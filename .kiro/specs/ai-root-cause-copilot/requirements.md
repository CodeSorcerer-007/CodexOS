# Requirements Document

## Introduction

The AI Root-Cause Copilot is an opt-in feature for CodexOS (Tauri 2.0 + Rust + React 19) that automatically diagnoses errors in context. When a terminal command exits with a non-zero code, memory usage spikes past a configurable threshold, or a proxied HTTP request returns a 4xx/5xx status, the system collects relevant context, sends it to the Mistral API (`mistral-large-latest`), and renders a dismissible glassmorphic diagnosis card. The feature is entirely silent when no `MISTRAL_API_KEY` is present in the Secrets vault.

The Rust backend (`src-tauri/src/ai.rs`) is already implemented. These requirements cover both the existing backend behaviour and the frontend work that must be delivered to complete the feature.

---

## Glossary

- **System**: The CodexOS application (Tauri 2.0 host process + React frontend).
- **Backend**: The Rust layer (`src-tauri/src/ai.rs`) that assembles context, enforces rate limits, manages the cache, and calls the Mistral API.
- **Frontend**: The React 19 layer responsible for triggering diagnoses, managing store state, and rendering UI.
- **Copilot**: The AI Root-Cause Copilot feature described in this document.
- **diagnosisStore**: The Zustand slice (`src/store/diagnosisStore.ts`) that holds all diagnosis entries and dismissed IDs for the current session.
- **DiagnosisCard**: The React component (`src/components/DiagnosisCard.tsx`) that renders a diagnosis result as a glassmorphic overlay.
- **DiagnosticTrigger**: A typed union (`terminal_error | memory_spike | proxy_error`) passed to `diagnose_issue` via Tauri IPC.
- **Diagnosis**: The structured result returned by `diagnose_issue`, containing `cause`, `confidence`, `explanation`, `suggested_fix`, and `related_files`.
- **TerminalMultiplexer**: The React component that manages PTY sessions and listens for exit events.
- **MemoryProfiler**: The React component that polls process memory and detects spikes.
- **NetworkInterceptor**: The React component that displays proxied HTTP requests and exposes per-row actions.
- **Secrets Vault**: The ChaCha20-Poly1305 encrypted credential store already present in CodexOS.
- **SettingsPage**: The existing settings UI in CodexOS where the Copilot configuration section is added.
- **triggerId**: A string key (`"terminal:<sessionId>"`, `"memory:<processName>"`, `"proxy:<requestId>"`) that uniquely identifies a diagnosis within a session.
- **MAX_CONTEXT_CHARS**: The hard upper bound of 16,000 characters for the assembled Mistral prompt.
- **Context_Gatherer**: The Rust subsystem inside `ai.rs` that assembles terminal lines, git diff, memory stats, and HTTP request/response into a prompt.
- **Parser**: The Rust function `parseDiagnosisJson` that extracts a `Diagnosis` from the raw Mistral API response, including markdown fence stripping.
- **Rate_Limiter**: The Rust subsystem inside `ai.rs` that enforces one request per trigger kind per 10-second window.
- **Cache**: The Rust in-memory store inside `ai.rs` keyed by `(trigger_kind, session/request_id)` that avoids redundant Mistral calls.

---

## Requirements

### Requirement 1: Opt-In Feature and Silent Disable

**User Story:** As a developer, I want the AI Copilot to be fully optional and completely silent when not configured, so that it never disrupts my workflow if I haven't set up an API key.

#### Acceptance Criteria

1. IF `get_secret_internal(secrets_state, "MISTRAL_API_KEY")` returns `None`, THEN THE Backend SHALL return `Err(...)` immediately and make no outbound network request.
2. WHEN `aiCopilotEnabled` is `false` in the settings store, THE Frontend SHALL not invoke `diagnose_issue` for any trigger type.
3. WHEN `MISTRAL_API_KEY` is absent from the Secrets vault AND the Copilot settings section is viewed, THE SettingsPage SHALL display an amber status indicator with a "Set up API Key →" link that navigates to the Secrets tab rather than an error toast.
4. WHERE `MISTRAL_API_KEY` is present and the vault is unlocked, THE SettingsPage SHALL display a green "API Key Configured" status chip.

---

### Requirement 2: Terminal Error Trigger

**User Story:** As a developer, I want the Copilot to automatically diagnose terminal command failures, so that I get immediate context about what went wrong without leaving the terminal pane.

#### Acceptance Criteria

1. WHEN a PTY session emits a `pty-exit-{id}` event with a non-zero exit code AND `aiCopilotEnabled` is `true`, THE TerminalMultiplexer SHALL invoke `diagnose_issue` with a `terminal_error` trigger containing the `session_id` and `exit_code`.
2. WHEN `diagnose_issue` is invoked with a `terminal_error` trigger, THE Backend SHALL assemble context from the PTY session's recent output lines and the current git diff.
3. IF the `triggerId` `"terminal:<sessionId>"` is already present in `diagnosisStore.dismissedIds`, THEN THE TerminalMultiplexer SHALL not invoke `diagnose_issue` for that session again.
4. WHEN `diagnose_issue` is invoked from `TerminalMultiplexer`, THE TerminalMultiplexer SHALL continue rendering without blocking on the result (fire-and-forget).

---

### Requirement 3: Memory Spike Trigger

**User Story:** As a developer, I want the Copilot to automatically diagnose memory spikes, so that I can understand what is consuming memory without manually inspecting process lists.

#### Acceptance Criteria

1. WHEN the memory delta for a process exceeds `memorySpikeThresholdMb` within a rolling window of `memorySpikeWindowSec` seconds, THE MemoryProfiler SHALL invoke `diagnose_issue` with a `memory_spike` trigger containing `process_name`, `delta_mb`, and `threshold_mb`.
2. WHILE a `memory_spike` diagnosis for a given `process_name` is already in the `loading` state, THE MemoryProfiler SHALL not invoke `diagnose_issue` again for the same process.
3. WHEN `memorySpikeThresholdMb` or `memorySpikeWindowSec` is updated in the Settings, THE MemoryProfiler SHALL use the new values for all subsequent spike evaluations.
4. WHEN `diagnose_issue` is invoked from `MemoryProfiler`, THE MemoryProfiler SHALL continue rendering without blocking on the result (fire-and-forget).

---

### Requirement 4: Network Error Trigger

**User Story:** As a developer, I want to manually trigger a diagnosis on any failed HTTP request, so that I can get an explanation of the error without leaving the network inspector.

#### Acceptance Criteria

1. WHEN a proxied HTTP response has a status code ≥ 400, THE NetworkInterceptor SHALL display a "Diagnose" button on that request row.
2. WHEN the user clicks the "Diagnose" button on a request row, THE NetworkInterceptor SHALL invoke `diagnose_issue` with a `proxy_error` trigger containing `request_id`, `status_code`, `url`, and `method`.
3. WHEN `diagnose_issue` is invoked from `NetworkInterceptor`, THE NetworkInterceptor SHALL continue rendering without blocking on the result (fire-and-forget).

---

### Requirement 5: diagnosisStore State Management

**User Story:** As a developer working on the frontend, I want a single Zustand slice to own all diagnosis state, so that any component can render or dismiss cards without prop-drilling.

#### Acceptance Criteria

1. WHEN `setLoading(triggerId)` is called, THE diagnosisStore SHALL set `entries[triggerId].status` to `"loading"`.
2. WHEN `setDiagnosis(triggerId, diagnosis)` is called, THE diagnosisStore SHALL set `entries[triggerId].status` to `"success"` and store the `Diagnosis` object at `entries[triggerId].diagnosis`.
3. WHEN `setError(triggerId, message)` is called, THE diagnosisStore SHALL set `entries[triggerId].status` to `"error"` and store the message at `entries[triggerId].errorMessage`.
4. WHEN `dismiss(triggerId)` is called, THE diagnosisStore SHALL add `triggerId` to `dismissedIds` and SHALL retain it for the entire session lifetime.
5. THE `dismissedIds` set SHALL only ever grow monotonically within a session; no operation SHALL remove a `triggerId` from `dismissedIds`.
6. WHEN `setEnabled(value)` is called, THE diagnosisStore SHALL update the `enabled` flag immediately.
7. THE diagnosisStore SHALL NOT persist `dismissedIds` or `entries` to `localStorage`; state is session-only.

---

### Requirement 6: DiagnosisCard Component

**User Story:** As a developer, I want a glassmorphic diagnosis card to appear near the active module, so that I can read the diagnosis without switching context.

#### Acceptance Criteria

1. WHEN `entries[triggerId].status` is `"loading"`, THE DiagnosisCard SHALL render a skeleton shimmer containing three rows (widths 100%, 75%, 50%) using `animate-pulse`.
2. WHEN `entries[triggerId].status` is `"success"`, THE DiagnosisCard SHALL render the `cause` headline, a confidence badge, a collapsible explanation section, a monospace fix block, and file chips for each entry in `related_files`.
3. WHEN `entries[triggerId].status` is `"error"`, THE DiagnosisCard SHALL render the `errorMessage` and a retry button that re-invokes `diagnose_issue` with the same trigger.
4. WHEN `triggerId` is present in `diagnosisStore.dismissedIds`, THE DiagnosisCard SHALL render `null`.
5. WHEN the dismiss button is clicked, THE DiagnosisCard SHALL call `diagnosisStore.dismiss(triggerId)` and render `null` immediately.
6. THE DiagnosisCard SHALL animate entrance and exit using Framer Motion (`initial: { opacity: 0, y: 10 }`, `animate: { opacity: 1, y: 0 }`).
7. THE confidence badge SHALL apply `bg-red-500/20 text-red-400 border-red-500/30` for `"high"`, `bg-amber-500/20 text-amber-400 border-amber-500/30` for `"medium"`, and `bg-gray-500/20 text-gray-400 border-gray-500/30` for `"low"`.
8. WHERE `onNavigateToFile` is provided, THE DiagnosisCard SHALL call it with the file path when a file chip is clicked.

---

### Requirement 7: Rust Backend — Cache Correctness

**User Story:** As a developer, I want repeated diagnoses for the same event to return instantly from cache, so that I don't incur extra API latency or cost for identical failures.

#### Acceptance Criteria

1. FOR ALL `DiagnosticTrigger` inputs, THE Cache SHALL store the `Diagnosis` result after the first successful Mistral API call, keyed by a deterministic `cache_key` derived from the trigger's fields.
2. WHEN `diagnose_issue` is called with a trigger whose `cache_key` matches an existing cache entry, THE Backend SHALL return the cached `Diagnosis` without calling the Mistral API.
3. THE `cache_key` function SHALL return the same value for structurally identical triggers and different values for structurally distinct triggers.
4. THE Cache SHALL be invalidated only on process restart; no runtime eviction policy is applied.

---

### Requirement 8: Rust Backend — Rate Limiting

**User Story:** As a developer, I want the backend to enforce rate limits per trigger kind, so that a burst of identical errors doesn't flood the Mistral API.

#### Acceptance Criteria

1. WHEN two `diagnose_issue` calls with the same trigger kind arrive within 10 seconds of each other, THE Rate_Limiter SHALL return `Err("Rate limited — please wait N seconds...")` for the second call without invoking the Mistral API.
2. THE Rate_Limiter SHALL measure elapsed time using `Instant::elapsed()` in Rust; frontend debouncing is supplementary and SHALL NOT be relied upon as the sole guard.
3. WHEN the 10-second window expires, THE Rate_Limiter SHALL permit the next call for that trigger kind.

---

### Requirement 9: Rust Backend — Context Budget

**User Story:** As a developer, I want the assembled prompt to always fit within the Mistral token budget, so that API calls never fail due to oversized payloads.

#### Acceptance Criteria

1. FOR ALL `ContextBundle` inputs of arbitrary total size, THE Context_Gatherer SHALL produce a prompt string of length ≤ `MAX_CONTEXT_CHARS` (16,000 characters).
2. WHEN terminal output lines must be truncated to meet the budget, THE Context_Gatherer SHALL remove the oldest lines first, retaining the most recent output.
3. THE Context_Gatherer SHALL cap the git diff section at 8,000 characters and the HTTP response body preview at 2,000 characters before applying the overall truncation loop.
4. THE truncation loop invariant SHALL hold: after each iteration, the total character count strictly decreases by at least 1 byte, guaranteeing termination.

---

### Requirement 10: Rust Backend — JSON Parser

**User Story:** As a developer, I want the backend to reliably extract a structured Diagnosis from Mistral's response even when the model wraps JSON in markdown fences, so that formatting variations don't cause unnecessary errors.

#### Acceptance Criteria

1. WHEN the Mistral API returns a JSON response not wrapped in markdown fences, THE Parser SHALL parse it directly into a `Diagnosis` struct.
2. WHEN the Mistral API returns a JSON response wrapped in ` ```json ` or ` ``` ` fences, THE Parser SHALL strip the fences and parse the underlying JSON into a `Diagnosis` struct.
3. WHEN the response cannot be parsed as valid JSON after one fence-strip attempt, THE Parser SHALL return `Err("Invalid response format: <parseError>")`.
4. FOR ALL valid `Diagnosis` values produced by the Parser, THE `confidence` field SHALL be one of `"high"`, `"medium"`, or `"low"`, and `cause`, `explanation`, and `suggested_fix` SHALL be non-empty strings.

---

### Requirement 11: Security — API Key Isolation

**User Story:** As a security-conscious developer, I want the Mistral API key to remain exclusively in the Rust process, so that it is never exposed to the JavaScript layer or observable through logs.

#### Acceptance Criteria

1. FOR ALL invocations of `diagnose_issue`, THE Backend SHALL never include the `MISTRAL_API_KEY` value in any Tauri event payload, `Result` return value, or log line.
2. THE `MISTRAL_API_KEY` value SHALL flow only as the `Authorization` HTTP header value within the Rust process when calling the Mistral API.
3. THE `get_secret_internal` function SHALL NOT be registered as a `#[tauri::command]`; it SHALL be accessible only within the Rust crate.
4. THE git diff section sent to Mistral SHALL be capped at 8,000 characters to prevent inadvertent transmission of large credential or config file changes.

---

### Requirement 12: Settings Integration

**User Story:** As a developer, I want a dedicated Copilot section in Settings, so that I can enable/disable the feature and tune spike detection thresholds without editing config files.

#### Acceptance Criteria

1. THE SettingsPage SHALL contain an "AI Root-Cause Copilot" section with an enable/disable toggle, an API key status indicator, a `memorySpikeMb` threshold input (default 500), and a `memorySpikeWindowSec` window input (default 10).
2. WHEN the enable/disable toggle is changed, THE SettingsPage SHALL call `diagnosisStore.setEnabled(value)` immediately.
3. WHEN `memorySpikeThresholdMb` is set to a value less than 1, THE SettingsPage SHALL reject the input and display a validation error.
4. WHEN `memorySpikeWindowSec` is set to a value less than 1, THE SettingsPage SHALL reject the input and display a validation error.

# Implementation Plan: AI Root-Cause Copilot

## Overview

The Rust backend (`src-tauri/src/ai.rs`) is fully implemented and registered in `lib.rs`. All remaining work is frontend-only: a Zustand store slice, a DiagnosisCard component, wiring into three existing components, and a Settings section. Tasks are ordered so each step produces runnable, integrated code before the next step begins.

## Tasks

- [x] 0. Rust backend — already complete
  - `diagnose_issue` and `is_copilot_configured` commands implemented in `src-tauri/src/ai.rs`
  - Both commands registered in `src-tauri/src/lib.rs`
  - _Requirements: 1.1, 2.2, 3.1, 4.2, 7.1–7.4, 8.1–8.3, 9.1–9.4, 10.1–10.4, 11.1–11.4_

- [x] 1. Create `diagnosisStore.ts` Zustand slice
  - Create `src/store/diagnosisStore.ts`
  - Define `Diagnosis`, `DiagnosisEntry`, and `DiagnosisState` TypeScript interfaces matching the Rust structs and design doc
  - Implement `setLoading`, `setDiagnosis`, `setError`, `dismiss`, and `setEnabled` actions
  - `dismissedIds` is a `Set<string>` that only ever grows — never cleared within the session
  - Do NOT use `persist` middleware or write to `localStorage` for any field in this store
  - `enabled` defaults to `true`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 1.1 Write property test for `dismissedIds` monotone growth
    - Use fast-check to generate arbitrary sequences of `dismiss(id)` calls
    - Assert that `dismissedIds.size` never decreases after any sequence of calls
    - Assert that a dismissed `triggerId` is always present in subsequent snapshots
    - **Property 6: Dismiss persistence**
    - **Validates: Requirements 5.4, 5.5**

- [x] 2. Create `DiagnosisCard.tsx` component
  - Create `src/components/DiagnosisCard.tsx`
  - Accept `triggerId: string` and optional `onNavigateToFile?: (path: string) => void` props
  - Read entry from `diagnosisStore`; render `null` when `triggerId` is in `dismissedIds` or entry is absent
  - Loading state: Framer Motion wrapper with `initial={{ opacity: 0, y: 10 }}`, `animate={{ opacity: 1, y: 0 }}`, three `animate-pulse` skeleton rows at widths 100%, 75%, 50%
  - Success state: glassmorphic card (`bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl`) containing cause headline, confidence badge, collapsible explanation, monospace fix block, file chips
  - Confidence badge classes: `high` → `bg-red-500/20 text-red-400 border-red-500/30`; `medium` → `bg-amber-500/20 text-amber-400 border-amber-500/30`; `low` → `bg-gray-500/20 text-gray-400 border-gray-500/30`
  - Error state: display `errorMessage` and a retry button; retry callback is passed in via props from the wiring layer
  - Dismiss button calls `diagnosisStore.dismiss(triggerId)`; card renders `null` immediately after
  - File chips call `onNavigateToFile(path)` when clicked (guard: only if prop provided)
  - Use `lucide-react` icons: `X` for dismiss, `AlertTriangle` for error, `Sparkles` for card header
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 2.1 Write unit tests for `DiagnosisCard` render states
    - Use React Testing Library
    - Test: loading → skeleton rows rendered, no cause headline
    - Test: success → cause, confidence badge, explanation, fix block, file chips visible
    - Test: error → errorMessage visible, retry button rendered
    - Test: dismissed (triggerId in dismissedIds) → renders `null`
    - Test: dismiss button click → calls `dismiss`, card becomes null
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 3. Wire `TerminalMultiplexer.tsx` — terminal error trigger
  - In `src/components/TerminalMultiplexer.tsx`, inside the `useEffect` that registers the `pty-exit-{id}` listener:
    - Import `useDiagnosisStore` and `invoke` from `@tauri-apps/api/core`
    - On exit event: guard on `exitCode !== 0`, `diagnosisStore.enabled === true`, and `triggerId` not in `diagnosisStore.dismissedIds`
    - Call `diagnosisStore.setLoading(triggerId)`, then `invoke<Diagnosis>('diagnose_issue', ...)` fire-and-forget (`.then`/`.catch` only, no `await` in the handler)
    - On resolve: call `diagnosisStore.setDiagnosis(triggerId, d)`
    - On reject: call `diagnosisStore.setError(triggerId, String(e))`
    - Render `<DiagnosisCard triggerId={triggerId} />` per session below the terminal pane; pass `onNavigateToFile` if a file navigation callback is available in the component
  - _Requirements: 2.1, 2.3, 2.4, 1.2_

  - [x] 3.1 Write unit tests for terminal trigger guards
    - Test: `enabled === false` → `diagnose_issue` is NOT invoked
    - Test: `triggerId` in `dismissedIds` → `diagnose_issue` is NOT invoked
    - Test: `exitCode === 0` → `diagnose_issue` is NOT invoked
    - Test: all guards pass → `setLoading` then `invoke` called
    - _Requirements: 2.1, 2.3, 1.2_

- [x] 4. Wire `MemoryProfiler.tsx` — memory spike trigger
  - In `src/components/MemoryProfiler.tsx`:
    - Add per-process rolling window state: `Map<string, Array<{ timestamp: number; memMb: number }>>` in a `useRef`
    - On each poll tick: run the `detectMemorySpike` algorithm from the design (evict expired entries, compute delta, compare against `memorySpikeThresholdMb` / `memorySpikeWindowSec` from settings store)
    - Guard before invoking: `enabled === true` AND no entry for this `processName` is already in `"loading"` state
    - Fire-and-forget `invoke<Diagnosis>('diagnose_issue', { trigger: { type: 'memory_spike', ... } })` with `.then`/`.catch` updating the store
    - Render `<DiagnosisCard triggerId={\`memory:${processName}\`} />` per process below the profiler UI
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 1.2_

  - [x] 4.1 Write unit tests for memory spike detection logic
    - Extract `detectMemorySpike` as a pure utility function and test in isolation
    - Test: delta below threshold → returns `false`
    - Test: delta at exactly threshold → returns `true`
    - Test: window eviction clears stale samples correctly
    - Test: already loading guard prevents double invocation
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 5. Checkpoint — ensure store and components are integrated
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Wire `NetworkInterceptor.tsx` — network error trigger
  - In `src/components/NetworkInterceptor.tsx`:
    - On rows where `response_status >= 400`, render a "Diagnose" button styled `px-2 py-1 text-[10px] font-bold rounded bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 border border-violet-500/30`
    - On button click: guard on `enabled === true`; build `triggerId = "proxy:" + req.id`; call `diagnosisStore.setLoading(triggerId)`; fire-and-forget `invoke<Diagnosis>('diagnose_issue', { trigger: { type: 'proxy_error', ... } })` with `.then`/`.catch`
    - Render `<DiagnosisCard triggerId={triggerId} />` inline below the selected row or in a fixed panel; use `onNavigateToFile` if available
  - _Requirements: 4.1, 4.2, 4.3, 1.2_

  - [x] 6.1 Write unit tests for network trigger
    - Test: `response_status < 400` → "Diagnose" button not rendered
    - Test: `response_status >= 400` → "Diagnose" button rendered
    - Test: button click with `enabled === false` → `invoke` not called
    - Test: button click with `enabled === true` → `setLoading` then `invoke` called
    - _Requirements: 4.1, 4.2, 4.3, 1.2_

- [x] 7. Extend settings store with Copilot fields
  - In the existing Zustand settings store (locate `DashboardState` or equivalent in `src/store/`):
    - Add `aiCopilotEnabled: boolean` (default: `true`)
    - Add `memorySpikeThresholdMb: number` (default: `500`)
    - Add `memorySpikeWindowSec: number` (default: `10`)
    - Wire `aiCopilotEnabled` bidirectionally with `diagnosisStore.enabled` (either derive from one source or sync on change — keep a single source of truth)
  - _Requirements: 12.1, 3.3_

- [x] 8. Add "AI Root-Cause Copilot" section to `SettingsPage.tsx`
  - In `src/components/SettingsPage.tsx`, add a new "AI Root-Cause Copilot" section:
    - Enable/disable toggle — calls `diagnosisStore.setEnabled(value)` and updates settings store field
    - API key status indicator: call `invoke('is_copilot_configured')` on mount; if `true` render green chip "API Key Configured"; if `false` render amber text link "Set up API Key →" that navigates to the Secrets tab (use whatever navigation pattern exists in the codebase)
    - `memorySpikeThresholdMb` number input: default 500, `min={1}`; show inline validation error "Must be ≥ 1 MB" if value < 1; on valid change update settings store
    - `memorySpikeWindowSec` number input: default 10, `min={1}`; show inline validation error "Must be ≥ 1 second" if value < 1; on valid change update settings store
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 1.3, 1.4_

  - [x] 8.1 Write unit tests for Settings section
    - Test: toggle on → `setEnabled(true)` called
    - Test: toggle off → `setEnabled(false)` called
    - Test: `memorySpikeThresholdMb` set to 0 → validation error shown, store not updated
    - Test: `memorySpikeWindowSec` set to 0 → validation error shown, store not updated
    - Test: `is_copilot_configured` returns `false` → amber link rendered
    - Test: `is_copilot_configured` returns `true` → green chip rendered
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 1.3, 1.4_

- [ ] 9. Property-based tests with fast-check

  - [x] 9.1 Write property test for context budget (prompt ≤ MAX_CONTEXT_CHARS)
    - Use fast-check to generate `ContextBundle`-shaped objects with arbitrary-length terminal lines, git diff, and response body strings
    - Invoke the frontend's prompt assembly helper (or call through Tauri mock) and assert output length ≤ 16,000 chars
    - If assembly runs in Rust only, test via a dedicated `#[cfg(test)]` unit test in `ai.rs` using proptest
    - **Property 5: Context budget**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

  - [ ] 9.2 Write property test for `cache_key` determinism
    - Use fast-check to generate `DiagnosticTrigger` values (all three variants)
    - Assert `cache_key(t) === cache_key(t)` for any trigger `t` (same input → same output)
    - Assert `cache_key(t1) !== cache_key(t2)` for structurally distinct triggers
    - If `cache_key` is Rust-only, test in `ai.rs` via proptest
    - **Property 3: Cache correctness**
    - **Validates: Requirements 7.3**

- [x] 10. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- The Rust backend (task 0) is already complete — do not re-implement it
- `diagnosisStore.dismissedIds` must never shrink within a session; no eviction, no localStorage
- All `invoke` calls are fire-and-forget: use `.then().catch()`, never `await` in event handlers
- `DiagnosisCard` renders `null` for dismissed entries — no unmount animation needed on dismiss
- Settings inputs for threshold and window use HTML `min` attribute plus Zod/manual validation before writing to store
- `is_copilot_configured` is already implemented in the Rust backend; call it on Settings mount

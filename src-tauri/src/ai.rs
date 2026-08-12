use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::multiplexer::MultiPtyState;
use crate::proxy;
use crate::secrets::{self, SecretsState};
use crate::sys::SysState;

const MISTRAL_API_KEY: &str = "MISTRAL_API_KEY";
const MAX_CONTEXT_CHARS: usize = 16_000; // ~4000 tokens
const RATE_LIMIT_SECS: u64 = 10;
const REQUEST_TIMEOUT_SECS: u64 = 15;

// ── Ollama (existing) ──────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Serialize, Deserialize, Debug)]
struct OllamaResponse {
    response: String,
    #[allow(dead_code)]
    model: String,
    #[allow(dead_code)]
    done: bool,
}

#[tauri::command]
pub async fn query_ollama(
    model: String,
    prompt: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    use futures::StreamExt;

    let client = Client::new();
    let req_body = OllamaRequest {
        model: model.clone(),
        prompt,
        stream: true,
    };

    let res = client
        .post("http://localhost:11434/api/generate")
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama (is it running?): {}", e))?;

    let mut stream = res.bytes_stream();

    while let Some(chunk) = stream.next().await {
        if let Ok(bytes) = chunk {
            if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                for line in text.lines() {
                    if line.is_empty() {
                        continue;
                    }
                    if let Ok(parsed) = serde_json::from_str::<OllamaResponse>(line) {
                        let _ = app_handle.emit("ai-token", parsed.response);
                    }
                }
            }
        }
    }

    Ok(())
}

// ── Root-Cause Copilot ───────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DiagnosticTrigger {
    TerminalError {
        session_id: String,
        exit_code: i32,
        last_n_lines: Option<usize>,
    },
    MemorySpike {
        process_name: String,
        delta_mb: f64,
        threshold_mb: f64,
    },
    ProxyError {
        request_id: u64,
        status_code: u16,
        url: String,
        method: String,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Diagnosis {
    pub cause: String,
    pub confidence: String,
    pub explanation: String,
    pub suggested_fix: String,
    pub related_files: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
struct MistralMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct MistralRequest {
    model: String,
    messages: Vec<MistralMessage>,
    response_format: ResponseFormat,
}

#[derive(Serialize)]
struct ResponseFormat {
    #[serde(rename = "type")]
    format_type: String,
}

#[derive(Deserialize, Debug)]
struct MistralChoice {
    message: MistralChoiceMessage,
}

#[derive(Deserialize, Debug)]
struct MistralChoiceMessage {
    content: String,
}

#[derive(Deserialize, Debug)]
struct MistralResponse {
    choices: Vec<MistralChoice>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum TriggerKind {
    Terminal,
    Memory,
    Proxy,
}

fn trigger_kind(trigger: &DiagnosticTrigger) -> TriggerKind {
    match trigger {
        DiagnosticTrigger::TerminalError { .. } => TriggerKind::Terminal,
        DiagnosticTrigger::MemorySpike { .. } => TriggerKind::Memory,
        DiagnosticTrigger::ProxyError { .. } => TriggerKind::Proxy,
    }
}

fn cache_key(trigger: &DiagnosticTrigger) -> String {
    match trigger {
        DiagnosticTrigger::TerminalError {
            session_id,
            exit_code,
            ..
        } => {
            format!("terminal:{}:{}", session_id, exit_code)
        }
        DiagnosticTrigger::MemorySpike { process_name, .. } => {
            format!("memory:{}", process_name)
        }
        DiagnosticTrigger::ProxyError { request_id, .. } => {
            format!("proxy:{}", request_id)
        }
    }
}

pub struct DiagnosisState {
    cache: Mutex<HashMap<String, Diagnosis>>,
    last_request: Mutex<HashMap<TriggerKind, Instant>>,
}

impl DiagnosisState {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(HashMap::new()),
            last_request: Mutex::new(HashMap::new()),
        }
    }
}

struct ContextBundle {
    sections: Vec<(String, String)>,
}

impl ContextBundle {
    fn new() -> Self {
        Self {
            sections: Vec::new(),
        }
    }

    fn push(&mut self, label: &str, content: String) {
        if !content.trim().is_empty() {
            self.sections.push((label.to_string(), content));
        }
    }

    fn to_prompt(&self) -> String {
        let mut total: usize = self.sections.iter().map(|(_, c)| c.len()).sum();
        let mut sections = self.sections.clone();

        // Truncate oldest terminal lines first when over budget
        while total > MAX_CONTEXT_CHARS {
            if let Some((label, content)) =
                sections.iter_mut().find(|(l, _)| l == "Terminal Output")
            {
                let lines: Vec<&str> = content.lines().collect();
                if lines.len() <= 1 {
                    break;
                }
                let removed = lines[0].len() + 1;
                *content = lines[1..].join("\n");
                total = total.saturating_sub(removed);
            } else {
                break;
            }
        }

        // Hard truncate from the end if still too large
        let mut result = String::new();
        for (label, content) in &sections {
            result.push_str(&format!("## {}\n{}\n\n", label, content));
        }
        if result.len() > MAX_CONTEXT_CHARS {
            result.truncate(MAX_CONTEXT_CHARS);
            result.push_str("\n...(truncated)");
        }
        result
    }
}

async fn gather_context(
    trigger: &DiagnosticTrigger,
    app: &AppHandle,
    pty_state: &MultiPtyState,
    sys_state: &SysState,
    repo_path: Option<&str>,
) -> ContextBundle {
    let mut ctx = ContextBundle::new();

    match trigger {
        DiagnosticTrigger::TerminalError {
            session_id,
            exit_code,
            last_n_lines,
        } => {
            let n = last_n_lines.unwrap_or(50);
            let lines = crate::multiplexer::get_terminal_lines(pty_state, session_id, n);
            ctx.push(
                "Terminal Output",
                format!(
                    "Session: {}\nExit code: {}\n\n{}",
                    session_id,
                    exit_code,
                    lines.join("\n")
                ),
            );
        }
        DiagnosticTrigger::MemorySpike {
            process_name,
            delta_mb,
            threshold_mb,
        } => {
            ctx.push(
                "Memory Spike",
                format!(
                    "Process: {}\nDelta: {:.1} MB\nThreshold: {:.1} MB",
                    process_name, delta_mb, threshold_mb
                ),
            );

            // Refresh sysinfo on a blocking thread so we don't stall the
            // Tokio async runtime (sysinfo::System::refresh_all is synchronous
            // and can be slow on loaded machines).
            let sys_state_mutex = sys_state.0.clone();
            let (stats, top) = tokio::task::spawn_blocking(move || {
                let mut sys = sys_state_mutex.lock().unwrap();
                sys.refresh_all();
                let stats = format!(
                    "System memory: {} MB used / {} MB total\nCPU: {:.1}%",
                    sys.used_memory() / 1024 / 1024,
                    sys.total_memory() / 1024 / 1024,
                    sys.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>() / sys.cpus().len() as f32
                );
                sys.refresh_processes();
                let mut procs: Vec<(String, u32, u64)> = sys
                    .processes()
                    .iter()
                    .map(|(pid, proc)| (proc.name().to_string(), pid.as_u32(), proc.memory()))
                    .collect();
                // Sort descending by memory so "top 10" is actually the top 10.
                procs.sort_by_key(|(_, _, mem)| std::cmp::Reverse(*mem));
                let top = procs
                    .into_iter()
                    .take(10)
                    .map(|(name, pid, mem)| format!("{} (PID {}) — {} MB", name, pid, mem / 1024))
                    .collect::<Vec<_>>()
                    .join("\n");
                (stats, top)
            })
            .await
            .map_err(|e| format!("Spawn blocking error: {}", e))
            .unwrap_or_default();
            ctx.push("System Stats", stats);
            ctx.push("Top Processes", top);
        }
        DiagnosticTrigger::ProxyError {
            request_id,
            status_code,
            url,
            method,
        } => {
            if let Some(req) = proxy::get_request_by_id(app, *request_id) {
                let body_preview = if req.response_body.len() > 2000 {
                    format!("{}...(truncated)", &req.response_body[..2000])
                } else {
                    req.response_body.clone()
                };
                let req_body_preview = if req.request_body.len() > 1000 {
                    format!("{}...(truncated)", &req.request_body[..1000])
                } else {
                    req.request_body.clone()
                };
                ctx.push(
                    "HTTP Request/Response",
                    format!(
                        "{} {} → {}\nDuration: {}ms\n\nRequest headers:\n{}\n\nRequest body:\n{}\n\nResponse body:\n{}",
                        req.method,
                        req.url,
                        req.response_status,
                        req.duration_ms,
                        req.request_headers.iter().map(|(k,v)| format!("{}: {}", k, v)).collect::<Vec<_>>().join("\n"),
                        req_body_preview,
                        body_preview,
                    ),
                );
            } else {
                ctx.push(
                    "HTTP Error",
                    format!("{} {} → status {}", method, url, status_code),
                );
            }
        }
    }

    // Always try to attach git diff if repo is open
    if let Some(path) = repo_path {
        if let Ok(diff) = crate::git::get_recent_commit_diff_internal(path) {
            let diff_preview = if diff.len() > 8000 {
                format!("{}...(truncated)", &diff[..8000])
            } else {
                diff
            };
            ctx.push("Recent Git Commit Diff", diff_preview);
        }
    }

    ctx
}

fn parse_diagnosis_json(raw: &str) -> Result<Diagnosis, String> {
    // Try direct parse first
    if let Ok(d) = serde_json::from_str::<Diagnosis>(raw) {
        return Ok(d);
    }

    // Strip markdown fences and retry once
    let cleaned = raw
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    serde_json::from_str::<Diagnosis>(cleaned)
        .map_err(|e| format!("Invalid response format: {}", e))
}

async fn call_mistral(api_key: &str, context: &str) -> Result<Diagnosis, String> {
    let system_prompt = "You are a root-cause diagnostic assistant embedded in a developer \
        tool. Given terminal output, git diffs, memory data, and/or network traces, \
        identify the most likely cause of the failure. Respond ONLY in JSON: \
        { \"cause\": string, \"confidence\": \"high\"|\"medium\"|\"low\", \
        \"explanation\": string, \"suggested_fix\": string, \"related_files\": string[] }";

    let client = Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let req = MistralRequest {
        model: "mistral-large-latest".to_string(),
        messages: vec![
            MistralMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            MistralMessage {
                role: "user".to_string(),
                content: format!("Diagnose the following failure context:\n\n{}", context),
            },
        ],
        response_format: ResponseFormat {
            format_type: "json_object".to_string(),
        },
    };

    let res = client
        .post("https://api.mistral.ai/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&req)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "Request timed out after 15 seconds".to_string()
            } else {
                format!("Network error: {}", e)
            }
        })?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        if status.as_u16() == 429 {
            return Err("Rate limited by Mistral API".to_string());
        }
        return Err(format!(
            "API returned status {} — {}",
            status,
            body.chars().take(200).collect::<String>()
        ));
    }

    let mistral_res: MistralResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {}", e))?;

    let content = mistral_res
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .ok_or_else(|| "Empty response from Mistral".to_string())?;

    parse_diagnosis_json(&content)
}

#[tauri::command]
pub async fn diagnose_issue(
    trigger: DiagnosticTrigger,
    repo_path: Option<String>,
    secrets_state: State<'_, SecretsState>,
    pty_state: State<'_, MultiPtyState>,
    sys_state: State<'_, SysState>,
    diagnosis_state: State<'_, DiagnosisState>,
    app: AppHandle,
) -> Result<Diagnosis, String> {
    // Check API key — silently fail if not configured
    let api_key = secrets::get_secret_internal(&secrets_state, MISTRAL_API_KEY)
        .ok_or_else(|| "AI Copilot not configured — add MISTRAL_API_KEY in Secrets".to_string())?;

    let key = cache_key(&trigger);

    // Return cached diagnosis if available
    {
        let cache = diagnosis_state.cache.lock().unwrap();
        if let Some(cached) = cache.get(&key) {
            return Ok(cached.clone());
        }
    }

    // Rate limit: 1 request per 10s per trigger type
    {
        let kind = trigger_kind(&trigger);
        let mut last = diagnosis_state.last_request.lock().unwrap();
        if let Some(prev) = last.get(&kind) {
            if prev.elapsed() < Duration::from_secs(RATE_LIMIT_SECS) {
                return Err(format!(
                    "Rate limited — please wait {} seconds before retrying",
                    RATE_LIMIT_SECS - prev.elapsed().as_secs()
                ));
            }
        }
        last.insert(kind, Instant::now());
    }

    let ctx = gather_context(&trigger, &app, &pty_state, &sys_state, repo_path.as_deref()).await;
    let context_str = ctx.to_prompt();

    if context_str.trim().is_empty() {
        return Err("No diagnostic context available".to_string());
    }

    let diagnosis = call_mistral(&api_key, &context_str).await?;

    // Cache result
    {
        let mut cache = diagnosis_state.cache.lock().unwrap();
        cache.insert(key, diagnosis.clone());
    }

    Ok(diagnosis)
}

#[tauri::command]
pub fn is_copilot_configured(secrets_state: State<'_, SecretsState>) -> bool {
    secrets::get_secret_internal(&secrets_state, MISTRAL_API_KEY).is_some()
}

// ── Property-Based Tests ─────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    // ── Helpers ────────────────────────────────────────────────────────────────

    /// Build a ContextBundle from raw string slices, exactly as gather_context does
    /// (but without any external I/O) so the test is a pure unit test.
    fn make_bundle(
        terminal_lines: &[String],
        git_diff: Option<&str>,
        response_body: Option<&str>,
    ) -> ContextBundle {
        let mut ctx = ContextBundle::new();

        // Terminal Output section (mirrors the TerminalError branch)
        if !terminal_lines.is_empty() {
            ctx.push("Terminal Output", terminal_lines.join("\n"));
        }

        // Recent Git Commit Diff section — capped to 8 000 chars (mirrors gather_context)
        if let Some(diff) = git_diff {
            let diff_preview = if diff.len() > 8_000 {
                format!("{}...(truncated)", &diff[..8_000])
            } else {
                diff.to_string()
            };
            ctx.push("Recent Git Commit Diff", diff_preview);
        }

        // HTTP response body section — capped to 2 000 chars (mirrors gather_context)
        if let Some(body) = response_body {
            let body_preview = if body.len() > 2_000 {
                format!("{}...(truncated)", &body[..2_000])
            } else {
                body.to_string()
            };
            ctx.push("HTTP Request/Response", body_preview);
        }

        ctx
    }

    // ── Property 5: Context budget ─────────────────────────────────────────────
    //
    // For ANY ContextBundle whose sections have arbitrary total size, to_prompt()
    // must return a string of length ≤ MAX_CONTEXT_CHARS (16 000 chars).
    //
    // Validates: Requirements 9.1, 9.2, 9.3, 9.4

    proptest! {
        /// Property 5: Context budget
        /// Validates: Requirements 9.1, 9.2, 9.3, 9.4
        #[test]
        fn prop_context_budget_never_exceeds_max(
            // Generate 0–200 terminal lines of arbitrary length (0–500 chars each)
            terminal_lines in prop::collection::vec(
                prop::string::string_regex("[^\n]{0,500}").unwrap(),
                0..=200,
            ),
            // Generate a git diff of arbitrary length up to 32 000 chars (4× the budget)
            git_diff_content in prop::option::of(
                prop::string::string_regex("[\\s\\S]{0,32000}").unwrap()
            ),
            // Generate a response body of arbitrary length up to 8 000 chars
            response_body_content in prop::option::of(
                prop::string::string_regex("[\\s\\S]{0,8000}").unwrap()
            ),
        ) {
            let bundle = make_bundle(
                &terminal_lines,
                git_diff_content.as_deref(),
                response_body_content.as_deref(),
            );
            let prompt = bundle.to_prompt();
            prop_assert!(
                prompt.len() <= MAX_CONTEXT_CHARS,
                "to_prompt() returned {} chars, which exceeds MAX_CONTEXT_CHARS = {}",
                prompt.len(),
                MAX_CONTEXT_CHARS,
            );
        }

        /// Property 5b: Context budget holds even when a single section already
        /// exceeds the entire budget (stress test for the hard-truncation path).
        /// Validates: Requirements 9.1, 9.4
        #[test]
        fn prop_context_budget_single_oversized_section(
            // One enormous terminal content (up to 64 000 chars — 4× budget)
            huge_content in prop::string::string_regex("[^\n]{0,64000}").unwrap(),
        ) {
            let mut bundle = ContextBundle::new();
            bundle.push("Terminal Output", huge_content);
            let prompt = bundle.to_prompt();
            prop_assert!(
                prompt.len() <= MAX_CONTEXT_CHARS,
                "to_prompt() returned {} chars for single-section bundle, exceeds limit {}",
                prompt.len(),
                MAX_CONTEXT_CHARS,
            );
        }

        /// Property 5c: Context budget holds for non-terminal sections only
        /// (no "Terminal Output" label → the line-dropping loop cannot help,
        /// so only the hard-truncation path applies).
        /// Validates: Requirements 9.1, 9.3, 9.4
        #[test]
        fn prop_context_budget_non_terminal_sections(
            git_diff in prop::string::string_regex("[\\s\\S]{0,32000}").unwrap(),
            response_body in prop::string::string_regex("[\\s\\S]{0,8000}").unwrap(),
        ) {
            let bundle = make_bundle(
                &[], // no terminal lines
                Some(&git_diff),
                Some(&response_body),
            );
            let prompt = bundle.to_prompt();
            prop_assert!(
                prompt.len() <= MAX_CONTEXT_CHARS,
                "to_prompt() returned {} chars (no terminal section), exceeds limit {}",
                prompt.len(),
                MAX_CONTEXT_CHARS,
            );
        }

    }

    // ── Property 3: Cache correctness ─────────────────────────────────────────
    //
    // The cache_key function must be a deterministic pure function of the
    // trigger's fields:
    //   P3a — Idempotence:      cache_key(t) == cache_key(t) for all t
    //   P3b — Cross-variant:    different trigger variants always yield
    //                           different keys
    //   P3c — Intra-variant:    same variant but different identifying
    //                           fields yield different keys
    //
    // Validates: Requirements 7.3

    /// Strategy that generates an arbitrary TerminalError trigger.
    fn arb_terminal_error() -> impl Strategy<Value = DiagnosticTrigger> {
        (
            "[a-z0-9]{1,32}", // session_id — non-empty alphanumeric
            any::<i32>(),     // exit_code
        )
            .prop_map(|(session_id, exit_code)| DiagnosticTrigger::TerminalError {
                session_id,
                exit_code,
                last_n_lines: None,
            })
    }

    /// Strategy that generates an arbitrary MemorySpike trigger.
    fn arb_memory_spike() -> impl Strategy<Value = DiagnosticTrigger> {
        (
            "[a-z][a-z0-9]{0,31}", // process_name — non-empty
            0.0_f64..10_000.0_f64, // delta_mb
            0.0_f64..10_000.0_f64, // threshold_mb
        )
            .prop_map(|(process_name, delta_mb, threshold_mb)| {
                DiagnosticTrigger::MemorySpike {
                    process_name,
                    delta_mb,
                    threshold_mb,
                }
            })
    }

    /// Strategy that generates an arbitrary ProxyError trigger.
    fn arb_proxy_error() -> impl Strategy<Value = DiagnosticTrigger> {
        (
            any::<u64>(),      // request_id
            400_u16..=599_u16, // status_code
            "[a-z]{1,16}",     // url
            "[A-Z]{3,6}",      // method
        )
            .prop_map(|(request_id, status_code, url, method)| {
                DiagnosticTrigger::ProxyError {
                    request_id,
                    status_code,
                    url,
                    method,
                }
            })
    }

    /// Generates any one of the three trigger variants.
    fn arb_trigger() -> impl Strategy<Value = DiagnosticTrigger> {
        prop_oneof![arb_terminal_error(), arb_memory_spike(), arb_proxy_error(),]
    }

    proptest! {
        /// P3a — Idempotence / determinism:
        /// cache_key(t) == cache_key(t) for any trigger t across all three variants.
        ///
        /// Validates: Requirements 7.3
        #[test]
        fn prop_cache_key_deterministic(
            trigger in arb_trigger(),
        ) {
            let k1 = cache_key(&trigger);
            let k2 = cache_key(&trigger);
            prop_assert_eq!(
                &k1, &k2,
                "cache_key returned different values for the same trigger: {:?}",
                trigger,
            );
        }

        /// P3b — Cross-variant uniqueness:
        /// cache_keys for triggers of different variants never collide.
        /// We generate one trigger per variant and verify all three keys are
        /// mutually distinct.
        ///
        /// Validates: Requirements 7.3
        #[test]
        fn prop_cache_key_cross_variant_unique(
            terminal in arb_terminal_error(),
            memory   in arb_memory_spike(),
            proxy    in arb_proxy_error(),
        ) {
            let kt = cache_key(&terminal);
            let km = cache_key(&memory);
            let kp = cache_key(&proxy);

            prop_assert_ne!(
                &kt, &km,
                "TerminalError and MemorySpike produced the same cache key:\n  terminal={:?}\n  memory={:?}",
                terminal, memory,
            );
            prop_assert_ne!(
                &kt, &kp,
                "TerminalError and ProxyError produced the same cache key:\n  terminal={:?}\n  proxy={:?}",
                terminal, proxy,
            );
            prop_assert_ne!(
                &km, &kp,
                "MemorySpike and ProxyError produced the same cache key:\n  memory={:?}\n  proxy={:?}",
                memory, proxy,
            );
        }

        /// P3c — Intra-variant uniqueness (TerminalError):
        /// Two TerminalError triggers with different session_ids must produce
        /// different cache keys.
        ///
        /// Validates: Requirements 7.3
        #[test]
        fn prop_cache_key_intra_variant_terminal_unique(
            (session_a, session_b) in ("[a-z0-9]{1,32}", "[a-z0-9]{1,32}")
                .prop_filter("session_ids must differ", |(a, b)| a != b),
            exit_code in any::<i32>(),
        ) {
            let t1 = DiagnosticTrigger::TerminalError {
                session_id: session_a.clone(),
                exit_code,
                last_n_lines: None,
            };
            let t2 = DiagnosticTrigger::TerminalError {
                session_id: session_b.clone(),
                exit_code,
                last_n_lines: None,
            };
            prop_assert_ne!(
                cache_key(&t1),
                cache_key(&t2),
                "Different session_ids ({:?} vs {:?}) produced the same cache key",
                session_a,
                session_b,
            );
        }

        /// P3c — Intra-variant uniqueness (MemorySpike):
        /// Two MemorySpike triggers with different process_names must produce
        /// different cache keys.
        ///
        /// Validates: Requirements 7.3
        #[test]
        fn prop_cache_key_intra_variant_memory_unique(
            (name_a, name_b) in ("[a-z][a-z0-9]{0,31}", "[a-z][a-z0-9]{0,31}")
                .prop_filter("process_names must differ", |(a, b)| a != b),
        ) {
            let t1 = DiagnosticTrigger::MemorySpike {
                process_name: name_a.clone(),
                delta_mb: 100.0,
                threshold_mb: 50.0,
            };
            let t2 = DiagnosticTrigger::MemorySpike {
                process_name: name_b.clone(),
                delta_mb: 100.0,
                threshold_mb: 50.0,
            };
            prop_assert_ne!(
                cache_key(&t1),
                cache_key(&t2),
                "Different process_names ({:?} vs {:?}) produced the same cache key",
                name_a,
                name_b,
            );
        }

        /// P3c — Intra-variant uniqueness (ProxyError):
        /// Two ProxyError triggers with different request_ids must produce
        /// different cache keys.
        ///
        /// Validates: Requirements 7.3
        #[test]
        fn prop_cache_key_intra_variant_proxy_unique(
            (id_a, id_b) in (any::<u64>(), any::<u64>())
                .prop_filter("request_ids must differ", |(a, b)| a != b),
        ) {
            let t1 = DiagnosticTrigger::ProxyError {
                request_id: id_a,
                status_code: 404,
                url: "example.com".to_string(),
                method: "GET".to_string(),
            };
            let t2 = DiagnosticTrigger::ProxyError {
                request_id: id_b,
                status_code: 404,
                url: "example.com".to_string(),
                method: "GET".to_string(),
            };
            prop_assert_ne!(
                cache_key(&t1),
                cache_key(&t2),
                "Different request_ids ({} vs {}) produced the same cache key",
                id_a,
                id_b,
            );
        }
    }
}

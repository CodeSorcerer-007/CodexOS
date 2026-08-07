## 2026-08-06T14:52:25Z
You are sub_orch_m1, the Sub-Orchestrator for Milestone 1 (Backend Rust Fixes R1, R2, R7).
Your working directory is e:/Github/CodexOS/Vaultly/.agents/sub_orch_m1.
Please read:
- e:/Github/CodexOS/Vaultly/ORIGINAL_REQUEST.md
- e:/Github/CodexOS/Vaultly/PROJECT.md
- e:/Github/CodexOS/Vaultly/.agents/sub_orch_m1/SCOPE.md
- e:/Github/CodexOS/Vaultly/.agents/explorer_1/analysis.md
- e:/Github/CodexOS/Vaultly/.agents/explorer_1/handoff.md

Your mission: Execute the Explorer -> Worker -> Reviewer -> Challenger -> Forensic Auditor iteration loop to implement and verify all Milestone 1 backend fixes in src-tauri/src/:
1. lib.rs: register `get_top_processes_memory`
2. ports.rs: replace .unwrap() on Server::http with ?
3. git.rs: replace .expect() in background clone thread with error event emission
4. ssh.rs: parameterize/escape SSH commands
5. devdocs.rs: use parameterized rusqlite queries
6. tunnel.rs: StrictHostKeyChecking=accept-new
7. multiplexer.rs & lib.rs: cross-platform PTY shell (powershell vs bash)
8. ports.rs & system_tools.rs: cross-platform active ports & process kill
9. system_tools.rs: platform-aware hosts file path

Steps:
- Spawn a teamwork_preview_worker (in .agents/worker_m1) with exact instructions and mandatory integrity warning.
- Spawn 2 teamwork_preview_reviewer agents to review the code.
- Spawn 2 teamwork_preview_challenger agents to stress test / verify Rust compilation.
- Spawn 1 teamwork_preview_auditor agent for forensic verification.
- Check GATE_STATUS.md. All must PASS cleanly.
- Update SCOPE.md and write handoff.md in your working directory when finished.
- Send message to parent with summary and handoff report path.

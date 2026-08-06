# 🎯 Vaultly — Multi-Agent Production Readiness Campaign
## Master Orchestration Guide

> **Goal:** Bring Vaultly from ~38% → 100% production ready.
> **Strategy:** Fix & Clean → Replace Mocks → Complete Features → Scale & Polish → Docs & Release

---

## 📐 Phase Overview

| Phase | Name | # Agents | Parallelizable | Blocker For |
|---|---|---|---|---|
| **Phase 1** | Foundation: Fix & Clean | 6 agents | ✅ All parallel | All phases |
| **Phase 2** | Real Data: Replace Mocks | 7 agents | ✅ Most parallel | Phase 3, 4 |
| **Phase 3** | Complete Incomplete Features | 6 agents | ✅ Most parallel | Phase 4 |
| **Phase 4** | Scale & Polish | 5 agents | ✅ All parallel | Phase 5 |
| **Phase 5** | Docs & Release | 3 agents | ✅ All parallel | — |

---

## 🔑 Global Rules for All Agents

1. **Every agent reads this file first**, then their phase document, then their specific task section.
2. **Workspace:** `e:\Github\CodexOS\Vaultly` — all edits must be within this path.
3. **Never break the build** — after every change, verify `npm run build` (frontend) and `cargo check` (Rust) pass.
4. **TypeScript strict** — no `any` types unless absolutely unavoidable; prefer typed interfaces.
5. **No placeholder/mock data in final output** — every UI element must show real data.
6. **Tailwind v4** is in use — use utility classes, no inline `style={}` for layout.
7. **Framer Motion** for all animations — maintain the premium aesthetic.
8. **Error handling pattern**: All `invoke()` calls must show a toast notification on failure (after Agent P1-A3 installs the toast system).
9. **Version preference**: Use the latest stable version of every dependency unless a specific version is pinned for compatibility.
10. **Commit after each task** with a descriptive message: `feat(scope): description` or `fix(scope): description`.

---

## 🧠 Model Selection Guide

| Task Complexity | Use Model |
|---|---|
| Simple file edits, CSS, config changes | `flash` (fast) |
| Component rewrites, Rust feature additions | `inherit` (default = Claude Sonnet) |
| Complex architecture decisions, multi-file refactors | `pro` (Claude Sonnet Thinking) |
| Research-only tasks (no code changes) | `flash` |

> **Rule:** Only use `pro` (Claude Sonnet) for the most complex tasks: Phase 2 (Real Port Tunnel, Real CRDT), Phase 3 (AST Engine, Secrets Keyring). All Phase 1 tasks can use `inherit` or `flash`.

---

## ⛓️ Dependency Chain

```
Phase 1 (all agents parallel)
  └─► Phase 2 (all agents parallel, after Phase 1 is DONE)
        └─► Phase 3 (all agents parallel, after Phase 2 is DONE)
              └─► Phase 4 (all agents parallel, after Phase 3 is DONE)
                    └─► Phase 5 (all agents parallel, after Phase 4 is DONE)
```

**Within Phase 1:** P1-A3 (Toast System) must complete before other Phase 1 agents wire error handling.
**Within Phase 2:** P2-A1 (Rust Modules) must complete before P2-A4 (Docker Controls) and P2-A5 (Git Diff).
**Within Phase 3:** P3-A1 (Secrets Keyring) can run in parallel with all others.

---

## 📋 Agent Roster Summary

### Phase 1 — Foundation: Fix & Clean
| ID | Agent Name | Model | Task |
|---|---|---|---|
| P1-A1 | Repo Janitor | flash | Remove dead code, junk files, fix Cargo.toml metadata |
| P1-A2 | Rust Splitter | inherit | Split monolithic lib.rs into domain modules |
| P1-A3 | Toast Architect | inherit | Build global toast/notification system |
| P1-A4 | Window Fix | flash | Fix window controls + FileGrid prop wiring |
| P1-A5 | Store Expander | inherit | Expand Zustand store with all shared state |
| P1-A6 | Icon Cleanup | flash | Replace inline SVG icon components |

### Phase 2 — Real Data: Replace Mocks
| ID | Agent Name | Model | Task |
|---|---|---|---|
| P2-A1 | Tunnel Engineer | pro | Real port tunneling via SSH -R / bore crate |
| P2-A2 | Proxy Engineer | pro | Real HTTP MITM proxy with request inspection/replay |
| P2-A3 | CRDT Engineer | pro | Real y-webrtc collaborative editor with Monaco |
| P2-A4 | Docker Engineer | inherit | Real Docker container controls + log streaming |
| P2-A5 | Git Engineer | inherit | Git diff viewer + branch management |
| P2-A6 | Dashboard Engineer | inherit | Live system vitals replacing hardcoded stats |
| P2-A7 | GPU Engineer | inherit | Real GPU metrics via nvml/wmic |

### Phase 3 — Complete Incomplete Features
| ID | Agent Name | Model | Task |
|---|---|---|---|
| P3-A1 | Keyring Engineer | pro | Persistent secrets via OS keyring (Windows Credential Manager) |
| P3-A2 | FileOps Engineer | inherit | Create/rename/drag-drop/breadcrumb in FileGrid |
| P3-A3 | Settings Engineer | inherit | Full settings page with persistence |
| P3-A4 | DB Studio Engineer | inherit | Database Studio with table browser + schema view |
| P3-A5 | AI Engineer | pro | Local AI via ollama subprocess integration |
| P3-A6 | AST Engineer | pro | Real AST transforms via web-tree-sitter |

### Phase 4 — Scale & Polish
| ID | Agent Name | Model | Task |
|---|---|---|---|
| P4-A1 | Tab Engineer | inherit | Multi-tab support with actual Tab state |
| P4-A2 | Keyboard Engineer | flash | Global keyboard shortcut system |
| P4-A3 | Onboarding Engineer | inherit | First-run wizard detecting tools |
| P4-A4 | CrossPlatform Engineer | inherit | Abstract Windows-only APIs behind OS detection |
| P4-A5 | Perf Engineer | inherit | useCallback/useMemo, virtual scroll, perf audit |

### Phase 5 — Docs & Release
| ID | Agent Name | Model | Task |
|---|---|---|---|
| P5-A1 | README Orchestrator | flash | Main README + all feature docs |
| P5-A2 | Test Engineer | inherit | Rust unit tests + React component tests |
| P5-A3 | Release Engineer | flash | Tauri build config, signing, GitHub Actions CI |

---

## 🚦 How to Launch a Phase

### Starting Phase 1 (example):
Launch all 6 agents simultaneously:
```
invoke_subagent P1-A1 (Repo Janitor) — branch workspace
invoke_subagent P1-A2 (Rust Splitter) — branch workspace
invoke_subagent P1-A3 (Toast Architect) — branch workspace
invoke_subagent P1-A4 (Window Fix) — branch workspace
invoke_subagent P1-A5 (Store Expander) — branch workspace
invoke_subagent P1-A6 (Icon Cleanup) — branch workspace
```

Wait for all to complete, then **merge their branches** (using the "share" workspace mode or merging PRs), run `cargo check && npm run build` to verify no conflicts, then start Phase 2.

---

## ✅ Phase Completion Criteria

A phase is only DONE when:
1. All agents in that phase have reported completion.
2. `cargo check` passes with 0 errors.
3. `npm run build` (TypeScript) passes with 0 errors.
4. `npm run lint` passes with 0 errors.
5. The app launches and navigates to each module without crashing.

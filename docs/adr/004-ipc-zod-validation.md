# ADR 004: Runtime IPC Boundary Validation using Zod

## Status
Accepted

## Context
Communication between the TypeScript React frontend and the Rust backend uses Tauri IPC (`invoke`). Contract drift between Rust `Serialize` structs and TypeScript interfaces can lead to subtle `undefined` runtime exceptions.

## Decision
We enforce runtime schema validation at the IPC call boundary using **Zod**.

## Rationale
1. **Runtime Type Safety**: IPC payloads returned from Rust are parsed through Zod schemas before reaching components, throwing typed errors on schema mismatch.
2. **Fail Fast**: Prevents invalid data structures from polluting the Zustand store or causing silent UI breakage.
3. **Self-Documenting API**: Zod schemas in `src/ipc.ts` act as the source-of-truth runtime type contracts.

## Consequences
- Requires updating Zod schemas whenever Rust command response structs are modified.

# Scope: Milestone 2 — Frontend Bugs, Dialogs & Toast Error Handling (R1, R3, R4)

## Mission
Fix VaultModal infinite re-render loop, replace all native browser dialogs with toast/modal UI, and implement pervasive async try/catch toast error handling across frontend components in `src/`.

## Assigned Work Items
1. `VaultModal.tsx`: Move `setMode()` call out of the render body into `useEffect([isOpen, targetPath])`.
2. Native Dialog Replacements (R3): Replace all 33 occurrences of `alert()`, `confirm()`, `prompt()` across frontend components with `showToast` toasts or styled modal confirmations (e.g. `VisualGit.tsx`, `EnvVarModal.tsx`, `DuplicateFinderModal.tsx`, `PluginMarketplace.tsx`, etc.).
3. Pervasive Toast Error Handling (R4): Ensure all 47 async `invoke()` calls in React components have `try/catch` blocks that call `showToast('error', ...)` on failure. Fix all empty `catch {}` blocks and replace `console.error(e)`-only blocks.

## Code Layout Ownership
- `src/components/VaultModal.tsx`
- `src/components/VisualGit.tsx`
- `src/components/EnvVarModal.tsx`
- `src/components/DuplicateFinderModal.tsx`
- All other `.tsx` files in `src/` requiring native dialog replacement or async invoke error handling.

## References
- `e:/Github/CodexOS/Vaultly/ORIGINAL_REQUEST.md`
- `e:/Github/CodexOS/Vaultly/PROJECT.md`
- `e:/Github/CodexOS/Vaultly/.agents/explorer_2/analysis.md`
- `e:/Github/CodexOS/Vaultly/.agents/explorer_2/handoff.md`

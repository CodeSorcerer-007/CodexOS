# ADR 002: Zustand for Centralized Application State

## Status
Accepted

## Context
CodexOS manages multi-tab navigation, workspace history, active app selection, system toasts, and user settings across 28 distinct modules.

## Decision
We chose **Zustand** as the single global state management library.

## Rationale
1. **Zero Boilerplate**: Avoids Redux action/reducer verbosity while maintaining strict immutability patterns.
2. **Selective Component Subscriptions**: Components subscribe to atomic selectors (e.g. `useStore(s => s.activeTabId)`), preventing unnecessary re-renders across un-related modules.
3. **Outside-React Access**: Store state can be queried and mutated in IPC helper callbacks and keyboard shortcut listeners outside component render trees.

## Consequences
- Requires discipline around atomic selector definitions to maximize React render performance.

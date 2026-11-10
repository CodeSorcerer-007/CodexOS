import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { cancelFileTransfer, getActiveTransfers, type TransferProgressEvent } from '../ipc';

export interface TransferState {
  transfers: Record<string, TransferProgressEvent>;
  isMinimized: boolean;
  isOpen: boolean;

  updateTransfer: (event: TransferProgressEvent) => void;
  dismissTransfer: (transferId: string) => void;
  clearCompleted: () => void;
  toggleMinimized: () => void;
  setMinimized: (minimized: boolean) => void;
  setOpen: (open: boolean) => void;
  cancelTransfer: (transferId: string) => Promise<boolean>;
  initTransferListeners: () => () => void;
}

export const useTransferStore = create<TransferState>((set, get) => ({
  transfers: {},
  isMinimized: false,
  isOpen: false,

  updateTransfer: (event) => {
    set((state) => {
      const existing = state.transfers[event.transfer_id];
      if (existing) {
        const isExistingTerminal = ['completed', 'failed', 'cancelled'].includes(existing.status);
        const isNewTerminal = ['completed', 'failed', 'cancelled'].includes(event.status);
        if (isExistingTerminal && !isNewTerminal) {
          // Reject stale non-terminal progress updates after transfer reached a terminal state
          return state;
        }
      }
      return {
        transfers: {
          ...state.transfers,
          [event.transfer_id]: event,
        },
        isOpen:
          event.status === 'running' || event.status === 'queued' || event.status === 'preparing'
            ? true
            : state.isOpen,
      };
    });
  },

  dismissTransfer: (transferId) => {
    set((state) => {
      const next = { ...state.transfers };
      delete next[transferId];
      return {
        transfers: next,
        isOpen: Object.keys(next).length > 0 ? state.isOpen : false,
      };
    });
  },

  clearCompleted: () => {
    set((state) => {
      const next: Record<string, TransferProgressEvent> = {};
      for (const [id, t] of Object.entries(state.transfers)) {
        if (t.status === 'running' || t.status === 'queued' || t.status === 'preparing') {
          next[id] = t;
        }
      }
      return {
        transfers: next,
        isOpen: Object.keys(next).length > 0,
      };
    });
  },

  toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),
  setMinimized: (isMinimized) => set({ isMinimized }),
  setOpen: (isOpen) => set({ isOpen }),

  cancelTransfer: async (transferId) => {
    try {
      const success = await cancelFileTransfer(transferId);
      if (success) {
        set((state) => {
          const t = state.transfers[transferId];
          if (!t) return state;
          return {
            transfers: {
              ...state.transfers,
              [transferId]: {
                ...t,
                status: 'cancelled',
                error_message: 'Transfer cancelled by user',
              },
            },
          };
        });
      }
      return success;
    } catch {
      return false;
    }
  },

  initTransferListeners: () => {
    let active = true;
    const unlistens: UnlistenFn[] = [];

    const eventNames = [
      'transfer://started',
      'transfer://progress',
      'transfer://completed',
      'transfer://failed',
      'transfer://cancelled',
    ];

    for (const name of eventNames) {
      listen<TransferProgressEvent>(name, (event) => {
        if (!active || !event.payload) return;
        get().updateTransfer(event.payload);
      }).then((unlisten) => {
        if (active) {
          unlistens.push(unlisten);
        } else {
          unlisten();
        }
      });
    }

    // Snapshot active transfers from backend and hydrate store
    getActiveTransfers()
      .then((activeList) => {
        if (!active) return;
        set((state) => {
          const merged = { ...state.transfers };
          for (const item of activeList) {
            const existing = merged[item.transfer_id];
            if (!existing) {
              merged[item.transfer_id] = item;
            } else {
              const isExistingTerminal = ['completed', 'failed', 'cancelled'].includes(existing.status);
              if (!isExistingTerminal) {
                merged[item.transfer_id] = item;
              }
            }
          }
          const hasActive = Object.values(merged).some(
            (t) => t.status === 'running' || t.status === 'queued' || t.status === 'preparing'
          );
          return {
            transfers: merged,
            isOpen: hasActive ? true : state.isOpen,
          };
        });
      })
      .catch(() => {});

    return () => {
      active = false;
      for (const unlisten of unlistens) {
        unlisten();
      }
    };
  },
}));

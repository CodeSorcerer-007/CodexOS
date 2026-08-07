import { create } from 'zustand';

export interface Diagnosis {
  cause: string;
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
  suggested_fix: string;
  related_files: string[];
}

export interface DiagnosisEntry {
  status: 'loading' | 'success' | 'error';
  diagnosis?: Diagnosis;
  errorMessage?: string;
  triggerId: string;
}

export interface DiagnosisState {
  entries: Record<string, DiagnosisEntry>;
  dismissedIds: Set<string>;
  enabled: boolean;

  setLoading: (triggerId: string) => void;
  setDiagnosis: (triggerId: string, d: Diagnosis) => void;
  setError: (triggerId: string, msg: string) => void;
  dismiss: (triggerId: string) => void;
  setEnabled: (v: boolean) => void;
}

export const useDiagnosisStore = create<DiagnosisState>((set) => ({
  entries: {},
  dismissedIds: new Set<string>(),
  enabled: true,

  setLoading: (triggerId) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [triggerId]: { status: 'loading', triggerId },
      },
    })),

  setDiagnosis: (triggerId, d) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [triggerId]: { status: 'success', diagnosis: d, triggerId },
      },
    })),

  setError: (triggerId, msg) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [triggerId]: { status: 'error', errorMessage: msg, triggerId },
      },
    })),

  dismiss: (triggerId) =>
    set((state) => {
      const next = new Set(state.dismissedIds);
      next.add(triggerId);
      return { dismissedIds: next };
    }),

  setEnabled: (v) => set({ enabled: v }),
}));

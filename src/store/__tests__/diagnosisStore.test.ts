import { expect, test, describe, beforeEach } from 'vitest';
import { useDiagnosisStore, type Diagnosis } from '../diagnosisStore';

const resetDiagnosisStore = () => {
  useDiagnosisStore.setState({
    entries: {},
    dismissedIds: new Set<string>(),
    enabled: true,
  });
};

describe('useDiagnosisStore', () => {
  beforeEach(resetDiagnosisStore);

  test('initial state is enabled with empty entries and dismissed set', () => {
    const { entries, dismissedIds, enabled } = useDiagnosisStore.getState();
    expect(enabled).toBe(true);
    expect(Object.keys(entries)).toHaveLength(0);
    expect(dismissedIds.size).toBe(0);
  });

  test('setLoading sets entry status to loading', () => {
    useDiagnosisStore.getState().setLoading('term-1');
    const entry = useDiagnosisStore.getState().entries['term-1'];
    expect(entry).toBeDefined();
    expect(entry.status).toBe('loading');
    expect(entry.triggerId).toBe('term-1');
  });

  test('setDiagnosis transitions state to success with payload', () => {
    const mockDiagnosis: Diagnosis = {
      cause: 'Syntax error in main.rs',
      confidence: 'high',
      explanation: 'Missing semicolon on line 42',
      suggested_fix: 'Add ; at line 42',
      related_files: ['src-tauri/src/main.rs'],
    };

    useDiagnosisStore.getState().setLoading('term-1');
    useDiagnosisStore.getState().setDiagnosis('term-1', mockDiagnosis);

    const entry = useDiagnosisStore.getState().entries['term-1'];
    expect(entry.status).toBe('success');
    expect(entry.diagnosis).toEqual(mockDiagnosis);
  });

  test('setError transitions state to error with message', () => {
    useDiagnosisStore.getState().setLoading('term-1');
    useDiagnosisStore.getState().setError('term-1', 'API key missing');

    const entry = useDiagnosisStore.getState().entries['term-1'];
    expect(entry.status).toBe('error');
    expect(entry.errorMessage).toBe('API key missing');
  });

  test('dismiss adds triggerId to dismissedIds set', () => {
    useDiagnosisStore.getState().dismiss('term-1');
    const { dismissedIds } = useDiagnosisStore.getState();
    expect(dismissedIds.has('term-1')).toBe(true);
  });

  test('setEnabled toggles enabled flag', () => {
    useDiagnosisStore.getState().setEnabled(false);
    expect(useDiagnosisStore.getState().enabled).toBe(false);
    useDiagnosisStore.getState().setEnabled(true);
    expect(useDiagnosisStore.getState().enabled).toBe(true);
  });
});

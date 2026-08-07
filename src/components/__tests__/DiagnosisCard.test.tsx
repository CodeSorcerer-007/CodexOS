import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiagnosisCard } from '../DiagnosisCard';
import { useDiagnosisStore } from '../../store/diagnosisStore';
import type { Diagnosis } from '../../store/diagnosisStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TRIGGER_ID = 'terminal:test-session-1';

const MOCK_DIAGNOSIS: Diagnosis = {
  cause: 'Module not found: react',
  confidence: 'high',
  explanation: 'The React package is missing from node_modules.',
  suggested_fix: 'npm install react',
  related_files: ['package.json', 'src/index.tsx'],
};

/** Reset the store to a clean slate before each test. */
function resetStore() {
  useDiagnosisStore.setState({
    entries: {},
    dismissedIds: new Set<string>(),
    enabled: true,
  });
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('DiagnosisCard', () => {
  beforeEach(() => {
    resetStore();
  });

  // ── Requirement 6.1 ─────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('renders three skeleton rows and no cause headline when status is loading', () => {
      useDiagnosisStore.setState({
        entries: {
          [TRIGGER_ID]: { status: 'loading', triggerId: TRIGGER_ID },
        },
      });

      const { container } = render(<DiagnosisCard triggerId={TRIGGER_ID} />);

      // Accessible loading indicator should be present
      expect(screen.getByRole('status')).toBeInTheDocument();

      // The cause headline must NOT be present in loading state
      expect(screen.queryByText(MOCK_DIAGNOSIS.cause)).not.toBeInTheDocument();

      // Three skeleton rows are rendered (they have animate-pulse class)
      const skeletonRows = container.querySelectorAll('.animate-pulse');
      expect(skeletonRows).toHaveLength(3);
    });
  });

  // ── Requirement 6.2 ─────────────────────────────────────────────────────────
  describe('success state', () => {
    beforeEach(() => {
      useDiagnosisStore.getState().setDiagnosis(TRIGGER_ID, MOCK_DIAGNOSIS);
    });

    it('renders the cause headline', () => {
      render(<DiagnosisCard triggerId={TRIGGER_ID} />);
      expect(screen.getByText(MOCK_DIAGNOSIS.cause)).toBeInTheDocument();
    });

    it('renders the confidence badge', () => {
      render(<DiagnosisCard triggerId={TRIGGER_ID} />);
      // Badge text is the confidence level in uppercase
      expect(screen.getByText(MOCK_DIAGNOSIS.confidence)).toBeInTheDocument();
    });

    it('renders the suggested fix block', () => {
      render(<DiagnosisCard triggerId={TRIGGER_ID} />);
      expect(screen.getByText(MOCK_DIAGNOSIS.suggested_fix)).toBeInTheDocument();
    });

    it('renders explanation after toggling the collapsible section', () => {
      render(<DiagnosisCard triggerId={TRIGGER_ID} />);

      // Explanation is initially hidden — toggle it open
      const toggleBtn = screen.getByRole('button', { name: /show explanation/i });
      fireEvent.click(toggleBtn);

      expect(screen.getByText(MOCK_DIAGNOSIS.explanation)).toBeInTheDocument();
    });

    it('renders file chips for each entry in related_files', () => {
      render(<DiagnosisCard triggerId={TRIGGER_ID} />);

      for (const filePath of MOCK_DIAGNOSIS.related_files) {
        expect(screen.getByTitle(filePath)).toBeInTheDocument();
      }
    });

    it('calls onNavigateToFile with the correct path when a file chip is clicked', () => {
      const onNavigateToFile = vi.fn();
      render(<DiagnosisCard triggerId={TRIGGER_ID} onNavigateToFile={onNavigateToFile} />);

      const firstFile = MOCK_DIAGNOSIS.related_files[0];
      fireEvent.click(screen.getByTitle(firstFile));

      expect(onNavigateToFile).toHaveBeenCalledOnce();
      expect(onNavigateToFile).toHaveBeenCalledWith(firstFile);
    });
  });

  // ── Requirement 6.3 ─────────────────────────────────────────────────────────
  describe('error state', () => {
    const ERROR_MESSAGE = 'Rate limited — please wait 8 seconds...';

    beforeEach(() => {
      useDiagnosisStore.getState().setError(TRIGGER_ID, ERROR_MESSAGE);
    });

    it('renders the errorMessage', () => {
      render(<DiagnosisCard triggerId={TRIGGER_ID} />);
      expect(screen.getByText(ERROR_MESSAGE)).toBeInTheDocument();
    });

    it('renders the retry button when an onRetry handler is provided', () => {
      const onRetry = vi.fn();
      render(<DiagnosisCard triggerId={TRIGGER_ID} onRetry={onRetry} />);

      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('calls onRetry when the retry button is clicked', () => {
      const onRetry = vi.fn();
      render(<DiagnosisCard triggerId={TRIGGER_ID} onRetry={onRetry} />);

      fireEvent.click(screen.getByRole('button', { name: /retry/i }));

      expect(onRetry).toHaveBeenCalledOnce();
    });

    it('does not render the retry button when no onRetry handler is provided', () => {
      render(<DiagnosisCard triggerId={TRIGGER_ID} />);
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });
  });

  // ── Requirement 6.4 ─────────────────────────────────────────────────────────
  describe('dismissed state', () => {
    it('renders null when triggerId is in dismissedIds', () => {
      // Set a success entry AND put it in dismissedIds simultaneously
      useDiagnosisStore.setState({
        entries: {
          [TRIGGER_ID]: {
            status: 'success',
            diagnosis: MOCK_DIAGNOSIS,
            triggerId: TRIGGER_ID,
          },
        },
        dismissedIds: new Set([TRIGGER_ID]),
      });

      const { container } = render(<DiagnosisCard triggerId={TRIGGER_ID} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders null when there is no entry at all for the triggerId', () => {
      // Store is empty (reset in beforeEach)
      const { container } = render(<DiagnosisCard triggerId={TRIGGER_ID} />);
      expect(container.firstChild).toBeNull();
    });
  });

  // ── Requirement 6.5 ─────────────────────────────────────────────────────────
  describe('dismiss button interaction', () => {
    it('calls dismiss with the triggerId when the dismiss button is clicked', () => {
      useDiagnosisStore.getState().setDiagnosis(TRIGGER_ID, MOCK_DIAGNOSIS);

      const dismissSpy = vi.spyOn(useDiagnosisStore.getState(), 'dismiss');

      render(<DiagnosisCard triggerId={TRIGGER_ID} />);
      fireEvent.click(screen.getByRole('button', { name: /dismiss diagnosis card/i }));

      expect(dismissSpy).toHaveBeenCalledWith(TRIGGER_ID);
    });

    it('renders null immediately after the dismiss button is clicked', () => {
      useDiagnosisStore.getState().setDiagnosis(TRIGGER_ID, MOCK_DIAGNOSIS);

      const { container } = render(<DiagnosisCard triggerId={TRIGGER_ID} />);

      // Card is visible before dismissal
      expect(screen.getByText(MOCK_DIAGNOSIS.cause)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /dismiss diagnosis card/i }));

      // After dismissal the card should be gone
      expect(container.firstChild).toBeNull();
    });
  });
});

/**
 * Unit tests for the AI Root-Cause Copilot section of SettingsPage.
 *
 * Tests Requirements 12.1, 12.2, 12.3, 12.4, 1.3, 1.4:
 *   - Toggle on  → diagnosisStore.setEnabled(true) called
 *   - Toggle off → diagnosisStore.setEnabled(false) called
 *   - memorySpikeThresholdMb set to 0 → validation error shown, store not updated
 *   - memorySpikeWindowSec set to 0 → validation error shown, store not updated
 *   - is_copilot_configured returns false → amber "Set up API Key →" link rendered
 *   - is_copilot_configured returns true  → green "API Key Configured" chip rendered
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { SettingsPage } from '../SettingsPage';
import { useStore } from '../../store/store';
import { useDiagnosisStore } from '../../store/diagnosisStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockedInvoke = vi.mocked(invoke);

/** Reset both stores to a clean, known state before each test. */
function resetStores() {
  useStore.setState((s) => ({
    settings: {
      ...s.settings,
      aiCopilotEnabled: true,
      memorySpikeThresholdMb: 500,
      memorySpikeWindowSec: 10,
    },
  }));

  useDiagnosisStore.setState({
    entries: {},
    dismissedIds: new Set<string>(),
    enabled: true,
  });
}

/**
 * The SettingsPage's labels are NOT associated to inputs via htmlFor/id.
 * We locate inputs by querying the label element and then finding the nearest
 * sibling input within the same parent <div>.
 */
function getInputByLabelText(labelText: RegExp) {
  // Find the <label> element matching the text
  const label = screen.getByText(labelText, { selector: 'label' });
  // The input is the next sibling element within the same wrapper <div>
  const wrapper = label.parentElement!;
  const input = wrapper.querySelector('input');
  if (!input) throw new Error(`No input found near label "${labelText}"`);
  return input;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SettingsPage — AI Root-Cause Copilot section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
    // Default: is_copilot_configured returns false unless overridden per test
    mockedInvoke.mockResolvedValue(false);
  });

  // ── Requirement 12.1 ────────────────────────────────────────────────────────
  describe('section presence', () => {
    it('renders the "AI Root-Cause Copilot" heading', () => {
      render(<SettingsPage />);
      expect(screen.getByText('AI Root-Cause Copilot')).toBeInTheDocument();
    });

    it('renders the enable/disable toggle', () => {
      render(<SettingsPage />);
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });

    it('renders the Memory Spike Threshold (MB) label', () => {
      render(<SettingsPage />);
      expect(screen.getByText(/Memory Spike Threshold \(MB\)/i)).toBeInTheDocument();
    });

    it('renders the Memory Spike Window (seconds) label', () => {
      render(<SettingsPage />);
      expect(screen.getByText(/Memory Spike Window \(seconds\)/i)).toBeInTheDocument();
    });
  });

  // ── Requirement 12.2 ────────────────────────────────────────────────────────
  describe('enable/disable toggle — setEnabled calls', () => {
    it('calls setEnabled(true) when the toggle is turned on', () => {
      // Start with the copilot disabled
      useStore.setState((s) => ({
        settings: { ...s.settings, aiCopilotEnabled: false },
      }));
      useDiagnosisStore.setState({ enabled: false });

      const setEnabledSpy = vi.spyOn(useDiagnosisStore.getState(), 'setEnabled');

      render(<SettingsPage />);
      fireEvent.click(screen.getByRole('switch'));

      expect(setEnabledSpy).toHaveBeenCalledWith(true);
    });

    it('calls setEnabled(false) when the toggle is turned off', () => {
      // Start with the copilot enabled
      useStore.setState((s) => ({
        settings: { ...s.settings, aiCopilotEnabled: true },
      }));
      useDiagnosisStore.setState({ enabled: true });

      const setEnabledSpy = vi.spyOn(useDiagnosisStore.getState(), 'setEnabled');

      render(<SettingsPage />);
      fireEvent.click(screen.getByRole('switch'));

      expect(setEnabledSpy).toHaveBeenCalledWith(false);
    });
  });

  // ── Requirement 12.3 ────────────────────────────────────────────────────────
  describe('memorySpikeThresholdMb validation', () => {
    it('shows a validation error when memorySpikeThresholdMb is set to 0', () => {
      render(<SettingsPage />);

      const thresholdInput = getInputByLabelText(/Memory Spike Threshold/i);
      fireEvent.change(thresholdInput, { target: { value: '0' } });

      expect(screen.getByText(/Must be ≥ 1 MB/i)).toBeInTheDocument();
    });

    it('does NOT update the settings store when memorySpikeThresholdMb is set to 0', () => {
      render(<SettingsPage />);

      const setThresholdSpy = vi.spyOn(useStore.getState(), 'setMemorySpikeThresholdMb');

      const thresholdInput = getInputByLabelText(/Memory Spike Threshold/i);
      fireEvent.change(thresholdInput, { target: { value: '0' } });

      expect(setThresholdSpy).not.toHaveBeenCalled();
    });

    it('does NOT show a validation error for a valid memorySpikeThresholdMb value', () => {
      render(<SettingsPage />);

      const thresholdInput = getInputByLabelText(/Memory Spike Threshold/i);
      fireEvent.change(thresholdInput, { target: { value: '200' } });

      expect(screen.queryByText(/Must be ≥ 1 MB/i)).not.toBeInTheDocument();
    });

    it('updates the store when a valid memorySpikeThresholdMb value is entered', () => {
      render(<SettingsPage />);

      const setThresholdSpy = vi.spyOn(useStore.getState(), 'setMemorySpikeThresholdMb');

      const thresholdInput = getInputByLabelText(/Memory Spike Threshold/i);
      fireEvent.change(thresholdInput, { target: { value: '200' } });

      expect(setThresholdSpy).toHaveBeenCalledWith(200);
    });
  });

  // ── Requirement 12.4 ────────────────────────────────────────────────────────
  describe('memorySpikeWindowSec validation', () => {
    it('shows a validation error when memorySpikeWindowSec is set to 0', () => {
      render(<SettingsPage />);

      const windowInput = getInputByLabelText(/Memory Spike Window/i);
      fireEvent.change(windowInput, { target: { value: '0' } });

      expect(screen.getByText(/Must be ≥ 1 second/i)).toBeInTheDocument();
    });

    it('does NOT update the settings store when memorySpikeWindowSec is set to 0', () => {
      render(<SettingsPage />);

      const setWindowSpy = vi.spyOn(useStore.getState(), 'setMemorySpikeWindowSec');

      const windowInput = getInputByLabelText(/Memory Spike Window/i);
      fireEvent.change(windowInput, { target: { value: '0' } });

      expect(setWindowSpy).not.toHaveBeenCalled();
    });

    it('does NOT show a validation error for a valid memorySpikeWindowSec value', () => {
      render(<SettingsPage />);

      const windowInput = getInputByLabelText(/Memory Spike Window/i);
      fireEvent.change(windowInput, { target: { value: '30' } });

      expect(screen.queryByText(/Must be ≥ 1 second/i)).not.toBeInTheDocument();
    });

    it('updates the store when a valid memorySpikeWindowSec value is entered', () => {
      render(<SettingsPage />);

      const setWindowSpy = vi.spyOn(useStore.getState(), 'setMemorySpikeWindowSec');

      const windowInput = getInputByLabelText(/Memory Spike Window/i);
      fireEvent.change(windowInput, { target: { value: '30' } });

      expect(setWindowSpy).toHaveBeenCalledWith(30);
    });
  });

  // ── Requirement 1.3 ─────────────────────────────────────────────────────────
  describe('API key status — not configured', () => {
    it('renders the amber "Configure Mistral Key →" link when is_copilot_configured returns false', async () => {
      mockedInvoke.mockResolvedValue(false);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Configure Mistral Key/i })).toBeInTheDocument();
      });
    });

    it('does NOT render the green chip when is_copilot_configured returns false', async () => {
      mockedInvoke.mockResolvedValue(false);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Configure Mistral Key/i })).toBeInTheDocument();
      });

      expect(screen.queryByText(/Ready \(Hybrid \/ Local\)/i)).not.toBeInTheDocument();
    });
  });

  // ── Requirement 1.4 ─────────────────────────────────────────────────────────
  describe('API key status — configured', () => {
    it('renders the green "Ready (Hybrid / Local)" chip when is_copilot_configured returns true', async () => {
      mockedInvoke.mockResolvedValue(true);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Ready \(Hybrid \/ Local\)/i)).toBeInTheDocument();
      });
    });

    it('does NOT render the amber "Configure Mistral Key →" link when is_copilot_configured returns true', async () => {
      mockedInvoke.mockResolvedValue(true);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Ready \(Hybrid \/ Local\)/i)).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /Configure Mistral Key/i })).not.toBeInTheDocument();
    });
  });
});

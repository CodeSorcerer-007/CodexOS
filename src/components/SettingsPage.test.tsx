import { expect, test, describe, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';

// Simple mock for Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('SettingsPage', () => {
  test('renders Settings header', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Terminal Shell')).toBeDefined();
  });
});

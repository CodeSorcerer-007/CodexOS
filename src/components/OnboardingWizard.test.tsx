import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnboardingWizard } from './OnboardingWizard';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn().mockResolvedValue('C:\\test-workspace'),
}));

describe('OnboardingWizard component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue('v1.0.0');
  });

  test('renders step 1 welcome screen initially', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    expect(screen.getByText(/welcome to codexos v2/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
  });

  test('navigates to step 2 on Get Started click', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(await screen.findByText(/set working directory/i)).toBeInTheDocument();
  });

  test('navigates to step 3 on Continue click', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    const continueBtn = await screen.findByRole('button', { name: /continue/i });
    fireEvent.click(continueBtn);
    expect(await screen.findByText(/environment check/i)).toBeInTheDocument();
  });

  test('detects tools in step 3', async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    const continueBtn = await screen.findByRole('button', { name: /continue/i });
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByText('Git')).toBeInTheDocument();
      expect(screen.getByText('Docker')).toBeInTheDocument();
    });
  });

  test('calls onComplete when finishing step 4', async () => {
    const onCompleteMock = vi.fn();
    render(<OnboardingWizard onComplete={onCompleteMock} />);
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    const continueBtn = await screen.findByRole('button', { name: /continue/i });
    fireEvent.click(continueBtn);
    const almostDoneBtn = await screen.findByRole('button', { name: /almost done/i });
    fireEvent.click(almostDoneBtn);

    const openBtn = await screen.findByRole('button', { name: /open codexos/i });
    fireEvent.click(openBtn);
    expect(onCompleteMock).toHaveBeenCalledTimes(1);
  });
});

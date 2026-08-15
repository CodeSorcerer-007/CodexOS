import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocalAI } from './LocalAI';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

describe('LocalAI component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  test('renders initial assistant greeting message', () => {
    render(<LocalAI />);
    expect(screen.getByText(/I am connected to your local Ollama instance/i)).toBeInTheDocument();
  });

  test('renders model selector and prompt input', () => {
    render(<LocalAI />);
    expect(screen.getByPlaceholderText(/ask anything or paste code/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  test('sends a prompt when Send button is clicked', async () => {
    render(<LocalAI />);
    const input = screen.getByPlaceholderText(/ask anything or paste code/i);
    fireEvent.change(input, { target: { value: 'Explain React hooks' } });

    const sendBtn = input.parentElement?.querySelector('button') as HTMLButtonElement;
    expect(sendBtn).not.toBeNull();
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText('Explain React hooks')).toBeInTheDocument();
      expect(invoke).toHaveBeenCalledWith('query_ollama', expect.objectContaining({
        prompt: expect.stringContaining('Explain React hooks'),
      }));
    });
  });

  test('clears conversation when clear button is clicked', () => {
    render(<LocalAI />);
    const clearBtn = screen.getByTitle(/clear chat/i);
    fireEvent.click(clearBtn);
    expect(screen.queryByText(/I am connected to your local Ollama/i)).not.toBeInTheDocument();
  });
});

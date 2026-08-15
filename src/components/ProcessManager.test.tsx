import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProcessManager } from './ProcessManager';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('./TerminalMultiplexer', () => ({
  TerminalPane: () => <div data-testid="terminal-pane-mock">Terminal Mock</div>,
}));

describe('ProcessManager component', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  test('renders empty state initially', () => {
    render(<ProcessManager />);
    expect(screen.getByRole('heading', { name: /processes/i })).toBeInTheDocument();
    expect(screen.getByText(/Select a process to configure/i)).toBeInTheDocument();
  });

  test('adds a new process task', () => {
    render(<ProcessManager />);
    const addBtn = screen.getByTitle(/add process/i);
    fireEvent.click(addBtn);

    expect(screen.getByDisplayValue('New Task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('npm run dev')).toBeInTheDocument();
  });

  test('starts a task', () => {
    render(<ProcessManager />);
    const addBtn = screen.getByTitle(/add process/i);
    fireEvent.click(addBtn);

    const startBtn = screen.getByRole('button', { name: /start/i });
    fireEvent.click(startBtn);

    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });
});

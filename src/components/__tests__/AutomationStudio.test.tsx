import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AutomationStudio } from '../AutomationStudio';
import { useStore } from '../../store/store';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="react-flow-mock">{children}</div>,
  Background: () => <div data-testid="flow-bg" />,
  Controls: () => <div data-testid="flow-controls" />,
  useNodesState: (initial: any) => {
    const [state, setState] = React.useState(initial);
    return [state, setState, vi.fn()];
  },
  useEdgesState: (initial: any) => {
    const [state, setState] = React.useState(initial);
    return [state, setState, vi.fn()];
  },
  addEdge: vi.fn(),
}));

describe('AutomationStudio component (Milestone M2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useStore.setState({ currentPath: '/test/workspace' });
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  test('renders automation studio with visual pipeline', () => {
    render(<AutomationStudio />);
    expect(screen.getByText(/Automation Studio/i)).toBeInTheDocument();
    expect(screen.getByTestId('react-flow-mock')).toBeInTheDocument();
  });

  test('initializes SQLite database tables including pipeline_runs', async () => {
    render(<AutomationStudio />);

    await waitFor(() => {
      // Verifies CREATE TABLE IF NOT EXISTS pipeline_runs was invoked
      expect(invoke).toHaveBeenCalledWith('query_sqlite', expect.objectContaining({
        query: expect.stringContaining('CREATE TABLE IF NOT EXISTS pipeline_runs'),
      }));
    });
  });

  test('saves pipeline state to workspace SQLite', async () => {
    render(<AutomationStudio />);
    const saveBtn = screen.getByRole('button', { name: /save to sqlite/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('query_sqlite', expect.objectContaining({
        query: expect.stringContaining('INSERT OR REPLACE INTO pipelines'),
      }));
    });
  });

  test('executes shell commands sequentially and records structured StepResults and pipeline runs', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'execute_command') {
        return 'Hello CodexOS Output\nProcess finished with exit code 0';
      }
      return undefined;
    });

    render(<AutomationStudio />);

    const runBtn = screen.getByRole('button', { name: /run pipeline/i });
    fireEvent.click(runBtn);

    // Wait for pipeline execution to complete
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('execute_command', expect.objectContaining({
        command: 'echo "Hello CodexOS"',
        cwd: '/test/workspace',
      }));
    });

    // Check pipeline persistence in SQLite
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('query_sqlite', expect.objectContaining({
        query: expect.stringContaining('INSERT INTO pipeline_runs'),
      }));
    });

    // Check localStorage persistence
    const savedRuns = JSON.parse(localStorage.getItem('codexos_automation_runs') || '[]');
    expect(savedRuns.length).toBeGreaterThan(0);
    expect(savedRuns[0].status).toBe('success');
    expect(savedRuns[0].stepResults.length).toBeGreaterThan(0);
    const cmdStep = savedRuns[0].stepResults.find((s: any) => s.command === 'echo "Hello CodexOS"');
    expect(cmdStep).toBeDefined();
    expect(cmdStep.exitCode).toBe(0);
    expect(cmdStep.status).toBe('success');
    expect(cmdStep.stdout).toContain('Hello CodexOS Output');

    // Switch to Step Results tab
    const stepsTab = screen.getByRole('button', { name: /step results/i });
    fireEvent.click(stepsTab);

    await waitFor(() => {
      expect(screen.getAllByText(/exit: 0/i)[0]).toBeInTheDocument();
      expect(screen.getByText(/Hello CodexOS Output/i)).toBeInTheDocument();
    });

    // Switch to Runs History tab
    const historyTab = screen.getByRole('button', { name: /runs history/i });
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(screen.getByText(/SUCCESS/i)).toBeInTheDocument();
    });
  });

  test('halts pipeline sequentially on node failure and records failed status', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'execute_command') {
        throw new Error('Command failed: exit code 127: command not found');
      }
      return undefined;
    });

    render(<AutomationStudio />);

    const runBtn = screen.getByRole('button', { name: /run pipeline/i });
    fireEvent.click(runBtn);

    // Wait for failure log and persistence
    await waitFor(() => {
      expect(screen.getByText(/\[ERROR\] Command failed: exit code 127/i)).toBeInTheDocument();
      expect(screen.getByText(/Pipeline stopped due to execution failure/i)).toBeInTheDocument();
    });

    // Verify run record saved with 'failed' status
    const savedRuns = JSON.parse(localStorage.getItem('codexos_automation_runs') || '[]');
    expect(savedRuns.length).toBeGreaterThan(0);
    expect(savedRuns[0].status).toBe('failed');
    const failedStep = savedRuns[0].stepResults.find((s: any) => s.command === 'echo "Hello CodexOS"');
    expect(failedStep).toBeDefined();
    expect(failedStep.exitCode).toBe(1);
    expect(failedStep.status).toBe('failed');
    expect(failedStep.stderr).toContain('exit code 127');
  });
});

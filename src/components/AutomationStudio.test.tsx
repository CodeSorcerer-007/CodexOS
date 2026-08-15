import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AutomationStudio } from './AutomationStudio';
import { useStore } from '../store/store';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => <div data-testid="react-flow-mock">{children}</div>,
  Background: () => <div data-testid="flow-bg" />,
  Controls: () => <div data-testid="flow-controls" />,
  useNodesState: (initial: any) => [initial, vi.fn(), vi.fn()],
  useEdgesState: (initial: any) => [initial, vi.fn(), vi.fn()],
  addEdge: vi.fn(),
}));

describe('AutomationStudio component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ currentPath: '/test/workspace' });
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  test('renders automation studio with visual pipeline', () => {
    render(<AutomationStudio />);
    expect(screen.getByText(/Automation Studio/i)).toBeInTheDocument();
    expect(screen.getByTestId('react-flow-mock')).toBeInTheDocument();
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
});

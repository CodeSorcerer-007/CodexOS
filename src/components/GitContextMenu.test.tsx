import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GitContextMenu } from './GitContextMenu';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('GitContextMenu component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
  });

  test('renders context menu options for file', () => {
    render(
      <GitContextMenu
        x={100}
        y={100}
        filePath="src/App.tsx"
        repoPath="/repo"
        onClose={vi.fn()}
        onActionComplete={vi.fn()}
      />
    );
    expect(screen.getByText('App.tsx')).toBeInTheDocument();
    expect(screen.getByText('Stage File')).toBeInTheDocument();
    expect(screen.getByText('Commit File')).toBeInTheDocument();
    expect(screen.getByText('Git Push')).toBeInTheDocument();
  });

  test('executes Stage File git action', async () => {
    const onActionComplete = vi.fn();
    const onClose = vi.fn();
    render(
      <GitContextMenu
        x={100}
        y={100}
        filePath="src/App.tsx"
        repoPath="/repo"
        onClose={onClose}
        onActionComplete={onActionComplete}
      />
    );

    const stageBtn = screen.getByText('Stage File');
    fireEvent.click(stageBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('git_action', {
        path: '/repo',
        action: 'add',
        file: 'App.tsx',
        message: '',
      });
      expect(onActionComplete).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});

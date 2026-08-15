import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VisualGit } from '../VisualGit';
import { invoke } from '@tauri-apps/api/core';

describe('VisualGit', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_git_status') {
        return {
          staged: ['file1.ts'],
          unstaged: ['file2.ts'],
          untracked: ['new.ts'],
          branch: 'main',
        };
      }
      if (cmd === 'get_branches') {
        return [
          { name: 'main', hash: 'abc1234', is_current: true, is_remote: false },
          { name: 'feature/test', hash: 'def5678', is_current: false, is_remote: false },
        ];
      }
      if (cmd === 'git_history') {
        return [
          { hash: 'abc1234', message: 'Initial commit', date: '2026-08-14' },
        ];
      }
      return null;
    });
  });

  it('renders source control header and staged changes', async () => {
    render(<VisualGit currentPath="/test/path" />);
    
    await waitFor(() => {
      expect(screen.getByText('Source Control')).toBeInTheDocument();
      expect(screen.getByText('Staged Changes')).toBeInTheDocument();
      expect(screen.getByText('file1.ts')).toBeInTheDocument();
    });
  });

  it('commit message input is a controlled field', async () => {
    render(<VisualGit currentPath="/test/path" />);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Commit message/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Commit message/i);
    fireEvent.change(input, { target: { value: 'Initial commit' } });
    expect(input).toHaveValue('Initial commit');
  });

  it('action buttons call correct invoke commands', async () => {
    render(<VisualGit currentPath="/test/path" />);
    
    await waitFor(() => {
      expect(screen.getByText('Commit')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Commit message/i);
    fireEvent.change(input, { target: { value: 'Fix bug' } });

    const commitButton = screen.getByText('Commit');
    fireEvent.click(commitButton);
    
    expect(invoke).toHaveBeenCalledWith('git_action', {
      path: '/test/path',
      action: 'commit',
      file: null,
      message: 'Fix bug',
    });
  });
});

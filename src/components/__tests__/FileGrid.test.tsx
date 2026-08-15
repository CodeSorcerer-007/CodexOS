import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileGrid } from '../FileGrid';
import { useStore } from '../../store/store';
import { invoke } from '@tauri-apps/api/core';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockFiles = [
  { name: 'folder1', path: '/test/folder1', is_dir: true, size_bytes: 0 },
  { name: 'file1.txt', path: '/test/file1.txt', is_dir: false, size_bytes: 1024 },
  { name: 'image.png', path: '/test/image.png', is_dir: false, size_bytes: 2048 },
];

describe('FileGrid Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      tabs: [{ id: 'tab-1', activeApp: 'home', currentPath: null, selectedFile: null, openFiles: [], pathHistory: [], historyIndex: -1 }],
      activeTabId: 'tab-1',
    });

    (invoke as any).mockImplementation((cmd: string, _args: any) => {
      if (cmd === 'get_files_in_dir') {
        return Promise.resolve(mockFiles);
      }
      if (cmd === 'get_sys_stats') {
        return Promise.resolve({ drives: [] });
      }
      if (cmd === 'get_git_status') {
        return Promise.resolve({});
      }
      return Promise.resolve();
    });
  });

  it('renders "This PC" correctly when no path is provided', async () => {
    render(
      <FileGrid 
        currentPath="This PC" 
        onNavigate={vi.fn()} 
        selectedFile={null} 
        onSelect={vi.fn()} 
      />
    );
    
    expect(screen.getByText('Devices and drives')).toBeInTheDocument();
  });

  it('loads and displays files for a given directory', async () => {
    render(
      <FileGrid 
        currentPath="/test" 
        onNavigate={vi.fn()} 
        selectedFile={null} 
        onSelect={vi.fn()} 
      />
    );

    await waitFor(() => {
      expect(screen.getByText('folder1')).toBeInTheDocument();
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
      expect(screen.getByText('image.png')).toBeInTheDocument();
    });

    expect(invoke).toHaveBeenCalledWith('get_files_in_dir', { path: '/test' });
  });

  it('filters files based on search input', async () => {
    render(
      <FileGrid 
        currentPath="/test" 
        onNavigate={vi.fn()} 
        selectedFile={null} 
        onSelect={vi.fn()} 
      />
    );

    await waitFor(() => {
      expect(screen.getByText('folder1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search/i);
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'file1' } });
    });

    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
      expect(screen.queryByText('folder1')).not.toBeInTheDocument();
      expect(screen.queryByText('image.png')).not.toBeInTheDocument();
    });
  });
  
  it('calls onSelect when a file is clicked', async () => {
    const mockOnSelect = vi.fn();
    render(
      <FileGrid 
        currentPath="/test" 
        onNavigate={vi.fn()} 
        selectedFile={null} 
        onSelect={mockOnSelect} 
      />
    );

    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });

    const fileEl = screen.getByText('file1.txt');
    fireEvent.click(fileEl);

    expect(mockOnSelect).toHaveBeenCalledWith('/test/file1.txt');
  });
});

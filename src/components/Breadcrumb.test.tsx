import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Breadcrumb } from './Breadcrumb';
import { useStore } from '../store/store';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('Breadcrumb component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      tabs: [{ id: 'tab-1', activeApp: 'files', currentPath: '/home/user/projects', selectedFile: null, openFiles: [], pathHistory: ['/home/user', '/home/user/projects'], historyIndex: 1 }],
      activeTabId: 'tab-1',
      currentPath: '/home/user/projects',
    });
  });

  test('renders null when currentPath is empty', () => {
    useStore.setState({ currentPath: null });
    const { container } = render(<Breadcrumb />);
    expect(container.firstChild).toBeNull();
  });

  test('renders path segments correctly', () => {
    render(<Breadcrumb />);
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.getByText('user')).toBeInTheDocument();
    expect(screen.getByText('projects')).toBeInTheDocument();
  });

  test('handles goBack and goForward buttons', () => {
    render(<Breadcrumb />);
    const backBtn = screen.getByTitle('Go Back');
    expect(backBtn).not.toBeDisabled();
    fireEvent.click(backBtn);
    expect(useStore.getState().currentPath).toBe('/home/user');
  });

  test('clicking on a segment navigates to that path', () => {
    render(<Breadcrumb />);
    const userSegment = screen.getByText('user');
    fireEvent.click(userSegment);
    expect(useStore.getState().currentPath).toBe('/home/user');
  });
});

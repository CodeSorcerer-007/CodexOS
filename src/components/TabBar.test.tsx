import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { TabBar } from './TabBar';
import { useStore } from '../store/store';

describe('TabBar Component', () => {
  beforeEach(() => {
    // Reset store before each test
    useStore.setState({
      tabs: [{ id: 'test-tab-1', activeApp: 'home', currentPath: null, selectedFile: null, openFiles: [] }],
      activeTabId: 'test-tab-1'
    });
  });

  it('renders initial tab correctly', () => {
    render(<TabBar />);
    // The default tab is 'home' which maps to 'Dashboard'
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('adds a new tab when plus button is clicked', async () => {
    render(<TabBar />);
    const plusBtn = screen.getByRole('button');
    fireEvent.click(plusBtn);
    
    await waitFor(() => {
      // Should now have 2 tabs
      const dashboardTabs = screen.getAllByText('Dashboard');
      expect(dashboardTabs.length).toBe(2);
    });
  });

  it('can close a tab', async () => {
    render(<TabBar />);
    
    // Add a second tab so the close button appears (it only shows if tabs.length > 1)
    const plusBtn = screen.getByRole('button');
    fireEvent.click(plusBtn);
    
    await waitFor(() => {
      expect(screen.getAllByText('Dashboard').length).toBe(2);
    });
    
    // The close button is rendered as an SVG within the tab div
    // But since it has onClick={closeTab}, we can query it via role or tag
    const svgs = document.querySelectorAll('svg.lucide-x');
    expect(svgs.length).toBeGreaterThan(0);
    
    fireEvent.click(svgs[0]);
    
    await waitFor(() => {
      // Should be back to 1 tab
      expect(screen.getAllByText('Dashboard').length).toBe(1);
    });
  });
});

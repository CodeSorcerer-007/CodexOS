import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TerminalMultiplexer } from '../TerminalMultiplexer';
import { invoke } from '@tauri-apps/api/core';

describe('TerminalMultiplexer', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
  });

  it('renders multiplexer heading and split buttons', () => {
    render(<TerminalMultiplexer />);
    expect(screen.getByText('Terminal Multiplexer')).toBeInTheDocument();
    expect(screen.getByText(/Split Vertical/i)).toBeInTheDocument();
    expect(screen.getByText(/Split Horizontal/i)).toBeInTheDocument();
  });

  it('split buttons add new terminal panes', () => {
    render(<TerminalMultiplexer />);
    
    const splitVertBtn = screen.getByText(/Split Vertical/i);
    fireEvent.click(splitVertBtn);
    
    // There should now be close buttons visible for multiple panes
    expect(screen.getAllByText('X').length).toBeGreaterThan(0);
  });

  it('terminal container mounts without crashing', () => {
    const { container } = render(<TerminalMultiplexer />);
    expect(container.querySelector('.xterm')).toBeInTheDocument();
  });
});

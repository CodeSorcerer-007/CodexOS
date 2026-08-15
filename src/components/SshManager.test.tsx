import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SshManager } from './SshManager';
import { useStore } from '../store/store';

describe('SshManager component', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ isVaultLocked: false });
  });

  test('renders SSH Remote Development title', () => {
    render(<SshManager />);
    expect(screen.getByRole('heading', { name: /ssh remote development/i })).toBeInTheDocument();
  });

  test('adds a new SSH connection item', () => {
    render(<SshManager />);
    const addBtn = screen.getByRole('button', { name: /add server/i });
    fireEvent.click(addBtn);

    expect(screen.getByDisplayValue('Production Server')).toBeInTheDocument();
    expect(screen.getByDisplayValue('root@192.168.1.100')).toBeInTheDocument();
  });

  test('connects to SSH and updates active path', () => {
    render(<SshManager />);
    const addBtn = screen.getByRole('button', { name: /add server/i });
    fireEvent.click(addBtn);

    const connectBtn = screen.getByRole('button', { name: /connect/i });
    fireEvent.click(connectBtn);

    expect(useStore.getState().currentPath).toBe('ssh://root@192.168.1.100/var/www');
    expect(useStore.getState().activeApp).toBe('files');
  });
});

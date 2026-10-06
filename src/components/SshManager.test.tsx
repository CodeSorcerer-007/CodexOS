import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SshManager } from './SshManager';
import { useStore } from '../store/store';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('SshManager component', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ isVaultLocked: false });
    vi.clearAllMocks();

    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_ssh_keys') {
        return [
          {
            key_id: 'id_ed25519_codexos_test',
            key_type: 'ssh-ed25519',
            public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... test@example.com',
            public_key_path: '/home/user/.ssh/id_ed25519_codexos_test.pub',
            private_key_path: '/home/user/.ssh/id_ed25519_codexos_test',
            comment: 'test@example.com',
          },
        ];
      }
      if (cmd === 'generate_ssh_keypair') {
        return {
          key_id: 'id_ed25519_codexos_123',
          key_type: 'ed25519',
          public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... generated',
          public_key_path: '/home/user/.ssh/id_ed25519_codexos_123.pub',
          private_key_path: '/home/user/.ssh/id_ed25519_codexos_123',
          comment: 'codexos-dev',
          created_at: '123456789',
        };
      }
      if (cmd === 'get_active_ports') {
        return [
          {
            port: '3000',
            pid: '1234',
            process_name: 'node',
            state: 'LISTENING',
          },
          {
            port: '8080',
            pid: '5678',
            process_name: 'codexos-backend',
            state: 'LISTENING',
          },
        ];
      }
      return undefined;
    });
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

    const connectBtn = screen.getByRole('button', { name: /connect workspace/i });
    fireEvent.click(connectBtn);

    expect(useStore.getState().currentPath).toBe('ssh://root@192.168.1.100/var/www');
    expect(useStore.getState().activeApp).toBe('files');
  });

  test('switches to SSH Keypairs tab and lists keys', async () => {
    render(<SshManager />);
    const keysTab = screen.getByRole('button', { name: /ssh keypairs/i });
    fireEvent.click(keysTab);

    await waitFor(() => {
      expect(screen.getByText('id_ed25519_codexos_test')).toBeInTheDocument();
      expect(screen.getByText('ssh-ed25519')).toBeInTheDocument();
    });
  });

  test('opens generate modal and calls generate_ssh_keypair', async () => {
    render(<SshManager />);
    const keysTab = screen.getByRole('button', { name: /ssh keypairs/i });
    fireEvent.click(keysTab);

    const genBtn = screen.getByRole('button', { name: /generate keypair/i });
    fireEvent.click(genBtn);

    const submitBtn = screen.getByRole('button', { name: /^generate key$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('generate_ssh_keypair', expect.objectContaining({
        keyType: 'ed25519',
      }));
    });
  });

  test('switches to Port Scanner tab and renders active listening ports', async () => {
    render(<SshManager />);
    const portsTab = screen.getByRole('button', { name: /port scanner/i });
    fireEvent.click(portsTab);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('get_active_ports');
      expect(screen.getByText('3000')).toBeInTheDocument();
      expect(screen.getByText('node')).toBeInTheDocument();
      expect(screen.getByText('8080')).toBeInTheDocument();
    });
  });
});

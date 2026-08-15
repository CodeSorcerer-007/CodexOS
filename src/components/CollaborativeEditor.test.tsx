import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollaborativeEditor } from './CollaborativeEditor';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation(async (cmd) => {
    if (cmd === 'read_file_text') return '// file content';
    return null;
  }),
}));

vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="monaco-editor-mock">Monaco Mock</div>,
}));

vi.mock('y-webrtc', () => {
  return {
    WebrtcProvider: class {
      roomName = 'test-room';
      awareness = {
        setLocalStateField: vi.fn(),
        on: vi.fn(),
      };
      on(event: string, cb: any) {
        if (event === 'status') cb({ status: 'connected' });
        if (event === 'peers') cb({ webrtcPeers: [] });
        if (event === 'synced') cb({ synced: true });
      }
      destroy() {}
    }
  };
});

vi.mock('y-monaco', () => {
  return {
    MonacoBinding: class {
      destroy() {}
    }
  };
});

describe('CollaborativeEditor component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders P2P CRDT editor interface', () => {
    render(<CollaborativeEditor currentPath="/test/workspace/index.ts" />);
    expect(screen.getByText(/CRDT Collaborative Editor/i)).toBeInTheDocument();
    expect(screen.getByText(/Encrypted Yjs \+ WebRTC/i)).toBeInTheDocument();
  });

  test('allows entering room ID and updating room state', () => {
    render(<CollaborativeEditor currentPath="/test/workspace/index.ts" />);
    const roomInput = screen.getByDisplayValue(/codexos-/i);
    fireEvent.change(roomInput, { target: { value: 'team-room-123' } });
    expect(screen.getByDisplayValue('team-room-123')).toBeInTheDocument();
  });
});

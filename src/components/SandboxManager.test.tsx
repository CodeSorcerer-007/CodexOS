import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SandboxManager } from './SandboxManager';

describe('SandboxManager component', () => {
  test('renders WASI Nano-VM sandbox interface', () => {
    render(<SandboxManager currentPath="/test/workspace" />);
    expect(screen.getByRole('heading', { name: /wasi nano-vm sandbox/i })).toBeInTheDocument();
    expect(screen.getByText(/Sandboxed Execution Active/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /boot nano-vm/i })).toBeInTheDocument();
  });
});

import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SandboxManager } from './SandboxManager';

describe('SandboxManager component', () => {
  test('renders sandbox manager with coming soon banner', () => {
    render(<SandboxManager currentPath="/test/workspace" />);
    expect(screen.getByRole('heading', { name: /nano-vm sandbox/i })).toBeInTheDocument();
    expect(screen.getByText(/Not Yet Implemented/i)).toBeInTheDocument();
    expect(screen.getByText(/WASI Preview 2/i)).toBeInTheDocument();
  });
});

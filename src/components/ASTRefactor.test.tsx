import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ASTRefactor } from './ASTRefactor';

vi.mock('web-tree-sitter', () => {
  return {
    default: class MockParser {
      static init = vi.fn().mockRejectedValue(new Error('Use fallback'));
    },
    init: vi.fn().mockRejectedValue(new Error('Use fallback')),
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('// auto fixed'),
}));

describe('ASTRefactor component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders AST structural refactoring interface', () => {
    render(<ASTRefactor currentPath="/test/workspace" />);
    expect(screen.getByText(/AST Refactor & Code Engine/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /analyze code/i })).toBeInTheDocument();
  });

  test('runs static analysis and displays lint suggestions', () => {
    render(<ASTRefactor currentPath="/test/workspace" />);
    const analyzeBtn = screen.getByRole('button', { name: /analyze code/i });
    fireEvent.click(analyzeBtn);

    expect(screen.getByText(/Use 'let' or 'const' instead of legacy 'var'/i)).toBeInTheDocument();
  });
});

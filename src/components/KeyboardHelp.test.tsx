import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { KeyboardHelp } from './KeyboardHelp';

describe('KeyboardHelp component', () => {
  test('does not render when closed', () => {
    const { container } = render(<KeyboardHelp />);
    expect(container.firstChild).toBeNull();
  });

  test('opens on codexos-show-shortcuts event', () => {
    render(<KeyboardHelp />);
    act(() => {
      window.dispatchEvent(new CustomEvent('codexos-show-shortcuts'));
    });
    expect(screen.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(screen.getByText('Ctrl + T')).toBeInTheDocument();
  });

  test('closes on Escape key press', () => {
    render(<KeyboardHelp />);
    act(() => {
      window.dispatchEvent(new CustomEvent('codexos-show-shortcuts'));
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('closes when clicking close button', () => {
    render(<KeyboardHelp />);
    act(() => {
      window.dispatchEvent(new CustomEvent('codexos-show-shortcuts'));
    });
    const closeBtn = screen.getByRole('button', { name: /close keyboard shortcuts/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

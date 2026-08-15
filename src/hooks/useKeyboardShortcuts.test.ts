import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useStore } from '../store/store';

const fireKey = (key: string, modifiers: { ctrlKey?: boolean; shiftKey?: boolean } = {}) => {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers })
  );
};

const resetStore = () => {
  useStore.setState({
    tabs: [{ id: 'tab-1', activeApp: 'home', currentPath: null, selectedFile: null, openFiles: [], pathHistory: [], historyIndex: -1 }],
    activeTabId: 'tab-1',
    activeApp: 'home',
    isVaultLocked: false,
  });
};

describe('useKeyboardShortcuts', () => {
  beforeEach(resetStore);

  it('Ctrl+1 navigates to home', () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey('1', { ctrlKey: true });
    expect(useStore.getState().activeApp).toBe('home');
  });

  it('Ctrl+4 navigates to 4th sidebar item (terminal)', () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey('4', { ctrlKey: true });
    expect(useStore.getState().activeApp).toBe('terminal');
  });

  it('Ctrl+T opens a new tab', () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey('t', { ctrlKey: true });
    expect(useStore.getState().tabs).toHaveLength(2);
  });

  it('Ctrl+W closes the current tab (when more than one exists)', () => {
    useStore.getState().addTab();
    expect(useStore.getState().tabs).toHaveLength(2);
    renderHook(() => useKeyboardShortcuts());
    fireKey('w', { ctrlKey: true });
    expect(useStore.getState().tabs).toHaveLength(1);
  });

  it('Ctrl+, opens settings', () => {
    renderHook(() => useKeyboardShortcuts());
    fireKey(',', { ctrlKey: true });
    expect(useStore.getState().activeApp).toBe('settings');
  });

  it('does not trigger shortcuts when vault is locked', () => {
    useStore.setState({ isVaultLocked: true });
    renderHook(() => useKeyboardShortcuts());
    fireKey('4', { ctrlKey: true });
    expect(useStore.getState().activeApp).toBe('home');
  });

  it('does not trigger shortcuts when user is typing in an input', () => {
    renderHook(() => useKeyboardShortcuts());
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: '4', ctrlKey: true, bubbles: true })
    );
    // activeApp should not have changed since event originated in an input
    expect(useStore.getState().activeApp).toBe('home');
    document.body.removeChild(input);
  });
});

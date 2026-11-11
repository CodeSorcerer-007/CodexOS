import { describe, it, expect, beforeEach } from 'vitest';
import { ROUTE_REGISTRY, useAppRouter } from '../AppRouter';
import { useStore } from '../../../store/store';
import { renderHook, act } from '@testing-library/react';

describe('AppRouter Routing and Registry', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({
        activeApp: 'home',
        currentPath: '/test/workspace',
        selectedFile: '/test/workspace/index.ts',
      });
    });
  });

  it('registers both zkp and hmac in ROUTE_REGISTRY pointing to the same vault component', () => {
    expect(ROUTE_REGISTRY.zkp).toBeDefined();
    expect(ROUTE_REGISTRY.hmac).toBeDefined();
    expect(ROUTE_REGISTRY.zkp).toBe(ROUTE_REGISTRY.hmac);
  });

  it('resolves HMACVault component when activeApp is "zkp"', () => {
    act(() => {
      useStore.setState({ activeApp: 'zkp' });
    });

    const { result } = renderHook(() => useAppRouter());
    expect(result.current.activeApp).toBe('zkp');
    expect(result.current.Component).toBe(ROUTE_REGISTRY.zkp);
  });

  it('resolves HMACVault component when activeApp is "hmac"', () => {
    act(() => {
      useStore.setState({ activeApp: 'hmac' });
    });

    const { result } = renderHook(() => useAppRouter());
    expect(result.current.activeApp).toBe('hmac');
    expect(result.current.Component).toBe(ROUTE_REGISTRY.hmac);
  });

  it('resolves CodexOSDashboard when activeApp is "home"', () => {
    act(() => {
      useStore.setState({ activeApp: 'home' });
    });

    const { result } = renderHook(() => useAppRouter());
    expect(result.current.activeApp).toBe('home');
    expect(result.current.Component).toBe(ROUTE_REGISTRY.home);
  });

  it('gracefully falls back to CodexOSDashboard for unrecognized route id', () => {
    act(() => {
      // Cast invalid route id to test fallback
      useStore.setState({ activeApp: 'unknown_route' as never });
    });

    const { result } = renderHook(() => useAppRouter());
    expect(result.current.Component).toBe(ROUTE_REGISTRY.home);
  });

  it('provides route state and actions from useAppRouter', () => {
    const { result } = renderHook(() => useAppRouter());
    expect(result.current.currentPath).toBe('/test/workspace');
    expect(result.current.selectedFile).toBe('/test/workspace/index.ts');
    expect(typeof result.current.setActiveApp).toBe('function');
    expect(typeof result.current.setCurrentPath).toBe('function');
    expect(typeof result.current.openFile).toBe('function');
  });
});

import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastContainer } from './ToastContainer';
import { useStore } from '../store/store';

describe('ToastContainer component', () => {
  beforeEach(() => {
    useStore.setState({ toasts: [] });
  });

  test('renders notification region with aria-label', () => {
    render(<ToastContainer />);
    expect(screen.getByRole('region', { name: /notifications/i })).toBeInTheDocument();
  });

  test('renders toasts added to store', () => {
    useStore.getState().addToast({
      type: 'success',
      title: 'Action Complete',
      message: 'File saved successfully',
    });
    render(<ToastContainer />);
    expect(screen.getByText('Action Complete')).toBeInTheDocument();
    expect(screen.getByText('File saved successfully')).toBeInTheDocument();
  });

  test('removes toast when clicked', () => {
    useStore.getState().addToast({
      type: 'error',
      title: 'Save Failed',
      message: 'Access denied',
    });
    render(<ToastContainer />);
    const toast = screen.getByText('Save Failed');
    fireEvent.click(toast);
    expect(useStore.getState().toasts).toHaveLength(0);
  });

  test('error toast has alert role', () => {
    useStore.getState().addToast({
      type: 'error',
      title: 'Fatal Error',
    });
    render(<ToastContainer />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

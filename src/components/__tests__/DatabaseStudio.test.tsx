import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseStudio } from '../DatabaseStudio';
import { invoke } from '@tauri-apps/api/core';

describe('DatabaseStudio', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockClear();
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === 'query_sqlite') {
        return {
          columns: ['id', 'name'],
          rows: [['1', 'test_user']]
        };
      }
      return null;
    });
  });

  it('query input is controlled', () => {
    render(<DatabaseStudio />);
    const input = screen.getByPlaceholderText(/SELECT \* FROM/i);
    fireEvent.change(input, { target: { value: 'SELECT * FROM users' } });
    expect(input).toHaveValue('SELECT * FROM users');
  });

  it('run query button calls query_sqlite', async () => {
    render(<DatabaseStudio />);
    const input = screen.getByPlaceholderText(/SELECT \* FROM/i);
    fireEvent.change(input, { target: { value: 'SELECT * FROM users' } });
    
    const runButton = screen.getByRole('button', { name: /Run Query/i });
    fireEvent.click(runButton);
    
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('query_sqlite', {
        path: '',
        query: 'SELECT * FROM users'
      });
    });
  });

  it('result table renders rows from mock data', async () => {
    render(<DatabaseStudio />);
    const input = screen.getByPlaceholderText(/SELECT \* FROM/i);
    fireEvent.change(input, { target: { value: 'SELECT * FROM users' } });
    
    const runButton = screen.getByRole('button', { name: /Run Query/i });
    fireEvent.click(runButton);
    
    await waitFor(() => {
      expect(screen.getByText('test_user')).toBeInTheDocument();
      expect(screen.getByText('name')).toBeInTheDocument();
    });
  });
});

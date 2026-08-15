import { describe, test, expect, vi } from 'vitest';
import {
  SysStatsSchema,
  GitStatusSchema,
  DiagnosisSchema,
  getSysStats,
  getGitStatus,
} from './ipc';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('IPC Validation & Contract Schemas', () => {
  describe('SysStatsSchema Contract', () => {
    test('parses valid sys stats object with multiple drives', () => {
      const valid = {
        cpu_usage: 12.5,
        mem_total: 16000000000,
        mem_used: 8000000000,
        drives: [
          {
            name: 'C:',
            mount_point: 'C:\\',
            total_space: 500000000000,
            available_space: 250000000000,
          },
          {
            name: 'D:',
            mount_point: 'D:\\',
            total_space: 1000000000000,
            available_space: 850000000000,
          },
        ],
      };
      const parsed = SysStatsSchema.parse(valid);
      expect(parsed).toEqual(valid);
      expect(parsed.drives).toHaveLength(2);
    });

    test('accepts empty drives array', () => {
      const valid = {
        cpu_usage: 0,
        mem_total: 0,
        mem_used: 0,
        drives: [],
      };
      const parsed = SysStatsSchema.parse(valid);
      expect(parsed.drives).toHaveLength(0);
    });

    test('rejects payload missing required fields', () => {
      expect(() => SysStatsSchema.parse({ cpu_usage: 10 })).toThrow();
      expect(() => SysStatsSchema.parse({ cpu_usage: 10, mem_total: 100, mem_used: 50 })).toThrow();
    });

    test('rejects malformed drive object', () => {
      const invalid = {
        cpu_usage: 50,
        mem_total: 1000,
        mem_used: 500,
        drives: [{ name: 'C:' }], // missing mount_point and space
      };
      expect(() => SysStatsSchema.parse(invalid)).toThrow();
    });

    test('getSysStats helper validates invoke output', async () => {
      const mockStats = {
        cpu_usage: 25.0,
        mem_total: 16000,
        mem_used: 4000,
        drives: [],
      };
      vi.mocked(invoke).mockResolvedValueOnce(mockStats);

      const result = await getSysStats();
      expect(result.cpu_usage).toBe(25.0);
    });

    test('getSysStats helper throws ZodError on schema mismatch from backend', async () => {
      vi.mocked(invoke).mockResolvedValueOnce({ cpu_usage: 'not-a-number' });
      await expect(getSysStats()).rejects.toThrow();
    });
  });

  describe('GitStatusSchema Contract', () => {
    test('parses valid git status with multiple branch naming styles', () => {
      const branches = ['main', 'feat/login-flow', 'v1.0.0', 'HEAD (detached at abc1234)'];
      for (const branch of branches) {
        const valid = {
          staged: ['src/App.tsx'],
          unstaged: ['src/ipc.ts'],
          untracked: ['newfile.txt'],
          branch,
        };
        const parsed = GitStatusSchema.parse(valid);
        expect(parsed.branch).toBe(branch);
      }
    });

    test('handles empty git status state', () => {
      const clean = {
        staged: [],
        unstaged: [],
        untracked: [],
        branch: 'main',
      };
      const parsed = GitStatusSchema.parse(clean);
      expect(parsed.staged).toHaveLength(0);
      expect(parsed.unstaged).toHaveLength(0);
      expect(parsed.untracked).toHaveLength(0);
    });

    test('rejects non-array staged files', () => {
      expect(() =>
        GitStatusSchema.parse({
          staged: 'invalid',
          unstaged: [],
          untracked: [],
          branch: 'main',
        })
      ).toThrow();
    });

    test('getGitStatus helper invokes backend and parses payload', async () => {
      const mockGit = {
        staged: ['fileA.ts'],
        unstaged: [],
        untracked: [],
        branch: 'develop',
      };
      vi.mocked(invoke).mockResolvedValueOnce(mockGit);

      const result = await getGitStatus('/fake/repo');
      expect(result.branch).toBe('develop');
      expect(result.staged).toContain('fileA.ts');
    });
  });

  describe('DiagnosisSchema Contract', () => {
    test('accepts all valid confidence levels (high, medium, low)', () => {
      const levels = ['high', 'medium', 'low'] as const;
      for (const confidence of levels) {
        const valid = {
          cause: 'Syntax error',
          confidence,
          explanation: 'Detailed explanation text',
          suggested_fix: 'Run `npm run build` to fix',
          related_files: ['src/index.ts', 'src/types.ts'],
        };
        const parsed = DiagnosisSchema.parse(valid);
        expect(parsed.confidence).toBe(confidence);
      }
    });

    test('rejects invalid confidence string', () => {
      const invalid = {
        cause: 'Syntax error',
        confidence: 'ultra-high',
        explanation: 'Some explanation',
        suggested_fix: 'Some fix',
        related_files: [],
      };
      expect(() => DiagnosisSchema.parse(invalid)).toThrow();
    });

    test('rejects missing suggested_fix', () => {
      const invalid = {
        cause: 'Syntax error',
        confidence: 'high',
        explanation: 'Some explanation',
        related_files: [],
      };
      expect(() => DiagnosisSchema.parse(invalid)).toThrow();
    });
  });
});

export type PluginCategory = 'DevTools' | 'AI' | 'Security' | 'Linter';

export interface PluginItem {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  category: PluginCategory;
  size: string;
  downloads: number;
  verified: boolean;
  peerHost?: string;
  wasmFile: string;
  sha256: string;
  bytecode?: string;
  corrupted?: boolean;
}

export interface InstalledPlugin extends PluginItem {
  installedAt: string;
  enabled: boolean;
}

export interface StepResult {
  nodeId: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  status: 'success' | 'failed' | 'running';
  executedAt: string;
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  status: 'success' | 'failed';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stepResults: StepResult[];
  logs: string[];
}

/* oxlint-disable react/only-export-components */
/**
 * Canonical Navigation Registry for CodexOS
 * Single source of truth for modules, icons, route IDs, and groups.
 */
import React from 'react';
import {
  LayoutDashboard, HardDrive, GitBranch, TerminalSquare,
  Workflow, Box, ShieldAlert, Zap, Layers, MonitorPlay,
  Key, Webhook, Activity, Users, Cpu, Store, FileCode2, FileText, Server,
  Globe, DatabaseZap, SlidersHorizontal, Gauge,
} from 'lucide-react';
import type { AppId } from '../types/apps';

export interface NavigationItem {
  id: AppId;
  icon: React.ReactNode;
  label: string;
  group: 'core' | 'system' | 'security' | 'network' | 'infra' | 'ai' | 'collab';
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'home',       icon: <LayoutDashboard size={18} />, label: 'Dashboard',     group: 'core' },
  { id: 'files',      icon: <HardDrive size={18} />,       label: 'Vaults',        group: 'core' },
  { id: 'editor',     icon: <FileCode2 size={18} />,       label: 'Code Editor',   group: 'core' },
  { id: 'terminal',   icon: <TerminalSquare size={18} />,  label: 'Terminal',      group: 'core' },
  { id: 'git',        icon: <GitBranch size={18} />,       label: 'Git Client',    group: 'core' },
  { id: 'gridline',   icon: <LayoutDashboard size={18} />, label: 'Gridline UI',   group: 'core' },
  { id: 'process',    icon: <Activity size={18} />,        label: 'Processes',     group: 'system' },
  { id: 'env',        icon: <FileText size={18} />,        label: 'Env Manager',   group: 'system' },
  { id: 'ssh',        icon: <Server size={18} />,          label: 'SSH Remote',    group: 'system' },
  { id: 'secrets',    icon: <Key size={18} />,             label: 'Secrets',       group: 'security' },
  { id: 'zkp',        icon: <ShieldAlert size={18} />,     label: 'ZKP Vault',     group: 'security' },
  { id: 'tunnel',     icon: <Webhook size={18} />,         label: 'Relay Tunnel',  group: 'network' },
  { id: 'network',    icon: <Globe size={18} />,           label: 'Proxy',         group: 'network' },
  { id: 'httpclient', icon: <SlidersHorizontal size={18} />, label: 'HTTP Client', group: 'network' },
  { id: 'docker',     icon: <Box size={18} />,             label: 'Docker',        group: 'infra' },
  { id: 'database',   icon: <DatabaseZap size={18} />,     label: 'Databases',     group: 'infra' },
  { id: 'gpu',        icon: <Cpu size={18} />,             label: 'GPU Cluster',   group: 'infra' },
  { id: 'memory',     icon: <Gauge size={18} />,           label: 'Memory',        group: 'infra' },
  { id: 'ai',         icon: <Zap size={18} />,             label: 'Local AI',      group: 'ai' },
  { id: 'ast',        icon: <Layers size={18} />,          label: 'AST Engine',    group: 'ai' },
  { id: 'automation', icon: <Workflow size={18} />,        label: 'Automation',    group: 'ai' },
  { id: 'crdt',       icon: <Users size={18} />,           label: 'Collab Editor', group: 'collab' },
  { id: 'sandbox',    icon: <MonitorPlay size={18} />,     label: 'Nano-VMs',      group: 'collab' },
  { id: 'market',     icon: <Store size={18} />,           label: 'Marketplace',   group: 'collab' },
];

export const SIDEBAR_ITEMS = NAVIGATION_ITEMS;

export type SidebarItemId = AppId;

export const GROUP_LABELS: Record<string, string> = {
  core:     'Core',
  system:   'System',
  security: 'Security',
  network:  'Network',
  infra:    'Infrastructure',
  ai:       'AI & Code',
  collab:   'Collaboration',
};

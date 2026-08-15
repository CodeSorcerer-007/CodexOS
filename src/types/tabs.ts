import type { AppId } from './apps';

export interface Tab {
  id: string;
  activeApp: AppId;
  currentPath: string | null;
}

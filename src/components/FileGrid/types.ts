export interface FileInfo {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
}

export interface DriveInfo {
  name: string;
  mount_point: string;
  total_space: number;
  available_space: number;
}

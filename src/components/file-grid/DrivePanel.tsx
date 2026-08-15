import React from 'react';
import { HardDrive24Regular } from '@fluentui/react-icons';

export interface DriveInfo {
  name: string;
  mount_point: string;
  total_space: number;
  available_space: number;
}

interface DrivePanelProps {
  drives: DriveInfo[];
  currentPath: string;
  onSelectDrive: (mountPoint: string) => void;
  formatBytes: (bytes: number) => string;
}

export const DrivePanel: React.FC<DrivePanelProps> = ({
  drives,
  currentPath,
  onSelectDrive,
  formatBytes,
}) => {
  if (drives.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 border-b border-white/10 bg-black/20">
      {drives.map((drive) => {
        const usedSpace = drive.total_space - drive.available_space;
        const percentUsed = drive.total_space > 0 ? (usedSpace / drive.total_space) * 100 : 0;
        const isActive = currentPath.toLowerCase().startsWith(drive.mount_point.toLowerCase());

        return (
          <button
            key={drive.mount_point}
            onClick={() => onSelectDrive(drive.mount_point)}
            className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-2 ${
              isActive
                ? 'bg-cyan/10 border-cyan text-white shadow-lg shadow-cyan/10'
                : 'bg-white/5 border-white/10 hover:border-white/20 text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <HardDrive24Regular className={isActive ? 'text-cyan' : 'text-gray-400'} />
              <span className="font-bold text-sm font-mono truncate">{drive.name || drive.mount_point}</span>
            </div>
            <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  percentUsed > 90 ? 'bg-red-500' : percentUsed > 75 ? 'bg-yellow-500' : 'bg-cyan'
                }`}
                style={{ width: `${percentUsed}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 font-mono">
              <span>{formatBytes(usedSpace)} used</span>
              <span>{formatBytes(drive.total_space)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

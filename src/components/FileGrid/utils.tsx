import {
  Folder24Filled,
  Document24Regular,
  Image24Regular,
  MusicNote124Regular,
  Video24Regular,
  FolderZip24Regular,
  DocumentPdf24Regular
} from '@fluentui/react-icons';
import type { FileInfo } from './types';

export const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatGB = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) {
    return `${(gb / 1024).toFixed(1)} TB`;
  }
  return `${gb.toFixed(1)} GB`;
};

export const getFileIcon = (file: FileInfo) => {
  if (file.is_dir) return <Folder24Filled className="text-[#e3a833]" />;
  
  const name = file.name.toLowerCase();
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.svg') || name.endsWith('.gif')) {
    return <Image24Regular className="text-[#00b4d8]" />;
  }
  if (name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.jsx') || name.endsWith('.tsx') || name.endsWith('.json') || name.endsWith('.css') || name.endsWith('.html')) {
    return <Document24Regular className="text-[#ff4d6d]" />;
  }
  if (name.endsWith('.zip') || name.endsWith('.tar') || name.endsWith('.gz') || name.endsWith('.rar')) {
    return <FolderZip24Regular className="text-[#ffb703]" />;
  }
  if (name.endsWith('.pdf')) {
    return <DocumentPdf24Regular className="text-[#e63946]" />;
  }
  if (name.endsWith('.mp3') || name.endsWith('.wav')) {
    return <MusicNote124Regular className="text-[#7209b7]" />;
  }
  if (name.endsWith('.mp4') || name.endsWith('.mkv')) {
    return <Video24Regular className="text-[#f77f00]" />;
  }
  
  return <Document24Regular className="text-[#a4b0be]" />;
};

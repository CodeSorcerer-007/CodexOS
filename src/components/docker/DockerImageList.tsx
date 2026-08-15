import { memo } from 'react';
import type { DockerImage } from '../../types/bindings/DockerImage';

interface DockerImageListProps {
  images: DockerImage[];
  pullImageName: string;
  onPullImageNameChange: (val: string) => void;
  onPullImage: () => void;
  onRequestRemove: (image: DockerImage) => void;
}

export const DockerImageList = memo(({
  images,
  pullImageName,
  onPullImageNameChange,
  onPullImage,
  onRequestRemove,
}: DockerImageListProps) => {
  return (
    <div className="flex flex-col gap-4 flex-1 overflow-hidden">
      <div className="premium-card p-4 flex gap-4 items-center">
        <input
          type="text"
          value={pullImageName}
          onChange={(e) => onPullImageNameChange(e.target.value)}
          placeholder="e.g. nginx:latest"
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500 transition-colors"
        />
        <button
          onClick={onPullImage}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(37,99,235,0.4)]"
        >
          Pull Image
        </button>
      </div>

      <div className="premium-card flex-1 overflow-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-max">
        {(images || []).map((image) => (
          <div
            key={image.id}
            className="bg-black/30 border border-white/5 rounded-lg p-4 flex flex-col gap-3 group hover:border-white/20 transition-colors"
          >
            <div className="flex justify-between items-start">
              <span className="font-bold text-white truncate mr-2" title={image.repository}>
                {image.repository}
              </span>
              <button
                onClick={() => onRequestRemove(image)}
                aria-label={`Remove image ${image.repository}`}
                className="text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                </svg>
              </button>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="bg-blue-900/30 text-blue-300 px-2 py-0.5 rounded font-mono border border-blue-500/20">
                {image.tag}
              </span>
              <span className="text-gray-400 font-mono">{image.size}</span>
            </div>

            <div className="text-xs text-gray-500 font-mono mt-2 truncate">ID: {image.id}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

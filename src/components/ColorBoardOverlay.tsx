import { motion } from 'framer-motion';

export const ColorBoardOverlay = ({ content }: { content: string }) => {
  // Regex to extract Hex and rgb/rgba colors
  const hexRegex = /#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})\b/g;
  const rgbRegex = /rgba?\([^)]+\)/g;

  const hexColors = Array.from(new Set(content.match(hexRegex) || []));
  const rgbColors = Array.from(new Set(content.match(rgbRegex) || []));
  const allColors = [...hexColors, ...rgbColors];

  if (allColors.length === 0) return null;

  return (
    <div className="absolute right-0 top-0 bottom-0 w-64 bg-[#111111]/90 backdrop-blur-xl border-l border-white/10 p-4 overflow-y-auto liquid-glass shadow-2xl z-20">
      <h3 className="text-gray-300 font-bold mb-4 text-sm flex items-center gap-2">
        <span>🎨</span> Palette Extractor
      </h3>
      <div className="flex flex-col gap-2">
        {allColors.map((color, i) => (
          <motion.div
            whileHover={{ scale: 1.05, x: -5 }}
            key={i}
            className="flex items-center gap-3 bg-black/40 p-2 rounded-lg cursor-pointer border border-white/5 hover:bg-white/5 transition-colors"
            onClick={() => navigator.clipboard.writeText(color)}
          >
            <div 
              className="w-8 h-8 rounded-full shadow-inner border border-white/20"
              style={{ backgroundColor: color }}
            />
            <span className="font-mono text-xs text-gray-400 font-bold truncate">
              {color}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

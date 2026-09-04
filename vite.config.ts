/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'monaco-editor/esm/vs/esm/vs/editor/editor.api.js', replacement: 'monaco-editor' },
      { find: 'monaco-editor/esm/vs/editor/editor.api.js', replacement: 'monaco-editor' },
      { find: '@', replacement: path.resolve(import.meta.dirname, 'src') }
    ]
  },
  build: {
    // Target the Chromium version bundled with Tauri 2
    target: ['chrome120'],
    minify: 'esbuild' as const,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-is')) return 'vendor-react';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('recharts')) return 'vendor-charts';
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'vendor-monaco';
          if (id.includes('reactflow') || id.includes('@xyflow')) return 'vendor-flow';
          if (id.includes('yjs') || id.includes('y-monaco') || id.includes('y-webrtc')) return 'vendor-collab';
          if (id.includes('xterm') || id.includes('@xterm')) return 'vendor-xterm';
          if (id.includes('web-tree-sitter')) return 'vendor-treesitter';
          if (id.includes('lucide-react') || id.includes('@fluentui')) return 'vendor-icons';
        }
      }
    }
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
    'import.meta.env.DROP_CONSOLE': JSON.stringify(process.env.NODE_ENV === 'production'),
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
    exclude: ['e2e/**', 'node_modules/**'],
    testTimeout: 30000,
    fileParallelism: false,
    maxWorkers: 1,
  },
})

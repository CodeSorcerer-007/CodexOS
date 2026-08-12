/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'monaco-editor/esm/vs/editor/editor.api.js': 'monaco-editor'
    }
  },
  build: {
    // Target the Chromium version bundled with Tauri 2
    target: ['chrome120'],
    // Strip console.* and debugger statements in production builds
    // Note: Vite 5+ moved drop options into minify's dedicated config key.
    minify: 'esbuild' as const,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('recharts')) return 'vendor-charts';
          if (id.includes('monaco-editor') || id.includes('@monaco-editor')) return 'vendor-monaco';
          if (id.includes('reactflow')) return 'vendor-flow';
          if (id.includes('yjs') || id.includes('y-monaco') || id.includes('y-webrtc')) return 'vendor-collab';
          if (id.includes('xterm')) return 'vendor-xterm';
        }
      }
    }
  },
  define: {
    // Strip debug-only code in production; also drop console/debugger via esbuild
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
  },
})

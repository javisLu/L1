import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/** png-js 引入的 fflate 换成同步解压（见 src/vendor/fflate-sync.ts） */
function pngSyncInflate(): Plugin {
  const shim = fileURLToPath(new URL('./src/vendor/fflate-sync.ts', import.meta.url));
  return {
    name: 'png-js-sync-inflate',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'fflate' && importer && /[\\/]png-js[\\/]/.test(importer)) return shim;
      return null;
    },
  };
}

// Tauri 开发模式固定端口；构建产物为相对路径，桌面壳直接加载 dist/
export default defineConfig({
  plugins: [pngSyncInflate(), react()],
  base: './',
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'es2021', outDir: 'dist', sourcemap: false },
  test: { environment: 'node' },
} as never);

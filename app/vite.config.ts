import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri 开发模式固定端口；构建产物为相对路径，桌面壳直接加载 dist/
export default defineConfig({
  plugins: [react()],
  base: './',
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'es2021', outDir: 'dist', sourcemap: false },
  test: { environment: 'node' },
} as never);

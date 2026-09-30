import type { StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';

/** 是否运行在桌面外壳（Tauri）里 */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * 桌面版：数据写入应用数据目录下的 JSON 文件（便于备份与恢复）。
 * 浏览器调试：写入 IndexedDB。
 * 写入做 300ms 合并，避免每次按键都写盘；窗口关闭前立即落盘。
 */
function desktopStorage(): StateStorage {
  const fs = import('@tauri-apps/plugin-fs');
  const file = (k: string) => k + '.json';
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, string>();

  const write = async (k: string, v: string) => {
    const { writeTextFile, mkdir, exists, rename, BaseDirectory } = await fs;
    const baseDir = BaseDirectory.AppData;
    if (!(await exists('', { baseDir }))) await mkdir('', { baseDir, recursive: true });
    // 先写临时文件再改名，避免写到一半断电导致数据文件损坏
    await writeTextFile(file(k) + '.tmp', v, { baseDir });
    await rename(file(k) + '.tmp', file(k), { oldPathBaseDir: baseDir, newPathBaseDir: baseDir });
  };
  const flush = () => {
    for (const [k, v] of pending) void write(k, v);
    pending.clear();
  };
  window.addEventListener('beforeunload', flush);

  return {
    getItem: async (k) => {
      const { readTextFile, exists, BaseDirectory } = await fs;
      const baseDir = BaseDirectory.AppData;
      return (await exists(file(k), { baseDir })) ? readTextFile(file(k), { baseDir }) : null;
    },
    setItem: (k, v) => {
      pending.set(k, v);
      clearTimeout(timers.get(k));
      timers.set(k, setTimeout(() => {
        pending.delete(k);
        write(k, v).catch((e) => console.error('保存失败', e));
      }, 300));
    },
    removeItem: async (k) => {
      const { remove, exists, BaseDirectory } = await fs;
      const baseDir = BaseDirectory.AppData;
      if (await exists(file(k), { baseDir })) await remove(file(k), { baseDir });
    },
  };
}

const browserStorage: StateStorage = {
  getItem: async (k) => (await get<string>(k)) ?? null,
  setItem: (k, v) => set(k, v),
  removeItem: (k) => del(k),
};

export const appStorage: StateStorage = isDesktop ? desktopStorage() : browserStorage;

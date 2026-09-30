import { isDesktop } from '../store/storage';

/** 导出文件统一保存在「文档/外贸超级工作台/订单号 订单名/」下 */
export const EXPORT_ROOT = '外贸超级工作台';

/** 去掉 Windows / macOS 文件名里不允许的字符 */
export const safeName = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim() || '未命名';

export interface OutFile { name: string; data: Uint8Array }
export interface SaveResult { dir: string | null; paths: string[] }

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  zip: 'application/zip',
};

function download(f: OutFile) {
  const ext = f.name.split('.').pop() ?? '';
  const url = URL.createObjectURL(new Blob([f.data as BlobPart], { type: MIME[ext] ?? 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 导出根目录：优先「文档」，系统没有文档目录时退到「下载」，再退到本软件数据目录 */
async function exportBase() {
  const { BaseDirectory } = await import('@tauri-apps/plugin-fs');
  const path = await import('@tauri-apps/api/path');
  const candidates = [
    { baseDir: BaseDirectory.Document, dir: path.documentDir, prefix: EXPORT_ROOT },
    { baseDir: BaseDirectory.Download, dir: path.downloadDir, prefix: EXPORT_ROOT },
    { baseDir: BaseDirectory.AppData, dir: path.appDataDir, prefix: 'exports' },
  ];
  for (const c of candidates) {
    try {
      return { baseDir: c.baseDir, abs: await path.join(await c.dir(), c.prefix), prefix: c.prefix };
    } catch {
      // 该目录在当前系统不可用，尝试下一个
    }
  }
  throw new Error('找不到可以保存文件的文件夹');
}

export async function saveFiles(folder: string, files: OutFile[]): Promise<SaveResult> {
  if (!isDesktop) {
    files.forEach(download);
    return { dir: null, paths: [] };
  }
  const { writeFile, mkdir } = await import('@tauri-apps/plugin-fs');
  const { join } = await import('@tauri-apps/api/path');
  const base = await exportBase();
  const sub = safeName(folder);
  const rel = await join(base.prefix, sub);
  await mkdir(rel, { baseDir: base.baseDir, recursive: true });
  const dir = await join(base.abs, sub);
  const paths: string[] = [];
  for (const f of files) {
    const name = safeName(f.name);
    await writeFile(await join(rel, name), f.data, { baseDir: base.baseDir });
    paths.push(await join(dir, name));
  }
  return { dir, paths };
}

/** 在资源管理器 / 访达中显示文件 */
export async function reveal(path: string) {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
  await revealItemInDir(path);
}

import { toast, useUI } from '../store/ui';
import { DOCNAMES, type DocKey, type Fmt } from '../modules/defs';
import type { Order } from '../domain/types';

async function run<T extends { dir: string | null; paths: string[]; name: string }>(label: string, job: () => Promise<T>, done: (r: T) => string) {
  const ui = useUI.getState();
  if (ui.busy) return;
  ui.set({ busy: true });
  toast(`正在生成${label}…`, undefined, 2500);
  try {
    const r = await job();
    const path = r.paths[0];
    if (path) {
      const { reveal } = await import('./save');
      toast(done(r), { label: '打开文件夹', run: () => void reveal(path).catch((e) => toast('无法打开文件夹：' + String(e))) });
    } else toast(done(r) + '（已下载）');
  } catch (e) {
    console.error(e);
    toast(`${label}生成失败：${e instanceof Error ? e.message : String(e)}`, undefined, 8000);
  } finally {
    useUI.getState().set({ busy: false });
  }
}

export function exportDoc(o: Order, doc: DocKey, fmt: Fmt) {
  return run(`「${DOCNAMES[doc]}」${fmt}`, async () => (await import('./index')).exportOne(o, doc, fmt), (r) => `已保存 ${r.name}`);
}

export function exportZip(o: Order, items: { doc: DocKey; fmt: Fmt }[], bundle: string) {
  if (!items.length) return toast('请先勾选要导出的单据');
  return run(`${bundle}资料包`, async () => (await import('./index')).exportBundle(o, items, bundle), (r) => `已打包 ${r.count} 个文件：${r.name}`);
}

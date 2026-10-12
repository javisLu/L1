import { toast, useUI } from '../store/ui';
import { DOCNAMES, type DocKey, type Fmt } from '../modules/defs';
import { useData } from '../store/data';
import { takeSnap } from '../domain/history';
import type { Order } from '../domain/types';

/** 导出过程只占一条提示：「正在生成…」完成后原地换成结果 */
const KEY = 'export';

async function run<T extends { dir: string | null; paths: string[]; name: string }>(label: string, job: () => Promise<T>, done: (r: T) => string, after?: (r: T) => void) {
  const ui = useUI.getState();
  if (ui.busy) return;
  ui.set({ busy: true });
  toast(`正在生成${label}…`, undefined, 60000, KEY);
  try {
    const r = await job();
    after?.(r);
    const path = r.paths[0];
    if (path) {
      const { reveal } = await import('./save');
      toast(done(r), { label: '打开文件夹', run: () => void reveal(path).catch((e) => toast('无法打开文件夹：' + String(e))) }, undefined, KEY);
    } else toast(done(r) + '（已下载）', undefined, undefined, KEY);
  } catch (e) {
    console.error(e);
    toast(`${label}生成失败：${e instanceof Error ? e.message : String(e)}`, undefined, 8000, KEY);
  } finally {
    useUI.getState().set({ busy: false });
  }
}

export function exportDoc(o: Order, doc: DocKey, fmt: Fmt) {
  // 留底取导出那一刻的数据（导出过程中再改也不影响记录）
  const snap = takeSnap(o);
  return run(`「${DOCNAMES[doc]}」${fmt}`, async () => (await import('./index')).exportOne(o, doc, fmt), (r) => `已保存 ${r.name}`,
    (r) => useData.getState().markExported(o.id, { docs: [doc], snap, file: r.name }));
}

export function exportZip(o: Order, items: { doc: DocKey; fmt: Fmt }[], bundle: string) {
  if (!items.length) return toast('请先勾选要导出的单据');
  const docs = [...new Set(items.map((x) => x.doc))];
  const snap = takeSnap(o);
  return run(`${bundle}资料包`, async () => (await import('./index')).exportBundle(o, items, bundle), (r) => `已打包 ${r.count} 个文件：${r.name}`,
    (r) => useData.getState().markExported(o.id, { docs, snap, to: bundle, file: r.name }));
}

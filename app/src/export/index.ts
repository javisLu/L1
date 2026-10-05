import JSZip from 'jszip';
import { DOCNAMES, EXT, docFile, type DocKey, type Fmt } from '../modules/defs';
import { saveFiles, type OutFile, type SaveResult } from './save';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Order } from '../domain/types';

export const orderFolder = (o: Order) => `${o.no} ${o.name}`;

/** 生成单个单据文件（按需加载 PDF / Excel / Word 库） */
export async function buildFile(o: Order, doc: DocKey, fmt: Fmt): Promise<OutFile> {
  const name = `${docFile(o, doc)}.${EXT[fmt]}`;
  const { assets, labels } = useData.getState().settings;
  if (fmt === 'PDF') {
    const { renderPdf } = await import('./pdf');
    const range = doc === 'labels' ? useUI.getState().labelRange : null;
    return { name, data: await renderPdf(o, doc, assets, { ...labels, ...range }) };
  }
  if (fmt === 'Excel' && (doc === 'booking' || doc === 'si')) {
    const { renderShipExcel } = await import('./shipexcel');
    const ff = useData.getState().partners.find((p) => p.id === o.partners.forwarder);
    return { name, data: await renderShipExcel(o, doc, ff ? [ff.name, ff.contact, ff.phone].filter(Boolean).join('  ') : '') };
  }
  if (fmt === 'Excel') {
    if (doc === 'contract' || doc === 'marks' || doc === 'labels' || doc === 'advice') throw new Error(`${DOCNAMES[doc]}不支持导出 Excel`);
    const { renderExcel } = await import('./excel');
    return { name, data: await renderExcel(o, doc as Parameters<typeof renderExcel>[1], assets) };
  }
  if (doc !== 'contract') throw new Error(`${DOCNAMES[doc]}不支持导出 Word`);
  const { renderContractDocx } = await import('./word');
  return { name, data: await renderContractDocx(o, assets) };
}

export async function exportOne(o: Order, doc: DocKey, fmt: Fmt): Promise<SaveResult & { name: string }> {
  const f = await buildFile(o, doc, fmt);
  const r = await saveFiles(orderFolder(o), [f]);
  return { ...r, name: f.name };
}

/** 按收件人打包：生成所选单据的各格式文件，压缩为一个 zip */
export async function exportBundle(o: Order, items: { doc: DocKey; fmt: Fmt }[], bundle: string): Promise<SaveResult & { name: string; count: number }> {
  const zip = new JSZip();
  for (const it of items) {
    const f = await buildFile(o, it.doc, it.fmt);
    zip.file(f.name, f.data);
  }
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const name = `${o.no}_${o.name}_${bundle}.zip`;
  const r = await saveFiles(orderFolder(o), [{ name, data }]);
  return { ...r, name, count: items.length };
}

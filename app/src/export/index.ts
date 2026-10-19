import JSZip from 'jszip';
import { DOCNAMES, EXT, docFile, type DocKey, type Fmt } from '../modules/defs';
import { saveFiles, type OutFile, type SaveResult } from './save';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import { factoriesOf, factoryName, poNo } from '../domain/purchase';
import type { Order } from '../domain/types';

export const orderFolder = (o: Order) => `${o.no} ${o.name}`;

/** 采购单文件名：采购单号 + 工厂名（几个工厂各一份，一看就知道发给谁） */
const poFile = (o: Order, fid: string) => {
  const name = factoryName(useData.getState().partners, fid);
  return [poNo(o, fid) || '采购单', name].filter(Boolean).join(' ');
};

/** 生成单个单据文件（按需加载 PDF / Excel / Word 库）；采购单要指定工厂 */
export async function buildFile(o: Order, doc: DocKey, fmt: Fmt, factory?: string): Promise<OutFile> {
  const fid = doc === 'po' ? (factory ?? factoriesOf(o)[0]) : undefined;
  const name = `${fid != null ? poFile(o, fid) : docFile(o, doc)}.${EXT[fmt]}`;
  const { assets, labels } = useData.getState().settings;
  if (fmt === 'PDF') {
    const { renderPdf } = await import('./pdf');
    const range = doc === 'labels' ? useUI.getState().labelRange : null;
    return { name, data: await renderPdf(o, doc, assets, { ...labels, ...range }, fid) };
  }
  if (fmt === 'Excel' && doc === 'po') {
    const { renderPoExcel } = await import('./poexcel');
    return { name, data: await renderPoExcel(o, fid!, useData.getState().partners, assets) };
  }
  if (fmt === 'Excel' && (doc === 'booking' || doc === 'si')) {
    const { renderShipExcel } = await import('./shipexcel');
    const ff = useData.getState().partners.find((p) => p.id === o.partners.forwarder);
    return { name, data: await renderShipExcel(o, doc, ff ? [ff.name, ff.contact, ff.phone].filter(Boolean).join('  ') : '') };
  }
  if (fmt === 'Excel') {
    if (doc === 'contract' || doc === 'marks' || doc === 'labels' || doc === 'advice' || doc === 'po') throw new Error(`${DOCNAMES[doc]}不支持导出 Excel`);
    const { renderExcel } = await import('./excel');
    return { name, data: await renderExcel(o, doc as Parameters<typeof renderExcel>[1], assets) };
  }
  if (doc !== 'contract') throw new Error(`${DOCNAMES[doc]}不支持导出 Word`);
  const { renderContractDocx } = await import('./word');
  return { name, data: await renderContractDocx(o, assets) };
}

/** 一份单据的全部文件：采购单按工厂各一份（只要某个工厂的传 factory），其它单据一份 */
export async function buildFiles(o: Order, doc: DocKey, fmt: Fmt, factory?: string): Promise<OutFile[]> {
  if (doc !== 'po') return [await buildFile(o, doc, fmt)];
  const fids = factory != null ? [factory] : factoriesOf(o);
  const out: OutFile[] = [];
  for (const fid of fids) out.push(await buildFile(o, doc, fmt, fid));
  return out;
}

export async function exportOne(o: Order, doc: DocKey, fmt: Fmt): Promise<SaveResult & { name: string }> {
  const fs = await buildFiles(o, doc, fmt);
  const r = await saveFiles(orderFolder(o), fs);
  return { ...r, name: fs.map((f) => f.name).join('、') };
}

/** 按收件人打包：生成所选单据的各格式文件，压缩为一个 zip */
export async function exportBundle(o: Order, items: { doc: DocKey; fmt: Fmt }[], bundle: string, factory?: string): Promise<SaveResult & { name: string; count: number }> {
  const zip = new JSZip();
  let count = 0;
  for (const it of items) {
    for (const f of await buildFiles(o, it.doc, it.fmt, factory)) {
      zip.file(f.name, f.data);
      count++;
    }
  }
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  const name = `${o.no}_${o.name}_${bundle}.zip`;
  const r = await saveFiles(orderFolder(o), [{ name, data }]);
  return { ...r, name, count };
}

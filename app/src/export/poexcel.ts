import ExcelJS from 'exceljs';
import { THEMES } from '../domain/constants';
import { calcOrder, fixed, qtyTotal, toNum, unitTotals } from '../domain/calc';
import { factoryName, poNo, poRows, purchaseOf, rmbWords } from '../domain/purchase';
import type { DocAssets } from '../docs/primitives';
import type { Order, Partner } from '../domain/types';
import { fit, imageInfo } from './images';

const thin = { style: 'thin' as const, color: { argb: 'FFC9CFD8' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const MONEY = '#,##0.00';

/** 采购单 Excel（给工厂）：金额、合计是公式，工厂改数量单价会自动重算 */
export async function renderPoExcel(o: Order, fid: string, partners: Partner[], assets?: DocAssets): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '外贸超级工作台';
  const ws = wb.addWorksheet('采购单', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 6 }, { width: 14 }, { width: 34 }, { width: 8 }, { width: 11 }, { width: 13 }, { width: 15 }];
  const last = 7;
  const acc = 'FF' + (THEMES[o.docset.theme] ?? '#1d3f72').slice(1).toUpperCase();
  const k = calcOrder(o);
  const pur = purchaseOf(o);
  const po = pur.pos[fid] ?? {};
  const fp = partners.find((p) => p.id === fid);
  const idx = poRows(o, fid);
  let r = 1;

  const logo = imageInfo(assets?.logo ?? '');
  if (logo) {
    const id = wb.addImage({ base64: logo.base64, extension: logo.ext });
    ws.addImage(id, { tl: { col: 0.1, row: 0.1 } as never, ext: fit(logo, 120, 48), editAs: 'oneCell' });
  }
  const from = logo ? 3 : 1;
  const line = (text: string, opt: { bold?: boolean; size?: number; color?: string; align?: 'left' | 'center' | 'right'; from?: number } = {}) => {
    ws.mergeCells(r, opt.from ?? 1, r, last);
    const c = ws.getCell(r, opt.from ?? 1);
    c.value = text;
    c.font = { name: 'Arial', bold: opt.bold, size: opt.size ?? 10, color: opt.color ? { argb: opt.color } : undefined };
    c.alignment = { horizontal: opt.align ?? 'left', vertical: 'middle', wrapText: true };
    r++;
    return c;
  };
  const label = (c: ExcelJS.Cell, t: string) => { c.value = t; c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF4B5563' } }; c.alignment = { vertical: 'top', wrapText: true }; };
  const pair = (l: string, v: string) => {
    ws.mergeCells(r, 1, r, 2);
    label(ws.getCell(r, 1), l);
    ws.mergeCells(r, 3, r, last);
    const c = ws.getCell(r, 3);
    c.value = v; c.font = { name: 'Arial', size: 10 }; c.alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.max(16, String(v).split('\n').length * 13 + 3);
    r++;
  };

  line(o.seller.nameCn || o.seller.name, { bold: true, size: 14, color: acc, from });
  line(o.seller.address, { size: 9, from });
  line(`电话：${o.seller.phone}   邮箱：${o.seller.email}`, { size: 9, from });
  r++;
  line('采购单  PURCHASE ORDER', { bold: true, size: 18, color: acc, align: 'center' });
  r++;
  pair('采购单号', poNo(o, fid));
  pair('日期', o.numbers.date);
  pair('需方（采购方）', `${o.seller.nameCn || o.seller.name}  ${o.seller.phone}`);
  if (o.seller.invoiceInfo?.trim()) pair('开票信息', o.seller.invoiceInfo.trim());
  pair('供方（工厂）', [factoryName(partners, fid), fp?.contact && `联系人：${fp.contact}`, fp?.phone && `电话：${fp.phone}`].filter(Boolean).join('   '));
  r++;

  const head = ['序号', '型号', '品名 / 规格', '单位', '数量', '单价（元）', '金额（元）'];
  head.forEach((h, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = h; c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: acc } }; c.border = box;
    c.alignment = { horizontal: i >= 4 ? 'right' : i === 0 || i === 3 ? 'center' : 'left', vertical: 'middle' };
  });
  r++;
  const first = r;
  const rows = idx.length ? idx : Array.from({ length: 8 }, () => -1);
  rows.forEach((i, n) => {
    const it = i >= 0 ? o.items[i] : null;
    const row = k.rows[i];
    const vals: (string | number | null)[] = it
      ? [n + 1, it.model, [it.nameCn || it.nameEn, it.spec].filter(Boolean).join('\n'), it.unit, toNum(row.q) || null, toNum(it.cost) || null, null]
      : [null, null, null, null, null, null, null];
    vals.forEach((v, j) => {
      const c = ws.getCell(r, j + 1);
      c.value = v; c.border = box; c.font = { name: 'Arial', size: 10 };
      c.alignment = { vertical: 'top', wrapText: true, horizontal: j >= 4 ? 'right' : j === 0 || j === 3 ? 'center' : 'left' };
    });
    if (it) ws.getCell(r, 7).value = { formula: `IF(AND(E${r}<>"",F${r}<>""),E${r}*F${r},"")` };
    ws.getCell(r, 6).numFmt = MONEY;
    ws.getCell(r, 7).numFmt = MONEY;
    r++;
  });
  ws.mergeCells(r, 1, r, 4);
  ws.getCell(r, 1).value = '合计（含税）';
  if (idx.length) {
    // 单位不同不能相加：按单位分开写
    const units = unitTotals(idx.map((i) => k.rows[i]));
    ws.getCell(r, 5).value = units.length > 1 ? qtyTotal(idx.map((i) => k.rows[i])) : { formula: `SUM(E${first}:E${r - 1})` };
    if (units.length > 1) { ws.getCell(r, 5).alignment = { horizontal: 'right', wrapText: true }; ws.getRow(r).height = units.length * 13 + 3; }
    ws.getCell(r, 7).value = { formula: `SUM(G${first}:G${r - 1})` };
  }
  ws.getCell(r, 7).numFmt = MONEY;
  for (let j = 1; j <= last; j++) {
    const c = ws.getCell(r, j);
    c.font = { name: 'Arial', bold: true, size: 10 }; c.border = box;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F8' } };
    if (j >= 5) c.alignment = { horizontal: 'right' };
  }
  r++;
  const total = idx.reduce((a, i) => a + toNum(k.rows[i].q) * toNum(o.items[i].cost), 0);
  if (total) line(`合计金额大写：${rmbWords(total)}`, { bold: true });
  r++;

  if (idx.length) {
    line('包装与唛头', { bold: true, color: acc });
    const ph = ['型号', '每箱装', '箱规 cm', '箱数', '箱号', '每箱净 / 毛重 kg'];
    const pcols = [[1, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7]];
    const prow = (vals: string[], headRow = false) => {
      vals.forEach((v, j) => {
        const [a, b] = pcols[j];
        if (b > a) ws.mergeCells(r, a, r, b);
        const c = ws.getCell(r, a);
        c.value = v; c.border = box; c.font = { name: 'Arial', size: 9, bold: headRow };
        if (headRow) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F8' } };
      });
      r++;
    };
    prow(ph, true);
    for (const i of idx) {
      const x = k.rows[i];
      const cno = x.from ? (x.from === x.to ? String(x.from) : `${x.from}-${x.to}`) : '';
      prow(x.pack
        ? [x.model || x.nameEn, '混装', `${toNum(x.pack.l)}×${toNum(x.pack.w)}×${toNum(x.pack.h)}`, '', cno, `${fixed(toNum(x.nw), 2)} / 整箱 ${fixed(toNum(x.pack.gw), 2)}`]
        : [x.model || x.nameEn, x.pcsPerCtn ? `${x.pcsPerCtn} ${x.unit}` : '', toNum(x.l) ? `${x.l}×${x.w}×${x.h}` : '', String(x.n || ''), cno, toNum(x.gw) ? `${fixed(toNum(x.nw), 2)} / ${fixed(toNum(x.gw), 2)}` : '']);
    }
    r++;
  }
  if (pur.packing) pair('包装要求', pur.packing);
  pair('正唛', o.shipping.marks || 'N/M');
  if (o.shipping.side) pair('侧唛', o.shipping.side);
  pair('交货日期', po.delivery ?? '');
  pair('交货地点', pur.deliverTo);
  pair('付款方式', po.payment ?? '');
  if (pur.invoice) pair('价格与发票', pur.invoice);
  if (pur.quality) pair('质量要求', pur.quality);
  if (po.note) pair('备注', po.note);
  r += 2;
  ws.mergeCells(r, 1, r, 3);
  ws.getCell(r, 1).value = `需方（盖章）：${o.seller.nameCn || o.seller.name}`;
  ws.mergeCells(r, 4, r, last);
  ws.getCell(r, 4).value = `供方（盖章）：${factoryName(partners, fid)}`;
  ws.headerFooter.oddFooter = `&L${poNo(o, fid)}&R&P / &N`;
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

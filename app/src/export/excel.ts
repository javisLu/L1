import ExcelJS from 'exceljs';
import { THEMES } from '../domain/constants';
import { amountWords, fixed, needAddr, calcOrder, qtyTotal, unitTotals } from '../domain/calc';
import { lcNoOf } from '../domain/lc';
import { DOCNAMES, docFile, type DocKey } from '../modules/defs';
import type { Order, Partner } from '../domain/types';
import type { DocAssets } from '../docs/primitives';
import { pkgNote, pkgSummary } from '../domain/package';
import { fit, imageInfo } from './images';

type ExcelDoc = Exclude<DocKey, 'contract' | 'po' | 'co' | 'marks' | 'labels' | 'booking' | 'si' | 'advice' | 'isf'>;
type CommercialDoc = Exclude<ExcelDoc, 'customs'>;
const MONEY = '#,##0.00';
const thin = { style: 'thin' as const, color: { argb: 'FFC9CFD8' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

interface Col { header: string; width: number; key: string; num?: string; align?: 'left' | 'center' | 'right' }

/**
 * 生成单据 Excel：抬头、双方、条款、明细表（金额与合计为公式，改数量单价会自动重算）。
 * 内容和 PDF 一致；报关单另按报关单的格子排（customsexcel.ts）。
 */
export async function renderExcel(o: Order, doc: ExcelDoc, assets?: DocAssets, partners: Partner[] = []): Promise<Uint8Array> {
  if (doc === 'customs') {
    const { renderCustomsExcel } = await import('./customsexcel');
    return renderCustomsExcel(o, partners);
  }
  return renderCommercial(o, doc, assets);
}

async function renderCommercial(o: Order, doc: CommercialDoc, assets?: DocAssets): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '外贸超级工作台';
  wb.created = new Date();
  const ws = wb.addWorksheet(DOCNAMES[doc], {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    views: [{ showGridLines: false }],
  });
  const acc = 'FF' + (THEMES[o.docset.theme] ?? '#1d3f72').slice(1).toUpperCase();
  const k = calcOrder(o);
  const pk = pkgSummary(o, k);
  const cur = o.terms.currency;

  const cols = columns(doc, cur);
  const last = cols.length;
  ws.columns = cols.map((c) => ({ width: c.width }));
  // 列宽（字符数）→ 像素，用于摆放 Logo、公章
  const colPx = cols.map((c) => Math.round(c.width * 7 + 5));
  const EMU = 9525; // 每像素
  /**
   * 放图片：x 为距表格左边缘的像素，row 为行号（0 起），dy 为行内向下偏移的像素。
   * 直接给出原生偏移（EMU）——exceljs 换算小数列位置时列宽单位不对，图片会贴到列首。
   */
  const addImage = (img: NonNullable<ReturnType<typeof imageInfo>>, x: number, row: number, dy: number, size: { width: number; height: number }) => {
    let col = 0;
    while (col < last - 1 && x >= colPx[col]) x -= colPx[col++];
    const id = wb.addImage({ base64: img.base64, extension: img.ext });
    const tl = { nativeCol: col, nativeColOff: Math.round(x * EMU), nativeRow: row, nativeRowOff: Math.round(dy * EMU) };
    ws.addImage(id, { tl: tl as never, ext: size, editAs: 'oneCell' });
  };

  // Logo 放在左上角（与预览、PDF 一致）：占第一列（第一列很窄时占前两列），公司名称等从它右边开始
  const logo = imageInfo(assets?.logo ?? '');
  let headFrom = 1;
  if (logo) {
    const span = colPx[0] >= 100 ? 1 : 2;
    const avail = colPx.slice(0, span).reduce((x, y) => x + y, 0) - 12;
    addImage(logo, 2, 0, 3, fit(logo, Math.min(150, avail), 54));
    headFrom = span + 1;
  }

  let r = 1;
  const line = (text: string, opt: { bold?: boolean; size?: number; color?: string; align?: 'left' | 'center' | 'right'; from?: number } = {}) => {
    ws.mergeCells(r, opt.from ?? 1, r, last);
    const cell = ws.getCell(r, opt.from ?? 1);
    cell.value = text;
    cell.font = { name: 'Arial', bold: opt.bold, size: opt.size ?? 10, color: opt.color ? { argb: opt.color } : undefined };
    cell.alignment = { horizontal: opt.align ?? 'left', vertical: 'middle', wrapText: true };
    r++;
    return cell;
  };
  /** 合并单元格在 Excel 里不会自动撑高，按行数估算行高 */
  const fitHeight = (texts: string[], charsPerLine: number) => {
    const lines = Math.max(...texts.map((t) => String(t ?? '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / charsPerLine)), 0)));
    ws.getRow(r).height = Math.max(16, lines * 13);
  };
  const labelStyle = (cell: ExcelJS.Cell, label: string) => {
    cell.value = label;
    cell.font = { name: 'Arial', size: 9, color: { argb: 'FF6B7380' } };
    cell.alignment = { vertical: 'top', wrapText: true };
  };
  const valueStyle = (cell: ExcelJS.Cell, value: string) => {
    cell.value = value;
    cell.font = { name: 'Arial', size: 10 };
    cell.alignment = { wrapText: true, vertical: 'top' };
  };
  // 标签占前两列（首列很窄时），内容占其余列
  const labelEnd = cols[0].width >= 14 ? 1 : 2;
  const pair = (label: string, value: string) => {
    if (labelEnd > 1) ws.mergeCells(r, 1, r, labelEnd);
    labelStyle(ws.getCell(r, 1), label);
    ws.mergeCells(r, labelEnd + 1, r, last);
    valueStyle(ws.getCell(r, labelEnd + 1), value);
    fitHeight([value], 70);
    r++;
  };
  // 抬头
  line(o.seller.name, { bold: true, size: 14, color: acc, from: headFrom });
  line(o.seller.address, { size: 9, from: headFrom });
  line(`Tel: ${o.seller.phone}   Email: ${o.seller.email}`, { size: 9, from: headFrom });
  if (logo) [22, 16, 16].forEach((h, i) => (ws.getRow(i + 1).height = h));
  r++;
  line({ quote: 'QUOTATION', pi: 'PROFORMA INVOICE', ci: 'COMMERCIAL INVOICE', pl: 'PACKING LIST' }[doc], { bold: true, size: 18, color: acc, align: 'center' });
  r++;

  // 编号与双方（和 PDF 一样的栏目）
  {
    const nos: [string, string][] =
      doc === 'quote' ? [['No.', o.numbers.quote], ['Date', o.numbers.date], ['Valid Until', o.numbers.validUntil]]
      : doc === 'pi' ? [['No.', o.numbers.pi], ['Date', o.numbers.date], ['PO No.', o.numbers.po]]
      : [['Invoice No.', o.numbers.ci], ['Date', o.numbers.date], ['Contract No.', o.numbers.contract], ...(doc === 'ci' ? [['PO No.', o.numbers.po] as [string, string]] : []), ...(lcNoOf(o) ? [['L/C No.', lcNoOf(o)] as [string, string]] : [])];
    nos.forEach(([l, v]) => pair(l, v));
    r++;
    const buyer = [o.buyer.name, o.buyer.address, `Attn: ${o.buyer.contact || '—'}  Tel: ${o.buyer.phone || '—'}`, o.buyer.email, o.buyer.tax && `Tax/VAT: ${o.buyer.tax}`].filter(Boolean).join('\n');
    if (doc === 'quote' || doc === 'pi') {
      pair('To / Buyer', buyer);
      pair('Bank Information', o.seller.bank);
      pair('Incoterms 2020', `${o.terms.incoterm} ${o.terms.place}`);
      pair('Payment', o.terms.paymentText);
      pair('Lead Time', o.terms.leadTime);
      pair('Port of Loading', o.terms.pol);
      pair('Destination', o.terms.pod);
      pair('Currency', o.terms.currency);
      if (o.terms.deliveryAddress || needAddr(o)) pair('Place of Delivery', o.terms.deliveryAddress);
    } else {
      pair(doc === 'ci' ? 'Sold To / Consignee' : 'Consignee', buyer);
      pair('Shipment', `From ${o.terms.pol} to ${o.terms.pod}${o.shipping.vessel ? ` by ${o.shipping.vessel}` : ''}`);
      pair('B/L No.', o.shipping.blNo);
      pair('ETD', o.shipping.etd);
      pair('Container', o.shipping.container);
      if (o.terms.deliveryAddress && needAddr(o)) pair('Deliver to', o.terms.deliveryAddress);
      if (doc === 'ci') {
        pair('Terms', `${o.terms.incoterm} ${o.terms.place}`);
        pair('Payment', o.terms.paymentText);
        pair('Origin', o.shipping.origin);
      }
    }
  }
  r++;

  // 明细表
  const headRow = ws.getRow(r);
  cols.forEach((c, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: acc } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = box;
  });
  headRow.height = 30;
  const first = r + 1;
  const letter = (key: string) => String.fromCharCode(64 + cols.findIndex((c) => c.key === key) + 1);
  k.rows.forEach((row, i) => {
    r++;
    const values: Record<string, unknown> = {
      no: i + 1, model: row.model, desc: row.pack && doc === 'pl' ? `${row.nameEn} (MIXED)` : row.nameEn, spec: row.spec, hs: row.hs, unit: row.unit, qty: row.q, price: row.p,
      per: row.pack ? 'MIXED' : row.pcsPerCtn ? `${row.pcsPerCtn} ${row.unit}/CTN` : '',
      cno: row.from ? (row.pack && row.from === row.to ? String(row.from) : `${row.from}-${row.to}`) : '',
      ctns: row.pack ? (row.n || null) : row.n,
      nw: Number(row.nwT.toFixed(3)), gw: Number(row.gwT.toFixed(2)), cbm: Number(row.cbmT.toFixed(3)),
      marks: i === 0 ? o.shipping.marks : '',
    };
    cols.forEach((c, ci) => {
      const cell = ws.getCell(r, ci + 1);
      if (c.key === 'amount') cell.value = { formula: `${letter('qty')}${r}*${letter('price')}${r}`, result: row.a };
      else cell.value = values[c.key] as ExcelJS.CellValue;
      cell.font = { name: 'Arial', size: 9 };
      cell.border = box;
      cell.alignment = { horizontal: c.align ?? 'left', vertical: 'top', wrapText: true };
      if (c.num) cell.numFmt = c.num;
    });
  });
  // 还没有货物（空白模板）：留 8 行带框的空行，方便手写或填写
  if (!k.rows.length)
    for (let i = 0; i < 8; i++) {
      r++;
      cols.forEach((_c, ci) => {
        const cell = ws.getCell(r, ci + 1);
        cell.border = box;
        cell.font = { name: 'Arial', size: 9 };
      });
      ws.getRow(r).height = 20;
    }
  // 箱单：混装箱的箱号、箱数合并单元格（与工厂箱单的写法一致），每行仍有自己的净重和分摊后的毛重
  if (doc === 'pl') {
    k.rows.forEach((row, i) => {
      if (!row.pack || !row.lead || (row.span ?? 1) < 2) return;
      for (const key of ['cno', 'ctns']) {
        const c = cols.findIndex((x) => x.key === key) + 1;
        if (c > 0) {
          ws.mergeCells(first + i, c, first + i + row.span! - 1, c);
          ws.getCell(first + i, c).alignment = { horizontal: 'center', vertical: 'middle' };
        }
      }
    });
  }
  if (k.rows.length) {
    r++;
    const sum = (key: string, result: number) => ({ formula: `SUM(${letter(key)}${first}:${letter(key)}${r - 1})`, result });
    // 单位不同不能相加：数量合计按单位分开写
    const mixed = unitTotals(k.rows).length > 1;
    const totals: Record<string, unknown> = { qty: mixed ? qtyTotal(k.rows) : sum('qty', k.qty), amount: sum('amount', k.amount), ctns: sum('ctns', k.ctns), nw: sum('nw', k.nw), gw: sum('gw', k.gw), cbm: sum('cbm', k.cbm) };
    cols.forEach((c, ci) => {
      const cell = ws.getCell(r, ci + 1);
      cell.value = ci === 0 ? (doc === 'quote' || doc === 'pi' ? `TOTAL ${o.terms.incoterm} ${o.terms.place}`.toUpperCase() : 'TOTAL') : ((totals[c.key] as ExcelJS.CellValue) ?? '');
      cell.font = { name: 'Arial', bold: true, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F8' } };
      cell.border = box;
      cell.alignment = { horizontal: c.align ?? 'left', wrapText: mixed && c.key === 'qty' };
      if (c.num) cell.numFmt = c.num;
    });
    if (mixed) ws.getRow(r).height = unitTotals(k.rows).length * 13 + 3;
    // 合计字样占到第一个有数的格子前面（「TOTAL FOB QINGDAO」不会被窄列截断）
    const firstNum = cols.findIndex((c, ci) => ci > 0 && totals[c.key] != null);
    if (firstNum > 1) {
      ws.mergeCells(r, 1, r, firstNum);
      ws.getCell(r, 1).alignment = { horizontal: 'left', vertical: 'middle' };
    }
  }
  r += 2;

  // 大写、包装、备注、条款、声明（和 PDF 一样）
  const heading = (t: string) => line(t, { bold: true, size: 9, color: acc });
  if (!k.rows.length) { /* 没有货物：不写大写 */ }
  else if (doc === 'pl') {
    line(pk.words, { bold: true, size: 10 });
    if (pkgNote(pk)) line(pkgNote(pk), { size: 9 });
  } else {
    line(amountWords(k.amount, cur), { bold: true, size: 10 });
    if (doc === 'quote' || doc === 'pi') line(`Packing: ${pk.short}  ·  G.W. ${fixed(pk.gw, 2)} kg  ·  Meas. ${fixed(pk.cbm, 3)} m³`, { size: 9, color: 'FF555555' });
  }
  if (doc === 'quote' || doc === 'pi') {
    if (o.docset.remarks) { heading('REMARKS'); line(o.docset.remarks, { size: 9 }); }
    const clauses = o.docset.clauses.split('\n').filter((x) => x.trim());
    if (clauses.length) { heading('TERMS & CONDITIONS'); clauses.forEach((x, i) => line(`${i + 1}. ${x}`, { size: 9 })); }
  }
  if ((doc === 'ci' || doc === 'pl') && o.docset.statement?.trim()) { heading('REMARKS'); line(o.docset.statement.trim(), { size: 9 }); }
  if (doc === 'pl' && (o.packs ?? []).length) line('Note: goods marked MIXED are packed together in the same carton(s); the carton gross weight is allocated to each item in proportion to its net weight.', { size: 8, color: 'FF666666' });
  if (doc === 'ci') { heading('DECLARATION'); line('We hereby certify that the information on this invoice is true and correct and that the contents of this shipment are as stated above.', { size: 9 }); }
  r++;
  // 签字区：右侧卖方名称 → 留白盖章、签名 → 签字线；报价单、PI 左侧留买方确认
  {
    // 从距右边缘约 320 像素的那一列开始
    let from = last, px = colPx[last - 1];
    while (from > 2 && px < 320) px += colPx[--from - 1];
    const fromPx = colPx.slice(0, from - 1).reduce((x, y) => x + y, 0);
    const top = r;
    const head = line(`For and on behalf of\n${o.seller.name}`, { size: 9, from });
    head.font = { ...head.font, bold: true };
    ws.getRow(r - 1).height = 28;
    const blank = r;
    ws.getRow(blank).height = 58;
    r++;
    const sigLine = r;
    line('______________________________', { size: 9, from });
    line('Authorized Signature', { size: 9, color: 'FF6B7380', from });
    if ((doc === 'quote' || doc === 'pi') && from > 2) {
      const left = (row: number, text: string, opt: { bold?: boolean; color?: string } = {}) => {
        ws.mergeCells(row, 1, row, from - 2);
        const c = ws.getCell(row, 1);
        c.value = text;
        c.font = { name: 'Arial', size: 9, bold: opt.bold, color: opt.color ? { argb: opt.color } : undefined };
        c.alignment = { vertical: 'middle', wrapText: true };
      };
      left(top, `Accepted by\n${o.buyer.name || 'the Buyer'}`, { bold: true });
      left(sigLine, '______________________________');
      left(sigLine + 1, "Buyer's Signature & Date", { color: 'FF6B7380' });
    }
    const stamp = o.docset.stamp ? imageInfo(assets?.stamp ?? '') : null;
    const sign = o.docset.stamp ? imageInfo(assets?.signature ?? '') : null;
    // 公章盖在卖方名称下方的留白处（压住签字线），签名在公章右侧
    if (stamp) addImage(stamp, fromPx + 6, blank - 1, 4, fit(stamp, 96, 96));
    if (sign) addImage(sign, fromPx + 112, blank - 1, 34, fit(sign, 130, 42));
  }

  ws.headerFooter.oddFooter = `&L${docFile(o, doc)}&R&P / &N`;
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

function columns(doc: CommercialDoc, cur: string): Col[] {
  if (doc === 'quote' || doc === 'pi')
    return [
      { header: 'No.', key: 'no', width: 6, align: 'center' }, { header: 'Model', key: 'model', width: 13 },
      { header: 'Description', key: 'desc', width: 34 }, { header: 'Specification', key: 'spec', width: 20 },
      { header: 'Unit', key: 'unit', width: 8, align: 'center' }, { header: 'Qty', key: 'qty', width: 10, num: '#,##0', align: 'right' },
      { header: `Unit Price (${cur})`, key: 'price', width: 14, num: MONEY, align: 'right' }, { header: `Amount (${cur})`, key: 'amount', width: 16, num: MONEY, align: 'right' },
    ];
  if (doc === 'ci')
    return [
      { header: 'Marks & Nos.', key: 'marks', width: 20 }, { header: 'Description of Goods', key: 'desc', width: 32 },
      { header: 'Model', key: 'model', width: 12 }, { header: 'HS Code', key: 'hs', width: 13 }, { header: 'Unit', key: 'unit', width: 8, align: 'center' },
      { header: 'Qty', key: 'qty', width: 10, num: '#,##0', align: 'right' }, { header: `Unit Price (${cur})`, key: 'price', width: 14, num: MONEY, align: 'right' },
      { header: `Amount (${cur})`, key: 'amount', width: 16, num: MONEY, align: 'right' },
    ];
  return [
      { header: 'Marks', key: 'marks', width: 18 }, { header: 'C/No.', key: 'cno', width: 10, align: 'center' },
      { header: 'Description', key: 'desc', width: 30 }, { header: 'Model', key: 'model', width: 11 }, { header: 'Packing', key: 'per', width: 13 },
      { header: 'Qty', key: 'qty', width: 10, num: '#,##0', align: 'right' },
      { header: 'CTNs', key: 'ctns', width: 8, num: '#,##0', align: 'right' }, { header: 'N.W. (kg)', key: 'nw', width: 12, num: MONEY, align: 'right' },
      { header: 'G.W. (kg)', key: 'gw', width: 12, num: MONEY, align: 'right' }, { header: 'Meas. (m³)', key: 'cbm', width: 12, num: '0.000', align: 'right' },
    ];
}

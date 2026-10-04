import ExcelJS from 'exceljs';
import { THEMES, TRANSPORT_CD } from '../domain/constants';
import { amountWords, intWords, needAddr, calcOrder } from '../domain/calc';
import { DOCNAMES, docFile, type DocKey } from '../modules/defs';
import type { Order } from '../domain/types';
import type { DocAssets } from '../docs/primitives';
import { fit, imageInfo } from './images';

type ExcelDoc = Exclude<DocKey, 'contract' | 'marks' | 'labels'>;
const MONEY = '#,##0.00';
const thin = { style: 'thin' as const, color: { argb: 'FFC9CFD8' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

interface Col { header: string; width: number; key: string; num?: string; align?: 'left' | 'center' | 'right' }

/** 生成单据 Excel：抬头、双方、条款、明细表（金额与合计为公式，改数量单价会自动重算） */
export async function renderExcel(o: Order, doc: ExcelDoc, assets?: DocAssets): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '外贸超级工作台';
  wb.created = new Date();
  const ws = wb.addWorksheet(DOCNAMES[doc], {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    views: [{ showGridLines: false }],
  });
  const acc = 'FF' + (THEMES[o.docset.theme] ?? '#1d3f72').slice(1).toUpperCase();
  const k = calcOrder(o);
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
  const logo = doc !== 'customs' ? imageInfo(assets?.logo ?? '') : null;
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
  /** 报关表：每行两组「字段：内容」 */
  const pair2 = (l1: string, v1: string, l2?: string, v2?: string) => {
    ws.mergeCells(r, 1, r, 2); labelStyle(ws.getCell(r, 1), l1);
    ws.mergeCells(r, 3, r, 4); valueStyle(ws.getCell(r, 3), v1);
    if (l2 != null) {
      ws.mergeCells(r, 5, r, 7); labelStyle(ws.getCell(r, 5), l2);
      ws.mergeCells(r, 8, r, last); valueStyle(ws.getCell(r, 8), v2 ?? '');
    }
    fitHeight([v1, v2 ?? ''], 40);
    r++;
  };

  // 抬头
  if (doc === 'customs') {
    line('出口报关资料预录入表', { bold: true, size: 16, align: 'center' });
    line('草稿 · 供报关行申报参考 · 以海关系统录入为准', { size: 9, color: 'FF777777', align: 'center' });
  } else {
    line(o.seller.name, { bold: true, size: 14, color: acc, from: headFrom });
    line(o.seller.address, { size: 9, from: headFrom });
    line(`Tel: ${o.seller.phone}   Email: ${o.seller.email}`, { size: 9, from: headFrom });
    if (logo) [22, 16, 16].forEach((h, i) => (ws.getRow(i + 1).height = h));
    r++;
    line({ quote: 'QUOTATION', pi: 'PROFORMA INVOICE', ci: 'COMMERCIAL INVOICE', pl: 'PACKING LIST' }[doc], { bold: true, size: 18, color: acc, align: 'center' });
  }
  r++;

  // 编号与双方
  if (doc === 'customs') {
    const cd = o.customs;
    const fields: [string, string][] = [
      ['合同协议号', o.numbers.contract], ['发票号', o.numbers.ci],
      ['境内发货人', `${o.seller.nameCn}  ${o.seller.tax}`], ['境外收货人', o.buyer.name], ['生产销售单位', o.seller.nameCn],
      ['出境关别', cd.exportPort], ['出口日期', o.shipping.etd], ['运输方式', TRANSPORT_CD[o.terms.transport] ?? ''],
      ['运输工具名称及航次号', o.shipping.vessel], ['提运单号', o.shipping.blNo], ['监管方式', cd.supervision], ['征免性质', cd.exemption],
      ['许可证号', cd.license], ['贸易国（地区）', cd.tradeCountry], ['运抵国（地区）', cd.destCountry], ['指运港', o.terms.pod], ['离境口岸', o.terms.pol],
      ['包装种类', cd.packageType], ['件数', `${k.ctns}`], ['毛重（千克）', k.gw.toFixed(2)], ['净重（千克）', k.nw.toFixed(2)],
      ['成交方式', o.terms.incoterm], ['运费', cd.freight], ['保费', cd.insFee], ['随附单证', cd.docs], ['标记唛码及备注', o.shipping.marks],
    ];
    for (let i = 0; i < fields.length; i += 2) {
      const [l1, v1] = fields[i];
      const next = fields[i + 1];
      pair2(l1, v1 ?? '', next?.[0], next?.[1] ?? '');
    }
  } else {
    const nos: [string, string][] =
      doc === 'quote' ? [['No.', o.numbers.quote], ['Date', o.numbers.date], ['Valid Until', o.numbers.validUntil]]
      : doc === 'pi' ? [['No.', o.numbers.pi], ['Date', o.numbers.date], ['PO No.', o.numbers.po]]
      : [['Invoice No.', o.numbers.ci], ['Date', o.numbers.date], ['Contract No.', o.numbers.contract], ['PO No.', o.numbers.po]];
    nos.forEach(([l, v]) => pair(l, v));
    r++;
    pair(doc === 'ci' ? 'Sold To' : doc === 'pl' ? 'Consignee' : 'To', [o.buyer.name, o.buyer.address, `Attn: ${o.buyer.contact}  Tel: ${o.buyer.phone}`, o.buyer.email].filter(Boolean).join('\n'));
    if (doc === 'ci' || doc === 'pl') {
      pair('Shipment', `From ${o.terms.pol} to ${o.terms.pod}${o.shipping.vessel ? ` by ${o.shipping.vessel}` : ''}`);
      pair('B/L No.', o.shipping.blNo);
      pair('Container', o.shipping.container);
    }
    pair('Terms', `${o.terms.incoterm} ${o.terms.place}`);
    if (o.terms.deliveryAddress || needAddr(o)) pair('Place of Delivery', o.terms.deliveryAddress);
    if (doc !== 'pl') pair('Payment', o.terms.paymentText);
    if (doc === 'quote' || doc === 'pi') pair('Lead Time', o.terms.leadTime);
    if (doc === 'pi') pair('Bank', o.seller.bank);
    if (doc === 'ci') pair('Country of Origin', o.shipping.origin);
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
      cno: row.from ? (row.pack && row.from === row.to ? String(row.from) : `${row.from}-${row.to}`) : '',
      ctns: row.pack ? (row.n || null) : row.n,
      nw: Number(row.nwT.toFixed(3)), gw: Number(row.gwT.toFixed(2)), cbm: Number(row.cbmT.toFixed(3)),
      marks: i === 0 ? o.shipping.marks : '', nameCn: row.nameCn, elements: row.elements, cur, origin: '中国',
      dest: o.customs.destCountry, source: o.customs.sourceArea, exempt: '照章征税',
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
  if (doc !== 'customs' && k.rows.length) {
    r++;
    const sum = (key: string, result: number) => ({ formula: `SUM(${letter(key)}${first}:${letter(key)}${r - 1})`, result });
    const totals: Record<string, unknown> = { qty: sum('qty', k.qty), amount: sum('amount', k.amount), ctns: sum('ctns', k.ctns), nw: sum('nw', k.nw), gw: sum('gw', k.gw), cbm: sum('cbm', k.cbm) };
    cols.forEach((c, ci) => {
      const cell = ws.getCell(r, ci + 1);
      cell.value = ci === 0 ? 'TOTAL' : ((totals[c.key] as ExcelJS.CellValue) ?? '');
      cell.font = { name: 'Arial', bold: true, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F8' } };
      cell.border = box;
      cell.alignment = { horizontal: c.align ?? 'left' };
      if (c.num) cell.numFmt = c.num;
    });
  }
  r += 2;

  // 大写与备注
  if (doc === 'pl') line(`SAY TOTAL ${intWords(k.ctns)} (${k.ctns}) CARTONS ONLY`, { bold: true, size: 10 });
  else if (doc !== 'customs') line(amountWords(k.amount, cur), { bold: true, size: 10 });
  if (doc === 'quote' || doc === 'pi') {
    if (o.docset.remarks) line('Remarks: ' + o.docset.remarks, { size: 9 });
    o.docset.clauses.split('\n').filter((x) => x.trim()).forEach((x, i) => line(`${i + 1}. ${x}`, { size: 9 }));
  }
  if (doc === 'ci') line('We hereby certify that the information on this invoice is true and correct.', { size: 9 });
  r++;
  // 签字区（右侧）：卖方名称 → 留白盖章、签名 → 签字线
  if (doc !== 'customs') {
    // 从距右边缘约 320 像素的那一列开始
    let from = last, px = colPx[last - 1];
    while (from > 2 && px < 320) px += colPx[--from - 1];
    const fromPx = colPx.slice(0, from - 1).reduce((x, y) => x + y, 0);
    const head = line(`For and on behalf of\n${o.seller.name}`, { size: 9, from });
    head.font = { ...head.font, bold: true };
    ws.getRow(r - 1).height = 28;
    const blank = r;
    ws.getRow(blank).height = 58;
    r++;
    line('______________________________', { size: 9, from });
    line('Authorized Signature', { size: 9, color: 'FF6B7380', from });
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

function columns(doc: ExcelDoc, cur: string): Col[] {
  if (doc === 'quote' || doc === 'pi')
    return [
      { header: 'No.', key: 'no', width: 6, align: 'center' }, { header: 'Model', key: 'model', width: 13 },
      { header: 'Description', key: 'desc', width: 34 }, { header: 'Specification', key: 'spec', width: 20 },
      { header: 'Unit', key: 'unit', width: 8, align: 'center' }, { header: 'Qty', key: 'qty', width: 10, num: '#,##0', align: 'right' },
      { header: `Unit Price (${cur})`, key: 'price', width: 14, num: MONEY, align: 'right' }, { header: `Amount (${cur})`, key: 'amount', width: 16, num: MONEY, align: 'right' },
    ];
  if (doc === 'ci')
    return [
      { header: 'Marks & Nos.', key: 'marks', width: 20 }, { header: 'Description of Goods', key: 'desc', width: 34 },
      { header: 'HS Code', key: 'hs', width: 13 }, { header: 'Unit', key: 'unit', width: 8, align: 'center' },
      { header: 'Qty', key: 'qty', width: 10, num: '#,##0', align: 'right' }, { header: `Unit Price (${cur})`, key: 'price', width: 14, num: MONEY, align: 'right' },
      { header: `Amount (${cur})`, key: 'amount', width: 16, num: MONEY, align: 'right' },
    ];
  if (doc === 'pl')
    return [
      { header: 'Marks', key: 'marks', width: 18 }, { header: 'C/No.', key: 'cno', width: 10, align: 'center' },
      { header: 'Description', key: 'desc', width: 34 }, { header: 'Qty', key: 'qty', width: 10, num: '#,##0', align: 'right' },
      { header: 'CTNs', key: 'ctns', width: 8, num: '#,##0', align: 'right' }, { header: 'N.W. (kg)', key: 'nw', width: 12, num: MONEY, align: 'right' },
      { header: 'G.W. (kg)', key: 'gw', width: 12, num: MONEY, align: 'right' }, { header: 'Meas. (m³)', key: 'cbm', width: 12, num: '0.000', align: 'right' },
    ];
  return [
    { header: '项号', key: 'no', width: 6, align: 'center' }, { header: '商品编号', key: 'hs', width: 13 },
    { header: '商品名称', key: 'nameCn', width: 22 }, { header: '申报要素', key: 'elements', width: 30 },
    { header: '数量', key: 'qty', width: 10, num: '#,##0', align: 'right' }, { header: '单位', key: 'unit', width: 8, align: 'center' },
    { header: '净重(千克)', key: 'nw', width: 11, num: MONEY, align: 'right' }, { header: '毛重(千克)', key: 'gw', width: 11, num: MONEY, align: 'right' },
    { header: '单价', key: 'price', width: 11, num: MONEY, align: 'right' }, { header: '总价', key: 'amount', width: 13, num: MONEY, align: 'right' },
    { header: '币制', key: 'cur', width: 7, align: 'center' }, { header: '原产国', key: 'origin', width: 8, align: 'center' },
    { header: '最终目的国', key: 'dest', width: 11, align: 'center' }, { header: '境内货源地', key: 'source', width: 11, align: 'center' },
    { header: '征免', key: 'exempt', width: 9, align: 'center' },
  ];
}

import ExcelJS from 'exceljs';
import { FIELDS, ITEM_FIELDS, ITEM_TOTALS, ctxOf, fieldByKey, itemFieldByKey, matchField, matchItemField, type Ctx, type Val } from '../domain/tplfields';
import type { ExcelTpl, Order, TplCell, TplTable } from '../domain/types';

/**
 * 套用客户 / 货代自己的 Excel 格式。
 * analyze：上传时找出要填的位置（标签旁边 / 下面的空格、货物表头）和 {{占位符}}
 * fill：按订单填好，货物行不够时插入行（保留样式和合并单元格）
 */

type WS = ExcelJS.Worksheet;
interface Box { top: number; left: number; bottom: number; right: number }

const PH = /\{\{\s*([^{}]+?)\s*\}\}/g;
const textOf = (c: ExcelJS.Cell): string => {
  const v = c.value as unknown;
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown; formula?: string };
    if (o.richText) return o.richText.map((x) => x.text).join('');
    if (o.text != null) return String(o.text);
    if (o.formula) return '';
    if (o.result != null) return String(o.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
};
const merges = (ws: WS): Box[] => Object.values((ws as unknown as { _merges: Record<string, { model: Box }> })._merges ?? {}).map((m) => ({ ...m.model }));
const boxOf = (ws: WS, r: number, c: number): Box => merges(ws).find((m) => r >= m.top && r <= m.bottom && c >= m.left && c <= m.right) ?? { top: r, left: c, bottom: r, right: c };
const isEmpty = (ws: WS, r: number, c: number) => {
  const cell = ws.getCell(r, c);
  return !textOf(cell.master ?? cell).trim();
};
const addr = (r: number, c: number) => {
  let s = '';
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s + r;
};

export interface Analysis { cells: TplCell[]; tables: TplTable[]; placeholders: string[]; sheets: string[] }

export async function analyze(data: Uint8Array): Promise<Analysis> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const out: Analysis = { cells: [], tables: [], placeholders: [], sheets: wb.worksheets.map((w) => w.name) };
  for (const ws of wb.worksheets) {
    const maxR = Math.min(ws.rowCount, 150), maxC = Math.min(ws.columnCount, 40);
    // {{占位符}}
    for (let r = 1; r <= maxR; r++) for (let c = 1; c <= maxC; c++) for (const m of textOf(ws.getCell(r, c)).matchAll(PH)) out.placeholders.push(m[1]);

    // 货物表头：一行里有 3 个以上货物字段，且有品名 / 型号 / 数量之一
    let table: TplTable | undefined;
    for (let r = 1; r <= maxR && !table; r++) {
      const cols: TplTable['cols'] = [];
      for (let c = 1; c <= maxC; c++) {
        const cell = ws.getCell(r, c);
        if (cell.master && cell.master.address !== cell.address) continue;
        const t = textOf(cell);
        if (t.includes('{{')) continue;
        const f = matchItemField(t);
        if (f && !cols.some((x) => x.field === f.key)) cols.push({ col: c, field: f.key, label: t.trim() });
        else if (!f && matchField(t)?.key === '唛头' && !cols.some((x) => x.field === '唛头')) cols.push({ col: c, field: '唛头', label: t.trim() });
      }
      if (cols.filter((x) => x.field !== '唛头').length >= 3 && cols.some((x) => ['品名', '型号', '数量'].includes(x.field))) {
        // 表头下面一行若是单位（KGS、CBM、PCS…）跳过
        let first = boxOf(ws, r, cols[0].col).bottom + 1;
        const unitRow = cols.filter((x) => /^\(?(kgs?|cbm|m3|m³|pcs|sets|usd|eur|ctns?|cm)\)?$/i.test(textOf(ws.getCell(first, x.col)).trim())).length;
        if (unitRow >= 2) first++;
        let n = 0;
        while (n < 200 && cols.every((x) => isEmpty(ws, first + n, x.col))) n++;
        const stop = first + n;
        const rowText = Array.from({ length: maxC }, (_, i) => textOf(ws.getCell(stop, i + 1))).join(' ');
        table = { sheet: ws.name, header: r, first, rows: Math.max(n, 1), ...(/total|合计|总计|sum/i.test(rowText) ? { total: stop } : {}), cols };
      }
    }
    if (table) out.tables.push(table);

    // 单个字段：标签文字 → 右边第一个空格；右边没有空格就填下面
    const taken = new Set<string>();
    for (let r = 1; r <= maxR; r++) {
      if (table && r >= table.header && r <= (table.total ?? table.first + table.rows - 1)) continue;
      for (let c = 1; c <= maxC; c++) {
        const cell = ws.getCell(r, c);
        if (cell.master && cell.master.address !== cell.address) continue;
        const raw = textOf(cell).trim();
        if (!raw || raw.includes('{{')) continue;
        // 「Invoice No.: 123」这种标签后面已有内容的不填
        const colon = raw.match(/^(.{1,40}?)[:：]\s*(.*)$/);
        if (colon && colon[2].trim()) continue;
        const f = matchField(colon ? colon[1] : raw);
        if (!f) continue;
        const b = boxOf(ws, r, c);
        let target: string | undefined;
        const area = (x: Box) => (x.bottom - x.top + 1) * (x.right - x.left + 1);
        // 右边是空格就填右边；但下面是更大的合并框（标签在上、值在下的大框）时填下面
        const right = boxOf(ws, r, b.right + 1);
        const below = boxOf(ws, b.bottom + 1, b.left);
        const rightOk = isEmpty(ws, right.top, right.left);
        // 右边已经有占位符的，说明模板自己写好了，不再另找位置
        if (!rightOk && textOf(ws.getCell(right.top, right.left)).includes('{{')) continue;
        // 填下面只限「大框」：标签本身是合并的横条，或者下面是合并的框；普通的一行一个标签不往下填
        const boxy = area(b) > 1 || area(below) > 1;
        const belowOk = boxy && below.top === b.bottom + 1 && below.left === b.left && isEmpty(ws, below.top, below.left);
        if (rightOk && !(belowOk && area(below) > 1 && area(below) > area(right))) target = addr(right.top, right.left);
        else if (belowOk) target = addr(below.top, below.left);
        if (!target || taken.has(`${ws.name}!${target}`)) continue;
        taken.add(`${ws.name}!${target}`);
        out.cells.push({ sheet: ws.name, cell: target, field: f.key, label: raw.replace(/[:：]\s*$/, '') });
      }
    }
  }
  return out;
}

/** 在 at 行（含）之前插入 count 行，样式照 styleRow；下面的合并单元格跟着下移，styleRow 里的合并复制到新行 */
function insertRows(ws: WS, styleRow: number, count: number) {
  if (count <= 0) return;
  const all = merges(ws);
  const below = all.filter((m) => m.top > styleRow);
  const inRow = all.filter((m) => m.top === styleRow && m.bottom === styleRow);
  for (const m of below) ws.unMergeCells(m.top, m.left, m.bottom, m.right);
  // 从没碰过的空行在 exceljs 里不存在，先建出来再复制
  ws.getRow(styleRow).commit?.();
  ws.duplicateRow(styleRow, count, true);
  for (const m of below) ws.mergeCells(m.top + count, m.left, m.bottom + count, m.right);
  for (let i = 1; i <= count; i++) for (const m of inRow) ws.mergeCells(styleRow + i, m.left, styleRow + i, m.right);
}

const setVal = (cell: ExcelJS.Cell, v: Val) => {
  const target = cell.master ?? cell;
  target.value = v === '' ? null : v;
  if (typeof v === 'string' && v.includes('\n')) target.alignment = { ...(target.alignment ?? {}), wrapText: true, vertical: target.alignment?.vertical ?? 'top' };
};

/** 替换一个单元格里的占位符；整格只有一个占位符且值是数字时写成数字 */
function replaceIn(cell: ExcelJS.Cell, get: (key: string) => Val | undefined) {
  const t = textOf(cell);
  if (!t.includes('{{')) return;
  const only = t.trim().match(/^\{\{\s*([^{}]+?)\s*\}\}$/);
  if (only) {
    const v = get(only[1]);
    if (v !== undefined) setVal(cell, v);
    return;
  }
  setVal(cell, t.replace(PH, (all, key: string) => {
    const v = get(key);
    return v === undefined ? all : String(v);
  }));
}

export async function fill(data: Uint8Array, tpl: Pick<ExcelTpl, 'cells' | 'tables'>, o: Order): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const ctx: Ctx = ctxOf(o);
  const rows = ctx.k.rows;
  const cells = tpl.cells.map((x) => ({ ...x }));
  const fieldVal = (key: string): Val | undefined => fieldByKey(key)?.get(ctx);

  // 1. 识别出的货物表
  for (const t of tpl.tables) {
    const ws = wb.getWorksheet(t.sheet);
    if (!ws) continue;
    const extra = Math.max(0, rows.length - t.rows);
    if (extra) {
      insertRows(ws, t.first, extra);
      for (const c of cells) if (c.sheet === t.sheet && Number(c.cell.replace(/^[A-Z]+/, '')) > t.first) c.cell = c.cell.replace(/\d+$/, (n) => String(Number(n) + extra));
    }
    rows.forEach((r, i) => {
      for (const col of t.cols) {
        const f = itemFieldByKey(col.field);
        if (f) setVal(ws.getCell(t.first + i, col.col), f.get(r, i, ctx));
      }
    });
    // 唛头列：整票一个唛头，写在第一行
    const mk = t.cols.find((x) => x.field === '唛头');
    if (mk) setVal(ws.getCell(t.first, mk.col), o.shipping.marks || 'N/M');
    if (t.total) for (const col of t.cols) if (ITEM_TOTALS[col.field]) setVal(ws.getCell(t.total + extra, col.col), ITEM_TOTALS[col.field](ctx));
  }

  // 2. 识别出的单个字段
  for (const c of cells) {
    const ws = wb.getWorksheet(c.sheet);
    const v = fieldVal(c.field);
    if (ws && v !== undefined) setVal(ws.getCell(c.cell), v);
  }

  // 3. {{占位符}}：先处理货物行（整行按货物复制），再处理其它
  for (const ws of wb.worksheets) {
    for (let r = ws.rowCount; r >= 1; r--) {
      const row = ws.getRow(r);
      let hasItem = false;
      row.eachCell({ includeEmpty: false }, (c) => { if (/\{\{\s*货物\./.test(textOf(c))) hasItem = true; });
      if (!hasItem) continue;
      if (rows.length > 1) insertRows(ws, r, rows.length - 1);
      for (let i = 0; i < Math.max(rows.length, 1); i++) {
        ws.getRow(r + i).eachCell({ includeEmpty: false }, (c) =>
          replaceIn(c, (key) => {
            const m = key.match(/^货物\.(.+)$/);
            if (!m) return undefined;
            const f = itemFieldByKey(m[1]);
            return f && rows[i] ? f.get(rows[i], i, ctx) : '';
          }));
      }
    }
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) =>
      replaceIn(c, (key) => {
        const m = key.match(/^合计\.(.+)$/);
        if (m) return ITEM_TOTALS[m[1]]?.(ctx);
        return fieldVal(key);
      })));
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** 示例模板：常见的订舱委托书版式，标签留空格给软件自动识别，货物表头一行 */
export async function sampleTemplate(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Booking');
  ws.columns = [{ width: 18 }, { width: 30 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }];
  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = 'BOOKING REQUEST 订舱委托书';
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A1').alignment = { horizontal: 'center' };
  const pairs: [string, string][] = [['Shipper', 'Consignee'], ['Notify Party', 'Port of Loading'], ['Port of Discharge', 'Vessel / Voyage'], ['Container Type', 'Cargo Ready'], ['Freight', 'B/L Type'], ['Invoice No.', 'PO No.']];
  pairs.forEach(([a, b], i) => {
    const r = 3 + i;
    ws.getCell(r, 1).value = a + ':';
    ws.getCell(r, 4).value = b + ':';
    ws.mergeCells(r, 5, r, 7);
    ws.getRow(r).height = a === 'Shipper' || a === 'Notify Party' ? 48 : 18;
  });
  const hr = 10;
  ['Marks', 'Description', 'Quantity', 'Ctns', 'G.W. (KGS)', 'N.W. (KGS)', 'Meas. (CBM)'].forEach((h, i) => {
    const c = ws.getCell(hr, i + 1);
    c.value = h;
    c.font = { bold: true };
    c.border = { bottom: { style: 'thin' } };
  });
  for (let r = hr + 1; r <= hr + 3; r++) ws.getRow(r).height = 18;
  ws.getCell(hr + 4, 1).value = 'TOTAL';
  ws.getCell(hr + 4, 1).font = { bold: true };
  ws.getCell(hr + 6, 1).value = 'Remarks:';
  ws.getCell(hr + 6, 2).value = '{{订舱要求}}';
  ws.getCell(hr + 7, 1).value = 'Date:';
  ws.getCell(hr + 7, 2).value = '{{今天}}';
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** 字段清单（占位符写法） */
export const placeholderList = () => ({
  fields: FIELDS.map((f) => ({ key: `{{${f.key}}}`, group: f.group })),
  items: ITEM_FIELDS.map((f) => `{{货物.${f.key}}}`),
  totals: Object.keys(ITEM_TOTALS).map((k) => `{{合计.${k}}}`),
});


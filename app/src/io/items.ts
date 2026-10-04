import { detectHeader, parseCsv, parseDims, toNumber, type FieldSpec } from './table';
import { emptyItem } from '../domain/factory';
import type { Item, Product } from '../domain/types';

/** 货物明细可以识别的列（客户 PO、工厂报价单、自己的 Excel 都适用） */
export type IK =
  | 'model' | 'nameEn' | 'nameCn' | 'spec' | 'hs' | 'unit' | 'qty' | 'price' | 'amount'
  | 'pcsPerCtn' | 'ctns' | 'dims' | 'l' | 'w' | 'h' | 'nw' | 'gw' | 'nwT' | 'gwT' | 'elements';

export const ITEM_FIELDS: FieldSpec<IK>[] = [
  { key: 'model', label: '型号', aliases: ['型号', '货号', '产品型号', '款号', '编号', 'model', 'model no', 'item', 'item no', 'item code', 'item number', 'sku', 'art no', 'article', 'article no', 'part no', 'ref'] },
  { key: 'nameEn', label: '英文品名', aliases: ['英文品名', '品名英文', '英文名称', 'description', 'english name', 'name', 'product name', 'product', 'commodity', 'goods', 'description of goods', 'item description'] },
  { key: 'nameCn', label: '中文品名', aliases: ['中文品名', '品名中文', '中文名称', '品名', '名称', '产品名称', '商品名称', '货物名称'] },
  { key: 'spec', label: '规格', aliases: ['规格', '规格型号', '规格参数', '尺寸', 'spec', 'specification', 'size', 'dimension', 'color', '颜色'] },
  { key: 'hs', label: 'HS 编码', aliases: ['hs', 'hs编码', 'hscode', 'hs code', '商品编码', '商品编号', '海关编码', '税号'] },
  { key: 'unit', label: '单位', aliases: ['单位', 'unit', 'uom', 'units'] },
  { key: 'qty', label: '数量', aliases: ['数量', '订单数量', '订购数量', '采购数量', 'qty', 'quantity', 'order qty', 'total qty', 'total quantity', 'pcs', 'q\'ty'] },
  { key: 'price', label: '单价', aliases: ['单价', '价格', '售价', '报价', '采购价', 'price', 'unit price', 'fob price', 'u/price', 'cost'] },
  { key: 'amount', label: '金额', aliases: ['金额', '总价', '总金额', '合计金额', 'amount', 'total', 'total amount', 'total price', 'value', 'line total', 'subtotal'] },
  { key: 'pcsPerCtn', label: '每箱装', aliases: ['每箱装', '每箱数量', '装箱数', '箱装数', '装箱量', 'pcs/ctn', 'qty/ctn', 'qty per carton', 'pcs per carton', 'packing qty', 'inner qty'] },
  { key: 'ctns', label: '箱数', aliases: ['箱数', '件数', 'ctns', 'cartons', 'ctn', 'no of cartons', 'carton qty', 'total cartons', 'total ctns', '总箱数'] },
  { key: 'dims', label: '外箱尺寸', aliases: ['外箱尺寸', '箱规', '纸箱尺寸', '箱子尺寸', 'carton size', 'ctn size', 'packing size', 'package size', 'meas', 'measurement', 'carton dimension', 'carton measurement'] },
  { key: 'l', label: '长', aliases: ['长', '长cm', '箱长', 'length'] },
  { key: 'w', label: '宽', aliases: ['宽', '宽cm', '箱宽', 'width'] },
  { key: 'h', label: '高', aliases: ['高', '高cm', '箱高', 'height'] },
  // 只写「净重 / N.W.」时先当作每箱，表里有「箱数」列时再改判为合计（见 fixWeights）
  { key: 'nw', label: '每箱净重', aliases: ['净重', '单箱净重', '每箱净重', '净重kg', '净重/箱', 'nw', 'n.w.', 'nwkg', 'nwkgs', 'net weight', 'net weightkgs', 'nw/ctn', 'nw per carton'] },
  { key: 'gw', label: '每箱毛重', aliases: ['毛重', '单箱毛重', '每箱毛重', '毛重kg', '毛重/箱', 'gw', 'g.w.', 'gwkg', 'gwkgs', 'gross weight', 'gross weightkgs', 'gw/ctn', 'gw per carton'] },
  { key: 'nwT', label: '净重合计', aliases: ['净重合计', '总净重', '合计净重', 'total nw', 'total n.w.', 'total net weight'] },
  { key: 'gwT', label: '毛重合计', aliases: ['毛重合计', '总毛重', '合计毛重', 'total gw', 'total g.w.', 'total gross weight'] },
  { key: 'elements', label: '申报要素', aliases: ['申报要素', '报关要素', 'declaration elements'] },
];
export const ITEM_FIELD_LABEL = Object.fromEntries(ITEM_FIELDS.map((f) => [f.key, f.label])) as Record<IK, string>;

export type Mapping = (IK | '')[];

export interface ItemSheet {
  /** 表头所在行（-1 表示没有表头，全部是数据） */
  headerRow: number;
  header: string[];
  /** 表头下面的数据行 */
  rows: string[][];
  /** 与 rows 对齐：true = Excel 合并单元格里非左上角的格子（内容与上面相同） */
  merged: boolean[][];
  mapping: Mapping;
  /** 表头上方找到的客户 PO 号 */
  po: string;
  table: string[][];
  tableMerged: boolean[][];
}

/** 从 Excel 复制的内容是制表符分隔；含换行的单元格会被加上引号 */
export function parsePasted(text: string): string[][] {
  const t = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  return parseCsv(t, t.includes('\t') ? '\t' : undefined).map((r) => r.map((c) => c.trim()));
}

const PO_RE = /(?:\bP\.?\s?O\.?|purchase\s*order|order|订单|采购单|合同)\s*(?:no\.?|number|#|号|编号)?\s*[:：#]?\s*([A-Z0-9][\w\-/.]{2,})?/i;

/** 在表头上方（PO 抬头区）找 PO 号：「PO No.: ABC-123」或「PO No.」右边一格 */
export function findPo(rows: string[][]): string {
  for (const cells of rows) {
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!c || !/(\bp\.?\s?o\b|purchase\s*order|订单号|采购单号|订单编号)/i.test(c)) continue;
      const m = PO_RE.exec(c);
      if (m?.[1] && /\d/.test(m[1])) return m[1];
      const next = cells.slice(i + 1).find((x) => x.trim());
      if (next && /\d/.test(next) && next.length < 40) return next.trim();
    }
  }
  return '';
}

/**
 * 只写「N.W. / 净重」的列：表里有「箱数」列（箱单常见写法）就按每行合计算，
 * 表头里有「每箱 / per carton / ctn」就按每箱算。
 */
function fixWeights(header: string[], mapping: Mapping): Mapping {
  const ctnsCol = mapping.includes('ctns');
  return mapping.map((k, i) => {
    if (k !== 'nw' && k !== 'gw') return k;
    const h = (header[i] ?? '').toLowerCase();
    if (/每箱|单箱|\/\s*ctn|per\s*c(ar)?t(o)?n|\/\s*箱/.test(h)) return k;
    if (/total|合计|总/.test(h) || ctnsCol) return k === 'nw' ? 'nwT' : 'gwT';
    return k;
  });
}

const blankMerged = (rows: string[][]) => rows.map((r) => r.map(() => false));

/** 识别表头与列含义；表头上方的内容用来找 PO 号 */
export function analyzeItems(table: string[][], tableMerged: boolean[][] = blankMerged(table)): ItemSheet {
  const { row, map } = detectHeader(table, ITEM_FIELDS);
  const width = Math.max(0, ...table.map((r) => r.length));
  // 至少认出两列才当作表头（否则可能是纯数据，例如只复制了几行货物）
  if (row < 0 || map.size < 2) {
    return { headerRow: -1, header: Array.from({ length: width }, (_, i) => `第 ${i + 1} 列`), rows: table, merged: tableMerged, mapping: Array(width).fill(''), po: '', table, tableMerged };
  }
  const header = Array.from({ length: width }, (_, i) => table[row][i] || `第 ${i + 1} 列`);
  const mapping = fixWeights(header, Array.from({ length: width }, (_, i) => map.get(i) ?? ''));
  return { headerRow: row, header, rows: table.slice(row + 1), merged: tableMerged.slice(row + 1), mapping, po: findPo(table.slice(0, row)), table, tableMerged };
}

/** 表头被手动切换（「第一行是表头」开 / 关）时重新划分 */
export function withHeaderRow(sheet: ItemSheet, headerRow: number): ItemSheet {
  if (headerRow === sheet.headerRow) return sheet;
  const t = sheet.table;
  const width = Math.max(0, ...t.map((r) => r.length));
  if (headerRow < 0) return { ...sheet, headerRow: -1, header: Array.from({ length: width }, (_, i) => `第 ${i + 1} 列`), rows: t, merged: sheet.tableMerged };
  return { ...sheet, headerRow, header: Array.from({ length: width }, (_, i) => t[headerRow][i] || `第 ${i + 1} 列`), rows: t.slice(headerRow + 1), merged: sheet.tableMerged.slice(headerRow + 1) };
}

const isTotalRow = (cells: string[]) => cells.some((c) => /^\s*(total|grand total|sub\s*total|合计|总计|小计)\b/i.test(c));
const num = (s: string | undefined) => (s && s.trim() ? toNumber(s) : '');
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const NUMERIC: IK[] = ['qty', 'price', 'amount', 'pcsPerCtn', 'ctns', 'nw', 'gw', 'nwT', 'gwT'];
/** 这些列是 Excel 合并单元格时，表示几行货混装在同一箱（箱数、毛重只算一次） */
const PER_CARTON: IK[] = ['ctns', 'gw', 'gwT'];
const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]+/g;

/** 「Tote bags 帆布袋」→ 英文 Tote bags、中文 帆布袋 */
export function splitName(s: string): { en: string; cn: string } | null {
  if (!/[A-Za-z]{2}/.test(s) || !s.match(CJK)) return null;
  const cn = (s.match(CJK) ?? []).join(' ').trim();
  const en = s.replace(CJK, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s/,，;-]+|[\s/,，;-]+$/g, '').trim();
  return en && cn ? { en, cn } : null;
}

export interface BuildResult {
  items: Item[];
  /** 有问题的行（导入后可在表格里补） */
  errors: string[];
  /** 提醒（混装等） */
  notes: string[];
  matched: number;
  /** 跳过的说明文字行（表格下方的 MARKS、Country of Origin 等） */
  skipped: number;
  /** 混装行（箱数计在同组第一行）：按品名更新时清空它们的装箱数据 */
  mixed: Set<string>;
}

/**
 * 按列映射生成货物行。
 * - 跳过空行、「合计 / Total」行，以及没有任何数字的说明文字行（表格下方的备注）
 * - 只有金额没有单价时，单价 = 金额 ÷ 数量；只有箱数没有每箱装时，每箱装 = 数量 ÷ 箱数
 * - 净毛重是每行合计时，按箱数换算成每箱
 * - 箱数 / 毛重是合并单元格（几种货混装一箱）：箱数、净重、毛重合计到这组的第一行
 * - 数量里带单位（如「1,200 PCS」）时取出单位；一格里中英文品名会拆开
 * - fill：按型号从产品库补全文件里没有的资料（单价仅在文件没有时）
 */
export function buildItems(rows: string[][], mapping: Mapping, products: Product[] = [], fill = true, merged: boolean[][] = []): BuildResult {
  const items: Item[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  const mixed = new Set<string>();
  let matched = 0, skipped = 0;
  const has = (k: IK) => mapping.includes(k);
  const byModel = new Map(products.map((p) => [p.model.trim().toLowerCase(), p]));
  const read = (cells: string[]) => {
    const v: Partial<Record<IK, string>> = {};
    mapping.forEach((k, ci) => { if (k) v[k] = (cells[ci] ?? '').trim(); });
    return v;
  };
  const hasNumber = (v: Partial<Record<IK, string>>) => NUMERIC.some((k) => toNumber(v[k] ?? '') !== 0);
  const anyNumeric = rows.some((r) => hasNumber(read(r)));
  // 混装组：箱数 / 毛重列是合并单元格的接续行
  let group: { first: Item; ctns: number; nwT: number; rows: number[] } | null = null;
  const closeGroup = () => {
    if (group && group.rows.length > 1) {
      const g = group;
      if (g.ctns > 0 && g.nwT > 0) g.first.nw = round(g.nwT / g.ctns, 3);
      notes.push(`第 ${g.rows[0]}–${g.rows[g.rows.length - 1]} 行是混装（Excel 合并单元格）：${g.ctns || ''} 箱的箱数和净毛重都计在第 ${g.rows[0]} 行，其余行不单独占箱`);
    }
    group = null;
  };

  rows.forEach((cells, ri) => {
    const line = ri + 1;
    const v = read(cells);
    if (!Object.values(v).some(Boolean)) return;
    if (isTotalRow(cells) && !v.model) { closeGroup(); return; }
    if (anyNumeric && !hasNumber(v)) { skipped++; closeGroup(); return; }
    const contRow = mapping.some((k, ci) => k && PER_CARTON.includes(k) && merged[ri]?.[ci]);
    const it = emptyItem();
    it.model = v.model ?? '';
    it.nameEn = v.nameEn ?? '';
    it.nameCn = v.nameCn ?? '';
    const sEn = !has('nameCn') && it.nameEn ? splitName(it.nameEn) : null;
    if (sEn) { it.nameEn = sEn.en; it.nameCn = sEn.cn; }
    const sCn = !has('nameEn') && it.nameCn ? splitName(it.nameCn) : null;
    if (sCn) { it.nameEn = sCn.en; it.nameCn = sCn.cn; }
    it.spec = v.spec ?? '';
    it.hs = (v.hs ?? '').replace(/\D/g, '');
    const unitInQty = (v.qty ?? '').match(/[A-Za-z]{2,}\s*$/)?.[0].trim().toUpperCase();
    it.unit = (v.unit || unitInQty || 'PCS').toUpperCase();
    it.qty = num(v.qty);
    const q = toNumber(String(it.qty));
    it.price = num(v.price);
    if (it.price === '' && v.amount && q) it.price = round(toNumber(v.amount) / q);
    const dims = parseDims(v.dims ?? '');
    it.l = dims ? dims[0] : num(v.l);
    it.w = dims ? dims[1] : num(v.w);
    it.h = dims ? dims[2] : num(v.h);
    it.elements = v.elements ?? '';

    if (contRow && group) {
      // 混装接续行：不单独占箱，净重合计加到组里
      group.rows.push(line);
      group.nwT += toNumber(v.nwT ?? '');
      mixed.add(it.id);
    } else {
      closeGroup();
      it.pcsPerCtn = num(v.pcsPerCtn);
      const ctns = toNumber(v.ctns ?? '');
      if (it.pcsPerCtn === '' && ctns && q) it.pcsPerCtn = round(q / ctns, 2);
      const cartons = ctns || (toNumber(String(it.pcsPerCtn)) && q ? Math.ceil(q / toNumber(String(it.pcsPerCtn))) : 0);
      it.nw = v.nwT && cartons ? round(toNumber(v.nwT) / cartons, 3) : num(v.nw);
      it.gw = v.gwT && cartons ? round(toNumber(v.gwT) / cartons, 3) : num(v.gw);
      group = { first: it, ctns: cartons, nwT: toNumber(v.nwT ?? ''), rows: [line] };
    }

    const p = it.model ? byModel.get(it.model.trim().toLowerCase()) : undefined;
    if (fill && p) {
      matched++;
      const keep = <K extends keyof Item>(k: K, val: Item[K]) => { if (it[k] === '' || it[k] == null) it[k] = val; };
      keep('nameEn', p.nameEn); keep('nameCn', p.nameCn); keep('spec', p.spec); keep('hs', p.hs);
      if (!has('unit') && !unitInQty) it.unit = p.unit || it.unit;
      if (!has('price') && !has('amount')) keep('price', p.price);
      if (!mixed.has(it.id)) { keep('pcsPerCtn', p.pcsPerCtn); keep('nw', p.nw); keep('gw', p.gw); }
      keep('l', p.l); keep('w', p.w); keep('h', p.h); keep('elements', p.elements);
    }
    if (!it.model && !it.nameEn && !it.nameCn) errors.push(`第 ${line} 行没有型号或品名`);
    else if (!q) errors.push(`第 ${line} 行（${it.model || it.nameEn || it.nameCn}）没有数量`);
    items.push(it);
  });
  closeGroup();
  return { items, errors, notes, matched, skipped, mixed };
}

/** 导入后哪些货物字段来自文件（按品名更新时只改这些） */
export function importedFields(mapping: Mapping): (keyof Item)[] {
  const f = new Set<keyof Item>();
  for (const k of mapping) {
    if (!k) continue;
    if (k === 'amount') f.add('price');
    else if (k === 'ctns') f.add('pcsPerCtn');
    else if (k === 'dims') { f.add('l'); f.add('w'); f.add('h'); }
    else if (k === 'nwT') f.add('nw');
    else if (k === 'gwT') f.add('gw');
    else f.add(k);
  }
  if (f.has('nameEn') || f.has('nameCn')) { f.add('nameEn'); f.add('nameCn'); }
  return [...f];
}

const keyOf = (it: Item) => (it.model || it.nameEn || it.nameCn).trim().toLowerCase();

/**
 * 按型号（没有型号时按品名）更新现有货物：只改文件里有的列，文件里是空的不覆盖；
 * 找不到对应货物的行加到最后。
 */
export function updateExisting(existing: Item[], r: BuildResult, mapping: Mapping): { items: Item[]; updated: number; added: number } {
  const fields = importedFields(mapping);
  const items = existing.map((x) => ({ ...x }));
  const byKey = new Map<string, number>();
  items.forEach((x, i) => {
    for (const k of [x.model, x.nameEn, x.nameCn]) if (k.trim() && !byKey.has(k.trim().toLowerCase())) byKey.set(k.trim().toLowerCase(), i);
  });
  let updated = 0, added = 0;
  for (const inc of r.items) {
    const idx = byKey.get(keyOf(inc)) ?? (inc.nameEn ? byKey.get(inc.nameEn.trim().toLowerCase()) : undefined) ?? (inc.nameCn ? byKey.get(inc.nameCn.trim().toLowerCase()) : undefined);
    if (idx == null) { items.push(inc); added++; continue; }
    const t = items[idx] as unknown as Record<string, unknown>;
    for (const f of fields) {
      const val = (inc as unknown as Record<string, unknown>)[f];
      if (val !== '' && val != null) t[f] = val;
    }
    if (r.mixed.has(inc.id)) { t.pcsPerCtn = ''; t.nw = ''; t.gw = ''; }
    updated++;
  }
  return { items, updated, added };
}

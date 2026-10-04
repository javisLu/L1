import { detectHeader, parseCsv, parseDims, toNumber, type FieldSpec } from './table';
import { emptyItem } from '../domain/factory';
import type { Item, Product } from '../domain/types';

/** 货物明细可以识别的列（客户 PO、工厂报价单、自己的 Excel 都适用） */
export type IK =
  | 'model' | 'nameEn' | 'nameCn' | 'spec' | 'hs' | 'unit' | 'qty' | 'price' | 'amount'
  | 'pcsPerCtn' | 'ctns' | 'dims' | 'l' | 'w' | 'h' | 'nw' | 'gw' | 'elements';

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
  { key: 'pcsPerCtn', label: '每箱装', aliases: ['每箱装', '每箱数量', '装箱数', '箱装数', '装箱量', 'pcs/ctn', 'qty/ctn', 'qty per carton', 'pcs per carton', 'packing qty', 'inner qty', 'packing'] },
  { key: 'ctns', label: '箱数', aliases: ['箱数', '件数', 'ctns', 'cartons', 'ctn', 'no of cartons', 'carton qty', 'total cartons', 'total ctns', '总箱数'] },
  { key: 'dims', label: '外箱尺寸', aliases: ['外箱尺寸', '箱规', '纸箱尺寸', '箱子尺寸', 'carton size', 'ctn size', 'meas', 'measurement', 'carton dimension'] },
  { key: 'l', label: '长', aliases: ['长', '长cm', '箱长', 'length'] },
  { key: 'w', label: '宽', aliases: ['宽', '宽cm', '箱宽', 'width'] },
  { key: 'h', label: '高', aliases: ['高', '高cm', '箱高', 'height'] },
  { key: 'nw', label: '净重/箱', aliases: ['净重', '单箱净重', '净重kg', 'nw', 'n.w.', 'net weight', 'nw/ctn'] },
  { key: 'gw', label: '毛重/箱', aliases: ['毛重', '单箱毛重', '毛重kg', 'gw', 'g.w.', 'gross weight', 'gw/ctn'] },
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
  mapping: Mapping;
  /** 表头上方找到的客户 PO 号 */
  po: string;
  table: string[][];
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

/** 识别表头与列含义；表头上方的内容用来找 PO 号 */
export function analyzeItems(table: string[][]): ItemSheet {
  const { row, map } = detectHeader(table, ITEM_FIELDS);
  const width = Math.max(0, ...table.map((r) => r.length));
  // 至少认出两列才当作表头（否则可能是纯数据，例如只复制了几行货物）
  if (row < 0 || map.size < 2) {
    return { headerRow: -1, header: Array.from({ length: width }, (_, i) => `第 ${i + 1} 列`), rows: table, mapping: Array(width).fill(''), po: '', table };
  }
  const header = Array.from({ length: width }, (_, i) => table[row][i] || `第 ${i + 1} 列`);
  return { headerRow: row, header, rows: table.slice(row + 1), mapping: Array.from({ length: width }, (_, i) => map.get(i) ?? ''), po: findPo(table.slice(0, row)), table };
}

/** 表头被手动切换（「第一行是表头」开 / 关）时重新划分 */
export function withHeaderRow(sheet: ItemSheet, headerRow: number): ItemSheet {
  if (headerRow === sheet.headerRow) return sheet;
  const t = sheet.table;
  const width = Math.max(0, ...t.map((r) => r.length));
  if (headerRow < 0) return { ...sheet, headerRow: -1, header: Array.from({ length: width }, (_, i) => `第 ${i + 1} 列`), rows: t };
  return { ...sheet, headerRow, header: Array.from({ length: width }, (_, i) => t[headerRow][i] || `第 ${i + 1} 列`), rows: t.slice(headerRow + 1) };
}

const isTotalRow = (cells: string[]) => cells.some((c) => /^\s*(total|grand total|sub\s*total|合计|总计|小计)\b/i.test(c));
const num = (s: string | undefined) => (s && s.trim() ? toNumber(s) : '');
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export interface BuildResult { items: Item[]; errors: string[]; matched: number }

/**
 * 按列映射生成货物行。
 * - 跳过空行和「合计 / Total」行
 * - 只有金额没有单价时，单价 = 金额 ÷ 数量；只有箱数没有每箱装时，每箱装 = 数量 ÷ 箱数
 * - 数量里带单位（如「1,200 PCS」）时取出单位
 * - fill：按型号从产品库补全文件里没有的资料（HS、中文品名、箱规、重量、申报要素，单价仅在文件没有时）
 */
export function buildItems(rows: string[][], mapping: Mapping, products: Product[] = [], fill = true): BuildResult {
  const items: Item[] = [];
  const errors: string[] = [];
  let matched = 0;
  const has = (k: IK) => mapping.includes(k);
  const byModel = new Map(products.map((p) => [p.model.trim().toLowerCase(), p]));
  rows.forEach((cells, ri) => {
    const v: Partial<Record<IK, string>> = {};
    mapping.forEach((k, ci) => { if (k) v[k] = (cells[ci] ?? '').trim(); });
    if (!Object.values(v).some(Boolean)) return;
    if (isTotalRow(cells) && !v.model) return;
    const it = emptyItem();
    it.model = v.model ?? '';
    it.nameEn = v.nameEn ?? '';
    it.nameCn = v.nameCn ?? '';
    it.spec = v.spec ?? '';
    it.hs = (v.hs ?? '').replace(/\D/g, '');
    const unitInQty = (v.qty ?? '').match(/[A-Za-z]{2,}\s*$/)?.[0].trim().toUpperCase();
    it.unit = (v.unit || unitInQty || 'PCS').toUpperCase();
    it.qty = num(v.qty);
    it.price = num(v.price);
    if (it.price === '' && v.amount && toNumber(String(it.qty))) it.price = round(toNumber(v.amount) / toNumber(String(it.qty)));
    it.pcsPerCtn = num(v.pcsPerCtn);
    if (it.pcsPerCtn === '' && v.ctns && toNumber(v.ctns) && toNumber(String(it.qty))) it.pcsPerCtn = round(toNumber(String(it.qty)) / toNumber(v.ctns), 2);
    const dims = parseDims(v.dims ?? '');
    it.l = dims ? dims[0] : num(v.l);
    it.w = dims ? dims[1] : num(v.w);
    it.h = dims ? dims[2] : num(v.h);
    it.nw = num(v.nw);
    it.gw = num(v.gw);
    it.elements = v.elements ?? '';

    const p = it.model ? byModel.get(it.model.trim().toLowerCase()) : undefined;
    if (fill && p) {
      matched++;
      const keep = <K extends keyof Item>(k: K, val: Item[K]) => { if (it[k] === '' || it[k] == null) it[k] = val; };
      keep('nameEn', p.nameEn); keep('nameCn', p.nameCn); keep('spec', p.spec); keep('hs', p.hs);
      if (!has('unit') && !unitInQty) it.unit = p.unit || it.unit;
      if (!has('price') && !has('amount')) keep('price', p.price);
      keep('pcsPerCtn', p.pcsPerCtn); keep('l', p.l); keep('w', p.w); keep('h', p.h);
      keep('nw', p.nw); keep('gw', p.gw); keep('elements', p.elements);
    }
    const line = ri + 1;
    if (!it.model && !it.nameEn && !it.nameCn) errors.push(`第 ${line} 行没有型号或品名`);
    else if (!toNumber(String(it.qty))) errors.push(`第 ${line} 行（${it.model || it.nameEn || it.nameCn}）没有数量`);
    items.push(it);
  });
  return { items, errors, matched };
}

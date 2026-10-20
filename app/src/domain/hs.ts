import { toNum, today, uid } from './calc';
import type { HsEntry, Item, Num, Order, Product, TariffRow } from './types';

/**
 * HS 记忆库与税则表（M2-3）。
 * 记忆库：导出过的订单里每个「中文品名 + 商品编号」自动记住，下次同品名自动带出编号、申报要素、退税率。
 * 税则表：用户导入（报关行、货代通常有），按编码查申报要素格式、退税率、监管条件。
 */

/** 品名比较：去掉首尾和多余空格，全角括号、空格按半角算 */
export const normName = (s: string) =>
  String(s ?? '').trim().replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/[\s　]+/g, ' ').toLowerCase();

export const hsDigits = (s: string) => String(s ?? '').replace(/\D/g, '');

export const findByName = (lib: HsEntry[], name: string) => {
  const k = normName(name);
  return k ? lib.find((e) => normName(e.nameCn) === k) : undefined;
};

/** 输入品名时的候选：先列开头一致的，再列包含的，按最近使用 */
export function suggestNames(lib: HsEntry[], q: string, limit = 12): HsEntry[] {
  const k = normName(q);
  const byUsed = [...lib].sort((a, b) => b.used.localeCompare(a.used));
  if (!k) return byUsed.slice(0, limit);
  const head = byUsed.filter((e) => normName(e.nameCn).startsWith(k));
  const mid = byUsed.filter((e) => !head.includes(e) && (normName(e.nameCn).includes(k) || e.hs.startsWith(hsDigits(q) || '-')));
  return [...head, ...mid].slice(0, limit);
}

/** 按商品编号查税则：先查 10 位，查不到按前 8 位 */
export function tariffOf(tariff: TariffRow[], hs: string): TariffRow | undefined {
  const d = hsDigits(hs);
  if (d.length < 8) return undefined;
  return tariff.find((t) => t.hs === d) ?? tariff.find((t) => t.hs.slice(0, 8) === d.slice(0, 8));
}

/** 税则里的申报要素格式 → 填写提示：「品牌类型|出口享惠情况|用途|材质|品牌|型号」 */
export function elementsHint(t?: TariffRow): string {
  if (!t?.elements) return '';
  const parts = t.elements.split(/[;；\n]/).map((x) => x.replace(/^\s*\d+\s*[:：.、]\s*/, '').trim()).filter(Boolean);
  return parts.join('|');
}

/** 常见监管条件代码（只列有把握的，其余原样显示） */
const CONTROL: Record<string, string> = { A: '入境检验检疫', B: '出境检验检疫', '4': '出口许可证' };
export const controlText = (c: string) =>
  String(c ?? '').replace(/\s/g, '').split('').filter(Boolean).map((x) => (CONTROL[x] ? `${x}（${CONTROL[x]}）` : x)).join('、');

const validHs = (hs: string) => hsDigits(hs).length >= 8;

/**
 * 记住订单里填好的品名、编号、申报要素、退税率（在 immer 草稿上改）。
 * 同品名已有的更新为最新填写的内容；返回新增和更新的条数。
 */
export function learn(lib: HsEntry[], items: Pick<Item, 'nameCn' | 'hs' | 'elements' | 'rebate'>[], date = today()): { added: number; updated: number } {
  const r = { added: 0, updated: 0 };
  for (const it of items) {
    if (!it.nameCn?.trim() || !validHs(it.hs)) continue;
    const hs = hsDigits(it.hs);
    const ex = findByName(lib, it.nameCn);
    const rebate: Num = it.rebate !== undefined && String(it.rebate).trim() !== '' ? it.rebate : ex?.rebate ?? '';
    if (!ex) {
      lib.unshift({ id: uid(), nameCn: it.nameCn.trim(), hs, elements: it.elements ?? '', rebate, source: 'order', used: date });
      r.added++;
      continue;
    }
    const changed = ex.hs !== hs || (it.elements && ex.elements !== it.elements) || String(ex.rebate) !== String(rebate);
    ex.hs = hs;
    if (it.elements) ex.elements = it.elements;
    ex.rebate = rebate;
    ex.used = date;
    if (changed) { ex.source = 'order'; r.updated++; }
  }
  return r;
}

/** 第一次升级时：从产品库和已有订单生成记忆库 */
export function buildLib(products: Product[], orders: Order[]): HsEntry[] {
  const lib: HsEntry[] = [];
  const sorted = [...orders].sort((a, b) => a.updated.localeCompare(b.updated));
  learn(lib, products.map((p) => ({ nameCn: p.nameCn, hs: p.hs, elements: p.elements, rebate: undefined })), '');
  for (const o of sorted) learn(lib, o.items, o.updated);
  return lib;
}

export interface FillResult { cells: number; rows: number[] }

/**
 * 按记忆库和税则表补全订单货物（只补空着的，不改已填的）：
 * 同品名 → 商品编号、申报要素、退税率；有编号没退税率 → 按税则表的退税率。
 */
/** rebateOnly：只补退税率（填完商品编号时用，不回填刚清空的编号） */
export function fillItems(o: Order, lib: HsEntry[], tariff: TariffRow[], only?: number[], rebateOnly = false): FillResult {
  const res: FillResult = { cells: 0, rows: [] };
  o.items.forEach((it, i) => {
    if (only && !only.includes(i)) return;
    let n = 0;
    const m = findByName(lib, it.nameCn);
    if (m) {
      if (!rebateOnly && !it.hs.trim() && m.hs) { it.hs = m.hs; n++; }
      if (!rebateOnly && !it.elements.trim() && m.elements && hsDigits(it.hs) === m.hs) { it.elements = m.elements; n++; }
      if (String(it.rebate ?? '').trim() === '' && String(m.rebate).trim() !== '' && hsDigits(it.hs) === m.hs) { it.rebate = m.rebate; n++; }
    }
    if (String(it.rebate ?? '').trim() === '') {
      const t = tariffOf(tariff, it.hs);
      if (t && String(t.rebate).trim() !== '') { it.rebate = t.rebate; n++; }
    }
    if (n) { res.cells += n; res.rows.push(i); }
  });
  return res;
}

/** 还能补全多少格（按钮上显示） */
export function fillable(o: Order, lib: HsEntry[], tariff: TariffRow[]): number {
  const copy = JSON.parse(JSON.stringify(o)) as Order;
  return fillItems(copy, lib, tariff).cells;
}

export const rebateOf = (e?: { rebate: Num }) => (e && String(e.rebate).trim() !== '' ? toNum(e.rebate) : null);

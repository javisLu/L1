import { calc, fillMarks, toNum } from './calc';
import type { LabelLayout, Order } from './types';

const MM = 72 / 25.4;

/** 版式：页面尺寸（pt）、每页几列几行 */
export const LABEL_LAYOUTS: Record<LabelLayout, { name: string; hint: string; page: [number, number]; cols: number; rows: number; margin: number; gap: number }> = {
  'a4-2': { name: 'A4 · 每页 2 张', hint: '大箱，贴整面', page: [595.28, 841.89], cols: 1, rows: 2, margin: 24, gap: 14 },
  'a4-4': { name: 'A4 · 每页 4 张', hint: '最常用', page: [595.28, 841.89], cols: 2, rows: 2, margin: 22, gap: 12 },
  'a4-6': { name: 'A4 · 每页 6 张', hint: '中小箱', page: [595.28, 841.89], cols: 2, rows: 3, margin: 20, gap: 10 },
  'a4-8': { name: 'A4 · 每页 8 张', hint: '小箱 / 不干胶 A4 标签纸', page: [595.28, 841.89], cols: 2, rows: 4, margin: 18, gap: 8 },
  '100x100': { name: '标签机 100×100 mm', hint: '热敏标签打印机', page: [100 * MM, 100 * MM], cols: 1, rows: 1, margin: 8, gap: 0 },
  '100x150': { name: '标签机 100×150 mm', hint: '热敏标签打印机（快递面单尺寸）', page: [100 * MM, 150 * MM], cols: 1, rows: 1, margin: 8, gap: 0 },
};

export interface CartonLabel {
  /** 箱号（从 1 起）与总箱数 */
  n: number;
  total: number;
  /** 正唛：C/NO. 换成本箱箱号 */
  mark: string;
  model: string;
  name: string;
  /** 本箱数量（尾箱为余数） */
  qty: number;
  unit: string;
  nw: number;
  gw: number;
  dims: string;
}

/** 正唛里的箱号行：C/NO.、CTN NO.、CARTON NO.（后面跟 1-74、1-UP 等） */
export const CNO_LINE = /((?:\bC\s*\/\s*NO|\bCTN\.?\s*NOS?|\bCARTON\s*NOS?|\bC\s*NO)\.?\s*:?\s*)([^\n]*)/i;

/** 正唛里的箱号行改成「C/NO. 5/74」；没有箱号行就在末尾加一行 */
export function markForCarton(mark: string, n: number, total: number): string {
  const re = CNO_LINE;
  if (re.test(mark)) return mark.replace(re, `$1${n}/${total}`);
  return (mark ? mark.replace(/\s+$/, '') + '\n' : '') + `C/NO. ${n}/${total}`;
}

/** 每箱一张箱贴；from / to 为箱号范围（含） */
export function cartonLabels(o: Order, from = 1, to = Infinity): CartonLabel[] {
  const k = calc(o.items);
  const total = k.ctns;
  const base = fillMarks(o.shipping.marks || '', o);
  const out: CartonLabel[] = [];
  for (const r of k.rows) {
    if (!r.n) continue;
    const per = toNum(r.pcsPerCtn), q = toNum(r.q);
    for (let n = Math.max(r.from, from); n <= Math.min(r.to, to); n++) {
      const last = n === r.to;
      const qty = last && per > 0 && q % per ? q % per : per;
      out.push({
        n, total, mark: markForCarton(base, n, total),
        model: r.model, name: String(r.nameEn || r.nameCn || '').toUpperCase(), qty, unit: r.unit,
        nw: toNum(r.nw), gw: toNum(r.gw), dims: toNum(r.l) ? `${r.l}×${r.w}×${r.h} CM` : '',
      });
    }
  }
  return out;
}

export const labelPages = (count: number, layout: LabelLayout) => {
  const l = LABEL_LAYOUTS[layout];
  return Math.ceil(count / (l.cols * l.rows));
};

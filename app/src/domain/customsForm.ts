import { CURRENCY_CN } from './constants';
import type { Currency } from './types';

/**
 * 出口货物报关单（海关现行格式）上的写法：日期 8 位、计量单位和币制写中文、代码写在名称后面括号里。
 * 只是给报关行核对的草稿，正式以单一窗口录入为准。
 */

/** 成交计量单位：常见英文写法 → 海关中文单位；认不出的照原样 */
const UNIT_CN: [RegExp, string][] = [
  [/^(PCS?|PIECES?)$/, '个'], [/^SETS?$/, '套'], [/^PAIRS?$/, '双'], [/^(CTNS?|CARTONS?)$/, '箱'], [/^(KGS?|KILOGRAMS?)$/, '千克'],
  [/^(M|MTRS?|METERS?|METRES?)$/, '米'], [/^ROLLS?$/, '卷'], [/^(DOZ|DOZENS?)$/, '打'], [/^BOX(ES)?$/, '盒'], [/^BAGS?$/, '袋'],
  [/^(TONS?|MT)$/, '吨'], [/^(SQM|M2|SQ\.?\s*M)$/, '平方米'], [/^(L|LTRS?|LITERS?|LITRES?)$/, '升'], [/^SHEETS?$/, '张'], [/^BOTTLES?$/, '瓶'],
];
export function unitCn(u: string): string {
  const t = String(u ?? '').trim();
  const hit = UNIT_CN.find(([re]) => re.test(t.toUpperCase()));
  return hit ? hit[1] : t;
}

/** 报关单上的日期写 8 位：2026-10-08 → 20261008 */
export const ymd8 = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d ?? '') ? d.replace(/-/g, '') : d ?? '');

/** 「0110 一般贸易」→「一般贸易(0110)」；没有代码的照原样 */
export function codeName(v: string): string {
  const m = String(v ?? '').trim().match(/^(\w+)\s+(.+)$/);
  return m && /\d/.test(m[1]) ? `${m[2]}(${m[1]})` : String(v ?? '').trim();
}

/** 币制写中文：USD → 美元 */
export const curCn = (c: Currency) => CURRENCY_CN[c]?.split(' ')[1] ?? c;

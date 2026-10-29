import { destOf } from './origin';
import type { Order } from './types';

/**
 * 目的国的进口合规要求（只收规则明确、有条文可查的）。
 * 原产地标记：美国要求进口货物（或其外包装）用英文清楚标明原产国，没标的进口商要补标或加征 10% 关税。
 */
export const ORIGIN_MARK: Record<string, { basis: string }> = {
  美国: { basis: '美国 19 U.S.C. §1304、19 CFR Part 134（原产地标记）' },
};

/** 唛头 / 侧唛里有没有写原产国 */
export const hasOriginMark = (text: string) => /MADE\s+IN\s+(THE\s+)?(P\.?\s*R\.?\s*)?CHINA|PRODUCT\s+OF\s+(P\.?\s*R\.?\s*)?CHINA|(COUNTRY\s+OF\s+)?ORIGIN\s*[:：]?\s*(P\.?\s*R\.?\s*)?CHINA/i.test(text);

/** 本单目的国要求标原产地、唛头里却没写：返回依据；不需要或已写返回 null */
export function originMarkMissing(o: Order): { country: string; basis: string } | null {
  const d = destOf(o).cn;
  const rule = ORIGIN_MARK[d];
  if (!rule) return null;
  return hasOriginMark(`${o.shipping.marks ?? ''}\n${o.shipping.side ?? ''}`) ? null : { country: d, basis: rule.basis };
}

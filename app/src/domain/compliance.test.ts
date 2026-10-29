import { describe, expect, it } from 'vitest';
import { hasOriginMark, originMarkMissing } from './compliance';
import { checkOrder } from '../modules/check';
import { seed } from './seed';

describe('目的国原产地标记', () => {
  it('认得各种写法', () => {
    for (const t of ['MADE IN CHINA', 'Made in P.R. China', 'PRODUCT OF CHINA', 'ORIGIN: CHINA', 'COUNTRY OF ORIGIN: P.R.CHINA']) expect(hasOriginMark(t)).toBe(true);
    expect(hasOriginMark('ABC\nLOS ANGELES\nC/NO. 1-210')).toBe(false);
  });
  it('美国单唛头没写原产国要提醒（带依据），一键加上；侧唛写了也算', () => {
    const o = seed().orders[1]; // 发美国
    expect(originMarkMissing(o)).toBeNull();
    o.shipping.marks = 'ABC\nLOS ANGELES\nC/NO. 1-210';
    const iss = checkOrder(o).find((x) => x.text.includes('标明原产国'));
    expect(iss?.basis).toContain('19 CFR Part 134');
    iss!.fix!.apply(o);
    expect(o.shipping.marks).toBe('ABC\nLOS ANGELES\nC/NO. 1-210\nMADE IN CHINA');
    o.shipping.marks = 'ABC';
    o.shipping.side = 'MADE IN CHINA';
    expect(originMarkMissing(o)).toBeNull();
  });
  it('不是美国的单子不提醒', () => {
    const o = seed().orders[2]; // 丹麦，唛头没有 MADE IN CHINA
    expect(originMarkMissing(o)).toBeNull();
  });
});

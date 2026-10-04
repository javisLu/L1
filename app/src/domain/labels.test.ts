import { describe, expect, it } from 'vitest';
import { cartonLabels, labelPages, markForCarton } from './labels';
import { seed } from './seed';

describe('箱贴', () => {
  it('正唛箱号改成本箱号 / 总箱数', () => {
    expect(markForCarton('G.V.\nC/NO. 1-74\nMADE IN CHINA', 5, 74)).toBe('G.V.\nC/NO. 5/74\nMADE IN CHINA');
    expect(markForCarton('ABC\nCTN NO.: 1-UP', 2, 9)).toBe('ABC\nCTN NO.: 2/9');
    expect(markForCarton('ABC', 3, 9)).toBe('ABC\nC/NO. 3/9');
    expect(markForCarton('', 1, 1)).toBe('C/NO. 1/1');
  });

  it('每箱一张，尾箱数量为余数，可指定箱号范围', () => {
    const o = seed().orders[0];
    o.items[0].qty = 101; // 每箱 2 → 51 箱，最后一箱 1
    const all = cartonLabels(o);
    const total = all.length;
    expect(all[0]).toMatchObject({ n: 1, total, qty: 2, model: 'AL-S200' });
    expect(all[50]).toMatchObject({ n: 51, qty: 1 });
    expect(all[51].model).toBe('AL-H500');
    expect(all[0].mark).toContain(`1/${total}`);
    const part = cartonLabels(o, 50, 53);
    expect(part.map((x) => x.n)).toEqual([50, 51, 52, 53]);
    expect(labelPages(74, 'a4-4')).toBe(19);
    expect(labelPages(74, '100x150')).toBe(74);
  });
});

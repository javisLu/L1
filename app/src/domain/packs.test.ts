import { describe, expect, it } from 'vitest';
import { calcOrder } from './calc';
import { groupRows, prunePacks, ungroup } from './packs';
import { seed } from './seed';
import { emptyItem } from './factory';
import type { Item } from './types';

const it_ = (name: string, qty: number, nw: number, extra: Partial<Item> = {}): Item => ({ ...emptyItem(), nameEn: name, qty, nw, ...extra });

describe('混装箱', () => {
  it('成员排到一起、整组占一段箱号、毛重按净重比例分摊', () => {
    const o = seed().orders[0];
    o.items = [
      it_('Tote bags', 500, 12.5, { pcsPerCtn: 50, gw: 13.385 }),
      it_('Key Ring', 130, 7.8),
      it_('Other', 10, 1, { pcsPerCtn: 10, gw: 1.2 }),
      it_('Brochure', 900, 13.5),
      it_('Sample box', 46, 1.15),
    ];
    const ids = [o.items[1].id, o.items[3].id, o.items[4].id];
    const p = groupRows(o, ids)!;
    p.gw = 29.5;
    p.l = 43; p.w = 28; p.h = 48;
    expect(o.items.map((x) => x.nameEn)).toEqual(['Tote bags', 'Key Ring', 'Brochure', 'Sample box', 'Other']);
    const k = calcOrder(o);
    expect(k.ctns).toBe(12);
    const [, kr, br, sb, other] = k.rows;
    expect([kr.from, kr.to, br.from, sb.to]).toEqual([11, 11, 11, 11]);
    expect([kr.n, br.n, sb.n]).toEqual([1, 0, 0]);
    expect(kr.lead && kr.span).toBe(3);
    expect(br.lead).toBe(false);
    const nwSum = 7.8 + 13.5 + 1.15;
    expect(kr.gwT).toBeCloseTo(29.5 * 7.8 / nwSum, 2);
    expect(Math.round((kr.gwT + br.gwT + sb.gwT) * 100)).toBe(2950);
    expect(kr.nwT).toBe(7.8);
    expect(other.from).toBe(12);
    expect(k.gw).toBeCloseTo(133.85 + 29.5 + 1.2, 6);
    expect(k.cbm).toBeCloseTo((43 * 28 * 48) / 1e6, 3);
  });

  it('拆开、删到只剩一行时自动拆开', () => {
    const o = seed().orders[0];
    o.items = [it_('A', 5, 1), it_('B', 3, 2), it_('C', 1, 1)];
    const p = groupRows(o, o.items.map((x) => x.id))!;
    o.items.splice(0, 2);
    prunePacks(o);
    expect(o.packs).toEqual([]);
    expect(o.items[0].mix).toBe('');
    const q = groupRows(o, [])!;
    expect(q).toBeNull();
    o.items = [it_('A', 5, 1), it_('B', 3, 2)];
    const r = groupRows(o, o.items.map((x) => x.id))!;
    ungroup(o, r.id);
    expect(o.items.every((x) => !x.mix && x.pcsPerCtn === x.qty)).toBe(true);
    expect(p.id).not.toBe(r.id);
  });
});

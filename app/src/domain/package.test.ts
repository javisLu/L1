import { describe, expect, it } from 'vitest';
import { pkgNote, pkgSummary } from './package';
import { seed } from './seed';
import { checkOrder } from '../modules/check';
import { missing } from '../modules/defs';
import { packagingFromNotes } from '../io/items';

describe('总件数 / 外包装', () => {
  it('散箱：件数 = 箱数，英文单复数', () => {
    const o = seed().orders[0];
    const s = pkgSummary(o);
    expect(s.count).toBe(74);
    expect(s.words).toBe('SAY TOTAL SEVENTY-FOUR (74) CARTONS ONLY');
    expect(s.contains).toBe('');
    expect(pkgNote(s)).toBe('');
  });

  it('托盘：件数、每件尺寸算体积、托盘自重计入毛重', () => {
    const o = seed().orders[0];
    const base = pkgSummary(o);
    o.pkg = { mode: 'pallet', unit: '', count: 1, tare: 6, sizes: [{ n: 1, l: 120, w: 80, h: 136 }] };
    const s = pkgSummary(o);
    expect(s.words).toBe('SAY TOTAL ONE (1) PALLET ONLY');
    expect(s.contains).toBe('1 PALLET CONTAINS 74 CARTONS');
    expect(s.gw).toBeCloseTo(base.gw + 6, 6);
    expect(s.cbm).toBeCloseTo(1.3056, 6);
    expect(pkgNote(s)).toContain('PALLET SIZE: 1@120×80×136 cm');
    o.pkg.count = 8;
    expect(pkgSummary(o).words).toBe('SAY TOTAL EIGHT (8) PALLETS ONLY');
    expect(pkgSummary(o).contains).toBe('8 PALLETS CONTAIN 74 CARTONS');
    expect(checkOrder(o).map((x) => x.text).join()).toContain('外包装尺寸里一共写了 1 件，总件数是 8 托');
    o.pkg = { mode: 'other', unit: 'bags', count: 3, tare: '', sizes: [] };
    expect(pkgSummary(o).words).toBe('SAY TOTAL THREE (3) BAGS ONLY');
  });

  it('选了托盘没填件数算缺项', () => {
    const o = seed().orders[0];
    o.pkg = { mode: 'pallet', unit: '', count: '', tare: '', sizes: [] };
    expect(missing(o, 'packing')).toContain('总件数（托盘 / 木箱数）');
  });

  it('从箱单备注识别托盘', () => {
    const p = packagingFromNotes([['Remarks:\nCarton 10@63*43*22cm,1@43*28*48cm\nPallet  1@120*80*136cm']]);
    expect(p).toMatchObject({ mode: 'pallet', count: 1, sizes: [{ n: 1, l: 120, w: 80, h: 136 }] });
    expect(packagingFromNotes([['Carton 10@63*43*22cm']])).toBeNull();
  });
});

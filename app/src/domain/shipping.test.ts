import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { blTypeText, cargoLine, consigneeText, containerRows, freightText, goodsLines, insureNeeded, notifyText } from './shipping';
import { checkOrder } from '../modules/check';

describe('订舱 / 提单补料', () => {
  it('收货人、通知人默认规则', () => {
    const o = seed().orders[1];
    expect(consigneeText(o).split('\n')[0]).toBe('ABC Trading LLC');
    expect(notifyText(o)).toBe('SAME AS CONSIGNEE');
    o.shipping.consigneeMode = 'order';
    expect(consigneeText(o)).toBe('TO ORDER');
    expect(notifyText(o).split('\n')[0]).toBe('ABC Trading LLC');
    o.shipping.notifyMode = 'custom';
    o.shipping.notify = 'XYZ BROKER INC.';
    expect(notifyText(o)).toBe('XYZ BROKER INC.');
  });

  it('运费、投保按贸易术语自动，提单类型文字', () => {
    const o = seed().orders[1];
    o.terms.incoterm = 'CIF';
    expect(freightText(o)).toBe('FREIGHT PREPAID');
    expect(insureNeeded(o)).toBe(true);
    o.terms.incoterm = 'FOB';
    expect(freightText(o)).toBe('FREIGHT COLLECT');
    expect(insureNeeded(o)).toBe(false);
    o.shipping.insure = 'yes';
    expect(insureNeeded(o)).toBe(true);
    expect(blTypeText(o)).toBe('3/3 ORIGINAL B/L');
    o.shipping.originals = 2;
    expect(blTypeText(o)).toBe('2/2 ORIGINAL B/L');
    o.shipping.blType = 'telex';
    expect(blTypeText(o)).toBe('TELEX RELEASE');
  });

  it('柜子：没有多柜明细时用柜号封号 + 整票件毛体；货描去重带 HS', () => {
    const o = seed().orders[1];
    const [c] = containerRows(o);
    expect(c).toMatchObject({ no: 'CSNU7234561', seal: 'CN4471823', type: '40HQ' });
    expect(c.pkgs).toBeGreaterThan(0);
    o.shipping.boxes = [{ no: 'A1', seal: 'S1', type: '20GP', pkgs: 10, gw: 100, cbm: 5 }, { no: 'A2', seal: 'S2', type: '20GP', pkgs: 5, gw: 50, cbm: 2 }];
    expect(containerRows(o).map((x) => x.no)).toEqual(['A1', 'A2']);
    expect(checkOrder(o).map((x) => x.text).join()).toContain('多柜明细里的件数合计 15');
    expect(goodsLines(o)[0]).toMatch(/HS CODE: \d{10}/);
    expect(cargoLine(o)).toMatch(/CARTONS \/ [\d,.]+ KGS \/ [\d.]+ CBM/);
  });

  it('检查：自定义收货人没填、运费与术语不符、TO ORDER 却电放', () => {
    const o = seed().orders[1];
    o.shipping.consigneeMode = 'custom';
    o.shipping.freight = 'COLLECT'; // CIF
    const t = checkOrder(o).map((x) => x.text).join('\n');
    expect(t).toContain('收货人选了「自定义」但没有填写');
    expect(t).toContain('CIF 成交一般是 FREIGHT PREPAID');
    o.shipping.consigneeMode = 'order';
    o.shipping.blType = 'telex';
    expect(checkOrder(o).map((x) => x.text).join()).toContain('TO ORDER 时一般出正本提单');
  });
});

import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { seed } from './seed';
import { factoriesOf, poNo, poRows, poTotal, profitOf, rmbWords } from './purchase';
import { docSig } from './exports';
import { asOrder, diffDoc, takeSnap, totalChanges } from './history';
import { checkOrder } from '../modules/check';
import { neededMods } from '../modules/defs';
import { renderPoExcel } from '../export/poexcel';

const order = () => seed().orders[0];

describe('人民币大写', () => {
  it.each([
    [0, '人民币零元整'],
    [1, '人民币壹元整'],
    [10, '人民币壹拾元整'],
    [105, '人民币壹佰零伍元整'],
    [1010, '人民币壹仟零壹拾元整'],
    [10050000, '人民币壹仟零伍万元整'],
    [15000001, '人民币壹仟伍佰万零壹元整'],
    [100000001, '人民币壹亿零壹元整'],
    [100500, '人民币壹拾万零伍佰元整'],
    [1.05, '人民币壹元零伍分'],
    [1.5, '人民币壹元伍角'],
    [0.56, '人民币伍角陆分'],
    [12345.67, '人民币壹万贰仟叁佰肆拾伍元陆角柒分'],
  ])('%s → %s', (n, s) => expect(rmbWords(n)).toBe(s));
});

describe('采购单按工厂分', () => {
  it('没单独选工厂的按订单菜单里的工厂；几个工厂编号加 -1、-2', () => {
    const o = order();
    expect(factoriesOf(o)).toEqual(['p4', 'p6']);
    expect(poRows(o, 'p4')).toEqual([0, 1]);
    expect(poRows(o, 'p6')).toEqual([2]);
    expect(poNo(o, 'p4')).toBe('CG-2026-003-1');
    expect(poNo(o, 'p6')).toBe('CG-2026-003-2');
    expect(poTotal(o, 'p4')).toBe(100 * 58 + 20 * 420);
    o.items[2].factory = '';
    expect(factoriesOf(o)).toEqual(['p4']);
    expect(poNo(o, 'p4')).toBe('CG-2026-003');
    o.purchase!.pos.p4 = { no: 'MY-PO-1' };
    expect(poNo(o, 'p4')).toBe('MY-PO-1');
  });

  it('自己是工厂（没选工厂、没填采购价）时「工厂采购」标为可不做', () => {
    const o = order();
    expect(neededMods(o).has('purchase')).toBe(true);
    o.partners.factory = '';
    o.items.forEach((it) => { it.factory = ''; it.cost = ''; });
    expect(neededMods(o).has('purchase')).toBe(false);
  });
});

describe('每单利润', () => {
  it('销售额 × 汇率 + 退税 − 采购成本 − 费用', () => {
    const o = order();
    const p = profitOf(o);
    const cost = 100 * 58 + 20 * 420 + 200 * 14.5;
    const rebate = ((100 * 58 + 20 * 420) / 1.13) * 0.13 + ((200 * 14.5) / 1.13) * 0.09;
    expect(p.rate).toBe(7.12);
    expect(p.cost).toBeCloseTo(cost, 6);
    expect(p.rebate).toBeCloseTo(rebate, 6);
    expect(p.fees).toBe(1200 + 650 + 400 + 150);
    expect(p.profit).toBeCloseTo(p.salesFx * 7.12 + rebate - cost - 2400, 6);
    expect(p.noCost).toEqual([]);
  });

  it('没填汇率用参考汇率；人民币报价汇率为 1；没填采购价的行列出来', () => {
    const o = order();
    o.purchase!.rate = '';
    expect(profitOf(o)).toMatchObject({ rate: 7.1, rateRef: true });
    o.terms.currency = 'CNY';
    expect(profitOf(o)).toMatchObject({ rate: 1, rateRef: false });
    o.items[1].cost = '';
    expect(profitOf(o).noCost).toEqual([1]);
    expect(checkOrder(o).some((x) => x.mod === 'purchase' && x.text.includes('第 2 行没填采购单价'))).toBe(true);
  });

  it('亏损时单据检查提醒', () => {
    const o = order();
    o.items.forEach((it) => (it.cost = 999));
    expect(checkOrder(o).some((x) => x.text.startsWith('按现在的采购价和费用，本单预计亏损'))).toBe(true);
  });
});

describe('采购价不影响给客户的单据', () => {
  it('改采购价、工厂、退税率：PI / 发票 / 箱单不算改过，采购单算改过', () => {
    const o = order();
    const before = { pi: docSig(o, 'pi'), ci: docSig(o, 'ci'), pl: docSig(o, 'pl'), po: docSig(o, 'po') };
    o.items[0].cost = 60;
    o.items[0].rebate = 9;
    o.items[1].factory = 'p6';
    expect(docSig(o, 'pi')).toBe(before.pi);
    expect(docSig(o, 'ci')).toBe(before.ci);
    expect(docSig(o, 'pl')).toBe(before.pl);
    expect(docSig(o, 'po')).not.toBe(before.po);
  });

  it('采购单改版对比：采购单价、交货日期、采购总金额', () => {
    const o = order();
    const prev = asOrder(takeSnap(o), o);
    o.items[0].cost = 60;
    o.purchase!.pos.p4.delivery = '2026-11-02';
    const ch = [...diffDoc(prev, o, 'po'), ...totalChanges(prev, o, 'po')];
    expect(ch.find((c) => c.label.endsWith('采购单价'))).toMatchObject({ from: '58.00', to: '60.00' });
    expect(ch.find((c) => c.label === '交货日期')).toMatchObject({ from: '2026-10-28', to: '2026-11-02' });
    expect(ch.find((c) => c.label === '采购总金额')).toBeTruthy();
  });
});

describe('采购单 Excel', () => {
  it('只列这个工厂的货，不写客户信息和销售价；金额是公式', async () => {
    const o = order();
    const s = seed();
    const u8 = await renderPoExcel(o, 'p6', s.partners);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(u8 as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const text: string[] = [];
    let formula = false;
    ws.eachRow((row) => row.eachCell((c) => {
      const v = c.value as unknown;
      if (v && typeof v === 'object' && 'formula' in (v as object)) formula = true;
      else text.push(String(v ?? ''));
    }));
    const all = text.join('\n');
    expect(all).toContain('义乌恒达五金配件厂');
    expect(all).toContain('CG-2026-003-2');
    expect(all).toContain('AC-01');
    expect(all).not.toContain('AL-H500');
    expect(all).not.toContain(o.buyer.name);
    expect(all).toContain('月结 30 天');
    expect(formula).toBe(true);
  });
});

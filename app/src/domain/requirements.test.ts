import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { REQS, applyReqs, autoReqCount, newReq, reqState } from './requirements';
import { applyCustomer, copyOrder } from './factory';
import { checkOrder } from '../modules/check';
import type { CustReq, Order, ReqKey } from './types';

const order = (i = 1): Order => seed().orders[i];
const req = (k: ReqKey, v = ''): CustReq => ({ id: 'x-' + k, k, v });

describe('客户要求清单', () => {
  it('每条规则都有说明；有参数的都有默认值或占位', () => {
    for (const [k, d] of Object.entries(REQS)) {
      expect(d.describe(newReq(k as ReqKey, 'id').v)).toBeTruthy();
      if (d.param?.kind === 'select') expect(d.param.options?.length).toBeGreaterThan(1);
    }
  });

  it('新建订单时套用：注明文字、唛头文字、提单类型、收货人、外包装', () => {
    const s = seed();
    const c = s.customers[2];
    c.reqs = [req('statement', 'NO WOOD PACKING MATERIAL IS USED'), req('marksText', 'FRAGILE'), req('blType', 'telex'), req('consignee', 'order'), req('pkgMode', 'pallet'), req('note', '寄样品')];
    const o = s.orders[2];
    const n = applyCustomer(o, c);
    expect(n).toBe(5);
    expect(autoReqCount(c.reqs)).toBe(5);
    expect(o.docset.statement).toBe('NO WOOD PACKING MATERIAL IS USED');
    expect(o.shipping.marks).toMatch(/FRAGILE$/);
    expect(o.shipping.blType).toBe('telex');
    expect(o.shipping.consigneeMode).toBe('order');
    expect(o.pkg?.mode).toBe('pallet');
    // 再套用一次不重复追加
    applyReqs(o, c.reqs);
    expect(o.docset.statement).toBe('NO WOOD PACKING MATERIAL IS USED');
    expect(o.shipping.marks.match(/FRAGILE/g)?.length).toBe(1);
  });

  it('唛头 PO 号：没填 PO 号、唛头里没有、一键改正', () => {
    const o = order();
    const r = req('marksPo');
    o.numbers.po = '';
    expect(reqState(o, r)).toMatchObject({ kind: 'bad', problem: { path: 'numbers.po' } });
    o.numbers.po = 'ABC-777';
    o.shipping.marks = 'ABC\nLOS ANGELES';
    expect(reqState(o, r)).toMatchObject({ kind: 'bad', problem: { path: 'shipping.marks' } });
    REQS.marksPo.apply!(o, '');
    expect(o.shipping.marks.split('\n')[0]).toBe('ABC-777');
    expect(reqState(o, r).kind).toBe('ok');
  });

  it('每箱毛重上限：单独装箱和混装箱都查', () => {
    const o = order();
    o.items[0].gw = 31;
    const st = reqState(o, req('maxGw', '30'));
    expect(st).toMatchObject({ kind: 'bad', problem: { path: 'items.0.gw', mod: 'pl' } });
    o.items[0].gw = 25;
    expect(reqState(o, req('maxGw', '30')).kind).toBe('ok');
    o.packs = [{ id: 'p1', ctns: 2, gw: 35, l: 50, w: 40, h: 30 }];
    o.items[1].mix = 'p1';
    expect(reqState(o, req('maxGw', '30'))).toMatchObject({ kind: 'bad', problem: { path: 'packs.0.gw' } });
  });

  it('HS、规格、税号、原产地、分批转运、托盘高度', () => {
    const o = order();
    o.items[1].hs = '';
    expect(reqState(o, req('hs'))).toMatchObject({ kind: 'bad', problem: { path: 'items.1.hs' } });
    o.buyer.tax = '';
    expect(reqState(o, req('tax')).kind).toBe('bad');
    o.shipping.origin = 'CHINA';
    expect(reqState(o, req('origin', 'MADE IN CHINA')).kind).toBe('bad');
    REQS.origin.apply!(o, 'MADE IN CHINA');
    expect(reqState(o, req('origin', 'made in china')).kind).toBe('ok');
    o.terms.partial = 'Allowed';
    expect(reqState(o, req('partial', 'Not Allowed')).kind).toBe('bad');
    o.pkg = { mode: 'pallet', unit: '', count: 2, tare: 10, sizes: [{ n: 2, l: 120, w: 100, h: 165 }] };
    expect(reqState(o, req('maxPalletH', '150'))).toMatchObject({ kind: 'bad', problem: { path: 'pkg.sizes.0.h' } });
  });

  it('自定义提醒：手动确认', () => {
    const o = order();
    const r = req('note', '正本提单 DHL 寄到芝加哥');
    expect(reqState(o, r)).toEqual({ kind: 'manual', done: false });
    o.reqDone = [r.id];
    expect(reqState(o, r)).toEqual({ kind: 'manual', done: true });
  });

  it('单据检查：确认之后不符合算错误（带一键改），之前只提醒；生产之后未确认的提醒', () => {
    const o = order();
    o.shipping.marks = 'ABC';
    const reqs = [req('marksPo'), req('note', '寄样品给客户')];
    o.status = '报价';
    let issues = checkOrder(o, reqs);
    const mk = issues.find((x) => x.text.includes('唛头有 PO 号'))!;
    expect(mk.level).toBe('warn');
    expect(issues.some((x) => x.text.includes('寄样品'))).toBe(false);
    o.status = '生产';
    issues = checkOrder(o, reqs);
    const mk2 = issues.find((x) => x.text.includes('唛头有 PO 号'))!;
    expect(mk2.level).toBe('error');
    expect(mk2.fix?.label).toBe('按要求改');
    expect(issues.find((x) => x.text.includes('寄样品'))).toMatchObject({ level: 'warn', toOrder: true });
    o.status = '完结';
    expect(checkOrder(o, reqs).some((x) => x.text.includes('客户要求'))).toBe(false);
  });

  it('示例客户 ABC 的订单：注明文字已套用，唛头缺 PO 号、毛重超限被查出', () => {
    const s = seed();
    const o = s.orders[1];
    const c = s.customers.find((x) => x.id === o.customerId)!;
    expect(o.docset.statement).toBe('NO WOOD PACKING MATERIAL IS USED');
    const texts = checkOrder(o, c.reqs).filter((x) => x.level === 'error').map((x) => x.text);
    expect(texts.some((t) => t.includes('唛头有 PO 号'))).toBe(true);
    expect(texts.some((t) => t.includes('每箱毛重不超过 30 kg'))).toBe(true);
  });

  it('返单清掉已确认的提醒', () => {
    const o = order();
    o.reqDone = ['r8'];
    expect(copyOrder(o, '2026-099').reqDone).toBeUndefined();
  });
});

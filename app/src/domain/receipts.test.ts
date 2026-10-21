import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { actualProfit, nextReceipt, planOf, receivedOf } from './receipts';
import { profitOf } from './purchase';
import { orderReminders } from './reminders';
import { checkOrder } from '../modules/check';
import type { Receipt } from './types';

const order = () => seed().orders[0];
const rec = (p: Partial<Receipt>): Receipt => ({ id: Math.random().toString(36), date: '2026-10-01', kind: '定金', amount: '', fee: '', rate: '', note: '', ...p });

describe('应收', () => {
  it('T/T 30% 定金：拆成定金和尾款；信用证没有定金', () => {
    const o = order();
    expect(planOf(o)).toMatchObject({ total: 3670, pct: 30, deposit: 1101, balance: 2569 });
    o.terms.payment = 'L/C 信用证';
    expect(planOf(o)).toMatchObject({ deposit: 0, balance: 3670 });
  });

  it('登记收款：先带出定金，收齐定金后带出尾款，收齐后没有要收的', () => {
    const o = order();
    expect(nextReceipt(o)).toEqual({ kind: '定金', amount: 1101 });
    o.receipts = [rec({ amount: 1000 })];
    expect(nextReceipt(o)).toEqual({ kind: '定金', amount: 101 });
    o.receipts.push(rec({ amount: 101 }));
    expect(nextReceipt(o)).toEqual({ kind: '尾款', amount: 2569 });
    o.receipts.push(rec({ kind: '尾款', amount: 2569 }));
    expect(nextReceipt(o).amount).toBe(0);
  });
});

describe('已收', () => {
  it('银行扣费从到账里扣；结汇的折人民币，没结汇的单独算', () => {
    const o = order();
    o.receipts = [rec({ amount: 1101, fee: 25, rate: 7 }), rec({ kind: '尾款', amount: 2000, fee: 20 })];
    const r = receivedOf(o);
    expect(r).toMatchObject({ gross: 3101, fees: 45, net: 3056, deposit: 1101, outstanding: 569 });
    expect(r.cny).toBeCloseTo(1076 * 7, 6);
    expect(r.unsettled).toBe(1980);
  });
});

describe('实际利润', () => {
  it('全部收齐结汇：按实际人民币算，银行手续费按实际扣费、不再算费用清单里的那一项', () => {
    const o = order();
    o.receipts = [rec({ kind: '全款', amount: 3670, fee: 30, rate: 7.2 })];
    const p = profitOf(o), a = actualProfit(o);
    const fees = 1200 + 650 + 400; // 不含费用清单里的银行手续费 150
    expect(a.estimated).toBe(false);
    expect(a.profit).toBeCloseTo((3670 - 30) * 7.2 + p.rebate - p.cost - fees, 6);
    expect(a.fx).toBeCloseTo((3670 - 30) * (7.2 - 7.12), 6);
  });

  it('没收齐：未收部分按汇率估', () => {
    const o = order();
    o.receipts = [rec({ amount: 1101, rate: 7.12 })];
    expect(actualProfit(o).estimated).toBe(true);
    expect(actualProfit(o).income).toBeCloseTo(3670 * 7.12, 6);
  });
});

describe('提醒与检查', () => {
  it('收齐了不再提醒尾款；没收齐的逾期提醒写还差多少', () => {
    const o = seed().orders[1];
    o.terms.payment = 'T/T 电汇';
    o.terms.payDeposit = 30;
    o.terms.payBalanceAt = 'against copy of B/L';
    const total = planOf(o).total;
    o.receipts = [rec({ amount: 1000 })];
    const r = orderReminders(o, '2026-10-20').find((x) => x.key.startsWith('bal:'));
    expect(r?.text).toContain(`还差 USD ${(total - 1000).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    expect(r?.go?.mod).toBe('payment');
    o.receipts.push(rec({ kind: '尾款', amount: total - 1000 }));
    expect(orderReminders(o, '2026-10-20').some((x) => x.key.startsWith('bal:'))).toBe(false);
  });

  it('生产了还没收定金、标了收款还没收齐、收多了', () => {
    const o = order();
    o.status = '生产';
    expect(checkOrder(o).some((x) => x.mod === 'payment' && x.text.includes('定金还没登记收齐'))).toBe(true);
    o.status = '收款';
    o.receipts = [rec({ amount: 1101 })];
    expect(checkOrder(o).some((x) => x.text.includes('收款记录里还差 USD 2,569.00'))).toBe(true);
    o.receipts.push(rec({ kind: '尾款', amount: 3000 }));
    expect(checkOrder(o).some((x) => x.text.includes('比合同金额多'))).toBe(true);
  });
});

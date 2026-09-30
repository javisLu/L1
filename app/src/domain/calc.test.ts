import { describe, expect, it } from 'vitest';
import { amountWords, calc, intWords, payText } from './calc';
import { applyCustomer, autoPlace, blankOrder, copyOrder, productToItem } from './factory';
import { seed } from './seed';
import { missing } from '../modules/defs';
import { quote } from '../pages/QuoteCalc';

const base = { payment: 'T/T 电汇', payDeposit: 30, payBalanceAt: 'before shipment', payDays: '', payCustom: '' };

describe('calc', () => {
  it('计算金额、箱数、连续箱号与体积', () => {
    const { products } = seed();
    const k = calc([productToItem(products[0], 100), productToItem(products[1], 20), productToItem(products[2], 200)]);
    expect(k.amount).toBeCloseTo(3670);
    expect(k.rows.map((r) => [r.n, r.from, r.to])).toEqual([[50, 1, 50], [20, 51, 70], [4, 71, 74]]);
    expect(k.ctns).toBe(74);
    expect(k.gw).toBeCloseTo(50 * 16 + 20 * 31 + 4 * 10);
    expect(k.cbm).toBeCloseTo(50 * 1.22 * 0.47 * 0.2 + 20 * 1.55 * 0.62 * 0.28 + 4 * 0.4 * 0.3 * 0.25, 5);
  });
  it('尾箱向上取整；输入中的数字字符串可计算', () => {
    const { products } = seed();
    const it0 = { ...productToItem(products[0]), qty: '101', price: '12.' };
    expect(calc([it0]).rows[0].n).toBe(51);
    expect(calc([it0]).amount).toBeCloseTo(1212);
  });
});

describe('amountWords', () => {
  it('英文大写', () => {
    expect(intWords(3670)).toBe('THREE THOUSAND SIX HUNDRED AND SEVENTY');
    expect(amountWords(1250.5, 'USD')).toBe('SAY US DOLLARS ONE THOUSAND TWO HUNDRED AND FIFTY AND CENTS FIFTY ONLY');
    expect(amountWords(21, 'EUR')).toBe('SAY EUROS TWENTY-ONE ONLY');
    expect(intWords(1_000_000)).toBe('ONE MILLION');
  });
});

describe('payText', () => {
  it('T/T 定金 + 尾款节点', () => {
    expect(payText(base)).toBe('30% T/T deposit in advance, 70% T/T balance before shipment');
    expect(payText({ ...base, payDeposit: 50, payBalanceAt: 'within N days after B/L date', payDays: 45 })).toBe('50% T/T deposit in advance, 50% T/T balance within 45 days after B/L date');
    expect(payText({ ...base, payDeposit: 100 })).toBe('100% T/T in advance');
  });
  it('信用证、赊销、自定义', () => {
    expect(payText({ ...base, payment: 'L/C 信用证', payDays: 0 })).toBe('100% irrevocable L/C at sight');
    expect(payText({ ...base, payment: 'L/C 信用证', payDays: 60 })).toBe('100% irrevocable L/C at 60 days after B/L date');
    expect(payText({ ...base, payment: 'O/A 赊销', payDays: '' })).toBe('O/A, 100% within 30 days after B/L date');
    expect(payText({ ...base, payment: '自定义', payCustom: 'Escrow' })).toBe('Escrow');
  });
});

describe('订单', () => {
  it('带入客户：交易习惯、付款条款、唛头', () => {
    const s = seed();
    const o = blankOrder(s.seller, '2026-009', 't');
    o.items = [productToItem(s.products[0], 10)];
    applyCustomer(o, s.customers[2]);
    expect(o.terms.incoterm).toBe('DAP');
    expect(o.terms.currency).toBe('EUR');
    expect(o.terms.deliveryAddress).toContain('Aarhus');
    expect(o.terms.paymentText).toBe('O/A, 100% within 30 days after B/L date');
    expect(o.shipping.marks).toContain('C/NO. 1-5');
  });
  it('切换术语时自动切换指定地点，手填的不覆盖', () => {
    const s = seed();
    const o = blankOrder(s.seller, '2026-009', 't');
    o.terms.pod = 'Singapore';
    o.terms.incoterm = 'DDP';
    autoPlace(o);
    expect(o.terms.place).toBe('Singapore');
    o.terms.incoterm = 'FOB';
    autoPlace(o);
    expect(o.terms.place).toBe('Qingdao');
    o.terms.place = 'Huangdao';
    o.terms.incoterm = 'CIF';
    autoPlace(o);
    expect(o.terms.place).toBe('Huangdao');
  });
  it('DDP 必须填交货地址', () => {
    const s = seed();
    const o = s.orders[0];
    expect(missing(o, 'terms')).toEqual([]);
    o.terms.incoterm = 'DDP';
    expect(missing(o, 'terms')).toContain('国外交货地址（仓库 / 门店 / 收货地址）');
  });
  it('返单清空船名提单号并派生新编号', () => {
    const s = seed();
    const c = copyOrder(s.orders[1], '2026-010');
    expect(c.numbers.pi).toBe('PI-2026-010');
    expect(c.shipping.blNo).toBe('');
    expect(c.items.length).toBe(s.orders[1].items.length);
    expect(c.items[0].id).not.toBe(s.orders[1].items[0].id);
  });
});

describe('报价计算器', () => {
  it('FOB 按目标利润率反推', () => {
    const r = quote({ buy: 45, pack: 3, qty: 1000, inland: 800, port: 650, freight: 1200, ins: 0.3, vat: 13, rebate: 13, rate: 7.1, margin: 15, quoteFob: 0 });
    const rebate = (45 / 1.13) * 0.13;
    expect(r.fobCost).toBeCloseTo(45 + 3 - rebate + 1.45);
    expect(r.fob).toBeCloseTo(r.fobCost / 0.85 / 7.1);
    expect(r.cfr).toBeCloseTo(r.fob + 1.2);
  });
});

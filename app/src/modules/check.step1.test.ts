import { describe, expect, it } from 'vitest';
import { checkOrder } from './check';
import { seed } from '../domain/seed';
import { calcOrder, qtyTotal, qtyWithUnit, unitTotals } from '../domain/calc';
import { missingSellerCosts } from '../domain/purchase';
import { lcNoOf } from '../domain/lc';
import { blankOrder } from '../domain/factory';
import { defaultSettings } from '../domain/settings';

const texts = (o: Parameters<typeof checkOrder>[0]) => checkOrder(o).map((x) => x.text).join('\n');
const MT700 = ':20: LC26ABC0091\n:46A: +SIGNED COMMERCIAL INVOICE IN 3 ORIGINALS\n+FULL SET OF CLEAN ON BOARD OCEAN BILLS OF LADING MADE OUT TO ORDER, BLANK ENDORSED, NOTIFY APPLICANT';

describe('信用证 / 托收：提单收货人与提单类型', () => {
  it('信用证单收货人写了买方要提醒，一键改成 TO ORDER', () => {
    const o = seed().orders[1];
    o.shipping.consigneeMode = 'buyer';
    const iss = checkOrder(o).find((x) => x.text.includes('提单收货人直接写了买方'));
    expect(iss?.text).toContain('信用证付款');
    iss!.fix!.apply(o);
    expect(o.shipping.consigneeMode).toBe('order');
    expect(texts(o)).not.toContain('提单收货人直接写了买方');
  });
  it('D/P 托收同样提醒；T/T、O/A 不提醒', () => {
    const o = seed().orders[0];
    o.terms.payment = 'D/P 付款交单';
    expect(texts(o)).toContain('托收（D/P、D/A）付款，提单收货人直接写了买方');
    o.terms.payment = 'T/T 电汇';
    expect(texts(o)).not.toContain('提单收货人直接写了买方');
  });
  it('信用证 46A 明确写了 CONSIGNED TO 买方，按信用证办不提醒', () => {
    const o = seed().orders[1];
    o.shipping.consigneeMode = 'buyer';
    o.lc = { text: ':20: LC1\n:46A: +FULL SET OF BILLS OF LADING CONSIGNED TO ABC TRADING LLC' };
    expect(texts(o)).not.toContain('提单收货人直接写了买方');
  });
  it('信用证单选了海运单要提醒改正本', () => {
    const o = seed().orders[1];
    o.shipping.blType = 'seaway';
    expect(texts(o)).toContain('信用证付款要交正本提单给银行，现在选的是海运单');
  });
});

describe('信用证号印在发票、箱单上', () => {
  it('贴过信用证电文才有信用证号', () => {
    const o = seed().orders[1];
    expect(lcNoOf(o)).toBe('');
    o.lc = { text: MT700 };
    expect(lcNoOf(o)).toBe('LC26ABC0091');
  });
});

describe('合计数量：单位不同不相加', () => {
  it('单位都一样只写数字，和原来一样', () => {
    expect(qtyTotal([{ q: 100, unit: 'PCS' }, { q: 20, unit: 'pcs' }])).toBe('120');
    expect(qtyWithUnit([{ q: 100, unit: 'PCS' }])).toBe('100 PCS');
  });
  it('单位不同按单位分行', () => {
    const k = calcOrder(seed().orders[1]);
    expect(unitTotals(k.rows)).toHaveLength(2);
    expect(qtyTotal(k.rows)).toBe('60 SETS\n300 PCS');
    expect(qtyWithUnit(k.rows)).toBe('60 SETS\n300 PCS');
  });
  it('没填数量的行不算', () => {
    expect(qtyTotal([{ q: 5, unit: 'PCS' }, { q: 0, unit: 'SETS' }])).toBe('5');
  });
});

describe('默认条款', () => {
  it('新订单的条款里不再有「价格可随时变动」，有有效期和银行费用', () => {
    const o = blankOrder(seed().seller, '2026-009', 't', '2026-10-29', defaultSettings());
    expect(o.docset.clauses).not.toMatch(/subject to change/i);
    expect(o.docset.clauses).toMatch(/valid for 30 days/);
    expect(o.docset.clauses).toMatch(/Bank charges/);
  });
  it('老订单条款里还有这句的，提醒删掉（不自动改用户的条款）', () => {
    const o = seed().orders[0];
    o.docset.clauses = 'All prices are subject to change without prior notice.';
    expect(texts(o)).toContain('价格可随时变动');
    expect(o.docset.clauses).toBe('All prices are subject to change without prior notice.');
  });
});

describe('卖方付运费 / 保费：利润提醒', () => {
  it('CIF 没填海运费、保险费要列出来；FOB 不提醒', () => {
    const o = seed().orders[0]; // FOB，示例填了采购价
    expect(missingSellerCosts(o)).toEqual([]);
    o.terms.incoterm = 'CIF';
    expect(missingSellerCosts(o)).toEqual(['海运费', '保险费']);
    expect(texts(o)).toContain('CIF 成交由我方付海运费、保险费');
    o.purchase!.fees.find((f) => f.name === '海运费')!.amount = 3000;
    o.purchase!.fees.find((f) => f.name === '保险费')!.amount = 200;
    expect(missingSellerCosts(o)).toEqual([]);
    o.terms.incoterm = 'DAP';
    o.purchase!.fees.find((f) => f.name === '海运费')!.amount = '';
    expect(missingSellerCosts(o)).toEqual(['海运费']);
  });
  it('没开始算利润（一个采购价都没填）的单子不打扰', () => {
    const o = seed().orders[1]; // CIF，没填采购价
    expect(texts(o)).not.toContain('由我方付');
  });
});

describe('采购单开票信息', () => {
  it('采购单写了含专票，我方开票信息没填要提醒', () => {
    const o = seed().orders[0];
    expect(texts(o)).not.toContain('开票信息');
    o.seller.invoiceInfo = '';
    expect(texts(o)).toContain('采购单上还没有我方开票信息');
  });
});

import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { balanceDue, daysUntil, orderReminders, reminders } from './reminders';
import { docSig, docState } from './exports';
import { copyOrder } from './factory';
import type { Order } from './types';

const T = '2026-10-10';
const fresh = (i: number): Order => {
  const o = seed().orders[i];
  o.dismissed = [];
  return o;
};
const texts = (o: Order) => orderReminders(o, T).map((r) => r.text);

describe('首页「今天要做」', () => {
  it('daysUntil 按自然日算', () => {
    expect(daysUntil('2026-10-13', T)).toBe(3);
    expect(daysUntil('2026-10-08', T)).toBe(-2);
    expect(daysUntil('2026-11-01', '2026-10-31')).toBe(1);
  });

  it('报价快到期、已过期', () => {
    const o = fresh(0);
    o.status = '报价';
    o.numbers.validUntil = '2026-10-12';
    expect(texts(o)).toContain('报价有效期 2 天后到期（10-12），跟进客户');
    o.numbers.validUntil = '2026-10-05';
    expect(texts(o)[0]).toBe('报价已过期 5 天，跟进客户或更新报价');
    o.numbers.validUntil = '2026-10-30';
    expect(texts(o).some((t) => t.includes('报价'))).toBe(false);
  });

  it('货好了还没订舱；订舱委托书导出过就不再提醒', () => {
    const o = fresh(0);
    o.status = '生产';
    o.terms.transport = '海运';
    o.shipping.vessel = '';
    o.shipping.cargoReady = '2026-10-15';
    const r = orderReminders(o, T).find((x) => x.key.startsWith('cargo:'))!;
    expect(r.text).toBe('货好时间 10-15（5 天后），还没订舱');
    expect(r.go?.mod).toBe('booking');
    o.exports = { booking: { at: '2026-10-09 10:00', sig: docSig(o, 'booking') } };
    expect(orderReminders(o, T).some((x) => x.key.startsWith('cargo:'))).toBe(false);
  });

  it('截关、已过开船日（带「改为出货」）、开船后没发装船通知', () => {
    const o = fresh(0);
    o.status = '生产';
    o.shipping.cutoff = '2026-10-11';
    o.shipping.etd = '2026-10-08';
    const rs = orderReminders(o, T);
    expect(rs.find((x) => x.key.startsWith('cutoff:'))!.text).toBe('明天截关（10-11）：报关资料还没发报关行');
    const etd = rs.find((x) => x.key.startsWith('etd:'))!;
    expect(etd.act).toEqual({ label: '改为出货', status: '出货' });
    o.status = '出货';
    o.terms.transport = '海运';
    expect(texts(o)).toContain('10-08 已开船，还没给客户发装船通知');
  });

  it('尾款：提单日后 N 天推算，逾期提醒', () => {
    const o = fresh(1);
    o.terms.payment = 'T/T 电汇';
    o.terms.payDeposit = 30;
    o.terms.payBalanceAt = 'within N days after B/L date';
    o.terms.payDays = 7;
    o.shipping.etd = '2026-09-28';
    expect(balanceDue(o)).toEqual({ date: '2026-10-05', auto: true });
    o.status = '出货';
    expect(texts(o)).toContain('尾款逾期 5 天（应于 10-05 前收到）');
    o.dates = { balanceDue: '2026-10-12' };
    expect(texts(o)).toContain('尾款 2 天后到期（10-12）');
    o.status = '收款';
    expect(texts(o).some((t) => t.includes('尾款'))).toBe(false);
  });

  it('信用证最迟装运期、有效期', () => {
    const o = fresh(1);
    o.terms.payment = 'L/C 信用证';
    o.status = '生产';
    o.dates = { lcLatest: '2026-10-12', lcExpiry: '2026-10-30' };
    const rs = orderReminders(o, T);
    expect(rs.find((x) => x.key.startsWith('lcl:'))).toMatchObject({ level: 'red', text: '信用证最迟装运期 2 天后（10-12）' });
    expect(rs.some((x) => x.key.startsWith('lce:'))).toBe(false);
  });

  it('「知道了」按键隐藏；日期改了重新提醒；完结订单不提醒；按紧急程度排序', () => {
    const o = fresh(0);
    o.status = '报价';
    o.numbers.validUntil = '2026-10-12';
    o.dismissed = ['quote:2026-10-12'];
    expect(texts(o).length).toBe(0);
    o.numbers.validUntil = '2026-10-11';
    expect(texts(o).length).toBe(1);
    const p = fresh(1);
    p.status = '生产';
    p.shipping.cutoff = '2026-10-11';
    const all = reminders([o, p], T);
    expect(all[0].level).toBe('red');
    p.status = '完结';
    expect(orderReminders(p, T)).toEqual([]);
  });
});

describe('导出记录', () => {
  it('导出后改了相关数据才算「改过」；改无关数据不算', () => {
    const o = fresh(1);
    expect(docState(o, 'pl').kind).toBe('none');
    o.exports = { pl: { at: '2026-10-09 10:00', sig: docSig(o, 'pl'), to: '货代' }, pi: { at: '2026-10-09 10:00', sig: docSig(o, 'pi') } };
    expect(docState(o, 'pl')).toEqual({ kind: 'sent', at: '2026-10-09 10:00', to: '货代' });
    o.items[0].price = 99; // 单价不影响箱单
    o.customs.license = 'X1';
    expect(docState(o, 'pl').kind).toBe('sent');
    expect(docState(o, 'pi').kind).toBe('changed');
    o.items[0].gw = 99;
    expect(docState(o, 'pl').kind).toBe('changed');
  });

  it('复制返单时清掉导出记录、提醒和日期', () => {
    const o = fresh(1);
    o.exports = { pl: { at: 'x', sig: 'y' } };
    o.dismissed = ['a'];
    o.shipping.cutoff = '2026-10-01';
    const c = copyOrder(o, '2026-099');
    expect(c.exports).toBeUndefined();
    expect(c.dismissed).toBeUndefined();
    expect(c.shipping.cutoff).toBe('');
  });
});

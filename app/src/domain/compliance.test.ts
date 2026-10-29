import { describe, expect, it } from 'vitest';
import { hasOriginMark, originMarkMissing } from './compliance';
import { checkOrder } from '../modules/check';
import { seed } from './seed';

describe('目的国原产地标记', () => {
  it('认得各种写法', () => {
    for (const t of ['MADE IN CHINA', 'Made in P.R. China', 'PRODUCT OF CHINA', 'ORIGIN: CHINA', 'COUNTRY OF ORIGIN: P.R.CHINA']) expect(hasOriginMark(t)).toBe(true);
    expect(hasOriginMark('ABC\nLOS ANGELES\nC/NO. 1-210')).toBe(false);
  });
  it('美国单唛头没写原产国要提醒（带依据），一键加上；侧唛写了也算', () => {
    const o = seed().orders[1]; // 发美国
    expect(originMarkMissing(o)).toBeNull();
    o.shipping.marks = 'ABC\nLOS ANGELES\nC/NO. 1-210';
    const iss = checkOrder(o).find((x) => x.text.includes('标明原产国'));
    expect(iss?.basis).toContain('19 CFR Part 134');
    iss!.fix!.apply(o);
    expect(o.shipping.marks).toBe('ABC\nLOS ANGELES\nC/NO. 1-210\nMADE IN CHINA');
    o.shipping.marks = 'ABC';
    o.shipping.side = 'MADE IN CHINA';
    expect(originMarkMissing(o)).toBeNull();
  });
  it('不是美国的单子不提醒', () => {
    const o = seed().orders[2]; // 丹麦，唛头没有 MADE IN CHINA
    expect(originMarkMissing(o)).toBeNull();
  });
});

import { isfData, isfNeeded } from './compliance';
import { docApplies } from '../modules/defs';

describe('美国 ISF 资料', () => {
  it('只有海运到美国的单子要', () => {
    const s = seed();
    expect(s.orders.map((o) => isfNeeded(o))).toEqual([false, true, false]);
    expect(docApplies(s.orders[1], 'isf')).toBe(true);
    expect(docApplies(s.orders[0], 'isf')).toBe(false);
    expect(docApplies(s.orders[0], 'advice')).toBe(true);
    const air = s.orders[1];
    air.terms.transport = '空运';
    expect(isfNeeded(air)).toBe(false);
  });
  it('卖方、厂家（英文）、6 位 HS、原产国、装柜地点（整柜一家工厂按工厂）、装柜方（按货代）', () => {
    const s = seed();
    const d = isfData(s.orders[1], s.partners);
    expect(d.seller.split('\n')[0]).toBe('Qingdao Hengyuan Industrial Co., Ltd.');
    expect(d.rows.map((r) => r.hts6)).toEqual(['9403.20', '9403.20']);
    expect(d.rows[0].maker).toContain('Linyi Jinsheng Aluminium Co., Ltd.');
    expect(d.rows[0].origin).toBe('CHINA');
    expect(d.stuffing).toContain('Linyi Jinsheng');
    expect(d.consolidator).toContain('Jietong Logistics');
    expect(d.missingMakers).toEqual([]);
  });
  it('工厂没填英文要提醒（生产以后）；手填的装柜地点优先；拼箱不按工厂猜', () => {
    const s = seed();
    const o = s.orders[1];
    const ps = s.partners.map((p) => (p.id === 'p4' ? { ...p, nameEn: '', addressEn: '' } : p));
    expect(isfData(o, ps).missingMakers).toEqual(['临沂金盛铝业有限公司']);
    const iss = checkOrder(o, [], ps).find((x) => x.text.includes('美国 ISF'));
    expect(iss?.basis).toContain('19 CFR Part 149');
    o.status = '报价';
    expect(checkOrder(o, [], ps).some((x) => x.text.includes('美国 ISF'))).toBe(false);
    o.shipping.equipment = 'LCL 拼箱';
    expect(isfData(o, s.partners).stuffing).toBe('');
    o.shipping.stuffing = 'CFS Warehouse, Huangdao, Qingdao';
    expect(isfData(o, s.partners).stuffing).toBe('CFS Warehouse, Huangdao, Qingdao');
  });
});

import { orderReminders } from './reminders';
describe('ISF 提醒', () => {
  it('美国单开船前一周、还没发 ISF 资料时提醒；发过就不提醒', () => {
    const o = seed().orders[1];
    o.status = '生产';
    o.shipping.etd = '2026-11-02'; // 还有 3 天
    const r = orderReminders(o, '2026-10-30').find((x) => x.text.includes('ISF'));
    expect(r?.level).toBe('red');
    o.exports = { ...(o.exports ?? {}), isf: { at: '2026-10-30 10:00', sig: 'x' } };
    expect(orderReminders(o, '2026-10-30').some((x) => x.text.includes('ISF'))).toBe(false);
    expect(orderReminders(seed().orders[0], '2026-10-30').some((x) => x.text.includes('ISF'))).toBe(false);
  });
});

import { parseMT700, reviewLc, sampleMT700 } from './lc';
describe('提醒带依据', () => {
  it('单据检查：HS 位数、报关运费带报关单填制规范；没有条文的惯例不硬标', () => {
    const o = seed().orders[0];
    o.items[0].hs = '940320';
    const iss = checkOrder(o);
    expect(iss.find((x) => x.text.includes('HS 编码'))?.basis).toContain('2019 年第 18 号');
    o.docset.clauses = 'All prices are subject to change without prior notice.';
    expect(checkOrder(o).find((x) => x.text.includes('价格可随时变动'))?.basis).toBeUndefined();
  });
  it('审证：问题项带 UCP600 条款，一致的项不带', () => {
    const o = seed().orders[1];
    o.shipping.consigneeMode = 'buyer';
    const r = reviewLc(o, parseMT700(sampleMT700(o, '2026-10-21')), '2026-10-21');
    expect(r.find((x) => x.area === '提单收货人')?.basis).toContain('UCP600 第 20 条');
    expect(r.filter((x) => x.level === 'ok').every((x) => !x.basis)).toBe(true);
  });
});

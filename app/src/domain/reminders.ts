import { STATUSES } from './constants';
import { toNum, today as localToday } from './calc';
import type { Order, OrderStatus } from './types';
import type { DocKey, ModKey, StepKey } from '../modules/defs';

/**
 * 首页「今天要做」：根据每单的关键日期和进度算出要跟进的事。
 * 规则只看订单里已有的数据（报价有效期、货好、截关、ETD、ETA、尾款到期、信用证日期、导出记录），不联网。
 */
export type Level = 'red' | 'amber' | 'blue';
export interface Reminder {
  /** 「知道了」用的键：带上日期，日期改了会重新提醒 */
  key: string;
  orderId: string;
  level: Level;
  text: string;
  /** 距今天数（负数 = 已过） */
  days: number;
  go?: { mod: ModKey; step?: StepKey; doc?: DocKey };
  act?: { label: string; status: OrderStatus };
}

export const localDay = localToday;

const DAY = 86400000;
const dayNo = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : NaN;
};
export const daysUntil = (date: string, today: string) => dayNo(date) - dayNo(today);
const addDays = (date: string, n: number) => {
  const t = dayNo(date);
  return Number.isNaN(t) ? '' : new Date((t + n) * DAY).toISOString().slice(0, 10);
};
const md = (s: string) => s.slice(5);

/** 「3 天后」「今天」「已过 2 天」 */
export const rel = (d: number) => (d === 0 ? '今天' : d === 1 ? '明天' : d > 0 ? `${d} 天后` : `已过 ${-d} 天`);

const before = (o: Order, s: OrderStatus) => STATUSES.indexOf(o.status) < STATUSES.indexOf(s);
const isLC = (o: Order) => /L\/C/.test(o.terms.payment);

/**
 * 尾款到期日：填了就用填的；没填时按付款方式推算（提单日后 N 天、到港付款、赊销 N 天…）。
 * 返回空 = 没有尾款或推算不出。
 */
export function balanceDue(o: Order): { date: string; auto: boolean } {
  if (o.dates?.balanceDue) return { date: o.dates.balanceDue, auto: false };
  const t = o.terms;
  const etd = o.shipping.etd, eta = o.shipping.eta ?? '';
  const days = toNum(t.payDays);
  let d = '';
  if (t.payment === 'T/T 电汇') {
    if (toNum(t.payDeposit) >= 100) return { date: '', auto: true };
    d = {
      'before shipment': o.shipping.cutoff || etd,
      'against copy of B/L': etd,
      'within N days after B/L date': etd && addDays(etd, days),
      'upon arrival at destination port': eta,
      'upon receipt of goods': eta,
    }[t.payBalanceAt] ?? '';
  } else if (t.payment === 'O/A 赊销' || t.payment === 'D/A 承兑交单') d = etd && addDays(etd, days);
  else if (t.payment === 'D/P 付款交单' || t.payment === 'CAD 交单付现') d = eta;
  return { date: d, auto: true };
}

export function orderReminders(o: Order, today: string): Reminder[] {
  if (o.status === '完结') return [];
  const out: Reminder[] = [];
  const add = (r: Omit<Reminder, 'orderId'>) => !o.dismissed?.includes(r.key) && out.push({ ...r, orderId: o.id });
  const s = o.shipping;
  const sent = (d: DocKey) => !!o.exports?.[d];

  // 1. 报价快到期 / 已过期
  if ((o.status === '询价' || o.status === '报价') && o.numbers.validUntil) {
    const d = daysUntil(o.numbers.validUntil, today);
    if (d <= 3 && d >= -14)
      add({ key: 'quote:' + o.numbers.validUntil, level: 'amber', days: d, go: { mod: 'quote', step: 'docset' },
        text: d < 0 ? `报价已过期 ${-d} 天，跟进客户或更新报价` : `报价有效期 ${rel(d)}到期（${md(o.numbers.validUntil)}），跟进客户` });
  }

  // 2. 货快好了还没订舱
  if ((o.status === '确认' || o.status === '生产') && s.cargoReady && o.terms.transport !== '快递' && !s.vessel && !sent('booking')) {
    const d = daysUntil(s.cargoReady, today);
    if (d <= 7)
      add({ key: 'cargo:' + s.cargoReady, level: d < 0 ? 'red' : 'amber', days: d, go: { mod: 'booking', step: 'shipping', doc: 'booking' },
        text: d < 0 ? `货好时间已过 ${-d} 天（${md(s.cargoReady)}），还没订舱` : `货好时间 ${md(s.cargoReady)}（${rel(d)}），还没订舱` });
  }

  // 3. 截关
  if (s.cutoff && before(o, '出货')) {
    const d = daysUntil(s.cutoff, today);
    if (d >= 0 && d <= 3)
      add({ key: 'cutoff:' + s.cutoff, level: 'red', days: d, go: { mod: 'customs' },
        text: `${rel(d)}截关（${md(s.cutoff)}）${sent('customs') ? '，确认报关进度' : '：报关资料还没发报关行'}` });
  }

  // 4. 信用证最迟装运期 / 有效期
  if (isLC(o)) {
    const latest = o.dates?.lcLatest, expiry = o.dates?.lcExpiry;
    if (latest && before(o, '出货')) {
      const d = daysUntil(latest, today);
      if (d <= 10) add({ key: 'lcl:' + latest, level: d <= 3 ? 'red' : 'amber', days: d, text: d < 0 ? `已过信用证最迟装运期 ${-d} 天，需要改证` : `信用证最迟装运期 ${rel(d)}（${md(latest)}）` });
    }
    if (expiry && before(o, '收款')) {
      const d = daysUntil(expiry, today);
      if (d <= 10) add({ key: 'lce:' + expiry, level: d <= 5 ? 'red' : 'amber', days: d, text: d < 0 ? `信用证已过期 ${-d} 天` : `信用证 ${rel(d)}到期（${md(expiry)}），抓紧交单` });
    }
  }

  // 5. 已过开船日，状态还没改
  if (s.etd && (o.status === '确认' || o.status === '生产')) {
    const d = daysUntil(s.etd, today);
    if (d < 0) add({ key: 'etd:' + s.etd, level: 'amber', days: d, act: { label: '改为出货', status: '出货' }, text: `已过开船日 ${md(s.etd)}，订单状态还是「${o.status}」` });
  }

  // 6. 开船了，还没发装船通知
  if (s.etd && (o.status === '出货' || o.status === '收款') && o.terms.transport !== '快递' && !sent('advice')) {
    const d = daysUntil(s.etd, today);
    if (d <= 0 && d >= -30) add({ key: 'advice:' + s.etd, level: 'blue', days: d, go: { mod: 'booking', doc: 'advice' }, text: `${md(s.etd)} 已开船，还没给客户发装船通知` });
  }

  // 7. 尾款
  if (o.status !== '收款') {
    const { date } = balanceDue(o);
    if (date) {
      const d = daysUntil(date, today);
      const shipped = !before(o, '出货');
      if (shipped && d < 0) add({ key: 'bal:' + date, level: 'red', days: d, text: `尾款逾期 ${-d} 天（应于 ${md(date)} 前收到）` });
      else if (d >= 0 && d <= 5 && (shipped || o.terms.payBalanceAt === 'before shipment'))
        add({ key: 'bal:' + date, level: 'amber', days: d, text: `尾款 ${rel(d)}到期（${md(date)}）${shipped ? '' : '，出货前要收到'}` });
    }
  }

  // 8. 快到港
  if (s.eta && o.status === '出货') {
    const d = daysUntil(s.eta, today);
    if (d >= 0 && d <= 5)
      add({ key: 'eta:' + s.eta, level: 'blue', days: d, text: `${rel(d)}到港（${md(s.eta)}）${(s.blType ?? 'original') === 'original' ? '：确认尾款，安排寄正本提单或电放' : '，提醒客户安排清关提货'}` });
  }
  return out;
}

const RANK: Record<Level, number> = { red: 0, amber: 1, blue: 2 };

export function reminders(orders: Order[], today: string): Reminder[] {
  return orders.flatMap((o) => orderReminders(o, today)).sort((a, b) => RANK[a.level] - RANK[b.level] || a.days - b.days);
}

import { ADDRESS_REQUIRED_TERMS, CUR_NAME, SYM } from './constants';
import type { Item, Num, Order, PaymentHabit } from './types';

export const toNum = (v: Num | undefined | null): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export const money = (n: number) =>
  (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fixed = (n: number, d: number) =>
  (n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const int = (n: number) => (n || 0).toLocaleString('en-US');
export const sym = (cur: string) => SYM[cur] ?? cur + ' ';

export interface Row extends Item {
  q: number;
  p: number;
  a: number;
  /** 箱数 */
  n: number;
  from: number;
  to: number;
  nwT: number;
  gwT: number;
  cbmT: number;
}

export interface Totals {
  rows: Row[];
  qty: number;
  amount: number;
  ctns: number;
  nw: number;
  gw: number;
  cbm: number;
}

/** 金额、箱数、箱号段、净毛重、体积：箱数按每箱装量向上取整，箱号按行顺序连续编号 */
export function calc(items: Item[]): Totals {
  let qty = 0, amount = 0, ctns = 0, nw = 0, gw = 0, cbm = 0, cursor = 0;
  const rows = items.map((it) => {
    const q = toNum(it.qty), p = toNum(it.price), per = toNum(it.pcsPerCtn);
    const n = per > 0 ? Math.ceil(q / per) : 0;
    const from = n ? cursor + 1 : 0, to = n ? cursor + n : 0;
    cursor += n;
    const vol = (toNum(it.l) * toNum(it.w) * toNum(it.h)) / 1e6;
    const r: Row = { ...it, q, p, a: q * p, n, from, to, nwT: n * toNum(it.nw), gwT: n * toNum(it.gw), cbmT: n * vol };
    qty += q; amount += r.a; ctns += n; nw += r.nwT; gw += r.gwT; cbm += r.cbmT;
    return r;
  });
  return { rows, qty, amount, ctns, nw, gw, cbm };
}

const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

function chunk(n: number): string {
  let s = '';
  if (n >= 100) {
    s += ONES[Math.floor(n / 100)] + ' HUNDRED';
    n %= 100;
    if (n) s += ' AND ';
  }
  if (n >= 20) {
    s += TENS[Math.floor(n / 10)];
    if (n % 10) s += '-' + ONES[n % 10];
  } else if (n > 0) s += ONES[n];
  return s;
}

export function intWords(n: number): string {
  n = Math.floor(n);
  if (!n) return 'ZERO';
  const units = ['', ' THOUSAND', ' MILLION', ' BILLION'];
  const parts: string[] = [];
  let i = 0;
  while (n > 0) {
    const c = n % 1000;
    if (c) parts.unshift(chunk(c) + units[i]);
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(' ');
}

/** SAY US DOLLARS ONE THOUSAND ... AND CENTS FIFTY ONLY */
export function amountWords(amount: number, cur: string): string {
  const cents = Math.round(amount * 100) % 100;
  return 'SAY ' + (CUR_NAME[cur] || cur) + ' ' + intWords(amount) + (cents ? ' AND CENTS ' + intWords(cents) : '') + ' ONLY';
}

/** 根据付款方式与参数生成单据上的英文付款条款 */
export function payText(t: PaymentHabit): string {
  const dep = Math.max(0, Math.min(100, toNum(t.payDeposit)));
  const days = toNum(t.payDays);
  const bal = (t.payBalanceAt || 'before shipment').replace('N days', (days || 30) + ' days');
  switch (t.payment) {
    case 'T/T 电汇':
      if (dep >= 100) return '100% T/T in advance';
      return dep > 0 ? `${dep}% T/T deposit in advance, ${100 - dep}% T/T balance ${bal}` : `100% T/T ${bal}`;
    case 'L/C 信用证':
      return days > 0 ? `100% irrevocable L/C at ${days} days after B/L date` : '100% irrevocable L/C at sight';
    case 'T/T + L/C 组合': {
      const d = dep || 30;
      return `${d}% T/T deposit in advance, ${100 - d}% by irrevocable L/C at ${days > 0 ? days + ' days after B/L date' : 'sight'}`;
    }
    case 'D/P 付款交单':
      return days > 0 ? `D/P at ${days} days after sight` : 'D/P at sight';
    case 'D/A 承兑交单':
      return `D/A at ${days || 60} days after sight`;
    case 'O/A 赊销':
      return `O/A, 100% within ${days || 30} days after B/L date`;
    case 'CAD 交单付现':
      return 'Cash against documents (CAD)';
    case '信保订单 Trade Assurance':
      return 'Payment via Alibaba.com Trade Assurance';
    case '西联 Western Union':
      return '100% by Western Union in advance';
    case 'PayPal':
      return '100% by PayPal in advance';
    case '信用卡 Credit Card':
      return '100% by credit card in advance';
    case '自定义':
      return t.payCustom || '';
    default:
      return t.payment || '';
  }
}

export const needAddr = (o: Order) => ADDRESS_REQUIRED_TERMS.includes(o.terms.incoterm);

export function addrLabel(o: Order): string {
  const t = o.terms.incoterm;
  if (t === 'EXW') return '提货地址（卖方工厂 / 仓库）';
  if (t === 'FCA') return '交货地址（交给承运人的地点）';
  if (['DAP', 'DPU', 'DDP'].includes(t)) return '国外交货地址（仓库 / 门店 / 收货地址）';
  return '具体交货地址（选填）';
}

/** 唛头模板中的 {PO}、{CTNS} 替换为 PO 号与总箱数 */
export function fillMarks(tpl: string, o: Order): string {
  if (!tpl) return '';
  const k = calc(o.items);
  return tpl.replace('{PO}', o.numbers.po || '—').replace('{CTNS}', k.ctns ? String(k.ctns) : 'UP');
}

export const today = () => new Date().toISOString().slice(0, 10);
export const uid = () => Math.random().toString(36).slice(2, 10);

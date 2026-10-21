import { calcOrder, toNum } from './calc';
import { STATUSES } from './constants';
import { profitOf, refRate } from './purchase';
import type { Order } from './types';

/**
 * 收款记录（M4-1）：每笔到账登记日期、类型、客户汇来的金额、银行扣费、结汇汇率。
 * 应收按付款方式拆成定金 / 尾款；实际利润按已收的实际结汇算，没收的按参考汇率估。
 */

export const RECEIPT_KINDS = ['定金', '尾款', '全款', '其他'] as const;

const DEPOSIT_PAYMENTS = ['T/T 电汇', 'T/T + L/C 组合'];

/** 应收：合同总额、定金、尾款（外币） */
export function planOf(o: Order) {
  const total = calcOrder(o).amount;
  const pct = DEPOSIT_PAYMENTS.includes(o.terms.payment) ? Math.max(0, Math.min(100, toNum(o.terms.payDeposit) || (o.terms.payment === 'T/T + L/C 组合' ? 30 : 0))) : 0;
  const deposit = Math.round(total * pct) / 100;
  return { total, pct, deposit, balance: Math.round((total - deposit) * 100) / 100 };
}

export interface Received {
  /** 客户汇来的合计（外币，含被银行扣掉的部分） */
  gross: number;
  /** 银行扣费合计（外币） */
  fees: number;
  /** 实际到账（外币） */
  net: number;
  /** 已结汇部分折人民币 */
  cny: number;
  /** 到账了还没结汇的外币 */
  unsettled: number;
  /** 登记为定金（或全款）的合计 */
  deposit: number;
  /** 客户还欠多少（外币） */
  outstanding: number;
  /** 已收占合同金额 */
  ratio: number;
}

export function receivedOf(o: Order): Received {
  const { total } = planOf(o);
  const cny1 = o.terms.currency === 'CNY';
  let gross = 0, fees = 0, cny = 0, unsettled = 0, deposit = 0;
  for (const r of o.receipts ?? []) {
    const a = toNum(r.amount), f = toNum(r.fee), rate = cny1 ? 1 : toNum(r.rate);
    gross += a;
    fees += f;
    if (rate) cny += (a - f) * rate;
    else unsettled += a - f;
    if (r.kind === '定金' || r.kind === '全款') deposit += a;
  }
  const outstanding = Math.round((total - gross) * 100) / 100;
  return { gross, fees, net: gross - fees, cny, unsettled, deposit, outstanding, ratio: total ? gross / total : 0 };
}

/** 新登记一笔时默认的类型和金额：定金没收齐先收定金，否则收剩下的 */
export function nextReceipt(o: Order): { kind: (typeof RECEIPT_KINDS)[number]; amount: number } {
  const p = planOf(o), r = receivedOf(o);
  if (r.outstanding <= 0) return { kind: '其他', amount: 0 };
  if (p.deposit > 0 && r.deposit < p.deposit) return { kind: '定金', amount: Math.round((p.deposit - r.deposit) * 100) / 100 };
  return { kind: p.deposit > 0 ? '尾款' : '全款', amount: r.outstanding };
}

/** 费用清单里的银行手续费：实际利润按收款记录里的实际扣费算，这一项不再重复算 */
const isBankFee = (name: string) => /银行|手续费/.test(name);

/**
 * 实际利润：已结汇的按实际人民币，到账未结汇和还没收的按参考汇率估；
 * 银行手续费按实际扣费（已从到账里扣掉），费用清单里的「银行手续费」不再计。
 */
export function actualProfit(o: Order) {
  const p = profitOf(o), r = receivedOf(o);
  const ref = o.terms.currency === 'CNY' ? 1 : p.rate;
  const pending = Math.max(0, r.outstanding);
  const income = r.cny + r.unsettled * ref + pending * ref;
  const otherFees = (o.purchase?.fees ?? []).filter((f) => !isBankFee(f.name)).reduce((a, f) => a + toNum(f.amount), 0);
  const profit = income + p.rebate - p.cost - otherFees;
  return {
    income, profit, margin: income ? profit / income : 0,
    /** 汇率差：实际结汇比预计汇率多（少）换的人民币 */
    fx: r.cny - (r.net - r.unsettled) * ref,
    estimated: r.unsettled > 0 || pending > 0,
    refRate: o.terms.currency === 'CNY' ? 1 : refRate(o.terms.currency),
  };
}

export const isPaidStatus = (o: Order) => STATUSES.indexOf(o.status) >= STATUSES.indexOf('收款');

import { calcOrder, toNum, uid } from './calc';
import type { Currency, Order, Partner, Purchase } from './types';

/**
 * 工厂采购与每单利润（M2-2）。
 * 货物行上记供应工厂、采购单价（人民币含税）、退税率；采购单按工厂各出一张。
 * 利润 = 销售额 × 汇率 + 出口退税 − 采购成本 − 各项费用，只在软件里看，不上任何单据。
 */

export const DEFAULT_FEES = ['国内运费（工厂到港口）', '报关 / 港杂费', '货代杂费', '海运费', '保险费', '银行手续费', '佣金'];

export function defaultPurchase(): Purchase {
  return {
    pos: {}, deliverTo: '', quality: '', packing: '', invoice: '以上价格含 13% 增值税专用发票。',
    rate: '', vat: 13, fees: DEFAULT_FEES.map((name) => ({ id: uid(), name, amount: '' })),
  };
}

const EMPTY: Purchase = { ...defaultPurchase(), fees: [] };
/** 老订单没有采购数据时按默认值读 */
export const purchaseOf = (o: Order): Purchase => o.purchase ?? EMPTY;

/** 参考汇率（没填汇率时估算用，界面上会提示按实际结汇汇率填写） */
export const REF_RATE: Record<Currency, number> = { USD: 7.1, EUR: 7.8, GBP: 9.1, CNY: 1, JPY: 0.048, AUD: 4.7, CAD: 5.2, HKD: 0.91, AED: 1.93 };

/** 这一行货物由哪个工厂供货（没单独选的按订单菜单里的工厂） */
export const factoryOf = (o: Order, i: number) => o.items[i]?.factory || o.partners.factory || '';

/** 本单涉及的工厂（按货物顺序，去重）；没有货物时也给一份（空白采购单） */
export function factoriesOf(o: Order): string[] {
  const out: string[] = [];
  o.items.forEach((_, i) => {
    const f = factoryOf(o, i);
    if (!out.includes(f)) out.push(f);
  });
  return out.length ? out : [o.partners.factory || ''];
}

/** 这个工厂供的货物行（原始行号） */
export const poRows = (o: Order, fid: string) => o.items.map((_, i) => i).filter((i) => factoryOf(o, i) === fid);

/** 采购单号：没填按「CG-订单号」，几个工厂时加 -1、-2 */
export function poNo(o: Order, fid: string): string {
  const own = purchaseOf(o).pos[fid]?.no;
  if (own) return own;
  if (!o.no) return '';
  const all = factoriesOf(o);
  return `CG-${o.no}${all.length > 1 ? `-${all.indexOf(fid) + 1}` : ''}`;
}

export const factoryName = (partners: Partner[], fid: string) => partners.find((p) => p.id === fid)?.name ?? '';

/** 某个工厂的采购金额（人民币） */
export function poTotal(o: Order, fid: string) {
  const k = calcOrder(o);
  return poRows(o, fid).reduce((a, i) => a + toNum(k.rows[i].q) * toNum(o.items[i].cost), 0);
}

export interface Profit {
  cur: Currency;
  rate: number;
  /** 没填汇率，用的参考汇率 */
  rateRef: boolean;
  /** 销售额（外币） */
  salesFx: number;
  /** 销售额（人民币） */
  sales: number;
  cost: number;
  rebate: number;
  fees: number;
  profit: number;
  /** 利润率（占销售额） */
  margin: number;
  /** 没填采购单价的行号 */
  noCost: number[];
  /** 至少填了一个采购单价 */
  hasCost: boolean;
}

export function profitOf(o: Order): Profit {
  const p = purchaseOf(o);
  const k = calcOrder(o);
  const cur = o.terms.currency;
  const typed = toNum(p.rate);
  const rate = cur === 'CNY' ? 1 : typed || REF_RATE[cur] || 1;
  const vat = toNum(p.vat);
  let cost = 0, rebate = 0;
  const noCost: number[] = [];
  k.rows.forEach((r, i) => {
    const c = toNum(o.items[i].cost);
    if (!c) noCost.push(i);
    const line = toNum(r.q) * c;
    cost += line;
    rebate += (line / (1 + vat / 100)) * (toNum(o.items[i].rebate) / 100);
  });
  const fees = p.fees.reduce((a, f) => a + toNum(f.amount), 0);
  const sales = k.amount * rate;
  const profit = sales + rebate - cost - fees;
  return {
    cur, rate, rateRef: cur !== 'CNY' && !typed, salesFx: k.amount, sales, cost, rebate, fees, profit,
    margin: sales ? profit / sales : 0, noCost, hasCost: noCost.length < k.rows.length,
  };
}

const DIG = '零壹贰叁肆伍陆柒捌玖';
const UNIT = ['', '拾', '佰', '仟'];
const BIG = ['', '万', '亿', '万亿'];

/** 人民币大写：壹万贰仟叁佰肆拾伍元陆角柒分 */
export function rmbWords(n: number): string {
  const fen = Math.round(Math.max(0, n) * 100);
  const yuan = Math.floor(fen / 100), jiao = Math.floor(fen / 10) % 10, f = fen % 10;
  if (!fen) return '人民币零元整';
  let out = '';
  if (yuan) {
    const groups: number[] = [];
    for (let x = yuan; x > 0; x = Math.floor(x / 10000)) groups.push(x % 10000);
    let zero = false;
    for (let g = groups.length - 1; g >= 0; g--) {
      const v = groups[g];
      if (!v) { zero = true; continue; }
      if (out && (zero || v < 1000)) out += '零';
      zero = false;
      let gs = '', z = false;
      for (let d = 3; d >= 0; d--) {
        const dig = Math.floor(v / 10 ** d) % 10;
        if (!dig) { if (gs) z = true; continue; }
        if (z) { gs += '零'; z = false; }
        gs += DIG[dig] + UNIT[d];
      }
      out += gs + BIG[g];
    }
    out += '元';
  }
  if (!jiao && !f) return `人民币${out}整`;
  if (jiao) out += DIG[jiao] + '角';
  else if (yuan) out += '零';
  if (f) out += DIG[f] + '分';
  return '人民币' + out;
}

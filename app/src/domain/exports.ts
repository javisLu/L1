import type { DocKey } from '../modules/defs';
import type { Order } from './types';

/**
 * 导出记录：每次导出或打包时记下时间和「单据指纹」。
 * 指纹只取这份单据用得到的数据，所以改报关要素不会让 PI 显示「导出后改过」。
 */

/** 单价只出现在商务单据上；箱单、唛头、订舱等不看单价 */
const PRICE = ['price'];
/** 采购价、供应工厂、退税率只在采购单 / 成本利润里用，给客户、货代、报关行的单据都不看 */
const COST = ['cost', 'factory', 'rebate'];
const strip = (o: Order, drop: string[]) => o.items.map((it) => Object.fromEntries(Object.entries(it).filter(([k]) => !drop.includes(k))));

/** 这份单据用到的数据（指纹和改版对比都按这个算） */
export function project(o: Order, doc: DocKey): unknown {
  const base = { seller: o.seller, buyer: o.buyer, numbers: o.numbers, docset: o.docset };
  const pack = { packs: o.packs ?? [], pkg: o.pkg ?? null };
  switch (doc) {
    case 'quote':
    case 'pi':
      return { ...base, terms: o.terms, items: strip(o, COST), ...pack };
    case 'contract':
      return { ...base, terms: o.terms, items: strip(o, COST), ...pack, clauses: o.contractClauses };
    case 'po': {
      const p = o.purchase;
      return {
        seller: o.seller, date: o.numbers.date, docset: o.docset, items: strip(o, ['price', 'rebate', 'hs', 'elements']), ...pack,
        marks: o.shipping.marks, side: o.shipping.side, factory: o.partners.factory,
        purchase: p ? { pos: p.pos, deliverTo: p.deliverTo, quality: p.quality, packing: p.packing, invoice: p.invoice } : null,
      };
    }
    case 'ci':
      return { ...base, terms: o.terms, items: strip(o, COST), ...pack, shipping: o.shipping };
    case 'co':
      return { ...base, terms: o.terms, items: strip(o, [...PRICE, ...COST]), ...pack, shipping: o.shipping, dest: o.customs.destCountry, co: o.co ?? null };
    case 'pl':
      return { ...base, terms: o.terms, items: strip(o, [...PRICE, ...COST]), ...pack, shipping: o.shipping };
    case 'customs':
      return { ...base, terms: o.terms, items: strip(o, COST), ...pack, shipping: o.shipping, customs: o.customs };
    case 'marks':
    case 'labels':
      return { po: o.numbers.po, marks: o.shipping.marks, side: o.shipping.side, items: strip(o, [...PRICE, ...COST]), ...pack };
    case 'booking':
    case 'si':
    case 'advice':
      return { ...base, terms: o.terms, items: strip(o, [...PRICE, ...COST]), ...pack, shipping: o.shipping, forwarder: o.partners.forwarder };
  }
}

/** FNV-1a，够用来判断「有没有变」 */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const docSig = (o: Order, doc: DocKey) => hashText(JSON.stringify(project(o, doc)));

export const nowStamp = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export type DocState = { kind: 'none' } | { kind: 'sent'; at: string; to?: string } | { kind: 'changed'; at: string; to?: string };

export function docState(o: Order, doc: DocKey): DocState {
  const r = o.exports?.[doc];
  if (!r) return { kind: 'none' };
  return { kind: r.sig === docSig(o, doc) ? 'sent' : 'changed', at: r.at, to: r.to };
}

/** 「10-08 14:20」：今年的日期省略年份 */
export const shortStamp = (at: string, now = new Date()) => (at.startsWith(String(now.getFullYear())) ? at.slice(5) : at.slice(0, 10));

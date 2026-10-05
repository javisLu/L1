import { calcOrder, fixed, toNum, type Totals } from './calc';
import { pkgSummary } from './package';
import type { ContainerRow, Order } from './types';

/** 卖方承担运费的贸易术语 → 提单写 FREIGHT PREPAID */
export const PREPAID_TERMS = ['CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
/** 卖方负责投保的贸易术语 */
export const INSURE_TERMS = ['CIF', 'CIP'];
export const CONTAINER_TYPES = ['20GP', '40GP', '40HQ', '45HQ', '20RF', '40RF', '20OT', '40OT', '20FR', '40FR', 'LCL'];

const lines = (...xs: (string | undefined)[]) => xs.map((x) => (x ?? '').trim()).filter(Boolean).join('\n');

export const shipperText = (o: Order) => lines(o.seller.name, o.seller.address, o.seller.phone && `TEL: ${o.seller.phone}`);
const buyerText = (o: Order) => lines(o.buyer.name, o.buyer.address, [o.buyer.contact && `ATTN: ${o.buyer.contact}`, o.buyer.phone && `TEL: ${o.buyer.phone}`].filter(Boolean).join('  '), o.buyer.email && `EMAIL: ${o.buyer.email}`);

/** 收货人（提单 Consignee） */
export function consigneeText(o: Order): string {
  const m = o.shipping.consigneeMode ?? 'buyer';
  if (m === 'order') return 'TO ORDER';
  if (m === 'custom') return o.shipping.consignee ?? '';
  return buyerText(o);
}

/** 通知人（提单 Notify Party） */
export function notifyText(o: Order): string {
  const m = o.shipping.notifyMode ?? 'auto';
  if (m === 'custom') return o.shipping.notify ?? '';
  if (m === 'buyer') return buyerText(o);
  return (o.shipping.consigneeMode ?? 'buyer') === 'buyer' ? 'SAME AS CONSIGNEE' : buyerText(o);
}

export const autoFreight = (o: Order): 'PREPAID' | 'COLLECT' => (PREPAID_TERMS.includes(o.terms.incoterm) ? 'PREPAID' : 'COLLECT');
export const freightOf = (o: Order) => o.shipping.freight || autoFreight(o);
export const freightText = (o: Order) => `FREIGHT ${freightOf(o)}`;
export const insureNeeded = (o: Order) => (o.shipping.insure ? o.shipping.insure === 'yes' : INSURE_TERMS.includes(o.terms.incoterm));

/** 提单类型文字：3/3 ORIGINAL B/L、TELEX RELEASE、SEA WAYBILL */
export function blTypeText(o: Order): string {
  const t = o.shipping.blType ?? 'original';
  if (t === 'telex') return 'TELEX RELEASE';
  if (t === 'seaway') return 'SEA WAYBILL';
  const n = Math.max(1, Math.round(toNum(o.shipping.originals ?? 3)) || 3);
  return `${n}/${n} ORIGINAL B/L`;
}
export const blTypeCn = (o: Order) => ({ original: '正本提单', telex: '电放', seaway: '海运单' })[o.shipping.blType ?? 'original'];

/** 柜子明细：填了多柜明细用明细，否则用柜号 / 封号 + 整票件毛体 */
export function containerRows(o: Order, k: Totals = calcOrder(o)): ContainerRow[] {
  const boxes = (o.shipping.boxes ?? []).filter((b) => b.no || b.seal || toNum(b.pkgs));
  if (boxes.length) return boxes;
  if (!o.shipping.container && !o.shipping.seal) return [];
  const pk = pkgSummary(o, k);
  const type = o.shipping.container.match(/\b(20|40|45)\s*'?\s*(GP|HQ|HC|DC|RF|OT|FR)\b/i)?.[0].replace(/\s|'/g, '').toUpperCase() ?? '';
  const no = o.shipping.container.replace(/\/?\s*\b(20|40|45)\s*'?\s*(GP|HQ|HC|DC|RF|OT|FR)\b/i, '').trim();
  return [{ no, seal: o.shipping.seal, type, pkgs: pk.count, gw: Number(pk.gw.toFixed(2)), cbm: Number(pk.cbm.toFixed(3)) }];
}

/** 货描（提单上的品名，按英文品名去重，附 HS） */
export function goodsLines(o: Order, k: Totals = calcOrder(o), withHs = true): string[] {
  const seen = new Map<string, string>();
  for (const r of k.rows) {
    const name = String(r.nameEn || r.nameCn || '').trim().toUpperCase();
    if (!name || seen.has(name)) continue;
    seen.set(name, withHs && r.hs ? `${name}  HS CODE: ${r.hs}` : name);
  }
  return [...seen.values()];
}

/** 件毛体一句话：12 CARTONS / 182.90 KGS / 1.306 CBM */
export function cargoLine(o: Order, k: Totals = calcOrder(o)) {
  const pk = pkgSummary(o, k);
  return `${pk.count} ${pk.unitEn} / ${fixed(pk.gw, 2)} KGS / ${fixed(pk.cbm, 3)} CBM`;
}

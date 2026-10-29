import { destOf } from './origin';
import { factoryOf } from './purchase';
import type { Order, Partner } from './types';

/**
 * 目的国的进口合规要求（只收规则明确、有条文可查的）。
 * 原产地标记：美国要求进口货物（或其外包装）用英文清楚标明原产国，没标的进口商要补标或加征 10% 关税。
 */
export const ORIGIN_MARK: Record<string, { basis: string }> = {
  美国: { basis: '美国 19 U.S.C. §1304、19 CFR Part 134（原产地标记）' },
};

/** 唛头 / 侧唛里有没有写原产国 */
export const hasOriginMark = (text: string) => /MADE\s+IN\s+(THE\s+)?(P\.?\s*R\.?\s*)?CHINA|PRODUCT\s+OF\s+(P\.?\s*R\.?\s*)?CHINA|(COUNTRY\s+OF\s+)?ORIGIN\s*[:：]?\s*(P\.?\s*R\.?\s*)?CHINA/i.test(text);

/** 本单目的国要求标原产地、唛头里却没写：返回依据；不需要或已写返回 null */
export function originMarkMissing(o: Order): { country: string; basis: string } | null {
  const d = destOf(o).cn;
  const rule = ORIGIN_MARK[d];
  if (!rule) return null;
  return hasOriginMark(`${o.shipping.marks ?? ''}\n${o.shipping.side ?? ''}`) ? null : { country: d, basis: rule.basis };
}

/* ---------- 美国 ISF（Importer Security Filing，10+2） ---------- */

/** 海运到美国：进口商要在装船前 24 小时向美国海关申报 ISF，其中厂家、装柜地点等要卖方提供 */
export const ISF_BASIS = '美国 19 CFR Part 149（Importer Security Filing）';
export const isfNeeded = (o: Order) => destOf(o).cn === '美国' && (o.terms.transport || '海运') === '海运';

const lines = (...xs: (string | undefined)[]) => xs.map((x) => (x ?? '').trim()).filter(Boolean).join('\n');
const partyEn = (p?: Partner) => (p ? lines(p.nameEn, p.addressEn) : '');

export interface IsfRow { i: number; desc: string; hts6: string; origin: string; maker: string; makerId: string; makerMissing: boolean }
export interface IsfData {
  seller: string; buyer: string; shipTo: string;
  rows: IsfRow[];
  stuffing: string; consolidator: string;
  /** 缺英文名称 / 地址的工厂（合作方库里补） */
  missingMakers: string[];
}

/** ISF 里卖方要提供的资料：卖方、买方、收货地址、每种货的厂家 / 6 位 HS / 原产国、装柜地点、装柜方 */
export function isfData(o: Order, partners: Partner[]): IsfData {
  const byId = (id: string) => partners.find((p) => p.id === id);
  const seller = lines(o.seller.name, o.seller.address);
  const missing = new Set<string>();
  const rows: IsfRow[] = o.items.map((it, i) => {
    const fid = factoryOf(o, i);
    const f = fid ? byId(fid) : undefined;
    // 没选工厂按卖方自己生产
    const maker = f ? partyEn(f) : seller;
    const makerMissing = !!f && !(f.nameEn?.trim() && f.addressEn?.trim());
    if (makerMissing) missing.add(f!.name || '未命名工厂');
    const d = String(it.hs ?? '').replace(/\D/g, '');
    return { i, desc: it.nameEn, hts6: d.length >= 6 ? `${d.slice(0, 4)}.${d.slice(4, 6)}` : '', origin: o.shipping.origin || 'CHINA', maker, makerId: fid, makerMissing };
  });
  // 装柜地点：没填时，整柜且只有一家工厂按那家工厂；装柜方：没填按货代
  const makers = [...new Set(rows.map((r) => r.makerId))];
  const lcl = /LCL|拼箱/i.test(o.shipping.equipment ?? '');
  const one = makers.length === 1 ? (makers[0] ? byId(makers[0]) : undefined) : undefined;
  const stuffing = o.shipping.stuffing?.trim() || (!lcl && makers.length === 1 ? (one ? (one.addressEn ? lines(one.nameEn, one.addressEn) : '') : seller) : '');
  const consolidator = o.shipping.consolidator?.trim() || partyEn(byId(o.partners.forwarder));
  return {
    seller, buyer: lines(o.buyer.name, o.buyer.address),
    shipTo: lines(o.terms.deliveryAddress) || lines(o.buyer.name, o.buyer.address),
    rows, stuffing, consolidator, missingMakers: [...missing],
  };
}

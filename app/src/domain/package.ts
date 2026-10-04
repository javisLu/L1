import { calcOrder, fixed, intWords, toNum, type Totals } from './calc';
import type { Order, Packaging, PkgMode } from './types';

export const PKG_MODES: Record<PkgMode, { name: string; en: [string, string]; cn: string; customs: string }> = {
  ctns: { name: '散箱（纸箱）', en: ['CARTON', 'CARTONS'], cn: '箱', customs: '纸制或纤维板制盒/箱' },
  pallet: { name: '托盘', en: ['PALLET', 'PALLETS'], cn: '托', customs: '再生木托' },
  case: { name: '木箱', en: ['WOODEN CASE', 'WOODEN CASES'], cn: '木箱', customs: '木制或竹藤等植物性材料制盒/箱' },
  other: { name: '其他', en: ['PACKAGE', 'PACKAGES'], cn: '件', customs: '其他包装' },
};

export const defaultPackaging = (): Packaging => ({ mode: 'ctns', unit: '', count: '', tare: '', sizes: [] });

export interface PkgSummary {
  mode: PkgMode;
  /** 总件数（散箱 = 箱数） */
  count: number;
  /** 英文单位（按件数单复数），如 PALLETS */
  unitEn: string;
  /** 中文单位，如 托 */
  unitCn: string;
  cartons: number;
  /** 总毛重（含托盘 / 木箱自重） */
  gw: number;
  tare: number;
  /** 总体积：托盘等按每件尺寸算，没填尺寸按纸箱算 */
  cbm: number;
  /** 例：1@120×80×136 cm */
  sizes: string;
  /** 例：1 PALLET CONTAINS 12 CARTONS（散箱为空） */
  contains: string;
  /** 例：SAY TOTAL ONE (1) PALLET ONLY */
  words: string;
  /** 一句话：12 cartons / 1 pallet (12 cartons) */
  short: string;
}

/** 总件数 / 外包装汇总：箱单、发票、报关资料、邮件统一用这一个口径 */
export function pkgSummary(o: Order, k: Totals = calcOrder(o)): PkgSummary {
  const p = o.pkg ?? defaultPackaging();
  const mode = p.mode ?? 'ctns';
  const def = PKG_MODES[mode];
  const loose = mode === 'ctns';
  const count = loose ? k.ctns : Math.max(0, Math.round(toNum(p.count)));
  const custom = mode === 'other' && p.unit.trim() ? p.unit.trim().toUpperCase() : '';
  const unitEn = custom || def.en[count === 1 ? 0 : 1];
  const unitCn = custom || def.cn;
  const sizes = loose ? [] : (p.sizes ?? []).filter((x) => toNum(x.n) && toNum(x.l) && toNum(x.w) && toNum(x.h));
  const sizeVol = sizes.reduce((a, x) => a + (toNum(x.n) * toNum(x.l) * toNum(x.w) * toNum(x.h)) / 1e6, 0);
  const tare = loose ? 0 : count * toNum(p.tare);
  const cartonsWord = k.ctns === 1 ? 'CARTON' : 'CARTONS';
  return {
    mode, count, unitEn, unitCn, cartons: k.ctns, tare,
    gw: k.gw + tare,
    cbm: sizeVol || k.cbm,
    sizes: sizes.map((x) => `${toNum(x.n)}@${x.l}×${x.w}×${x.h} cm`).join(', '),
    contains: !loose && count && k.ctns ? `${count} ${unitEn} ${count === 1 ? 'CONTAINS' : 'CONTAIN'} ${k.ctns} ${cartonsWord}` : '',
    words: `SAY TOTAL ${intWords(count)} (${count}) ${unitEn} ONLY`,
    short: loose ? `${k.ctns} ${cartonsWord.toLowerCase()}` : `${count} ${unitEn.toLowerCase()} (${k.ctns} ${cartonsWord.toLowerCase()})`,
  };
}

/** 箱单底部的说明行：托盘含多少箱、每件尺寸、含托盘的毛重 */
export function pkgNote(s: PkgSummary): string {
  if (s.mode === 'ctns') return '';
  const parts = [s.contains, s.sizes && `${s.unitEn.replace(/S$/, '')} SIZE: ${s.sizes}`, s.tare ? `G.W. INCL. ${s.unitEn}: ${fixed(s.gw, 2)} KGS` : '', `MEAS.: ${fixed(s.cbm, 3)} CBM`];
  return parts.filter(Boolean).join('; ');
}

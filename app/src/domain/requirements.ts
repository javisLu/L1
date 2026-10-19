import { STATUSES } from './constants';
import { toNum } from './calc';
import { PKG_MODES, defaultPackaging } from './package';
import type { CustReq, Order, PkgMode, ReqKey } from './types';
import type { ModKey, StepKey } from '../modules/defs';

/**
 * 客户要求清单：每个客户的单据规矩。
 * 能自动设置的（apply）在新建订单时直接套用；能自动检查的（check）在单据检查里逐条核对；
 * 「自定义提醒」没法自动判断，每单手动勾选确认。
 */
export interface ReqProblem { text: string; mod: ModKey; step?: StepKey; path?: string }

interface Param {
  kind: 'text' | 'number' | 'select';
  placeholder?: string;
  unit?: string;
  options?: [string, string][];
  /** 新加一条时的默认值 */
  def?: string;
}

export interface ReqDef {
  label: string;
  group: '单据内容' | '唛头' | '提单' | '装箱' | '其他';
  param?: Param;
  /** 清单里显示的完整说明 */
  describe: (v: string) => string;
  /** 不符合时返回问题；符合返回 null */
  check?: (o: Order, v: string) => ReqProblem | null;
  /** 新建订单 / 一键改：按要求设置订单 */
  apply?: (o: Order, v: string) => void;
}

const has = (text: string, v: string) => text.toUpperCase().includes(v.trim().toUpperCase());
const appendLine = (text: string, v: string) => (text.trim() ? `${text.replace(/\s+$/, '')}\n${v.trim()}` : v.trim());
const ALLOW: [string, string][] = [['Allowed', '允许'], ['Not Allowed', '不允许']];
const BL: [string, string][] = [['original', '正本提单'], ['telex', '电放'], ['seaway', '海运单']];

export const REQS: Record<ReqKey, ReqDef> = {
  note: {
    label: '自定义提醒（每单手动确认）', group: '其他',
    param: { kind: 'text', placeholder: '如：正本提单 DHL 寄到客户芝加哥办公室' },
    describe: (v) => v || '（未填写）',
  },
  po: {
    label: '单据上必须有客户 PO 号', group: '单据内容',
    describe: () => '单据上必须有客户 PO 号',
    check: (o) => (o.numbers.po.trim() ? null : { text: '客户要求单据上有 PO 号，还没填', mod: 'pi', path: 'numbers.po' }),
  },
  hs: {
    label: '发票每行都要有 HS 编码', group: '单据内容',
    describe: () => '发票每行都要有 HS 编码',
    check: (o) => {
      const i = o.items.findIndex((x) => !x.hs.trim());
      return i < 0 ? null : { text: `客户要求发票每行有 HS 编码，第 ${i + 1} 行没填`, mod: 'customs', step: 'customsItems', path: `items.${i}.hs` };
    },
  },
  spec: {
    label: '每行货物都要写规格', group: '单据内容',
    describe: () => '每行货物都要写规格',
    check: (o) => {
      const i = o.items.findIndex((x) => !x.spec.trim());
      return i < 0 ? null : { text: `客户要求每行写规格，第 ${i + 1} 行没填`, mod: 'quote', step: 'items', path: `items.${i}.spec` };
    },
  },
  tax: {
    label: '单据上要有买方税号 / VAT / EORI', group: '单据内容',
    describe: () => '单据上要有买方税号 / VAT / EORI',
    check: (o) => (o.buyer.tax.trim() ? null : { text: '客户要求单据上有买方税号 / VAT / EORI，还没填', mod: 'quote', step: 'parties', path: 'buyer.tax' }),
  },
  statement: {
    label: '发票 / 箱单上注明指定文字', group: '单据内容',
    param: { kind: 'text', placeholder: '如：NO WOOD PACKING MATERIAL IS USED', def: 'NO WOOD PACKING MATERIAL IS USED' },
    describe: (v) => `发票 / 箱单上注明：${v || '（未填写）'}`,
    check: (o, v) => (!v.trim() || has(o.docset.statement ?? '', v) ? null : { text: `客户要求发票 / 箱单注明「${v.trim()}」`, mod: 'ci', step: 'invoice', path: 'docset.statement' }),
    apply: (o, v) => { if (v.trim() && !has(o.docset.statement ?? '', v)) o.docset.statement = appendLine(o.docset.statement ?? '', v); },
  },
  origin: {
    label: '原产地的写法', group: '单据内容',
    param: { kind: 'text', placeholder: '如：MADE IN CHINA', def: 'MADE IN CHINA' },
    describe: (v) => `原产地写作：${v || '（未填写）'}`,
    check: (o, v) => (!v.trim() || o.shipping.origin.trim().toUpperCase() === v.trim().toUpperCase() ? null : { text: `客户要求原产地写作「${v.trim()}」，现在是「${o.shipping.origin || '空'}」`, mod: 'ci', step: 'invoice', path: 'shipping.origin' }),
    apply: (o, v) => { if (v.trim()) o.shipping.origin = v.trim(); },
  },
  marksPo: {
    label: '唛头要有 PO 号', group: '唛头',
    describe: () => '唛头要有 PO 号',
    check: (o) => {
      if (!o.numbers.po.trim()) return { text: '客户要求唛头有 PO 号，但 PO 号还没填', mod: 'pi', path: 'numbers.po' };
      return has(o.shipping.marks, o.numbers.po) ? null : { text: `客户要求唛头有 PO 号 ${o.numbers.po}`, mod: 'marks', path: 'shipping.marks' };
    },
    apply: (o) => { if (o.numbers.po.trim() && !has(o.shipping.marks, o.numbers.po) && !o.shipping.marks.includes('{PO}')) o.shipping.marks = `${o.numbers.po.trim()}\n${o.shipping.marks}`.trim(); },
  },
  marksText: {
    label: '唛头要有指定文字', group: '唛头',
    param: { kind: 'text', placeholder: '如：MADE IN CHINA', def: 'MADE IN CHINA' },
    describe: (v) => `唛头要有：${v || '（未填写）'}`,
    check: (o, v) => (!v.trim() || has(o.shipping.marks, v) ? null : { text: `客户要求唛头有「${v.trim()}」`, mod: 'marks', path: 'shipping.marks' }),
    apply: (o, v) => { if (v.trim() && !has(o.shipping.marks, v)) o.shipping.marks = appendLine(o.shipping.marks, v); },
  },
  side: {
    label: '要有侧唛', group: '唛头',
    describe: () => '要有侧唛（不用自动生成的）',
    check: (o) => (o.shipping.side.trim() ? null : { text: '客户要求有侧唛，侧唛还没填', mod: 'marks', path: 'shipping.side' }),
  },
  consignee: {
    label: '提单收货人', group: '提单',
    param: { kind: 'select', options: [['buyer', '同买方'], ['order', 'TO ORDER（凭指示）']], def: 'order' },
    describe: (v) => `提单收货人：${v === 'order' ? 'TO ORDER' : '同买方'}`,
    check: (o, v) => ((o.shipping.consigneeMode ?? 'buyer') === v ? null : { text: `客户要求提单收货人是 ${v === 'order' ? 'TO ORDER' : '买方'}`, mod: 'booking', path: 'shipping.consigneeMode' }),
    apply: (o, v) => { o.shipping.consigneeMode = v as 'buyer' | 'order'; },
  },
  notify: {
    label: '提单通知人固定为', group: '提单',
    param: { kind: 'text', placeholder: '通知人公司名称、地址、电话' },
    describe: (v) => `提单通知人：${v.split('\n')[0] || '（未填写）'}`,
    check: (o, v) => (!v.trim() || (o.shipping.notifyMode === 'custom' && (o.shipping.notify ?? '').trim() === v.trim()) ? null : { text: `客户要求通知人是「${v.split('\n')[0]}」`, mod: 'booking', path: 'shipping.notifyMode' }),
    apply: (o, v) => { if (v.trim()) { o.shipping.notifyMode = 'custom'; o.shipping.notify = v.trim(); } },
  },
  blType: {
    label: '提单类型', group: '提单',
    param: { kind: 'select', options: BL, def: 'telex' },
    describe: (v) => `提单类型：${BL.find((x) => x[0] === v)?.[1] ?? v}`,
    check: (o, v) => ((o.shipping.blType ?? 'original') === v ? null : { text: `客户要求${BL.find((x) => x[0] === v)?.[1]}`, mod: 'booking', path: 'shipping.blType' }),
    apply: (o, v) => { o.shipping.blType = v as 'original' | 'telex' | 'seaway'; },
  },
  originals: {
    label: '正本提单份数', group: '提单',
    param: { kind: 'number', unit: '份', def: '3' },
    describe: (v) => `正本提单 ${v || '3'} 份`,
    check: (o, v) => ((o.shipping.blType ?? 'original') !== 'original' || toNum(o.shipping.originals || 3) === toNum(v || 3) ? null : { text: `客户要求正本提单 ${v} 份`, mod: 'booking', path: 'shipping.originals' }),
    apply: (o, v) => { if (toNum(v)) o.shipping.originals = v; },
  },
  partial: {
    label: '分批装运', group: '提单',
    param: { kind: 'select', options: ALLOW, def: 'Not Allowed' },
    describe: (v) => `分批装运：${v === 'Allowed' ? '允许' : '不允许'}`,
    check: (o, v) => (o.terms.partial === v ? null : { text: `客户要求分批装运${v === 'Allowed' ? '允许' : '不允许'}`, mod: 'quote', step: 'terms', path: 'terms.partial' }),
    apply: (o, v) => { o.terms.partial = v; },
  },
  transship: {
    label: '转运', group: '提单',
    param: { kind: 'select', options: ALLOW, def: 'Not Allowed' },
    describe: (v) => `转运：${v === 'Allowed' ? '允许' : '不允许'}`,
    check: (o, v) => (o.terms.transship === v ? null : { text: `客户要求转运${v === 'Allowed' ? '允许' : '不允许'}`, mod: 'quote', step: 'terms', path: 'terms.transship' }),
    apply: (o, v) => { o.terms.transship = v; },
  },
  pkgMode: {
    label: '外包装方式', group: '装箱',
    param: { kind: 'select', options: (Object.keys(PKG_MODES) as PkgMode[]).filter((m) => m !== 'other').map((m) => [m, PKG_MODES[m].name]), def: 'pallet' },
    describe: (v) => `外包装：${PKG_MODES[v as PkgMode]?.name ?? v}`,
    check: (o, v) => ((o.pkg?.mode ?? 'ctns') === v ? null : { text: `客户要求外包装是${PKG_MODES[v as PkgMode]?.name ?? v}`, mod: 'pl', step: 'packing' }),
    apply: (o, v) => {
      const g = (o.pkg ??= defaultPackaging());
      g.mode = v as PkgMode;
      if (v !== 'ctns' && !g.sizes.length) g.sizes.push({ n: '', l: '', w: '', h: '' });
      o.customs.packageType = PKG_MODES[v as PkgMode].customs;
    },
  },
  maxGw: {
    label: '每箱毛重不超过', group: '装箱',
    param: { kind: 'number', unit: 'kg', def: '23' },
    describe: (v) => `每箱毛重不超过 ${v || '?'} kg`,
    check: (o, v) => {
      const max = toNum(v);
      if (!max) return null;
      const packs = o.packs ?? [];
      const i = o.items.findIndex((x) => !(x.mix && packs.some((p) => p.id === x.mix)) && toNum(x.gw) > max);
      if (i >= 0) return { text: `客户要求每箱毛重不超过 ${max} kg，第 ${i + 1} 行每箱 ${toNum(o.items[i].gw)} kg`, mod: 'pl', step: 'packing', path: `items.${i}.gw` };
      const pi = packs.findIndex((p) => toNum(p.gw) > max && o.items.some((x) => x.mix === p.id));
      return pi < 0 ? null : { text: `客户要求每箱毛重不超过 ${max} kg，有混装箱每箱 ${toNum(packs[pi].gw)} kg`, mod: 'pl', step: 'packing', path: `packs.${pi}.gw` };
    },
  },
  maxPalletH: {
    label: '托盘 / 木箱高度不超过', group: '装箱',
    param: { kind: 'number', unit: 'cm', def: '150' },
    describe: (v) => `托盘 / 木箱高度不超过 ${v || '?'} cm`,
    check: (o, v) => {
      const max = toNum(v);
      if (!max || !o.pkg || o.pkg.mode === 'ctns') return null;
      const i = o.pkg.sizes.findIndex((x) => toNum(x.h) > max);
      return i < 0 ? null : { text: `客户要求托盘 / 木箱高度不超过 ${max} cm，现在 ${toNum(o.pkg.sizes[i].h)} cm`, mod: 'pl', step: 'packing', path: `pkg.sizes.${i}.h` };
    },
  },
};

export const REQ_GROUPS: ReqDef['group'][] = ['单据内容', '唛头', '提单', '装箱', '其他'];

export const newReq = (k: ReqKey, id: string): CustReq => ({ id, k, v: REQS[k].param?.def ?? '' });

/** 新建订单 / 换客户时，把能自动设置的要求套用到订单；返回套用的条数 */
export function applyReqs(o: Order, reqs: CustReq[] = []): number {
  let n = 0;
  for (const r of reqs) {
    const d = REQS[r.k];
    if (!d?.apply) continue;
    d.apply(o, r.v);
    n++;
  }
  return n;
}

/** 这个客户有几条要求会在新建订单时自动设置 */
export const autoReqCount = (reqs: CustReq[] = []) => reqs.filter((r) => REQS[r.k]?.apply).length;

export type ReqState =
  | { kind: 'ok' }
  | { kind: 'bad'; problem: ReqProblem }
  | { kind: 'manual'; done: boolean };

export function reqState(o: Order, r: CustReq): ReqState {
  const d = REQS[r.k];
  if (!d) return { kind: 'ok' };
  if (!d.check) return { kind: 'manual', done: !!o.reqDone?.includes(r.id) };
  const p = d.check(o, r.v);
  return p ? { kind: 'bad', problem: p } : { kind: 'ok' };
}

/** 订单是否到了要严格核对客户要求的阶段（确认之后不符合算错误，之前只提醒） */
export const reqStrict = (o: Order) => STATUSES.indexOf(o.status) >= STATUSES.indexOf('确认');

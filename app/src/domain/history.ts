import { STEPS, DOCNAMES, docFile, dyn, type DocKey } from '../modules/defs';
import { calcOrder, fixed, int, money } from './calc';
import { pkgSummary } from './package';
import { profitOf } from './purchase';
import { docSig, hashText, project } from './exports';
import type { Order, OrderSnap, SendRecord } from './types';

/**
 * 发出记录与改版对比。
 * 每次导出 / 打包把单据用到的数据留一份底（按内容去重），之后可以和现在逐项对比，
 * 并生成发给客户（英文）或工厂、货代（中文）的改版说明。
 */

const SNAP_KEYS = ['seller', 'buyer', 'terms', 'numbers', 'items', 'packs', 'pkg', 'shipping', 'customs', 'partners', 'docset', 'contractClauses', 'purchase', 'co'] as const;

export const takeSnap = (o: Order): OrderSnap =>
  JSON.parse(JSON.stringify(Object.fromEntries(SNAP_KEYS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])))) as OrderSnap;
export const snapKey = (s: OrderSnap) => hashText(JSON.stringify(s));
/** 留底数据按订单读取（单据模板、计算函数只用到这些字段） */
export const asOrder = (s: OrderSnap, o: Order): Order => ({ ...o, ...s, packs: s.packs, pkg: s.pkg });

const MAX_RECORDS = 60;

/** 记一条发出记录（在 immer 草稿上改）；返回留底的键 */
export function recordSend(o: Order, rec: { at: string; docs: string[]; to?: string; file?: string; snap: OrderSnap; id: string }): string {
  const key = snapKey(rec.snap);
  o.snaps ??= {};
  o.snaps[key] ??= rec.snap;
  (o.sent ??= []).push({ id: rec.id, at: rec.at, docs: rec.docs, ...(rec.to ? { to: rec.to } : {}), ...(rec.file ? { file: rec.file } : {}), snap: key });
  if (o.sent.length > MAX_RECORDS) o.sent.splice(0, o.sent.length - MAX_RECORDS);
  // 没有记录再用到的留底删掉
  const used = new Set([...o.sent.map((r) => r.snap), ...Object.values(o.exports ?? {}).map((m) => m?.snap)]);
  used.add(key);
  for (const k of Object.keys(o.snaps)) if (!used.has(k)) delete o.snaps[k];
  return key;
}

export interface DocVersion { v: number; at: string; to?: string; snap: string; sig: string; rec: string }

/** 某份单据发出过的版本：内容变了才算新版本（同一版发给几个人不加版本号） */
export function docVersions(o: Order, doc: DocKey): DocVersion[] {
  const out: DocVersion[] = [];
  for (const r of o.sent ?? []) {
    if (!r.docs.includes(doc)) continue;
    const s = o.snaps?.[r.snap];
    if (!s) continue;
    const sig = docSig(asOrder(s, o), doc);
    const last = out[out.length - 1];
    if (last && last.sig === sig) continue;
    out.push({ v: out.length + 1, at: r.at, to: r.to, snap: r.snap, sig, rec: r.id });
  }
  return out;
}

/** 这条记录里每份单据是第几版 */
export function recordVersions(o: Order, r: SendRecord): Record<string, number> {
  const res: Record<string, number> = {};
  for (const d of r.docs) {
    const vs = docVersions(o, d as DocKey);
    const s = o.snaps?.[r.snap];
    if (!s) continue;
    const sig = docSig(asOrder(s, o), d as DocKey);
    // 同内容的版本里，取发出时间不晚于这条记录的最后一个
    const hit = [...vs].reverse().find((v) => v.sig === sig && v.at <= r.at);
    if (hit) res[d] = hit.v;
  }
  return res;
}

/* ---------------- 对比 ---------------- */

export interface Change {
  /** 中文说明，如「第 1 行 AL-H500 · 数量」 */
  label: string;
  /** 英文说明（发给客户的改版说明用）；没有的不写进英文说明 */
  en?: string;
  from: string;
  to: string;
  kind: 'mod' | 'add' | 'del';
}

const ITEM_CN: Record<string, string> = {
  model: '型号', nameEn: '品名', nameCn: '中文品名', spec: '规格', hs: 'HS 编码', unit: '单位', qty: '数量', price: '单价',
  pcsPerCtn: '每箱装', l: '箱长', w: '箱宽', h: '箱高', nw: '每箱净重', gw: '每箱毛重', elements: '申报要素', cost: '采购单价',
};
const ITEM_EN: Record<string, string> = {
  model: 'model', nameEn: 'description', spec: 'specification', unit: 'unit', qty: 'quantity', price: 'unit price', hs: 'HS code',
  pcsPerCtn: 'packing', l: 'carton length', w: 'carton width', h: 'carton height', nw: 'N.W. per carton', gw: 'G.W. per carton',
};
const FIELD_EN: Record<string, string> = {
  'terms.incoterm': 'Trade term', 'terms.place': 'Named place', 'terms.currency': 'Currency', 'terms.paymentText': 'Payment terms',
  'terms.pol': 'Port of loading', 'terms.pod': 'Port of destination', 'terms.leadTime': 'Lead time', 'terms.shipment': 'Time of shipment',
  'terms.partial': 'Partial shipment', 'terms.transship': 'Transshipment', 'terms.insurance': 'Insurance', 'terms.packing': 'Packing',
  'terms.deliveryAddress': 'Delivery address', 'terms.transport': 'Transport',
  'numbers.validUntil': 'Validity', 'numbers.date': 'Date', 'numbers.po': 'PO No.', 'numbers.pi': 'PI No.', 'numbers.contract': 'Contract No.',
  'numbers.ci': 'Invoice No.', 'numbers.quote': 'Quotation No.',
  'buyer.name': 'Buyer', 'buyer.address': 'Buyer address', 'buyer.contact': 'Contact', 'buyer.phone': 'Phone', 'buyer.email': 'Email',
  'buyer.tax': 'Tax ID', 'buyer.notify': 'Notify party',
  'shipping.vessel': 'Vessel / voyage', 'shipping.blNo': 'B/L No.', 'shipping.etd': 'ETD', 'shipping.eta': 'ETA', 'shipping.container': 'Container No.',
  'shipping.seal': 'Seal No.', 'shipping.marks': 'Shipping marks', 'shipping.origin': 'Origin', 'shipping.consigneeMode': 'Consignee',
  'shipping.notify': 'Notify party', 'shipping.freight': 'Freight', 'shipping.blType': 'B/L type', 'shipping.equipment': 'Container type',
  'docset.remarks': 'Remarks', 'docset.statement': 'Remarks', 'docset.clauses': 'Terms and conditions',
  po: 'PO No.', marks: 'Shipping marks', side: 'Side marks',
};
/** 不算改版的字段：样式、内部标记、由其它字段生成的 */
const IGNORE = new Set(['terms.paymentManual', 'terms.payment', 'terms.payDeposit', 'terms.payBalanceAt', 'terms.payDays', 'terms.payCustom', 'docset.theme', 'docset.stamp']);
const EXTRA_CN: Record<string, string> = {
  'shipping.side': '侧唛', 'shipping.boxes': '多柜明细', 'shipping.cutoff': '截关时间', forwarder: '货代', 'pkg.mode': '外包装方式', 'pkg.count': '总件数',
  'pkg.tare': '每件自重', 'pkg.unit': '包装单位', 'pkg.sizes': '每件尺寸', 'docset.statement': '发票 / 箱单注明',
  po: '客户 PO 号', marks: '唛头', side: '侧唛', date: '单据日期', factory: '默认工厂',
};
const PO_CN: Record<string, string> = { no: '采购单号', delivery: '交货日期', payment: '付款方式', note: '备注' };

function labelOf(path: string, o: Order): string {
  if (EXTRA_CN[path]) return EXTRA_CN[path];
  const po = path.match(/^purchase\.pos\.[^.]*\.(\w+)$/);
  if (po) return PO_CN[po[1]] ?? path;
  for (const st of Object.values(STEPS)) for (const f of st.fields ?? []) if (f.kind === 'field' && f.path === path) return dyn(f.label, o).replace(/（[^）]*）$/, '');
  return path;
}

const show = (v: unknown): string => {
  if (v == null || v === '') return '（空）';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v).replace(/\s*\n\s*/g, ' / ');
  return s.length > 80 ? s.slice(0, 78) + '…' : s;
};

function flat(obj: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flat(v, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = obj;
  return out;
}

const OPTION_TEXT: Record<string, Record<string, string>> = {
  'shipping.consigneeMode': { buyer: '同买方', order: 'TO ORDER', custom: '自定义' },
  'shipping.notifyMode': { auto: '自动', buyer: '同买方', custom: '自定义' },
  'shipping.blType': { original: '正本提单', telex: '电放', seaway: '海运单' },
  'pkg.mode': { ctns: '散箱', pallet: '托盘', case: '木箱', other: '其他' },
};

/** 比较两个版本某份单据用到的数据：返回逐项改动（货物按行 id 对应，新增 / 删除整行列出） */
export function diffDoc(prev: Order, cur: Order, doc: DocKey): Change[] {
  const a = project(prev, doc) as Record<string, unknown>;
  const b = project(cur, doc) as Record<string, unknown>;
  const out: Change[] = [];

  // 货物
  const ia = (a.items ?? []) as Record<string, unknown>[];
  const ib = (b.items ?? []) as Record<string, unknown>[];
  const rowName = (it: Record<string, unknown>) => String(it.model || it.nameEn || it.nameCn || '').trim();
  ib.forEach((it, i) => {
    const old = ia.find((x) => x.id === it.id);
    const name = rowName(it);
    if (!old) {
      out.push({ kind: 'add', label: `新增第 ${i + 1} 行 ${name}`, en: `Added item ${name}`, from: '', to: `${show(it.nameEn)} · ${int(Number(it.qty) || 0)} ${it.unit ?? ''}${doc === 'pl' || !('price' in it) ? '' : ` @ ${it.price}`}` });
      return;
    }
    for (const k of Object.keys(ITEM_CN)) {
      if (!(k in it) && !(k in old)) continue;
      if (String(old[k] ?? '') === String(it[k] ?? '')) continue;
      const fmt = (v: unknown) => ((k === 'price' || k === 'cost') && v !== '' && v != null && !Number.isNaN(Number(v)) ? money(Number(v)) : show(v));
      out.push({ kind: 'mod', label: `第 ${i + 1} 行 ${name} · ${ITEM_CN[k]}`, en: ITEM_EN[k] && `${ITEM_EN[k][0].toUpperCase() + ITEM_EN[k].slice(1)} of ${name}`, from: fmt(old[k]), to: fmt(it[k]) });
    }
    if (String(old.mix ?? '') !== String(it.mix ?? '')) out.push({ kind: 'mod', label: `第 ${i + 1} 行 ${name} · 混装`, from: old.mix ? '混装' : '单独装箱', to: it.mix ? '混装' : '单独装箱' });
  });
  for (const old of ia) if (!ib.some((x) => x.id === old.id)) out.push({ kind: 'del', label: `删除 ${rowName(old)}`, en: `Removed item ${rowName(old)}`, from: `${show(old.nameEn)} · ${int(Number(old.qty) || 0)} ${old.unit ?? ''}`, to: '' });

  // 合同条款
  if ('clauses' in b) {
    const ca = (a.clauses ?? []) as { id: string; title: string; body: string; on: boolean }[];
    const cb = (b.clauses ?? []) as typeof ca;
    for (const c of cb) {
      const old = ca.find((x) => x.id === c.id);
      if (!old) { if (c.on) out.push({ kind: 'add', label: `新增条款「${c.title}」`, en: `Added clause "${c.title}"`, from: '', to: show(c.body) }); continue; }
      if (old.on !== c.on) out.push({ kind: c.on ? 'add' : 'del', label: `条款「${c.title}」`, en: `Clause "${c.title}"`, from: old.on ? '有' : '无', to: c.on ? '有' : '无' });
      else if (c.on && (old.title !== c.title || old.body !== c.body)) out.push({ kind: 'mod', label: `条款「${c.title}」`, en: `Clause "${c.title}"`, from: show(old.body), to: show(c.body) });
    }
    for (const old of ca) if (old.on && !cb.some((x) => x.id === old.id)) out.push({ kind: 'del', label: `删除条款「${old.title}」`, en: `Removed clause "${old.title}"`, from: show(old.body), to: '' });
  }

  // 混装箱、外包装尺寸、多柜明细：只说有改动
  const sameJson = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  if (!sameJson(a.packs, b.packs) && ((a.packs as unknown[])?.length || (b.packs as unknown[])?.length)) out.push({ kind: 'mod', label: '混装箱（箱数、毛重、箱规）', en: 'Mixed carton packing', from: '…', to: '已改动' });

  // 其它字段
  const skip = (p: string) => p.startsWith('items') || p.startsWith('clauses') || p.startsWith('packs') || IGNORE.has(p);
  const fa = flat(Object.fromEntries(Object.entries(a).filter(([k]) => !['items', 'clauses', 'packs'].includes(k))));
  const fb = flat(Object.fromEntries(Object.entries(b).filter(([k]) => !['items', 'clauses', 'packs'].includes(k))));
  for (const p of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
    if (skip(p)) continue;
    const x = fa[p], y = fb[p];
    if (Array.isArray(x) || Array.isArray(y)) {
      if (!sameJson(x, y)) out.push({ kind: 'mod', label: labelOf(p, cur), en: FIELD_EN[p], from: '…', to: '已改动' });
      continue;
    }
    if (String(x ?? '') === String(y ?? '')) continue;
    if (p === 'factory') { out.push({ kind: 'mod', label: '默认工厂', from: x ? '原工厂' : '（未选）', to: y ? '已更换' : '（未选）' }); continue; }
    if (p === 'forwarder') { out.push({ kind: 'mod', label: '货代', from: x ? '原货代' : '（未选）', to: y ? '已更换' : '（未选）' }); continue; }
    const opt = OPTION_TEXT[p];
    out.push({ kind: 'mod', label: labelOf(p, cur), en: FIELD_EN[p], from: show(opt?.[String(x)] ?? x), to: show(opt?.[String(y)] ?? y) });
  }
  return out;
}

const COMMERCIAL: DocKey[] = ['quote', 'pi', 'contract', 'ci', 'customs'];
const PACKING: DocKey[] = ['pl', 'booking', 'si', 'advice', 'isf', 'customs', 'labels', 'marks'];

/** 合计的变化：金额（商务单据）、件数 / 毛重 / 体积（装箱、物流单据） */
export function totalChanges(prev: Order, cur: Order, doc: DocKey): Change[] {
  const out: Change[] = [];
  const ka = calcOrder(prev), kb = calcOrder(cur);
  if (COMMERCIAL.includes(doc) && (ka.amount !== kb.amount || prev.terms.currency !== cur.terms.currency))
    out.push({ kind: 'mod', label: '总金额', en: 'Total amount', from: `${prev.terms.currency} ${money(ka.amount)}`, to: `${cur.terms.currency} ${money(kb.amount)}` });
  if (doc === 'po') {
    const ca = profitOf(prev).cost, cb = profitOf(cur).cost;
    if (money(ca) !== money(cb)) out.push({ kind: 'mod', label: '采购总金额', from: `¥${money(ca)}`, to: `¥${money(cb)}` });
    if (ka.qty !== kb.qty) out.push({ kind: 'mod', label: '总数量', from: int(ka.qty), to: int(kb.qty) });
  }
  if (COMMERCIAL.includes(doc) && ka.qty !== kb.qty) out.push({ kind: 'mod', label: '总数量', en: 'Total quantity', from: int(ka.qty), to: int(kb.qty) });
  if (PACKING.includes(doc)) {
    const pa = pkgSummary(prev, ka), pb = pkgSummary(cur, kb);
    if (pa.count !== pb.count || pa.unitEn !== pb.unitEn) out.push({ kind: 'mod', label: '总件数', en: 'Total packages', from: `${pa.count} ${pa.unitEn}`, to: `${pb.count} ${pb.unitEn}` });
    if (fixed(pa.gw, 2) !== fixed(pb.gw, 2)) out.push({ kind: 'mod', label: '总毛重', en: 'Total G.W.', from: `${fixed(pa.gw, 2)} kg`, to: `${fixed(pb.gw, 2)} kg` });
    if (fixed(pa.cbm, 3) !== fixed(pb.cbm, 3)) out.push({ kind: 'mod', label: '总体积', en: 'Total measurement', from: `${fixed(pa.cbm, 3)} m³`, to: `${fixed(pb.cbm, 3)} m³` });
  }
  return out;
}

/* ---------------- 改版说明 ---------------- */

const DOC_EN: Record<DocKey, string> = {
  quote: 'Quotation', pi: 'Proforma Invoice', contract: 'Sales Contract', po: 'Purchase Order', co: 'Certificate of Origin application', ci: 'Commercial Invoice', pl: 'Packing List', customs: 'customs documents',
  marks: 'Shipping Marks', labels: 'carton labels', booking: 'Booking Note', si: 'Shipping Instruction', advice: 'Shipping Advice', isf: 'ISF information',
};
/** 发给客户的单据默认写英文说明，其它（工厂、货代、报关行）写中文 */
export const noteLang = (doc: DocKey): 'en' | 'zh' => (['quote', 'pi', 'contract', 'ci', 'pl', 'advice', 'isf'].includes(doc) ? 'en' : 'zh');

export function changeNote(o: Order, doc: DocKey, changes: Change[], lang: 'en' | 'zh', version?: number): string {
  const no = docFile(o, doc);
  if (lang === 'zh') {
    const lines = changes.map((c, i) => `${i + 1}. ${c.label}：${c.kind === 'add' ? '新增 ' + c.to : c.kind === 'del' ? '删除（原 ' + c.from + '）' : `${c.from} → ${c.to}`}`);
    return `${DOCNAMES[doc]}（${no}）${version ? `第 ${version} 版` : ''}改动如下：\n${lines.join('\n')}\n\n其余内容不变，请以最新版本为准，谢谢！`;
  }
  const first = (o.buyer.contact || 'Sir/Madam').split(/\s+/)[0];
  const en = changes.filter((c) => c.en);
  const lines = en.map((c) => (c.kind === 'add' ? `- ${c.en}: ${c.to}` : c.kind === 'del' ? `- ${c.en}` : `- ${c.en} changed from ${c.from} to ${c.to}`));
  const others = changes.length - en.length;
  return `Dear ${first},\n\nPlease note the following changes in our ${DOC_EN[doc]} No. ${no}${version ? ` (Rev. ${version})` : ''}:\n${lines.join('\n')}${others ? `\n- Other details updated (${others} item${others > 1 ? 's' : ''})` : ''}\n\nAll other terms remain unchanged. Please find the revised ${DOC_EN[doc]} attached and confirm at your convenience.\n\nBest regards,\n${o.seller.name}`;
}


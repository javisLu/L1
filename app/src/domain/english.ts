import type { DocKey } from '../modules/defs';
import type { Order } from './types';

/**
 * 英文单据（M4-4）：报价单、PI、发票、箱单是发给客户的，上面不能有中文。
 * 模板本身全是英文；会出中文的是用户在格子里填的内容（条款、备注、品名、单位、交期……）。
 * 这里找出会印到单据上的中文，常见的贸易条款写法按内置译法翻成英文（离线，不用 AI），翻不了的列出来手工改。
 */

export const hasCn = (s: unknown) => /[一-龥　-〿！-～]/.test(String(s ?? ''));

export const EN_DOCS: DocKey[] = ['quote', 'pi', 'ci', 'pl'];

export interface CnField { path: string; label: string; text: string; docs: DocKey[] }

type Src = { path: string; label: string; docs: DocKey[] };
const ALL = EN_DOCS;
const QP: DocKey[] = ['quote', 'pi'];
const CIPL: DocKey[] = ['ci', 'pl'];

/** 这四份单据上印出来的字段（按单据） */
const FIELDS: Src[] = [
  { path: 'seller.name', label: '我司英文名称', docs: ALL }, { path: 'seller.address', label: '我司地址', docs: ALL },
  { path: 'seller.bank', label: '收款银行信息', docs: QP },
  { path: 'buyer.name', label: '买方名称', docs: ALL }, { path: 'buyer.address', label: '买方地址', docs: ALL }, { path: 'buyer.contact', label: '买方联系人', docs: ALL },
  { path: 'terms.place', label: '贸易术语地点', docs: [...QP, 'ci'] }, { path: 'terms.paymentText', label: '付款条款', docs: [...QP, 'ci'] },
  { path: 'terms.leadTime', label: '交期', docs: QP }, { path: 'terms.pol', label: '装运港', docs: ALL }, { path: 'terms.pod', label: '目的港', docs: ALL },
  { path: 'terms.deliveryAddress', label: '交货地址', docs: ALL },
  { path: 'docset.remarks', label: '备注', docs: QP }, { path: 'docset.clauses', label: '报价单 / PI 条款', docs: QP },
  { path: 'docset.statement', label: '发票 / 箱单注明', docs: CIPL },
  { path: 'shipping.vessel', label: '船名航次', docs: CIPL }, { path: 'shipping.marks', label: '唛头', docs: CIPL }, { path: 'shipping.origin', label: '原产地', docs: ['ci'] },
  { path: 'shipping.container', label: '柜号', docs: CIPL },
];
const ITEM_FIELDS: { key: 'nameEn' | 'spec' | 'unit' | 'model'; label: string; docs: DocKey[] }[] = [
  { key: 'nameEn', label: '英文品名', docs: ALL }, { key: 'spec', label: '规格', docs: QP }, { key: 'unit', label: '单位', docs: ALL }, { key: 'model', label: '型号', docs: ALL },
];

const get = (o: Order, p: string): string => String(p.split('.').reduce<unknown>((a, k) => (a == null ? a : (a as Record<string, unknown>)[k]), o) ?? '');

/** 会印到这份单据（不传 = 四份里任何一份）上的中文 */
export function cnFields(o: Order, doc?: DocKey): CnField[] {
  const out: CnField[] = [];
  for (const f of FIELDS) {
    if (doc && !f.docs.includes(doc)) continue;
    const v = get(o, f.path);
    if (hasCn(v)) out.push({ path: f.path, label: f.label, text: v, docs: f.docs });
  }
  o.items.forEach((it, i) => {
    for (const f of ITEM_FIELDS) {
      if (doc && !f.docs.includes(doc)) continue;
      const v = String(it[f.key] ?? '');
      if (hasCn(v)) out.push({ path: `items.${i}.${f.key}`, label: `第 ${i + 1} 行${f.label}`, text: v, docs: f.docs });
    }
  });
  return out;
}

/* ---------- 常见写法的英文译法 ---------- */

const UNIT: Record<string, string> = { 件: 'PCS', 个: 'PCS', 只: 'PCS', 套: 'SETS', 台: 'UNITS', 箱: 'CTNS', 双: 'PAIRS', 卷: 'ROLLS', 米: 'M', 千克: 'KGS', 公斤: 'KGS', 吨: 'TONS', 包: 'BAGS', 张: 'SHEETS', 条: 'PCS', 把: 'PCS', 打: 'DOZ', 盒: 'BOXES', 瓶: 'BOTTLES', 桶: 'DRUMS' };
const PAYER: Record<string, string> = { 买方: 'the Buyer', 客户: 'the Buyer', 卖方: 'the Seller', 我方: 'the Seller', 双方: 'both parties' };
const days = (unit: string) => (/工作/.test(unit) ? 'working days' : 'days');

/** 一句一句匹配；整句都认出来才算翻译成功 */
const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(?:本)?(?:报价|价格)(?:单)?有效期(?:为)?(\d+)天$/, (m) => `Prices are valid for ${m[1]} days.`],
  [/^(?:本)?报价(?:单)?有效期至(\d{4}[-./年]\d{1,2}[-./月]\d{1,2})日?$/, (m) => `This quotation is valid until ${m[1].replace(/[年月]/g, '-')}.`],
  [/^以上价格(?:为|按)?(EXW|FCA|FOB|CFR|CIF|CPT|CIP|DAP|DDP)\s*([A-Za-z一-龥]*?)(?:价格?|条款)?$/i, (m) => `Prices above are quoted on ${m[1].toUpperCase()}${m[2] ? ' ' + cityEn(m[2]) : ''} basis.`],
  [/^(?:以上)?价格(?:可能)?(?:会)?随原材料(?:价格)?(?:波动|变化|上涨)(?:而)?(?:调整|变动)$/, () => 'Prices are subject to change with raw material costs.'],
  [/^(?:以上)?价格不含运费$/, () => 'Prices above exclude freight.'],
  [/^(?:交货期|交期|货期)[:：]?(?:为)?(?:收到定金后)?(\d+)(?:[-~至到](\d+))?(?:个)?(工作日|天)(?:内)?$/, (m) => `Delivery time: ${m[1]}${m[2] ? '-' + m[2] : ''} ${days(m[3])} after receipt of deposit.`],
  [/^收到(?:定金|预付款)后(\d+)(?:[-~至到](\d+))?(?:个)?(工作日|天)(?:内)?(?:交货|发货|出货)$/, (m) => `Delivery within ${m[1]}${m[2] ? '-' + m[2] : ''} ${days(m[3])} after receipt of deposit.`],
  [/^(\d+)(?:[-~至到](\d+))?(?:个)?(工作日|天)$/, (m) => `${m[1]}${m[2] ? '-' + m[2] : ''} ${days(m[3])}`],
  [/^(\d+)%(?:定金|预付款?)[,，、]?\s*(?:余款|尾款|余额)?(\d+)%\s*(?:余款|尾款|余额)?\s*(?:在)?(发货前|出货前|装运前|见提单副本|提单副本|到港前)(?:付清|支付)?$/, (m) => `${m[1]}% T/T deposit in advance, ${m[2]}% balance ${/提单/.test(m[3]) ? 'against copy of B/L' : /到港/.test(m[3]) ? 'before arrival' : 'before shipment'}.`],
  [/^付款方式[:：]?\s*(T\/T|L\/C|D\/P|D\/A|西联|PayPal)(?:电汇)?$/i, (m) => `Payment: ${m[1].replace('西联', 'Western Union')}.`],
  [/^(?:质量)?(?:异议|索赔)(?:须|应|需)?(?:在)?(?:收货|收到货物|货到)后(\d+)天内(?:以书面形式)?提出$/, (m) => `Any quality claim must be raised within ${m[1]} days after receipt of goods.`],
  [/^(?:货物)?(?:售出|一经售出)?(?:概)?不(?:接受|予)?退(?:换|货)$/, () => 'Goods sold are not returnable.'],
  [/^(?:因)?不可抗力(?:造成的)?(?:延误|延迟)?(?:双方)?(?:均)?不(?:承担|负)责任?$|^不可抗力条款$/, () => 'Neither party shall be liable for delays caused by force majeure.'],
  [/^样品免费[,，]?\s*(?:快递)?运费(?:由)?(买方|客户)(?:承担|支付|负责)$/, () => 'Samples are free of charge; courier cost is borne by the Buyer.'],
  [/^(?:银行)?(?:手续)?费(?:用)?(?:由)?(买方|客户|卖方|我方)(?:承担|支付|负责)$/, (m) => `Bank charges are borne by ${PAYER[m[1]]}.`],
  [/^(?:银行)?(?:手续)?费(?:用)?(?:由)?双方各自承担$|^各自承担(?:本国|己方)?银行费用$/, () => 'Each party bears its own bank charges.'],
  [/^(?:数量)?(?:允许)?(?:溢短装|上下浮动|增减)(\d+)%$/, (m) => `Quantity tolerance of ±${m[1]}% is allowed.`],
  [/^(?:最小)?起订量[:：]?\s*(\d+)\s*([一-龥]|PCS|SETS)?$/i, (m) => `MOQ: ${m[1]} ${m[2] ? UNIT[m[2]] ?? m[2].toUpperCase() : 'PCS'}.`],
  [/^(?:包装)[:：]?\s*出口标准纸箱(?:包装)?$/, () => 'Packing: export standard cartons.'],
  [/^(?:包装)[:：]?\s*(?:打)?托盘(?:包装)?$/, () => 'Packing: on pallets.'],
  [/^中性包装$/, () => 'Neutral packing.'],
  [/^(?:不含|无|没有)木质包装(?:材料)?$/, () => 'NO WOOD PACKING MATERIAL IS USED.'],
  [/^原产地[:：]?\s*中国$|^中国(?:制造|原产)$/, () => 'Origin: China.'],
  [/^中国$/, () => 'CHINA'],
  [/^(?:运费|海运费)(?:由)?(买方|客户|卖方|我方)(?:承担|支付|负责)$/, (m) => `Freight is paid by ${PAYER[m[1]]}.`],
  [/^(?:保险|保险费)(?:由)?(买方|客户|卖方|我方)(?:负责|办理|承担)$/, (m) => `Insurance to be covered by ${PAYER[m[1]]}.`],
  [/^(?:唛头)(?:由)?(买方|客户)提供$/, () => 'Shipping marks to be provided by the Buyer.'],
  [/^(?:不)?允许分批(?:装运)?$/, (m) => `Partial shipment ${m[0].startsWith('不') ? 'not ' : ''}allowed.`],
  [/^(?:不)?允许转运$/, (m) => `Transshipment ${m[0].startsWith('不') ? 'not ' : ''}allowed.`],
  [/^(?:货物)?(?:出货|发货|装运)前(?:我方|我司)?(?:验货|检验)$|^货物经检验合格后(?:发货|出货)$/, () => 'Goods are inspected before shipment.'],
  [/^(?:争议|纠纷)(?:提交|由)?(?:中国国际经济贸易仲裁委员会|仲裁)(?:仲裁|解决)?$/, () => 'Any dispute shall be submitted to CIETAC for arbitration.'],
  [/^(?:本)?(?:报价单|合同|形式发票)(?:经)?双方签字(?:盖章)?后生效$/, (m) => `This ${/合同/.test(m[0]) ? 'contract' : /报价/.test(m[0]) ? 'quotation' : 'proforma invoice'} becomes effective upon signature of both parties.`],
];

/** 港口 / 城市常见中文名 */
const CITY: Record<string, string> = { 青岛: 'QINGDAO', 上海: 'SHANGHAI', 宁波: 'NINGBO', 深圳: 'SHENZHEN', 广州: 'GUANGZHOU', 厦门: 'XIAMEN', 天津: 'TIANJIN', 大连: 'DALIAN', 连云港: 'LIANYUNGANG', 福州: 'FUZHOU', 义乌: 'YIWU', 南沙: 'NANSHA', 蛇口: 'SHEKOU', 盐田: 'YANTIAN' };
const cityEn = (s: string) => CITY[s.replace(/港$/, '')] ?? s.toUpperCase();

/** 一句中文 → 英文；认不出返回空 */
export function translateLine(raw: string): string {
  const s = raw.trim().replace(/[。.;；!！]+$/, '').replace(/^\s*(?:\d+[.、)]|[-•·])\s*/, '').trim();
  if (!s) return '';
  if (!hasCn(s)) return raw.trim();
  if (UNIT[s]) return UNIT[s];
  const port = s.match(/^(.+?)港?(?:[,，]\s*中国)?$/);
  if (port && CITY[port[1].replace(/港$/, '')]) return `${CITY[port[1].replace(/港$/, '')]}, CHINA`;
  for (const [re, fn] of RULES) {
    const m = s.match(re);
    if (m) return fn(m);
  }
  return '';
}

/** 多行文字逐句翻：返回译文和没翻出来的句子（没翻出来的保留原文） */
export function toEnglish(text: string): { text: string; left: string[] } {
  const left: string[] = [];
  const lines = String(text ?? '').split('\n').flatMap((l) => (hasCn(l) ? l.split(/(?<=[。；;])\s*/) : [l]));
  const out = lines.map((l) => {
    if (!hasCn(l)) return l;
    const t = translateLine(l);
    if (!t) left.push(l.trim());
    return t || l;
  });
  return { text: out.filter((x, i) => x.trim() || lines[i].trim() === '').join('\n'), left };
}

/** 一键翻成英文：能翻的字段直接改（在 immer 草稿上改）；返回改了几处、还剩哪些 */
export function translateOrder(o: Order, doc?: DocKey): { done: number; left: CnField[] } {
  let done = 0;
  for (const f of cnFields(o, doc)) {
    const r = toEnglish(f.text);
    if (r.text === f.text) continue;
    const ks = f.path.split('.');
    let a = o as unknown as Record<string, unknown>;
    for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]] as Record<string, unknown>;
    a[ks[ks.length - 1]] = r.text;
    done++;
  }
  return { done, left: cnFields(o, doc) };
}

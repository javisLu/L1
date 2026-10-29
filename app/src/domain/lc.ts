import { calcOrder, money } from './calc';
import { freightOf } from './shipping';
import type { Order } from './types';

/**
 * 信用证审证（M4-3）：粘贴 MT700 电文，按栏目代号拆开，离线逐条和订单比对，
 * 列出单据要求、常见软条款，生成改证建议。只认电文文字；扫描件读不出。
 */

/** 常用栏目的英文名（银行打印件里代号后面常跟着这些字样，解析时去掉） */
export const LC_TAGS: Record<string, { en: string; cn: string }> = {
  '27': { en: 'Sequence of Total', cn: '页次' },
  '40A': { en: 'Form of Documentary Credit', cn: '信用证类型' },
  '20': { en: 'Documentary Credit Number', cn: '信用证号' },
  '23': { en: 'Reference to Pre-Advice', cn: '预通知编号' },
  '31C': { en: 'Date of Issue', cn: '开证日期' },
  '40E': { en: 'Applicable Rules', cn: '适用规则' },
  '31D': { en: 'Date and Place of Expiry', cn: '有效期和到期地点' },
  '51A': { en: 'Applicant Bank', cn: '开证申请人银行' },
  '51D': { en: 'Applicant Bank', cn: '开证申请人银行' },
  '50': { en: 'Applicant', cn: '开证申请人' },
  '59': { en: 'Beneficiary', cn: '受益人' },
  '32B': { en: 'Currency Code, Amount', cn: '币种和金额' },
  '39A': { en: 'Percentage Credit Amount Tolerance', cn: '金额溢短装' },
  '39C': { en: 'Additional Amounts Covered', cn: '附加金额' },
  '41A': { en: 'Available With ... By ...', cn: '兑付银行和方式' },
  '41D': { en: 'Available With ... By ...', cn: '兑付银行和方式' },
  '42C': { en: 'Drafts at ...', cn: '汇票期限' },
  '42A': { en: 'Drawee', cn: '汇票付款人' },
  '42D': { en: 'Drawee', cn: '汇票付款人' },
  '42P': { en: 'Negotiation/Deferred Payment Details', cn: '延期付款' },
  '43P': { en: 'Partial Shipments', cn: '分批装运' },
  '43T': { en: 'Transhipment', cn: '转运' },
  '44A': { en: 'Place of Taking in Charge/Dispatch from .../Place of Receipt', cn: '接管地' },
  '44E': { en: 'Port of Loading/Airport of Departure', cn: '装运港' },
  '44F': { en: 'Port of Discharge/Airport of Destination', cn: '卸货港' },
  '44B': { en: 'Place of Final Destination/For Transportation to .../Place of Delivery', cn: '最终目的地' },
  '44C': { en: 'Latest Date of Shipment', cn: '最迟装运期' },
  '44D': { en: 'Shipment Period', cn: '装运期间' },
  '45A': { en: 'Description of Goods and/or Services', cn: '货物描述' },
  '46A': { en: 'Documents Required', cn: '单据要求' },
  '47A': { en: 'Additional Conditions', cn: '附加条款' },
  '71D': { en: 'Charges', cn: '费用' },
  '71B': { en: 'Charges', cn: '费用' },
  '48': { en: 'Period for Presentation in Days', cn: '交单期' },
  '49': { en: 'Confirmation Instructions', cn: '保兑指示' },
  '53A': { en: 'Reimbursing Bank', cn: '偿付行' },
  '78': { en: 'Instructions to the Paying/Accepting/Negotiating Bank', cn: '给付款行的指示' },
  '57A': { en: "'Advise Through' Bank", cn: '通知行' },
  '57D': { en: "'Advise Through' Bank", cn: '通知行' },
  '72Z': { en: 'Sender to Receiver Information', cn: '附言' },
};

export type LcFields = Record<string, string>;

/** 按栏目代号拆电文：支持原始电文（:31D:261130CHINA）和银行打印件（31D: Date and Place of Expiry 换行 261130 CHINA） */
/** 订单里贴过信用证电文时的信用证号（:20:），印在发票、箱单上 */
export const lcNoOf = (o: Pick<Order, 'lc'>): string => (o.lc?.text?.trim() ? (parseMT700(o.lc.text)['20'] ?? '').trim() : '');

export function parseMT700(text: string): LcFields {
  const out: LcFields = {};
  let cur = '';
  for (const raw of splitTags(String(text ?? '').replace(/\r/g, '')).split('\n')) {
    const m = raw.match(/^\s*:?(\d{2}[A-Z]?)\s*:\s?(.*)$/);
    if (m && LC_TAGS[m[1]]) {
      cur = m[1];
      let v = m[2].trim();
      const label = LC_TAGS[cur].en.toLowerCase();
      if (v.toLowerCase().startsWith(label)) v = v.slice(label.length).replace(/^\s*[:：-]?\s*/, '');
      out[cur] = v;
      continue;
    }
    if (cur && raw.trim()) out[cur] = out[cur] ? `${out[cur]}\n${raw.trim()}` : raw.trim();
  }
  for (const k of Object.keys(out)) out[k] = out[k].trim();
  return out;
}

const TAG_ALT = Object.keys(LC_TAGS).sort((a, b) => b.length - a.length).join('|');
/** 带冒号前缀的代号（:31D:）在哪都算；不带前缀的（31D:）要前后有空白，免得把正文里的时间之类当成代号 */
const TAG_COLON = new RegExp(`(^|\\s):(${TAG_ALT}):`, 'g');
const TAG_BARE = new RegExp(`(^|\\s)(${TAG_ALT}):(?=\\s)`, 'g');
/** 粘贴时换行丢了、整段连成一行：在每个栏目代号前补上换行 */
export const splitTags = (t: string) => t.replace(TAG_COLON, '$1\n:$2:').replace(TAG_BARE, '$1\n$2:');

/** 31D 的到期地点：去掉日期和 DATE / PLACE 这些字样，「261130 IN CHINA」「DATE 231031 PLACE IN CHINA」都取出 CHINA */
export const expiryPlace = (s: string) =>
  String(s ?? '').replace(/\bDATE\b/i, ' ').replace(/\d{6}/, ' ').replace(/\bPLACE(\s+OF\s+EXPIRY)?\b/i, ' ').replace(/^\s*(IN|AT)\s+/i, '').replace(/\s+/g, ' ').trim();

/** 电文日期 YYMMDD → YYYY-MM-DD */
export function swiftDate(s: string): string {
  const m = String(s ?? '').match(/(\d{2})(\d{2})(\d{2})/);
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : '';
}

/** 32B：USD12345,67 / USD 12,345.67 → { cur, amount } */
export function parseAmount(s: string): { cur: string; amount: number } {
  const m = String(s ?? '').replace(/\s/g, '').match(/^([A-Z]{3})([\d.,]+)/);
  if (!m) return { cur: '', amount: 0 };
  let n = m[2];
  if (n.includes(',') && n.includes('.')) n = n.replace(/,/g, '');
  else if (/,\d{3}$/.test(n) && !/,\d{1,2}$/.test(n)) n = n.replace(/,/g, '');
  else n = n.replace(',', '.');
  return { cur: m[1], amount: parseFloat(n) || 0 };
}

/** 39A：10/10 → 上下浮动 % */
export function tolerance(s: string): { plus: number; minus: number } {
  const m = String(s ?? '').match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { plus: Number(m[1]), minus: Number(m[2]) } : { plus: 0, minus: 0 };
}

/** 43P / 43T → Allowed / Not Allowed / 原文 */
export function allowed(s: string): 'Allowed' | 'Not Allowed' | '' {
  const t = String(s ?? '').toUpperCase();
  if (/NOT\s+(ALLOWED|PERMITTED)|PROHIBITED/.test(t)) return 'Not Allowed';
  if (/ALLOWED|PERMITTED/.test(t)) return 'Allowed';
  return '';
}

/** 48 交单期天数（没写按 UCP600 默认 21 天） */
export const presentDays = (s?: string) => Number(String(s ?? '').match(/\d+/)?.[0] ?? 21) || 21;

const addDays = (d: string, n: number) => {
  const t = new Date(d + 'T00:00:00');
  t.setDate(t.getDate() + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
const dayDiff = (a: string, b: string) => Math.round((+new Date(a + 'T00:00:00') - +new Date(b + 'T00:00:00')) / 86400000);

/** 公司名比较：去掉 CO., LTD 这类后缀和标点后看主要单词是否都在 */
const CORP = /\b(CO|COMPANY|LTD|LIMITED|INC|CORP|CORPORATION|LLC|GMBH|PTE|PVT|S\.?A|APS|INDUSTRIAL|TRADING|IMPORT|EXPORT|THE|AND)\b/g;
export function sameParty(lcText: string, name: string): boolean {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(CORP, ' ').split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return true;
  const t = lcText.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ');
  return words.filter((w) => new RegExp(`\\b${w}\\b`).test(t)).length / words.length >= 0.7;
}

export type LcLevel = 'error' | 'warn' | 'ok' | 'info';
export interface LcFinding {
  level: LcLevel;
  area: string;
  text: string;
  /** 改证建议（英文，写进改证函） */
  amend?: string;
  /** 一键按信用证改订单 */
  fix?: { label: string; apply: (o: Order) => void };
}

/* ---------- 单据要求 ---------- */
export interface LcDoc {
  text: string;
  name: string;
  /** 软件能出的单据（模块名），或要另外办的说明 */
  how: string;
  can: boolean;
  copies: string;
}

const DOC_KINDS: { re: RegExp; name: string; how: string; can: boolean }[] = [
  { re: /COMMERCIAL\s+INVOICE/, name: '商业发票', how: '商业发票模块', can: true },
  { re: /PACKING\s+LIST|WEIGHT\s+(LIST|MEMO|NOTE)/, name: '装箱单', how: '箱单模块', can: true },
  { re: /BILLS?\s+OF\s+LADING|\bB\/L\b|MULTIMODAL\s+TRANSPORT\s+DOCUMENT/, name: '海运提单', how: '货代出；收发通、运费按订舱 / 提单模块备料', can: false },
  { re: /AIR\s*WAY\s*BILL|AWB/, name: '空运单', how: '货代 / 航空公司出', can: false },
  { re: /CERTIFICATE\s+OF\s+ORIGIN|FORM\s+[AEFPNRL]\b|RCEP/, name: '原产地证', how: '产地证模块备资料，海关 / 贸促会签发', can: true },
  { re: /INSURANCE\s+(POLICY|CERTIFICATE)/, name: '保险单', how: '向保险公司投保（或请货代代投保）', can: false },
  { re: /INSPECTION|CERTIFICATE\s+OF\s+(QUALITY|QUANTITY|WEIGHT|ANALYSIS)|\bSGS\b|\bINTERTEK\b|BUREAU\s+VERITAS/, name: '检验证书', how: '提前约检验机构；看清由谁出具', can: false },
  { re: /BENEFICIARY'?S?\s+CERTIFICATE|BENEFICIARY'?S?\s+STATEMENT/, name: '受益人证明', how: '自己出：按条款原文打印、签字盖章', can: false },
  { re: /SHIPPING\s+ADVICE|ADVICE\s+OF\s+SHIPMENT|SHIPMENT\s+ADVICE/, name: '装船通知', how: '订舱 / 提单模块的装船通知', can: true },
  { re: /FUMIGATION/, name: '熏蒸证书', how: '熏蒸公司出', can: false },
  { re: /PHYTOSANITARY|HEALTH\s+CERTIFICATE|SANITARY/, name: '植检 / 卫生证书', how: '海关出', can: false },
  { re: /CERTIFICATE\s+OF\s+CONFORMITY|\bCOC\b/, name: '符合性证书', how: '认证机构出', can: false },
  { re: /\bDRAFTS?\b|BILL\s+OF\s+EXCHANGE/, name: '汇票', how: '自己出（按 42C 期限）', can: false },
];

const COPY_WORDS: Record<string, string> = { DUPLICATE: '2', TRIPLICATE: '3', QUADRUPLICATE: '4', QUINTUPLICATE: '5' };

/** 46A 拆成每份单据（按 +、1)、1. 等开头分条） */
export function docsRequired(f: LcFields): LcDoc[] {
  // 一行里用「+」或「1)」连着写的单据也拆开
  const t = (f['46A'] ?? '').replace(/(^|\s)\+\s*(?=[A-Z0-9(])/g, '\n+').replace(/\s(?=\(?\d{1,2}\)\s)/g, '\n');
  if (!t.trim()) return [];
  const parts = t.split(/\n(?=\s*(?:\+|\d{1,2}[).]|\(\d{1,2}\)|-\s))/).map((x) => x.replace(/^\s*(?:\+|\d{1,2}[).]|\(\d{1,2}\)|-\s)\s*/, '').replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  return parts.map((p) => {
    const u = p.toUpperCase();
    const k = DOC_KINDS.find((d) => d.re.test(u));
    const c = u.match(/IN\s+(\d+|DUPLICATE|TRIPLICATE|QUADRUPLICATE|QUINTUPLICATE)\b/) ?? u.match(/(\d+)\s+(?:ORIGINALS?|COPIES|FOLD)/) ?? u.match(/FULL\s+SET/);
    const copies = !c ? '' : c[0].startsWith('FULL') ? '全套' : `${COPY_WORDS[c[1]] ?? c[1]} 份`;
    return { text: p, name: k?.name ?? '其他单据', how: k?.how ?? '看原文要求', can: !!k?.can, copies };
  });
}

/* ---------- 软条款 ---------- */
export interface SoftClause { name: string; why: string; amend: string; hit: string }

const SOFT: { re: RegExp; name: string; why: string; amend: string }[] = [
  { re: /(INSPECTION|QUALITY|CERTIFICATE)[^.;]{0,80}(ISSUED|SIGNED|COUNTERSIGNED|APPROVED)\s+BY\s+(THE\s+)?(APPLICANT|BUYER|OPENER)/, name: '证书要申请人（买方）签发或会签', why: '单据能不能交齐由买方说了算，买方不签就收不到钱', amend: 'Please delete the requirement that the inspection certificate be issued/signed by the applicant, or allow it to be issued by the beneficiary or an independent inspection company.' },
  { re: /(SUBJECT\s+TO|UPON|AFTER)\s+(THE\s+)?(APPLICANT'?S?|BUYER'?S?)\s+(APPROVAL|ACCEPTANCE|CONFIRMATION|CONSENT|NOTIFICATION)/, name: '以买方批准 / 通知为条件', why: '生效或付款取决于买方，信用证等于没保障', amend: 'Please delete the clause making the credit/payment subject to the applicant\'s approval or notification.' },
  { re: /(NOT\s+(YET\s+)?OPERATIVE|BECOME\s+OPERATIVE|EFFECTIVE\s+ONLY|WILL\s+BE\s+ACTIVATED)/, name: '信用证暂不生效', why: '要等开证行另行通知才生效，别急着备货', amend: 'Please make the credit operative upon issuance without further notification.' },
  { re: /(VESSEL|SHIPPING\s+COMPANY|CARRIER|FORWARDER)[^.;]{0,40}(TO\s+BE\s+)?(NOMINATED|DESIGNATED|APPROVED)\s+BY\s+(THE\s+)?(APPLICANT|BUYER)/, name: '船公司 / 货代由买方指定', why: '买方不指定就出不了货，交单可能逾期', amend: 'Please delete the requirement that the vessel/carrier be nominated by the applicant, or allow shipment by any carrier.' },
  { re: /(ORIGINAL\s+B\/L|ORIGINAL\s+BILLS?\s+OF\s+LADING|1\/3)[^.;]{0,80}(SENT|DISPATCHED|COURIERED|MAILED)\s+(DIRECT(LY)?\s+)?TO\s+(THE\s+)?(APPLICANT|BUYER)/, name: '部分正本提单直接寄买方', why: '买方拿到正本就能提货，可以不付款', amend: 'Please delete the clause requiring original B/L to be sent directly to the applicant; all originals should be presented to the bank.' },
  { re: /PAYMENT[^.;]{0,60}(AFTER|UPON)\s+(THE\s+)?(ARRIVAL|RECEIPT|INSPECTION|SALE)\s+OF\s+(THE\s+)?GOODS/, name: '货到 / 检验 / 卖出后才付款', why: '付款条件和交单无关，等于赊销', amend: 'Please amend the payment terms so that payment is made against presentation of complying documents.' },
  { re: /(APPLICANT'?S?|BUYER'?S?)\s+(SIGNATURE|COUNTERSIGNATURE|AUTHORIZATION)/, name: '单据要有买方签字', why: '买方不签字单据就不符', amend: 'Please delete the requirement of the applicant\'s signature on the documents.' },
];

export function softClauses(f: LcFields): SoftClause[] {
  const t = `${f['46A'] ?? ''}\n${f['47A'] ?? ''}`.toUpperCase().replace(/\s+/g, ' ');
  const out: SoftClause[] = [];
  for (const s of SOFT) {
    const m = t.match(s.re);
    if (m) {
      const at = Math.max(0, (m.index ?? 0) - 30);
      out.push({ name: s.name, why: s.why, amend: s.amend, hit: '…' + t.slice(at, at + 160).trim() + '…' });
    }
  }
  return out;
}

/* ---------- 与订单比对 ---------- */
const INCO = /\b(EXW|FCA|FAS|FOB|CFR|CNF|C&F|CIF|CPT|CIP|DAP|DPU|DDP)\b/;

export function reviewLc(o: Order, f: LcFields, today: string): LcFinding[] {
  const out: LcFinding[] = [];
  const add = (x: LcFinding) => out.push(x);
  const k = calcOrder(o);

  // 1. 类型、受益人、申请人
  if (f['40A'] && !/IRREVOCABLE/i.test(f['40A'])) add({ level: 'error', area: '信用证类型', text: `40A 是「${f['40A']}」，不是不可撤销信用证`, amend: 'Please issue the credit as IRREVOCABLE.' });
  if (f['59']) {
    if (!sameParty(f['59'], o.seller.name)) add({ level: 'error', area: '受益人', text: `59 受益人「${f['59'].split('\n')[0]}」和我司名称「${o.seller.name}」对不上`, amend: `Please amend the beneficiary to read: ${o.seller.name}, ${o.seller.address}.` });
    else add({ level: 'ok', area: '受益人', text: '59 受益人是我司' });
  }
  if (f['50'] && o.buyer.name && !sameParty(f['50'], o.buyer.name)) add({ level: 'warn', area: '申请人', text: `50 申请人「${f['50'].split('\n')[0]}」和订单客户「${o.buyer.name}」不一样，确认是不是同一家（或第三方开证）` });

  // 2. 金额
  if (f['32B']) {
    const a = parseAmount(f['32B']), tol = tolerance(f['39A'] ?? '');
    if (a.cur && a.cur !== o.terms.currency) add({ level: 'error', area: '金额', text: `32B 币种是 ${a.cur}，订单是 ${o.terms.currency}`, amend: `Please amend the currency to ${o.terms.currency}.` });
    else if (a.amount + 0.005 < k.amount * (1 - tol.minus / 100) && a.amount + 0.005 < k.amount)
      add({ level: 'error', area: '金额', text: `32B 金额 ${a.cur} ${money(a.amount)}，比订单 ${o.terms.currency} ${money(k.amount)} 少 ${money(k.amount - a.amount)}${tol.plus ? `（可溢装 ${tol.plus}%，上限 ${money(a.amount * (1 + tol.plus / 100))}）` : ''}`, amend: `Please increase the credit amount to ${o.terms.currency} ${money(k.amount)}.` });
    else add({ level: 'ok', area: '金额', text: `32B ${a.cur} ${money(a.amount)}，够订单金额 ${money(k.amount)}${tol.plus || tol.minus ? `；溢短装 +${tol.plus}% / -${tol.minus}%` : ''}` });
  }

  // 3. 日期：最迟装运期、有效期、交单期
  const latest = swiftDate(f['44C'] ?? ''), expiry = swiftDate(f['31D'] ?? '');
  const days = presentDays(f['48']);
  if (expiry && expiry < today) add({ level: 'error', area: '有效期', text: `31D 有效期 ${expiry} 已经过了` });
  const ready = o.shipping.etd || o.shipping.cargoReady;
  if (latest) {
    if (ready && ready > latest) add({ level: 'error', area: '装运期', text: `${o.shipping.etd ? '开船日期' : '货好时间'} ${ready} 晚于 44C 最迟装运期 ${latest}`, amend: `Please extend the latest date of shipment to ${ready.replace(/-/g, '/')} and the expiry date accordingly.` });
    else if (ready && dayDiff(latest, ready) <= 5) add({ level: 'warn', area: '装运期', text: `44C 最迟装运期 ${latest}，离${o.shipping.etd ? '开船' : '货好'}只有 ${dayDiff(latest, ready)} 天，船期一变就来不及` });
    else if (latest < today) add({ level: 'error', area: '装运期', text: `44C 最迟装运期 ${latest} 已经过了` });
    else add({ level: 'ok', area: '装运期', text: `44C 最迟装运期 ${latest}${ready ? `，本单${o.shipping.etd ? '开船' : '货好'} ${ready}` : '（订单还没填货好 / 开船日期）'}` });
  }
  if (latest && expiry) {
    const gap = dayDiff(expiry, latest);
    if (gap < 0) add({ level: 'error', area: '有效期', text: `31D 有效期 ${expiry} 早于最迟装运期 ${latest}`, amend: 'Please extend the expiry date to at least 15 days after the latest date of shipment.' });
    else if (gap < 10) add({ level: 'warn', area: '交单期', text: `有效期只比最迟装运期晚 ${gap} 天，开船后要在 ${gap} 天内交单（48 交单期 ${days} 天，以先到者为准）`, amend: 'Please extend the expiry date to allow at least 15 days for presentation after shipment.' });
    else add({ level: 'ok', area: '交单期', text: `开船后 ${days} 天内交单，且不晚于有效期 ${expiry}` });
  }
  const place = expiryPlace(f['31D'] ?? '');
  if (place && !/CHINA|中国|BENEFICIARY'?S?\s+COUNTRY/i.test(place)) add({ level: 'warn', area: '到期地点', text: `31D 到期地点是「${place}」，不在中国：单据要在有效期前寄到国外银行，实际交单时间更短`, amend: 'Please amend the place of expiry to CHINA.' });
  if (o.shipping.etd && latest && expiry) {
    const lastDay = addDays(o.shipping.etd, days);
    if (lastDay > expiry) add({ level: 'info', area: '交单', text: `按开船 ${o.shipping.etd} 算，最晚 ${expiry} 前交单（有效期比 ${days} 天交单期先到）` });
  }

  // 4. 港口、分批、转运
  const city = (s: string) => s.split(',')[0].trim().toUpperCase();
  const pol = f['44E'] ?? f['44A'] ?? '', pod = f['44F'] ?? f['44B'] ?? '';
  if (pol && o.terms.pol && !/ANY/i.test(pol) && !pol.toUpperCase().includes(city(o.terms.pol)))
    add({ level: 'warn', area: '装运港', text: `44E 装运港「${pol}」，订单是「${o.terms.pol}」`, amend: `Please amend the port of loading to ${city(o.terms.pol)}, CHINA (or ANY CHINESE PORT).` });
  if (pod && o.terms.pod && !/ANY/i.test(pod) && !pod.toUpperCase().includes(city(o.terms.pod)))
    add({ level: 'warn', area: '卸货港', text: `44F 卸货港「${pod}」，订单是「${o.terms.pod}」` });
  for (const [tag, key, cn] of [['43P', 'partial', '分批装运'], ['43T', 'transship', '转运']] as const) {
    const v = allowed(f[tag] ?? '');
    if (!v) continue;
    if (v !== o.terms[key]) add({
      level: 'warn', area: cn, text: `${tag} ${cn}「${v === 'Allowed' ? '允许' : '不允许'}」，订单写的是「${o.terms[key] === 'Allowed' ? '允许' : '不允许'}」`,
      amend: v === 'Not Allowed' && tag === '43T' ? 'Please amend transhipment to ALLOWED.' : undefined,
      fix: { label: '订单按信用证改', apply: (x) => void (x.terms[key] = v) },
    });
  }

  // 5. 货描：贸易术语、型号
  const goods = (f['45A'] ?? '').toUpperCase();
  if (goods) {
    const inc = goods.match(INCO)?.[1];
    const norm = inc === 'CNF' || inc === 'C&F' ? 'CFR' : inc;
    if (norm && norm !== o.terms.incoterm) add({ level: 'error', area: '贸易术语', text: `45A 写的是 ${inc}，订单是 ${o.terms.incoterm}`, amend: `Please amend the trade term in field 45A to ${o.terms.incoterm} ${o.terms.place.toUpperCase()}.` });
    const miss = o.items.filter((it) => it.model && !goods.includes(it.model.toUpperCase()));
    if (miss.length && miss.length < o.items.length) add({ level: 'warn', area: '货描', text: `45A 里没找到型号 ${miss.map((x) => x.model).join('、')}；发票货描要和 45A 一致` });
    add({ level: 'info', area: '货描', text: '发票上的货描要照 45A 写（品名、规格、数量、单价、贸易术语逐字一致），可以把 45A 原文复制到发票备注核对' });
  }

  // 6. 单据要求里的提单、保险
  for (const d of docsRequired(f)) {
    const u = d.text.toUpperCase();
    if (d.name === '海运提单') {
      if (/TO\s+(THE\s+)?ORDER/.test(u) && (o.shipping.consigneeMode ?? 'buyer') !== 'order')
        add({ level: 'warn', area: '提单收货人', text: '46A 要求提单「TO ORDER」（凭指示），订单的收货人现在是买方', fix: { label: '收货人改为 TO ORDER', apply: (x) => void (x.shipping.consigneeMode = 'order') } });
      const fr = u.match(/FREIGHT\s+(PREPAID|COLLECT)/)?.[1];
      if (fr && fr !== freightOf(o)) add({ level: 'warn', area: '运费', text: `46A 要求提单 FREIGHT ${fr}，按订单是 FREIGHT ${freightOf(o)}`, fix: { label: `运费改为 ${fr}`, apply: (x) => void (x.shipping.freight = fr as 'PREPAID' | 'COLLECT') } });
      if (/TELEX|SURRENDER/.test(u) === false && (o.shipping.blType ?? 'original') !== 'original' && /FULL\s+SET|ORIGINAL/.test(u))
        add({ level: 'warn', area: '提单类型', text: '信用证要正本提单，订单现在是电放 / 海运单', fix: { label: '改为正本提单', apply: (x) => void (x.shipping.blType = 'original') } });
    }
    if (d.name === '保险单' && !['CIF', 'CIP'].includes(o.terms.incoterm)) add({ level: 'warn', area: '保险', text: `46A 要保险单，订单是 ${o.terms.incoterm}（一般买方投保）`, amend: 'Please delete the insurance document requirement as the trade term is ' + o.terms.incoterm + '.' });
  }
  if (['CIF', 'CIP'].includes(o.terms.incoterm) && f['46A'] && !docsRequired(f).some((d) => d.name === '保险单'))
    add({ level: 'info', area: '保险', text: `${o.terms.incoterm} 成交，但 46A 没要保险单，确认是否还要投保` });

  // 7. 汇票期限、费用、保兑
  if (f['42C']) {
    const sight = /SIGHT/i.test(f['42C']) && !/\d+\s*DAYS/i.test(f['42C']);
    const usance = Number(f['42C'].match(/(\d+)\s*DAYS/i)?.[1] ?? 0);
    const want = Number(o.terms.payDays) || 0;
    if (sight && want) add({ level: 'info', area: '付款期限', text: `42C 是即期（AT SIGHT），订单写的是 ${want} 天远期，对我方更有利` });
    else if (usance && usance !== want) add({ level: 'warn', area: '付款期限', text: `42C 是 ${usance} 天远期，订单写的是${want ? ` ${want} 天` : '即期'}`, amend: want ? `Please amend the draft tenor to ${want} days.` : 'Please amend the drafts to be payable AT SIGHT.' });
  }
  if (f['71D'] || f['71B']) add({ level: 'info', area: '费用', text: `费用条款：${(f['71D'] ?? f['71B']).replace(/\n/g, ' ')}` });

  return out;
}

/** 改证函：英文，列出需要改的条款（给客户） */
export function amendmentText(o: Order, f: LcFields, findings: LcFinding[], soft: SoftClause[]): string {
  const items = [...findings.filter((x) => x.amend && (x.level === 'error' || x.level === 'warn')).map((x) => x.amend!), ...soft.map((s) => s.amend)];
  if (!items.length) return '';
  const first = (o.buyer.contact || 'Sir/Madam').split(/\s+/)[0];
  return `Dear ${first},\n\nThank you for your L/C No. ${f['20'] || '—'}${f['31C'] ? ` dated ${swiftDate(f['31C'])}` : ''}. After checking, please kindly amend the credit as follows:\n${items.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nAll other terms remain unchanged. Please let us have the amendment at your earliest convenience so that we can arrange shipment on time.\n\nBest regards,\n${o.seller.name}`;
}

/** 示例电文：按本单数据生成，故意放几处问题（装运期太紧、转运不允许、软条款），让用户看看审证结果 */
export function sampleMT700(o: Order, today = ''): string {
  const k = calcOrder(o);
  const yymmdd = (d: string) => d.replace(/^20(\d{2})-(\d{2})-(\d{2})$/, '$1$2$3');
  const base = o.shipping.etd || o.shipping.cargoReady || addDays(o.numbers.date || '2026-10-01', 30);
  const latest = addDays(base, -3);
  // 有效期别早于今天，免得示例一打开就是「已过期」
  const exp0 = addDays(latest, 15), expiry = today && exp0 < today ? addDays(today, 30) : exp0;
  const pol = (o.terms.pol.split(',')[0] || 'QINGDAO').toUpperCase(), pod = (o.terms.pod || 'DESTINATION').toUpperCase();
  const goods = o.items.map((it) => `${it.model} ${String(it.nameEn).toUpperCase()} ${it.qty} ${it.unit} AT ${o.terms.currency} ${it.price}/${it.unit}`).join('\n');
  return [
    ':27: 1/1', ':40A: IRREVOCABLE', `:20: LC${o.no.replace(/\D/g, '')}`, `:31C: ${yymmdd(o.numbers.date || '2026-10-01')}`, ':40E: UCP LATEST VERSION',
    `:31D: ${yymmdd(expiry)}CHINA`, `:50: ${o.buyer.name.toUpperCase()}\n${o.buyer.address.toUpperCase()}`, `:59: ${o.seller.name.toUpperCase()}\n${o.seller.address.toUpperCase()}`,
    `:32B: ${o.terms.currency}${k.amount.toFixed(2).replace('.', ',')}`, ':39A: 05/05', ':41D: ANY BANK IN CHINA BY NEGOTIATION', ':42C: AT SIGHT', ':42A: ISSUING BANK',
    ':43P: NOT ALLOWED', ':43T: NOT ALLOWED', `:44E: ${pol}, CHINA`, `:44F: ${pod}`, `:44C: ${yymmdd(latest)}`,
    `:45A: ${goods}\n${o.terms.incoterm} ${o.terms.place.toUpperCase()}`,
    `:46A: +SIGNED COMMERCIAL INVOICE IN 3 ORIGINALS\n+PACKING LIST IN 3 COPIES\n+FULL SET OF CLEAN ON BOARD OCEAN BILLS OF LADING MADE OUT TO ORDER, BLANK ENDORSED, MARKED FREIGHT ${freightOf(o)}, NOTIFY APPLICANT\n${['CIF', 'CIP'].includes(o.terms.incoterm) ? '+INSURANCE POLICY IN DUPLICATE FOR 110 PCT OF INVOICE VALUE\n' : ''}+CERTIFICATE OF ORIGIN ISSUED BY CCPIT\n+INSPECTION CERTIFICATE ISSUED AND SIGNED BY THE APPLICANT`,
    ':47A: +ALL DOCUMENTS MUST SHOW THE L/C NUMBER\n+A DISCREPANCY FEE OF USD 80.00 WILL BE DEDUCTED FOR EACH SET OF DISCREPANT DOCUMENTS',
    ':71D: ALL BANKING CHARGES OUTSIDE ISSUING BANK ARE FOR ACCOUNT OF BENEFICIARY', ':48: 21/DAYS AFTER THE DATE OF SHIPMENT', ':49: WITHOUT',
  ].join('\n');
}

import type { Order } from './types';

/**
 * 产地证资料（M2-4）：按目的国提示能用的原产地证书，生成申请资料单，照着在单一窗口填。
 * 协定清单只列已生效、把握大的；新协定生效或调整以海关 / 单一窗口为准（界面上有提示）。
 */

export interface CertDef {
  key: string;
  name: string;
  /** 证书上商品编码一般填 6 位（自贸协定） */
  hs6: boolean;
  /** 原产地标准常用写法（单一窗口里选） */
  criteria: string[];
  note?: string;
}

const FTA_CRIT = ['WO', 'PE', 'RVC', 'CTH', 'PSR'];

export const CERTS: Record<string, CertDef> = {
  general: { key: 'general', name: '一般原产地证（C/O）', hs6: false, criteria: ['P', 'W'], note: '所有国家都能办，不享受关税减免；客户清关或信用证要求时用。完全国产填 P，含进口料件填 W + 4 位品目号。' },
  rcep: { key: 'rcep', name: 'RCEP 原产地证明', hs6: true, criteria: ['WO', 'PE', 'CTC', 'RVC', 'ACU', 'DMI'] },
  asean: { key: 'asean', name: '中国-东盟 Form E', hs6: true, criteria: FTA_CRIT, note: '按区域价值成分（RVC）判定时要填 FOB 价。' },
  apta: { key: 'apta', name: '亚太贸易协定（APTA）', hs6: true, criteria: ['A', 'B', 'C', 'D'] },
  pakistan: { key: 'pakistan', name: '中国-巴基斯坦 Form P', hs6: true, criteria: FTA_CRIT },
  chile: { key: 'chile', name: '中国-智利 Form F', hs6: true, criteria: FTA_CRIT },
  newzealand: { key: 'newzealand', name: '中国-新西兰 Form N', hs6: true, criteria: FTA_CRIT },
  singapore: { key: 'singapore', name: '中国-新加坡原产地证书', hs6: true, criteria: FTA_CRIT },
  peru: { key: 'peru', name: '中国-秘鲁 Form R', hs6: true, criteria: FTA_CRIT },
  costarica: { key: 'costarica', name: '中国-哥斯达黎加 Form L', hs6: true, criteria: FTA_CRIT },
  iceland: { key: 'iceland', name: '中国-冰岛原产地证书', hs6: true, criteria: FTA_CRIT },
  switzerland: { key: 'switzerland', name: '中国-瑞士原产地证书', hs6: true, criteria: FTA_CRIT },
  korea: { key: 'korea', name: '中国-韩国原产地证书', hs6: true, criteria: FTA_CRIT },
  australia: { key: 'australia', name: '中国-澳大利亚原产地证书', hs6: true, criteria: FTA_CRIT },
  georgia: { key: 'georgia', name: '中国-格鲁吉亚原产地证书', hs6: true, criteria: FTA_CRIT },
  mauritius: { key: 'mauritius', name: '中国-毛里求斯原产地证书', hs6: true, criteria: FTA_CRIT },
  cambodia: { key: 'cambodia', name: '中国-柬埔寨原产地证书', hs6: true, criteria: FTA_CRIT },
  serbia: { key: 'serbia', name: '中国-塞尔维亚原产地证书', hs6: true, criteria: FTA_CRIT },
  nicaragua: { key: 'nicaragua', name: '中国-尼加拉瓜原产地证书', hs6: true, criteria: FTA_CRIT },
  ecuador: { key: 'ecuador', name: '中国-厄瓜多尔原产地证书', hs6: true, criteria: FTA_CRIT },
};

/** 国家 → 能用的协定证书（一般原产地证所有国家都能办，另外加上） */
const COUNTRIES: { cn: string; en: string[]; certs: string[] }[] = [
  { cn: '新加坡', en: ['singapore'], certs: ['singapore', 'rcep', 'asean'] },
  { cn: '马来西亚', en: ['malaysia'], certs: ['rcep', 'asean'] },
  { cn: '印度尼西亚', en: ['indonesia'], certs: ['rcep', 'asean'] },
  { cn: '泰国', en: ['thailand'], certs: ['rcep', 'asean'] },
  { cn: '越南', en: ['vietnam', 'viet nam'], certs: ['rcep', 'asean'] },
  { cn: '菲律宾', en: ['philippines'], certs: ['rcep', 'asean'] },
  { cn: '文莱', en: ['brunei'], certs: ['rcep', 'asean'] },
  { cn: '柬埔寨', en: ['cambodia'], certs: ['cambodia', 'rcep', 'asean'] },
  { cn: '老挝', en: ['laos', 'lao'], certs: ['rcep', 'asean', 'apta'] },
  { cn: '缅甸', en: ['myanmar', 'burma'], certs: ['rcep', 'asean'] },
  { cn: '日本', en: ['japan'], certs: ['rcep'] },
  { cn: '韩国', en: ['korea', 'south korea', 'republic of korea'], certs: ['korea', 'rcep', 'apta'] },
  { cn: '澳大利亚', en: ['australia'], certs: ['australia', 'rcep'] },
  { cn: '新西兰', en: ['new zealand'], certs: ['newzealand', 'rcep'] },
  { cn: '巴基斯坦', en: ['pakistan'], certs: ['pakistan'] },
  { cn: '智利', en: ['chile'], certs: ['chile'] },
  { cn: '秘鲁', en: ['peru'], certs: ['peru'] },
  { cn: '哥斯达黎加', en: ['costa rica'], certs: ['costarica'] },
  { cn: '冰岛', en: ['iceland'], certs: ['iceland'] },
  { cn: '瑞士', en: ['switzerland'], certs: ['switzerland'] },
  { cn: '格鲁吉亚', en: ['georgia'], certs: ['georgia'] },
  { cn: '毛里求斯', en: ['mauritius'], certs: ['mauritius'] },
  { cn: '塞尔维亚', en: ['serbia'], certs: ['serbia'] },
  { cn: '尼加拉瓜', en: ['nicaragua'], certs: ['nicaragua'] },
  { cn: '厄瓜多尔', en: ['ecuador'], certs: ['ecuador'] },
  { cn: '印度', en: ['india'], certs: ['apta'] },
  { cn: '孟加拉国', en: ['bangladesh'], certs: ['apta'] },
  { cn: '斯里兰卡', en: ['sri lanka'], certs: ['apta'] },
  { cn: '蒙古', en: ['mongolia'], certs: ['apta'] },
];

/** 常见国家英文名（证书第 4 栏写英文） */
const EN_NAME: Record<string, string> = {
  新加坡: 'SINGAPORE', 马来西亚: 'MALAYSIA', 印度尼西亚: 'INDONESIA', 泰国: 'THAILAND', 越南: 'VIETNAM', 菲律宾: 'PHILIPPINES', 文莱: 'BRUNEI',
  柬埔寨: 'CAMBODIA', 老挝: 'LAOS', 缅甸: 'MYANMAR', 日本: 'JAPAN', 韩国: 'KOREA', 澳大利亚: 'AUSTRALIA', 新西兰: 'NEW ZEALAND', 巴基斯坦: 'PAKISTAN',
  智利: 'CHILE', 秘鲁: 'PERU', 哥斯达黎加: 'COSTA RICA', 冰岛: 'ICELAND', 瑞士: 'SWITZERLAND', 格鲁吉亚: 'GEORGIA', 毛里求斯: 'MAURITIUS', 塞尔维亚: 'SERBIA',
  尼加拉瓜: 'NICARAGUA', 厄瓜多尔: 'ECUADOR', 印度: 'INDIA', 孟加拉国: 'BANGLADESH', 斯里兰卡: 'SRI LANKA', 蒙古: 'MONGOLIA',
  美国: 'U.S.A.', 加拿大: 'CANADA', 英国: 'UNITED KINGDOM', 德国: 'GERMANY', 法国: 'FRANCE', 意大利: 'ITALY', 西班牙: 'SPAIN', 荷兰: 'NETHERLANDS',
  丹麦: 'DENMARK', 比利时: 'BELGIUM', 波兰: 'POLAND', 瑞典: 'SWEDEN', 挪威: 'NORWAY', 阿联酋: 'U.A.E.', 沙特阿拉伯: 'SAUDI ARABIA', 墨西哥: 'MEXICO',
  巴西: 'BRAZIL', 俄罗斯: 'RUSSIA', 土耳其: 'TURKEY', 南非: 'SOUTH AFRICA', 尼日利亚: 'NIGERIA', 埃及: 'EGYPT',
};

const lc = (s: string) => String(s ?? '').toLowerCase();

/** 本单的目的国：运抵国（报关资料）优先，其次买方地址、目的港里出现的国家 */
export function destOf(o: Order): { cn: string; en: string; from: 'customs' | 'guess' | 'none' } {
  const typed = o.customs.destCountry.trim();
  if (typed) {
    const hit = COUNTRIES.find((c) => c.cn === typed || c.en.includes(lc(typed)));
    const cn = hit?.cn ?? typed;
    return { cn, en: EN_NAME[cn] ?? typed.toUpperCase(), from: 'customs' };
  }
  const text = lc(`${o.buyer.address} ${o.terms.pod}`);
  const hit = COUNTRIES.find((c) => c.en.some((e) => new RegExp(`\\b${e}\\b`).test(text)) || text.includes(c.cn));
  if (hit) return { cn: hit.cn, en: EN_NAME[hit.cn], from: 'guess' };
  const other = Object.entries(EN_NAME).find(([cn, en]) => text.includes(cn) || new RegExp(`\\b${en.toLowerCase().replace(/\./g, '\\.?')}\\b`).test(text));
  return other ? { cn: other[0], en: other[1], from: 'guess' } : { cn: '', en: '', from: 'none' };
}

/** 目的国能用的证书：协定证书在前，一般原产地证最后 */
export function certsFor(country: string): CertDef[] {
  const c = COUNTRIES.find((x) => x.cn === country);
  return [...(c?.certs ?? []).map((k) => CERTS[k]), CERTS.general];
}

/** 本单选的证书（没选按目的国第一个推荐） */
export function certOf(o: Order): CertDef {
  const k = o.co?.type;
  return (k && CERTS[k]) || certsFor(destOf(o).cn)[0];
}

/** 第 3 栏运输方式和路线：FROM QINGDAO, CHINA TO SINGAPORE BY SEA */
export function routeText(o: Order): string {
  if (o.co?.route?.trim()) return o.co.route.trim();
  const by: Record<string, string> = { 海运: 'SEA', 空运: 'AIR', 铁路: 'RAIL', 陆运: 'TRUCK', 快递: 'AIR' };
  const pol = o.terms.pol.split(',')[0].trim().toUpperCase();
  const pod = o.terms.pod.split(',')[0].trim().toUpperCase();
  if (!pol && !pod) return '';
  return `FROM ${pol || '—'}, CHINA TO ${pod || '—'}${destOf(o).en && !pod.includes(destOf(o).en) ? ', ' + destOf(o).en : ''} BY ${by[o.terms.transport] ?? 'SEA'}`;
}

/** 证书上的商品编码：自贸协定 6 位，一般原产地证用报关的编码 */
export const certHs = (hs: string, c: CertDef) => {
  const d = String(hs ?? '').replace(/\D/g, '');
  return c.hs6 && d.length >= 6 ? `${d.slice(0, 4)}.${d.slice(4, 6)}` : d;
};

/** 原产地标准：要按货物实际情况判断（完全国产 / 含进口料件），不替用户假设，没填就空着提示 */
export const criterionOf = (o: Order) => o.co?.criterion?.trim() ?? '';

/** 第 11 栏申报地点：「QINGDAO, CHINA」（签约地点里已经带 China 的不重复） */
export function declPlace(o: Order): string {
  const p = (o.co?.place || o.numbers.signedAt || '').trim().toUpperCase();
  return !p ? '' : /CHINA|中国/.test(p) ? p : `${p}, CHINA`;
}

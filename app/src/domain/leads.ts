import type { LeadsState, Product } from './types';

/**
 * 商机（官方公开采购）：世界银行采购公告、欧盟 TED 招标公告。
 * 都是采购方为了招标主动公开的信息，按产品库里的英文品名匹配；软件联网时直接调官方接口，不用我们自己的服务器。
 */

export type LeadSource = 'wb' | 'ted';
export const SOURCE_NAME: Record<LeadSource, string> = { wb: '世界银行', ted: '欧盟 TED' };

export interface Lead {
  id: string;
  source: LeadSource;
  title: string;
  /** 采购方 */
  buyer: string;
  country: string;
  /** 投标截止 YYYY-MM-DD */
  deadline: string;
  published: string;
  url: string;
  /** 命中的关键词 */
  keyword: string;
  /** 公告类型（如 Invitation for Bids、Request for Quotations） */
  kind: string;
  desc: string;
  /** 世界银行公告里的官方联系人 */
  contact?: { name: string; email: string; phone: string; org: string; address: string };
}

/** 从产品库英文品名生成关键词：去掉「- 款式」和括号，按出现次数取前几个 */
export function keywordsFromProducts(products: Product[], max = 6): string[] {
  const count = new Map<string, number>();
  for (const p of products) {
    // 「Aluminium Display Rack - Standard」→ display rack：去掉款式、尺寸，取最后两个词（品名的核心词，太长了搜不到）
    const words = String(p.nameEn || '').split(/\s+-\s+|[,(（/]/)[0].toLowerCase().split(/\s+/).filter((w) => w && !/\d/.test(w));
    const k = words.slice(-2).join(' ');
    if (k.length >= 4) count.set(k, (count.get(k) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([k]) => k);
}

const lc = (s: string) => String(s ?? '').toLowerCase();
/** 关键词（短语）每个词都出现在文字里才算命中，避免「display」「rack」分开命中不相干的公告 */
export function matches(text: string, keyword: string): boolean {
  const t = ` ${lc(text).replace(/[^a-z0-9]+/g, ' ')} `;
  return lc(keyword).split(/\s+/).filter(Boolean).every((w) => t.includes(` ${w.replace(/[^a-z0-9]+/g, '')}`));
}

const day = (s: string) => String(s ?? '').slice(0, 10);

/* ---------- 世界银行 ---------- */
export const wbUrl = (keyword: string) =>
  `https://search.worldbank.org/api/v2/procnotices?format=json&rows=100&srt=noticedate&order=desc&qterm=${encodeURIComponent(`"${keyword}"`)}`;

interface WbNotice {
  id: string; notice_type: string; noticedate: string; submission_deadline_date?: string; project_ctry_name?: string; project_name?: string;
  bid_description?: string; procurement_group?: string; procurement_method_name?: string; contact_name?: string; contact_email?: string;
  contact_phone_no?: string; contact_organization?: string; contact_address?: string; contact_ctry_name?: string;
}

const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const wbDate = (s: string) => { const m = String(s ?? '').match(/(\d{2})-([A-Z][a-z]{2})-(\d{4})/); return m ? `${m[3]}-${MONTHS[m[2]]}-${m[1]}` : day(s); };

/** 只要货物类（GO）的招标 / 询价，没过截止日，标题或描述里真有关键词 */
export function parseWb(json: unknown, keyword: string, today: string): Lead[] {
  const list = ((json as { procnotices?: WbNotice[] })?.procnotices ?? []);
  return list
    .filter((n) => n.procurement_group === 'GO' && /Invitation for Bids|Request for (Quotations|Bids)/i.test(`${n.notice_type} ${n.procurement_method_name ?? ''}`))
    .filter((n) => day(n.submission_deadline_date ?? '') >= today)
    .filter((n) => matches(`${n.bid_description ?? ''} ${n.project_name ?? ''}`, keyword))
    .map((n) => ({
      id: 'wb:' + n.id, source: 'wb' as const, title: (n.bid_description || n.project_name || '').trim(), buyer: n.contact_organization ?? '',
      country: n.project_ctry_name ?? '', deadline: day(n.submission_deadline_date ?? ''), published: wbDate(n.noticedate),
      url: `https://projects.worldbank.org/en/projects-operations/procurement-detail/${n.id}`, keyword,
      kind: n.procurement_method_name || n.notice_type, desc: n.project_name ?? '',
      contact: { name: n.contact_name ?? '', email: n.contact_email ?? '', phone: n.contact_phone_no ?? '', org: n.contact_organization ?? '', address: [n.contact_address, n.contact_ctry_name].filter(Boolean).join(', ') },
    }));
}

/* ---------- 欧盟 TED ---------- */
export const TED_URL = 'https://api.ted.europa.eu/v3/notices/search';
const ymd = (d: string) => d.replace(/-/g, '');
/** 近 30 天发布、还在招标（cn-standard）的公告，标题里有关键词 */
export function tedBody(keyword: string, today: string): string {
  const from = new Date(today + 'T00:00:00');
  from.setDate(from.getDate() - 30);
  const since = from.toISOString().slice(0, 10);
  return JSON.stringify({
    query: `notice-title~"${keyword.replace(/"/g, '')}" AND notice-type=cn-standard AND publication-date>=${ymd(since)}`,
    fields: ['publication-number', 'notice-title', 'buyer-name', 'buyer-country', 'publication-date', 'deadline-receipt-tender-date-lot', 'notice-type'],
    limit: 50, page: 1,
  });
}

type Multi = Record<string, string | string[]>;
const pick = (m?: Multi): string => {
  if (!m) return '';
  const v = m.eng ?? m.ENG ?? Object.values(m)[0];
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
};
const COUNTRY3: Record<string, string> = {
  DEU: '德国', FRA: '法国', ITA: '意大利', ESP: '西班牙', POL: '波兰', NLD: '荷兰', BEL: '比利时', AUT: '奥地利', SWE: '瑞典', DNK: '丹麦', FIN: '芬兰',
  CZE: '捷克', SVK: '斯洛伐克', HUN: '匈牙利', ROU: '罗马尼亚', BGR: '保加利亚', GRC: '希腊', PRT: '葡萄牙', IRL: '爱尔兰', LUX: '卢森堡', SVN: '斯洛文尼亚',
  HRV: '克罗地亚', EST: '爱沙尼亚', LVA: '拉脱维亚', LTU: '立陶宛', CYP: '塞浦路斯', MLT: '马耳他', NOR: '挪威', CHE: '瑞士', ISL: '冰岛',
};

export function parseTed(json: unknown, keyword: string, today: string): Lead[] {
  const list = ((json as { notices?: Record<string, unknown>[] })?.notices ?? []);
  return list
    .map((n) => {
      const no = String(n['publication-number'] ?? '');
      const dl = ((n['deadline-receipt-tender-date-lot'] as string[] | undefined) ?? []).map(day).sort()[0] ?? '';
      const c = ((n['buyer-country'] as string[] | undefined) ?? [])[0] ?? '';
      // 标题形如「Germany – Furniture – 具体项目」，去掉前面的国家名
      const title = pick(n['notice-title'] as Multi).replace(/^[^–-]{2,30}\s[–-]\s/, '');
      return {
        id: 'ted:' + no, source: 'ted' as const, title, buyer: pick(n['buyer-name'] as Multi), country: COUNTRY3[c] ?? c,
        deadline: dl, published: day(String(n['publication-date'] ?? '')), url: `https://ted.europa.eu/en/notice/-/detail/${no}`, keyword,
        kind: 'Contract notice', desc: '',
      };
    })
    .filter((l) => l.title && (!l.deadline || l.deadline >= today));
}

/** 合并多次查询：同一条只留一次，最新发布的在前 */
export function mergeLeads(lists: Lead[][]): Lead[] {
  const seen = new Map<string, Lead>();
  for (const l of lists.flat()) if (!seen.has(l.id)) seen.set(l.id, l);
  return [...seen.values()].sort((a, b) => b.published.localeCompare(a.published) || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
}

/** 最少还要留几天准备投标，太近的不列 */
export const MIN_DAYS = 3;
export function cutoffDate(today: string): string {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() + MIN_DAYS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const defaultLeads = (products: Product[]): LeadsState => ({
  keywords: keywordsFromProducts(products), sources: ['wb', 'ted'], items: [], fetchedAt: '', starred: [], hidden: [], seen: [],
});

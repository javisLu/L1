import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { cutoffDate, keywordsFromProducts, matches, mergeLeads, parseTed, parseWb, tedBody, wbUrl } from './leads';

const wb = {
  procnotices: [
    { id: 'OP1', notice_type: 'Invitation for Bids', procurement_method_name: 'Request for Quotations', procurement_group: 'GO', noticedate: '20-Oct-2026', submission_deadline_date: '2026-11-20T00:00:00Z', project_ctry_name: 'Kenya', project_name: 'Schools Project', bid_description: 'Supply of classroom furniture and steel shelving', contact_name: 'Jane Doe', contact_email: 'jane@moe.go.ke', contact_phone_no: '+254 1', contact_organization: 'Ministry of Education', contact_address: 'Nairobi', contact_ctry_name: 'Kenya' },
    { id: 'OP2', notice_type: 'Invitation for Bids', procurement_method_name: 'Request for Bids', procurement_group: 'CW', noticedate: '20-Oct-2026', submission_deadline_date: '2026-11-20T00:00:00Z', bid_description: 'Construction of school with furniture' },
    { id: 'OP3', notice_type: 'Contract Award', procurement_group: 'GO', noticedate: '20-Oct-2026', submission_deadline_date: '2026-11-20T00:00:00Z', bid_description: 'furniture' },
    { id: 'OP4', notice_type: 'Invitation for Bids', procurement_method_name: 'Request for Bids', procurement_group: 'GO', noticedate: '01-Sep-2026', submission_deadline_date: '2026-10-01T00:00:00Z', bid_description: 'office furniture' },
    { id: 'OP5', notice_type: 'Invitation for Bids', procurement_method_name: 'Request for Bids', procurement_group: 'GO', noticedate: '20-Oct-2026', submission_deadline_date: '2026-11-20T00:00:00Z', bid_description: 'Fourniture de matériels informatiques' },
  ],
};
const ted = {
  notices: [
    { 'publication-number': '711485-2026', 'notice-type': 'cn-standard', 'notice-title': { eng: 'Germany – Furniture – VZ Nürnberg, Möblierung', deu: 'x' }, 'buyer-name': { deu: ['Bundesagentur für Arbeit'] }, 'buyer-country': ['DEU'], 'publication-date': '2026-10-15+02:00', 'deadline-receipt-tender-date-lot': ['2026-11-16+01:00', '2026-11-10+01:00'] },
    { 'publication-number': '700001-2026', 'notice-type': 'cn-standard', 'notice-title': { eng: 'Romania – Office machinery – Supplies except furniture' }, 'buyer-country': ['ROU'], 'publication-date': '2026-10-16+02:00', 'deadline-receipt-tender-date-lot': ['2026-11-20+01:00'] },
    { 'publication-number': '700000-2026', 'notice-type': 'cn-standard', 'notice-title': { eng: 'France – Office furniture – old' }, 'buyer-country': ['FRA'], 'publication-date': '2026-10-01+02:00', 'deadline-receipt-tender-date-lot': ['2026-10-20+01:00'] },
  ],
};

describe('商机', () => {
  it('关键词按产品库生成：去掉款式和尺寸，取品名核心词', () => {
    expect(keywordsFromProducts(seed().products)).toEqual(['display rack', 'accessory kit', 'steel shelf']);
  });

  it('关键词每个词都要出现（复数也算），法语 Fourniture 不算 furniture', () => {
    expect(matches('Supply of classroom furniture', 'furniture')).toBe(true);
    expect(matches('Supply of display stands', 'display rack')).toBe(false);
    expect(matches('Supply of display stands and racks', 'display rack')).toBe(true);
    expect(matches('Fourniture de matériels', 'furniture')).toBe(false);
    // 「家具除外」不算
    expect(matches('Office and computing machinery, equipment and supplies except furniture and software packages', 'furniture')).toBe(false);
    expect(matches('Lamps and lighting fittings (excluding LED lamps), office furniture', 'led lamp')).toBe(false);
    expect(matches('Lamps and lighting fittings (excluding LED lamps), office furniture', 'furniture')).toBe(true);
  });

  it('世界银行：只要货物类招标 / 询价、没过截止日、真有关键词；带官方联系人', () => {
    const r = parseWb(wb, 'furniture', '2026-10-28');
    expect(r.map((x) => x.id)).toEqual(['wb:OP1']);
    expect(r[0]).toMatchObject({ country: 'Kenya', deadline: '2026-11-20', published: '2026-10-20', kind: 'Request for Quotations', buyer: 'Ministry of Education' });
    expect(r[0].contact).toMatchObject({ email: 'jane@moe.go.ke', name: 'Jane Doe' });
    expect(r[0].url).toBe('https://projects.worldbank.org/en/projects-operations/procurement-detail/OP1');
    expect(decodeURIComponent(wbUrl('display rack'))).toContain('qterm="display rack"');
  });

  it('欧盟 TED：英文标题去掉国家名，截止取最早的分包，过期的不要', () => {
    const r = parseTed(ted, 'furniture', '2026-10-28');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'ted:711485-2026', title: 'Furniture – VZ Nürnberg, Möblierung', buyer: 'Bundesagentur für Arbeit', country: '德国', deadline: '2026-11-10', published: '2026-10-15' });
    expect(JSON.parse(tedBody('office chair', '2026-10-28')).query).toBe('notice-title~"office chair" AND notice-type=cn-standard AND contract-nature=supplies AND publication-date>=20260928 SORT BY publication-date DESC');
  });

  it('合并去重、最新发布在前；截止太近的不列', () => {
    const a = parseWb(wb, 'furniture', '2026-10-28'), b = parseTed(ted, 'furniture', '2026-10-28');
    expect(mergeLeads([a, b, a]).map((x) => x.id)).toEqual(['wb:OP1', 'ted:711485-2026']);
    expect(cutoffDate('2026-10-28')).toBe('2026-10-31');
    expect(parseWb(wb, 'furniture', '2026-11-21')).toEqual([]);
  });
});

import { ALL_SOURCES, parseNz, parseOcds, withNewSources } from './leads';

describe('英国、新西兰', () => {
  const cut = '2026-11-01';
  it('英国 OCDS：只要货物类、还在招标、截止不太近、有关键词；带联系人', () => {
    const rel = (id: string, title: string, cat: string, end: string, status = 'active') => ({
      id, date: '2026-10-28T10:00:00Z', buyer: { name: 'Scottish Police Authority' },
      parties: [{ name: 'Scottish Police Authority', roles: ['buyer'], address: { locality: 'Glasgow', countryName: 'United Kingdom' }, contactPoint: { name: 'Ewen', email: 'e@police.uk', telephone: '+44 1' } }],
      tender: { title, status, mainProcurementCategory: cat, tenderPeriod: { endDate: end } },
    });
    const json = { releases: [rel('1-2026', 'Supply of Office Furniture', 'goods', '2026-11-30T12:00:00Z'), rel('2-2026', 'Furniture removal services', 'services', '2026-11-30'), rel('3-2026', 'Classroom furniture', 'goods', '2026-10-30'), rel('4-2026', 'Lab furniture', 'goods', '2026-12-30', 'cancelled'), rel('5-2026', 'Vehicles', 'goods', '2026-12-30')] };
    const r = parseOcds(json, 'ukfts', ['furniture'], cut);
    expect(r.map((x) => x.id)).toEqual(['ukfts:1-2026']);
    expect(r[0]).toMatchObject({ country: '英国', deadline: '2026-11-30', url: 'https://www.find-tender.service.gov.uk/Notice/1-2026', keyword: 'furniture' });
    expect(r[0].contact?.email).toBe('e@police.uk');
    const cf = parseOcds({ releases: [{ ...rel('81b0ecdd-9ed0-4bd5-a77d-832e0f1837dc-919532', 'GB-Colchester: Office furniture', 'goods', '2026-12-01'), tender: { ...rel('x', 'GB-Colchester: Office furniture', 'goods', '2026-12-01').tender } }] }, 'ukcf', ['furniture'], cut);
    expect(cf[0].url).toBe('https://www.contractsfinder.service.gov.uk/Notice/81b0ecdd-9ed0-4bd5-a77d-832e0f1837dc');
    expect(cf[0].title).toBe('Office furniture');
  });
  it('新西兰 RSS：分类里有产品类（UNSPSC 10–60）才要；截止日从描述里取', () => {
    const item = (id: string, title: string, close: string, cats: string) => `<item><title>${title}</title><link>https://www.gets.govt.nz//MOE/ExternalTenderDetails.htm?id=${id}</link><pubDate>Tue, 21 Oct 2026 20:00:00 GMT</pubDate><description>&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;b&gt;RFx ID: &lt;/b&gt;&lt;/td&gt;&lt;td&gt;${id}&lt;/td&gt;&lt;/tr&gt;&lt;tr&gt;&lt;td&gt;Organisation: &lt;/td&gt;&lt;td&gt;Ministry of Education&lt;/td&gt;&lt;/tr&gt; Open date: Wednesday, 22 October 2026 9:00 AM +13:00 Close date: ${close} Categories: ${cats} Region: New Zealand Overview: Supply of school furniture to schools.</description></item>`;
    const xml = `<rss><channel>${item('1', 'School furniture panel', 'Monday, 24 November 2026 5:00 PM +13:00', '56100000 - Accommodation furniture')}${item('2', 'Furniture design services', 'Monday, 24 November 2026 5:00 PM +13:00', '80000000 - Management services')}${item('3', 'Office furniture', 'Thursday, 30 October 2026 5:00 PM +13:00', '56100000 - Furniture')}</channel></rss>`;
    const r = parseNz(xml, ['furniture'], cut);
    expect(r.map((x) => x.id)).toEqual(['nz:1']);
    expect(r[0]).toMatchObject({ country: '新西兰', deadline: '2026-11-24', published: '2026-10-21', buyer: 'Ministry of Education', url: 'https://www.gets.govt.nz/MOE/ExternalTenderDetails.htm?id=1' });
  });
  it('老数据只勾了世界银行、TED：新来源补勾一次；取消过的不再加回', () => {
    const old = { keywords: ['x'], sources: ['wb', 'ted'] as const, items: [], fetchedAt: '', starred: [], hidden: [], seen: [] };
    const up = withNewSources({ ...old, sources: [...old.sources] });
    expect(up.sources).toEqual(ALL_SOURCES);
    expect(up.srcVer).toBe(2);
    const off = withNewSources({ ...up, sources: ['wb'] });
    expect(off.sources).toEqual(['wb']);
  });
});

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
    expect(JSON.parse(tedBody('office chair', '2026-10-28')).query).toBe('notice-title~"office chair" AND notice-type=cn-standard AND publication-date>=20260928');
  });

  it('合并去重、最新发布在前；截止太近的不列', () => {
    const a = parseWb(wb, 'furniture', '2026-10-28'), b = parseTed(ted, 'furniture', '2026-10-28');
    expect(mergeLeads([a, b, a]).map((x) => x.id)).toEqual(['wb:OP1', 'ted:711485-2026']);
    expect(cutoffDate('2026-10-28')).toBe('2026-10-31');
    expect(parseWb(wb, 'furniture', '2026-11-21')).toEqual([]);
  });
});

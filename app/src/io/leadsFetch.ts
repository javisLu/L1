import { isDesktop } from '../store/storage';
import { CF_URL, FTS_URL, NZ_URL, SOURCE_NAME, TED_URL, cutoffDate, mergeLeads, parseNz, parseOcds, parseTed, parseWb, tedBody, wbUrl, type Lead, type LeadSource } from '../domain/leads';

/**
 * 联网取商机。官方接口不允许网页直接跨域调用，桌面版走 Tauri 的 HTTP 插件（只放行这几个官方地址）；
 * 浏览器预览里大多取不到，会报「网络连不上」。
 */
async function request(url: string, init?: RequestInit): Promise<Response> {
  if (isDesktop) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(url, { ...init, connectTimeout: 20000 } as RequestInit);
  }
  return fetch(url, init);
}

/** attempts：一共查了几次（全部失败才算更新失败） */
export interface FetchResult { leads: Lead[]; errors: string[]; attempts: number }

/** OCDS 接口分页：跟着 links.next 往下取，最多 maxPages 页 */
async function ocdsPages(url: string, maxPages = 6): Promise<unknown[]> {
  const pages: unknown[] = [];
  let next: string | undefined = url;
  while (next && pages.length < maxPages) {
    const r = await request(next);
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { links?: { next?: string } };
    pages.push(j);
    next = j.links?.next;
  }
  return pages;
}

const daysBefore = (today: string, n: number) => {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * 世界银行、TED 每个关键词查一次；英国、新西兰没有关键词搜索，各取一次最近的全部公告在本机筛。
 * 合并去重；某个来源失败不影响其它的。
 */
export async function fetchLeads(keywords: string[], sources: LeadSource[], today: string): Promise<FetchResult> {
  const lists: Lead[][] = [];
  const errors: string[] = [];
  const jobs: Promise<void>[] = [];
  const since = daysBefore(today, 30);
  // 截止日太近（来不及准备投标）的不要
  const cut = cutoffDate(today);
  const bulk = (s: LeadSource, run: () => Promise<Lead[]>) => {
    if (!sources.includes(s)) return;
    jobs.push(run().then((l) => void lists.push(l)).catch((e) => void errors.push(`${SOURCE_NAME[s]}：${msg(e)}`)));
  };
  bulk('ukfts', async () => (await ocdsPages(FTS_URL(since))).flatMap((j) => parseOcds(j, 'ukfts', keywords, cut)));
  bulk('ukcf', async () => (await ocdsPages(CF_URL(since))).flatMap((j) => parseOcds(j, 'ukcf', keywords, cut)));
  bulk('nz', async () => {
    const r = await request(NZ_URL);
    if (!r.ok) throw new Error(String(r.status));
    return parseNz(await r.text(), keywords, cut);
  });
  for (const k of keywords) {
    if (sources.includes('wb'))
      jobs.push(request(wbUrl(k)).then(async (r) => {
        if (!r.ok) throw new Error(`世界银行 ${r.status}`);
        lists.push(parseWb(await r.json(), k, cut));
      }).catch((e) => void errors.push(`世界银行「${k}」：${msg(e)}`)));
    if (sources.includes('ted'))
      jobs.push(request(TED_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: tedBody(k, today) }).then(async (r) => {
        if (!r.ok) throw new Error(`欧盟 TED ${r.status}`);
        lists.push(parseTed(await r.json(), k, cut));
      }).catch((e) => void errors.push(`欧盟 TED「${k}」：${msg(e)}`)));
  }
  const attempts = jobs.length;
  await Promise.all(jobs);
  return { leads: mergeLeads(lists), errors, attempts };
}

const msg = (e: unknown) => (e instanceof TypeError ? '网络连不上' : e instanceof Error ? e.message : String(e));

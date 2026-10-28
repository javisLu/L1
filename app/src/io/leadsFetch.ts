import { isDesktop } from '../store/storage';
import { TED_URL, cutoffDate, mergeLeads, parseTed, parseWb, tedBody, wbUrl, type Lead, type LeadSource } from '../domain/leads';

/**
 * 联网取商机。官方接口不允许网页直接跨域调用，桌面版走 Tauri 的 HTTP 插件（只放行这两个地址）；
 * 浏览器预览里大多取不到，会报「网络连不上」。
 */
async function request(url: string, init?: RequestInit): Promise<Response> {
  if (isDesktop) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(url, { ...init, connectTimeout: 20000 } as RequestInit);
  }
  return fetch(url, init);
}

export interface FetchResult { leads: Lead[]; errors: string[] }

/** 每个关键词、每个来源查一次，合并去重；某个来源失败不影响其它的 */
export async function fetchLeads(keywords: string[], sources: LeadSource[], today: string): Promise<FetchResult> {
  const lists: Lead[][] = [];
  const errors: string[] = [];
  const jobs: Promise<void>[] = [];
  // 截止日太近（来不及准备投标）的不要
  const cut = cutoffDate(today);
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
  await Promise.all(jobs);
  return { leads: mergeLeads(lists), errors };
}

const msg = (e: unknown) => (e instanceof TypeError ? '网络连不上' : e instanceof Error ? e.message : String(e));

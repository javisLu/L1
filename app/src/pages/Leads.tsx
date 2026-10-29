import { useState } from 'react';
import { LibCrumbs, TopBar } from '../components/common';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { SOURCE_NAME, keywordsFromProducts, type Lead, type LeadSource } from '../domain/leads';
import { daysUntil, localDay } from '../domain/reminders';
import { nowStamp } from '../domain/exports';
import { isDesktop } from '../store/storage';

let running = false;
/** 联网更新商机（首页自动更新和「立即更新」共用）；quiet：自动更新时失败不打扰 */
export async function refreshLeads(quiet = false) {
  if (running) { if (!quiet) toast('正在更新商机，请稍等'); return; }
  const st = useData.getState();
  const l = st.leads;
  if (!l.keywords.length) { if (!quiet) toast('先填几个产品关键词（英文），再更新'); return; }
  if (!l.sources.length) { if (!quiet) toast('至少选一个来源'); return; }
  // 官方接口不允许网页直接调，只有桌面版能取
  if (!isDesktop) { if (!quiet) toast('浏览器预览里取不到商机，请在桌面版里更新', undefined, 6000, 'leads'); return; }
  if (!quiet) toast('正在联网取商机…', undefined, 60000, 'leads');
  running = true;
  try {
    const { fetchLeads } = await import('../io/leadsFetch');
    const r = await fetchLeads(l.keywords, l.sources, localDay());
    if (!r.leads.length && r.errors.length === l.keywords.length * l.sources.length) throw new Error(r.errors[0]);
    st.updateLeads((x) => { x.items = r.leads; x.fetchedAt = nowStamp(); });
    if (!quiet) toast(`已更新：${r.leads.length} 条在招标的商机${r.errors.length ? `（${r.errors.length} 个查询没取到）` : ''}`, undefined, undefined, 'leads');
  } catch (e) {
    if (!quiet) toast('更新失败：' + (e instanceof Error ? e.message : String(e)) + '。请检查网络后再试', undefined, 9000, 'leads');
  } finally {
    running = false;
  }
}

export const leftDays = (l: Lead) => (l.deadline ? daysUntil(l.deadline, localDay()) : null);

/** 一条商机：标题、采购方、国家、截止，操作按钮 */
export function LeadCard({ lead: l, compact = false }: { lead: Lead; compact?: boolean }) {
  const { leads, updateLeads } = useData();
  const star = leads.starred.includes(l.id);
  const fresh = !leads.seen.includes(l.id);
  const d = leftDays(l);
  const open = () => {
    updateLeads((x) => void (x.seen.includes(l.id) || x.seen.push(l.id)));
    void import('../export/save').then(({ openWeb }) => openWeb(l.url)).catch((e) => toast('打不开浏览器：' + String(e)));
  };
  return (
    <div className={'lead' + (compact ? ' compact' : '')}>
      <div className="lead-h">
        <span className={'lead-src ' + l.source}>{SOURCE_NAME[l.source]}</span>
        {fresh && <span className="lead-new">新</span>}
        <b className="lead-t" title={l.title}>{l.title}</b>
      </div>
      <div className="lead-m">
        <span>{l.country || '—'}</span>
        {l.buyer && <span title={l.buyer}>{l.buyer}</span>}
        <span className={d != null && d <= 7 ? 'warn' : ''}>{l.deadline ? `截止 ${l.deadline}${d != null ? `（${d === 0 ? '今天' : `还剩 ${d} 天`}）` : ''}` : '截止日见原文'}</span>
        <span className="lead-k">{l.keyword}</span>
      </div>
      {!compact && l.contact && (l.contact.email || l.contact.name) && (
        <div className="lead-c">联系人：{[l.contact.name, l.contact.email, l.contact.phone].filter(Boolean).join(' · ')}</div>
      )}
      <div className="lead-a">
        <button className="btn sm" onClick={open}>看原文</button>
        <button className={'btn ghost sm' + (star ? ' on' : '')} onClick={() => updateLeads((x) => void (x.starred = star ? x.starred.filter((i) => i !== l.id) : [...x.starred, l.id]))}>{star ? '★ 已关注' : '☆ 关注'}</button>
        {!compact && <button className="btn ghost sm" onClick={() => addToCustomers(l)}>加入客户库</button>}
        <button className="btn ghost sm" onClick={() => { updateLeads((x) => void x.hidden.push(l.id)); toast('已隐藏', { label: '撤销', run: () => updateLeads((x) => void (x.hidden = x.hidden.filter((i) => i !== l.id))) }); }}>不感兴趣</button>
      </div>
    </div>
  );
}

/** 采购方存进客户库（世界银行公告带官方联系人） */
function addToCustomers(l: Lead) {
  const st = useData.getState();
  const name = (l.contact?.org || l.buyer || '').trim();
  if (!name) return toast('这条公告没写采购方名称，看原文后手工添加');
  if (st.customers.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) return toast('客户库里已经有「' + name + '」');
  const id = st.addCustomer();
  st.updateCustomer(id, (c) => {
    c.name = name;
    c.country = l.country;
    c.address = l.contact?.address ?? '';
    c.level = 'C';
    c.source = SOURCE_NAME[l.source] + '采购公告';
    c.contacts = [{ name: l.contact?.name ?? '', title: '', email: l.contact?.email ?? '', phone: l.contact?.phone ?? '' }];
    c.notes = `${l.title}\n截止 ${l.deadline || '见原文'}\n${l.url}`;
    c.follow = [{ d: localDay(), t: `从商机加入：${l.title.slice(0, 60)}` }];
  });
  toast('已加入客户库：' + name, { label: '去看看', run: () => { useUI.getState().set({ custId: id }); useUI.getState().go('customers'); } });
}

/** 商机页：关键词、来源、列表（全部 / 关注 / 已隐藏） */
export function Leads() {
  const { leads, products, updateLeads } = useData();
  const busy = useUI((s) => s.busy);
  const [kw, setKw] = useState('');
  const [tab, setTab] = useState<'all' | 'star' | 'hidden'>('all');
  const [src, setSrc] = useState<LeadSource | ''>('');
  const list = leads.items.filter((l) => (tab === 'star' ? leads.starred.includes(l.id) : tab === 'hidden' ? leads.hidden.includes(l.id) : !leads.hidden.includes(l.id)) && (!src || l.source === src));
  const addKw = () => {
    const k = kw.trim().toLowerCase();
    if (!k) return;
    if (/[一-龥]/.test(k)) return toast('关键词要用英文（公告是英文的），如 office chair、led lamp');
    updateLeads((x) => void (x.keywords.includes(k) || x.keywords.push(k)));
    setKw('');
  };
  return (
    <>
      <TopBar><LibCrumbs title="商机" /></TopBar>
      <main className="wrap leads">
        <div className="sec-title">
          <div><div className="eyebrow">全球公开采购</div><h1 style={{ fontSize: 22 }}>商机</h1></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{leads.fetchedAt ? `上次更新 ${leads.fetchedAt}` : '还没更新过'}</span>
            <button className="btn pri" disabled={busy} onClick={() => void refreshLeads()}>立即更新</button>
          </div>
        </div>

        <div className="panel lead-set">
          <div className="lead-row">
            <b>关键词</b>
            <div className="chips">
              {leads.keywords.map((k) => (
                <span key={k} className="chip on lead-kw">{k}<button aria-label={'删除 ' + k} onClick={() => updateLeads((x) => void (x.keywords = x.keywords.filter((i) => i !== k)))}>×</button></span>
              ))}
              <input className="lead-kw-in" placeholder="加一个，如 office chair" value={kw} onChange={(e) => setKw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addKw()} aria-label="新关键词" />
              <button className="btn ghost sm" onClick={addKw}>添加</button>
              <button className="btn ghost sm" onClick={() => { const k = keywordsFromProducts(products); updateLeads((x) => void (x.keywords = k)); toast(k.length ? '已按产品库生成：' + k.join('、') : '产品库里没有英文品名'); }}>按产品库重新生成</button>
            </div>
          </div>
          <div className="lead-row">
            <b>来源</b>
            <div className="chips">
              {(['wb', 'ted'] as LeadSource[]).map((s) => (
                <label key={s} className="chk-inline">
                  <input type="checkbox" checked={leads.sources.includes(s)} onChange={(e) => updateLeads((x) => void (x.sources = e.target.checked ? [...x.sources, s] : x.sources.filter((i) => i !== s)))} />
                  {SOURCE_NAME[s]}<span className="muted">{s === 'wb' ? '（各国世行项目的货物采购，带官方联系人）' : '（欧盟各国政府的货物招标，近 30 天发布、还在招标的）'}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="lead-bar">
          <div className="seg">
            <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>全部 · {leads.items.filter((l) => !leads.hidden.includes(l.id)).length}</button>
            <button className={tab === 'star' ? 'on' : ''} onClick={() => setTab('star')}>关注 · {leads.items.filter((l) => leads.starred.includes(l.id)).length}</button>
            <button className={tab === 'hidden' ? 'on' : ''} onClick={() => setTab('hidden')}>不感兴趣 · {leads.items.filter((l) => leads.hidden.includes(l.id)).length}</button>
          </div>
          <select value={src} onChange={(e) => setSrc(e.target.value as LeadSource | '')} aria-label="来源">
            <option value="">全部来源</option><option value="wb">世界银行</option><option value="ted">欧盟 TED</option>
          </select>
          {leads.items.some((l) => !leads.seen.includes(l.id)) && <button className="btn ghost sm" onClick={() => updateLeads((x) => void (x.seen = [...new Set([...x.seen, ...x.items.map((l) => l.id)])]))}>全部标为已看</button>}
        </div>

        {list.length ? list.map((l) => <LeadCard key={l.id} lead={l} />) : (
          <div className="panel empty">
            {!leads.items.length
              ? leads.fetchedAt ? '按现在的关键词没找到在招标的公告。可以换个更通用的词（如 furniture、lamp、textile）再更新。' : '点右上角「立即更新」取一次；之后每天第一次打开软件会自动更新。'
              : tab === 'star' ? '还没有关注的商机' : tab === 'hidden' ? '没有隐藏的商机' : '没有符合条件的商机'}
          </div>
        )}
        <div className="note">
          数据来自世界银行、欧盟 TED 的官方公开采购公告（采购方为招标主动公开），软件联网时直接调官方接口。多是政府和国际项目的采购，单子偏正规、偏大，要按原文要求投标；
          关键词用英文，越具体越准、越通用越多。
        </div>
      </main>
    </>
  );
}

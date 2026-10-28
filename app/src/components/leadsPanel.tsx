import { useData } from '../store/data';
import { useUI } from '../store/ui';
import { LeadCard } from '../pages/Leads';

/** 首页「今日商机」：没隐藏的、新的在前，最多 3 条 */
export function LeadsPanel() {
  const leads = useData((s) => s.leads);
  const go = useUI((s) => s.go);
  const live = leads.items.filter((l) => !leads.hidden.includes(l.id));
  const fresh = live.filter((l) => !leads.seen.includes(l.id));
  const show = [...fresh, ...live.filter((l) => leads.seen.includes(l.id))].slice(0, 3);
  return (
    <div className="panel leads-panel">
      <div className="today-h">
        <h2>今日商机</h2>
        <span className="muted">{live.length ? `${live.length} 条在招标${fresh.length ? `，${fresh.length} 条新的` : ''} · 关键词 ${leads.keywords.slice(0, 3).join('、')}${leads.keywords.length > 3 ? ' 等' : ''}` : leads.fetchedAt ? '按现在的关键词暂时没有在招标的公告' : '按产品库匹配全球公开采购（世界银行、欧盟 TED）'}</span>
        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => go('leads')}>{live.length ? '查看全部' : '设置关键词'}</button>
      </div>
      {show.map((l) => <LeadCard key={l.id} lead={l} compact />)}
    </div>
  );
}

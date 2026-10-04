import { OrderCrumbs, TopBar } from '../components/common';
import { openCustomerPicker } from '../components/form';
import { confirmAction } from '../components/confirm';
import { CheckPanel } from '../components/CheckPanel';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { fixed, int, calcOrder } from '../domain/calc';
import { STATUSES } from '../domain/constants';
import { MODS, modProgress, neededMods, type ModKey } from '../modules/defs';
import { orderAmount } from './Home';
import type { Order, PartnerType } from '../domain/types';

export function OrderMenu({ order: o }: { order: Order }) {
  const ui = useUI();
  const { customers, partners, setOrderField, duplicateOrder, deleteOrder } = useData();
  const k = calcOrder(o);
  const need = neededMods(o);
  const cur = STATUSES.indexOf(o.status);
  const cust = customers.find((c) => c.id === o.customerId);

  const partnerSelect = (type: PartnerType, key: 'forwarder' | 'broker' | 'factory') => (
    <select id={'in-partners-' + key} value={o.partners[key]} onChange={(e) => setOrderField(o.id, 'partners.' + key, e.target.value)}>
      <option value="">未选择</option>
      {partners.filter((p) => p.type === type).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );

  const card = (key: ModKey) => {
    const m = MODS[key];
    const pr = modProgress(o, key);
    let st;
    if (m.ph) st = <span className="st ph">规划中 · {m.ph}</span>;
    else if (m.special) st = <span className="st ph">{k.rows.length} 行货物 · 可导出</span>;
    else if (pr && pr.done === pr.total) st = <span className="st ok">✓ 资料齐全，可导出</span>;
    else st = <span className="st warn">{pr?.done} / {pr?.total} 步完成</span>;
    return (
      <button key={key} className={'mcard' + (m.ph ? ' dim' : '')} onClick={() => ui.openMod(key)}>
        {need.has(key) && !m.ph && <span className="need">本单需要</span>}
        <span className="code">{m.code}</span>
        <b>{m.name}</b>
        <small>{m.desc}</small>
        {st}
      </button>
    );
  };
  const keys = Object.keys(MODS) as ModKey[];

  return (
    <>
      <TopBar><OrderCrumbs order={o} /></TopBar>
      <main className="wrap">
        <div className="ord-head">
          <div>
            <div className="eyebrow">订单 {o.no}</div>
            <input className="title-in" id="in-name" value={o.name} aria-label="订单名称" onChange={(e) => setOrderField(o.id, 'name', e.target.value)} />
            <p>{o.buyer.name || '未选择客户'} · 创建于 {o.created} · 更新于 {o.updated}</p>
          </div>
          <div className="ord-head-r">
            <button
              className="btn ghost danger-t"
              onClick={async () => {
                const ok = await confirmAction({ title: '删除订单', danger: true, ok: '删除订单', body: <p>删除订单「{o.no} {o.name}」？订单里的全部单据资料都会删除，已导出到电脑上的文件不受影响。</p> });
                if (ok) { deleteOrder(o.id); ui.go('home'); toast(`已删除订单 ${o.no}`); }
              }}
            >删除</button>
            <button className="btn" onClick={() => { const n = duplicateOrder(o.id); ui.openOrder(n.id); toast(`已复制为 ${n.no}：客户、货物、条款已带入，船名提单号已清空`); }}>复制为新订单</button>
            <button className="btn pri" onClick={() => ui.openMod('export')}>单据导出</button>
          </div>
        </div>
        <div className="track" aria-label="订单状态">
          {STATUSES.map((s, i) => (
            <button key={s} className={i < cur ? 'done' : i === cur ? 'cur' : ''} onClick={() => { setOrderField(o.id, 'status', s); toast('订单状态已改为「' + s + '」'); }}>
              {i + 1} · {s}
            </button>
          ))}
        </div>
        <CheckPanel order={o} max={3} />
        <div className="sum">
          <div className="panel">
            <h3>客户 <button className="btn ghost sm" onClick={() => openCustomerPicker(o.id)}>{o.customerId ? '更换' : '从客户库选择'}</button></h3>
            <div className="big">{o.buyer.name || '—'}</div>
            <div className="kv">
              <span>联系人</span><b>{o.buyer.contact || '—'}</b>
              <span>国家</span><b>{cust?.country || '—'}</b>
              <span>档案</span><b>{cust ? `客户库 · ${cust.level} 级` : '未入库'}</b>
            </div>
          </div>
          <div className="panel">
            <h3>贸易条款</h3>
            <div className="big">{o.terms.incoterm} {o.terms.place}</div>
            <div className="kv">
              <span>付款</span><b>{o.terms.payment}</b>
              <span>航线</span><b>{(o.terms.pol || '—') + ' → ' + (o.terms.pod || '—')}</b>
              <span>运输</span><b>{o.terms.transport}</b>
            </div>
          </div>
          <div className="panel">
            <h3>货物合计</h3>
            <div className="big num">{orderAmount(o)}</div>
            <div className="kv">
              <span>数量</span><b className="num">{int(k.qty)}</b>
              <span>箱数</span><b className="num">{k.ctns} CTNS</b>
              <span>毛重 / 体积</span><b className="num">{fixed(k.gw, 1)} kg / {fixed(k.cbm, 2)} m³</b>
            </div>
          </div>
          <div className="panel">
            <h3>合作方</h3>
            <div className="kv" style={{ gridTemplateColumns: '52px 1fr', alignItems: 'center', gap: '6px 8px' }}>
              <span>货代</span>{partnerSelect('货代', 'forwarder')}
              <span>报关行</span>{partnerSelect('报关行', 'broker')}
              <span>工厂</span>{partnerSelect('工厂', 'factory')}
            </div>
          </div>
        </div>
        <div className="mgroup">
          <div className="sec-title"><h2>单据</h2><span className="muted" style={{ fontSize: 12.5 }}>按本单的运输方式和付款方式标出需要的单据；所有单据共用本订单数据</span></div>
          <div className="mods">{keys.filter((x) => MODS[x].grp === 'doc').map(card)}</div>
        </div>
        <div className="mgroup">
          <div className="sec-title"><h2>业务</h2></div>
          <div className="mods">{keys.filter((x) => MODS[x].grp === 'biz').map(card)}</div>
        </div>
      </main>
    </>
  );
}

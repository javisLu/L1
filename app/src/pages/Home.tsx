import { useState } from 'react';
import { TopBar, StatusPill, soon } from '../components/common';
import { useData } from '../store/data';
import { toast, useUI, type Page } from '../store/ui';
import { calc, money, sym } from '../domain/calc';
import { STATUSES } from '../domain/constants';
import type { Order } from '../domain/types';

export const orderAmount = (o: Order) => sym(o.terms.currency) + money(calc(o.items).amount);

export function Home() {
  const { orders, customers, products, partners } = useData();
  const ui = useUI();
  const duplicate = useData((s) => s.duplicateOrder);
  const sorted = [...orders].sort((a, b) => b.no.localeCompare(a.no));
  const q = ui.q.trim().toLowerCase();
  const list = sorted.filter(
    (o) =>
      (ui.status === 'all' || o.status === ui.status) &&
      (!q || [o.no, o.name, o.buyer.name, ...o.items.map((i) => i.nameEn + ' ' + i.model)].join(' ').toLowerCase().includes(q)),
  );
  const active = sorted.filter((o) => o.status !== '完结').length;
  const toShip = sorted.filter((o) => o.status === '确认' || o.status === '生产').length;
  const recv = sorted.filter((o) => o.status === '出货');

  const lib = (page: Page, ic: string, t: string, s: string, c?: number) => (
    <button key={page} onClick={() => ui.go(page)}>
      <span className="ic">{ic}</span>
      <span><b>{t}</b><small>{s}</small></span>
      {c != null && <span className="cnt">{c}</span>}
    </button>
  );

  return (
    <>
      <TopBar><span className="cur">首页</span></TopBar>
      <main className="wrap">
        <div className="home">
          <section>
            <div className="home-hero">
              <div><div className="eyebrow">我的订单</div><h1>每一单，一个独立档案</h1></div>
              <button className="btn pri" onClick={() => ui.openModal({ title: '新建订单', body: <NewOrderForm /> })}>＋ 新建订单</button>
            </div>
            <div className="stats">
              <div className="stat"><b>{active}</b><span>进行中订单</span></div>
              <div className="stat"><b>{toShip}</b><span>待出货</span></div>
              <div className="stat"><b>{recv.length ? recv.map(orderAmount).join(' + ') : '—'}</b><span>已出货待收款</span></div>
            </div>
            <div className="panel">
              <div className="toolbar">
                <label className="search">
                  <span className="muted">搜索</span>
                  <input placeholder="单号 / 客户 / 型号 / 品名" value={ui.q} onChange={(e) => ui.set({ q: e.target.value })} />
                </label>
                <div className="chips">
                  {(['all', ...STATUSES] as const).map((s) => (
                    <button key={s} className={'chip' + (ui.status === s ? ' on' : '')} onClick={() => ui.set({ status: s })}>{s === 'all' ? '全部' : s}</button>
                  ))}
                </div>
              </div>
              <div className="olist">
                <div className="orow head"><span>单号</span><span>订单名称 · 货物</span><span>客户</span><span>状态</span><span style={{ textAlign: 'right' }}>金额</span><span>更新</span><span /></div>
                {list.map((o) => {
                  const c = customers.find((x) => x.id === o.customerId);
                  return (
                    <div key={o.id} className="orow" role="button" tabIndex={0} onClick={() => ui.openOrder(o.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ui.openOrder(o.id)}>
                      <span className="no">{o.no}</span>
                      <span className="nm"><b>{o.name}</b><small>{o.items.map((i) => i.model).join(' · ') || '尚未添加货物'}</small></span>
                      <span>{o.buyer.name || '未选择客户'} {c && <small className="muted">{c.country}</small>}</span>
                      <span><StatusPill status={o.status} /></span>
                      <span className="amt">{orderAmount(o)}</span>
                      <span className="dt">{o.updated}</span>
                      <span>
                        <button
                          className="btn ghost sm"
                          title="复制为新订单（返单）"
                          onClick={(e) => {
                            e.stopPropagation();
                            const n = duplicate(o.id);
                            ui.openOrder(n.id);
                            toast(`已复制为 ${n.no}：客户、货物、条款已带入，船名提单号已清空`);
                          }}
                        >
                          复制
                        </button>
                      </span>
                    </div>
                  );
                })}
                {!list.length && <div className="empty">没有符合条件的订单</div>}
              </div>
            </div>
          </section>
          <aside>
            <div className="side-group"><h3>资料库</h3><div className="lib">
              {lib('customers', '客户', '客户库', '客户档案、交易习惯、历史订单', customers.length)}
              {lib('partners', '合作', '合作方库', '货代、报关行、工厂、船公司', partners.length)}
              {lib('products', '产品', '产品库', '型号、HS、箱规、重量', products.length)}
              {lib('clauses', '条款', '条款库', '合同条款、付款、交货等')}
              {lib('hs', 'HS', 'HS 记忆库', '品名 ↔ 编码 ↔ 申报要素', products.length)}
            </div></div>
            <div className="side-group"><h3>小工具</h3><div className="lib">
              {lib('calc', '¥→$', '报价计算器', '成本 + 运费 + 退税 → FOB / CIF')}
              <button onClick={() => soon('汇率换算')}><span className="ic">FX</span><span><b>汇率换算</b><small>常用币种汇率</small></span></button>
              <button onClick={() => soon('金额英文大写')}><span className="ic">SAY</span><span><b>金额英文大写</b><small>SAY US DOLLARS … ONLY</small></span></button>
            </div></div>
          </aside>
        </div>
      </main>
    </>
  );
}

function NewOrderForm() {
  const customers = useData((s) => s.customers);
  const seq = useData((s) => s.seq);
  const createOrder = useData((s) => s.createOrder);
  const ui = useUI();
  const [name, setName] = useState('外贸订单' + seq);
  const [cid, setCid] = useState(customers[0]?.id ?? '');
  return (
    <>
      <div className="fi" style={{ marginBottom: 14 }}>
        <label htmlFor="nc-name">订单名称</label>
        <input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>选择客户（客户信息和交易习惯会自动带入）</div>
      {customers.map((c) => (
        <label key={c.id} className="opt">
          <input type="radio" name="nc" checked={cid === c.id} onChange={() => setCid(c.id)} />
          <span><b>{c.name}</b><small>{c.country} · 默认 {c.habits.incoterm} / {c.habits.payment} / {c.habits.currency}</small></span>
        </label>
      ))}
      <label className="opt">
        <input type="radio" name="nc" checked={cid === ''} onChange={() => setCid('')} />
        <span><b>新客户，稍后填写</b><small>在订单里填完后可一键保存到客户库</small></span>
      </label>
      <div className="modal-f" style={{ margin: '12px -20px -16px' }}>
        <button className="btn" onClick={ui.closeModal}>取消</button>
        <button
          className="btn pri"
          onClick={() => {
            const o = createOrder(cid, name.trim());
            const c = customers.find((x) => x.id === cid);
            ui.closeModal();
            ui.openOrder(o.id);
            toast(c ? `已新建 ${o.no}，已带入 ${c.name} 的客户信息和交易习惯` : `已新建 ${o.no}`);
          }}
        >
          创建订单
        </button>
      </div>
    </>
  );
}

import { useState } from 'react';
import { LibCrumbs, LibPage, StatusPill, TopBar, soon } from '../components/common';
import { useData, getPath, setPath } from '../store/data';
import { toast, useUI } from '../store/ui';
import { calc, money, payText, sym, today } from '../domain/calc';
import { CONTRACT_LIB, CURRENCIES, INCOTERMS, OTHER_CLAUSES, PARTNER_TYPES, PAYMENTS } from '../domain/constants';
import { orderAmount } from './Home';
import type { Customer } from '../domain/types';

/* ---------- 客户库 ---------- */
function custStats(c: Customer, orders: ReturnType<typeof useData.getState>['orders']) {
  const os = orders.filter((o) => o.customerId === c.id);
  const by: Record<string, number> = {};
  os.forEach((o) => (by[o.terms.currency] = (by[o.terms.currency] ?? 0) + calc(o.items).amount));
  return {
    os,
    total: Object.keys(by).map((x) => sym(x) + money(by[x])).join(' + ') || '—',
    last: os.map((o) => o.created).sort().pop() ?? '—',
  };
}

export function Customers() {
  const { customers, orders, updateCustomer, addCustomer, createOrder } = useData();
  const ui = useUI();
  const q = ui.cq.trim().toLowerCase();
  const list = customers.filter((c) => !q || (c.name + c.country + c.contacts.map((x) => x.name).join(' ')).toLowerCase().includes(q));
  const c = customers.find((x) => x.id === ui.custId) ?? list[0];
  const [follow, setFollow] = useState('');

  const fi = (p: string, label: string, opt: { wide?: boolean; opts?: string[]; ta?: boolean } = {}) => {
    const id = 'cp-' + p.replace(/\./g, '-');
    const v = String(getPath(c, p) ?? '');
    const set = (val: string) => updateCustomer(c!.id, (x) => setPath(x, p, val));
    return (
      <div className={'fi' + (opt.wide ? ' w2' : '')} key={p}>
        {label && <label htmlFor={id}>{label}</label>}
        {opt.opts ? (
          <select id={id} value={v} onChange={(e) => set(e.target.value)}>{opt.opts.map((x) => <option key={x}>{x}</option>)}</select>
        ) : opt.ta ? (
          <textarea id={id} rows={3} value={v} onChange={(e) => set(e.target.value)} />
        ) : (
          <input id={id} value={v} onChange={(e) => set(e.target.value)} />
        )}
      </div>
    );
  };

  return (
    <>
      <TopBar><LibCrumbs title="客户库" /></TopBar>
      <main className="wrap">
        <div className="sec-title">
          <div><div className="eyebrow">资料库</div><h1 style={{ fontSize: 22 }}>客户库</h1></div>
          <button className="btn" onClick={() => { ui.set({ custId: addCustomer() }); toast('已新建客户，请完善资料'); }}>＋ 新建客户</button>
        </div>
        <div className="cust">
          <div className="panel">
            <div className="toolbar">
              <label className="search"><span className="muted">搜索</span><input placeholder="公司 / 国家 / 联系人" value={ui.cq} onChange={(e) => ui.set({ cq: e.target.value })} /></label>
            </div>
            <div className="clist">
              {list.map((x) => (
                <button key={x.id} className={'citem' + (c && x.id === c.id ? ' on' : '')} onClick={() => ui.set({ custId: x.id })}>
                  <b>{x.name}</b>
                  <small>{x.country} · {x.level} 级 · {orders.filter((o) => o.customerId === x.id).length} 单</small>
                </button>
              ))}
            </div>
          </div>
          <div className="panel">
            {!c ? <div className="empty">还没有客户</div> : (() => {
              const st = custStats(c, orders);
              return (
                <div className="cdet">
                  <div className="cdet-h">
                    <div>
                      <div className="eyebrow">客户档案</div>
                      <h2>{c.name}<span className="lvl">{c.level}</span></h2>
                      <div className="muted" style={{ fontSize: 13 }}>{c.country} · 来源：{c.source || '—'}</div>
                    </div>
                    <button className="btn pri" onClick={() => { const o = createOrder(c.id, ''); ui.openOrder(o.id); toast(`已新建 ${o.no}，已带入 ${c.name} 的客户信息和交易习惯`); }}>为该客户新建订单</button>
                  </div>
                  <div className="cstats">
                    <div className="stat"><b>{st.os.length}</b><span>历史订单</span></div>
                    <div className="stat"><b>{st.total}</b><span>累计金额</span></div>
                    <div className="stat"><b>{st.last}</b><span>最近下单</span></div>
                  </div>
                  <div className="cblock"><h3>基本信息</h3><div className="grid">
                    {fi('name', '公司名称', { wide: true })}{fi('address', '地址', { wide: true, ta: true })}
                    {fi('country', '国家')}{fi('tax', '税号 / VAT / EORI')}{fi('notify', '通知方')}{fi('level', '客户等级', { opts: ['A', 'B', 'C'] })}
                  </div></div>
                  <div className="cblock"><h3>联系人</h3>
                    <div className="tbl-wrap"><table className="tbl" style={{ minWidth: 560 }}>
                      <thead><tr><th>姓名</th><th>职位</th><th>邮箱</th><th>电话 / WhatsApp</th></tr></thead>
                      <tbody>{c.contacts.map((k, i) => (
                        <tr key={i}>{(['name', 'title', 'email', 'phone'] as const).map((f) => (
                          <td key={f}><input className="cell" aria-label={f} value={k[f]} onChange={(e) => updateCustomer(c.id, (x) => void (x.contacts[i][f] = e.target.value))} /></td>
                        ))}</tr>
                      ))}</tbody>
                    </table></div>
                    <div className="tbl-tools"><button className="btn sm" onClick={() => updateCustomer(c.id, (x) => void x.contacts.push({ name: '', title: '', email: '', phone: '' }))}>＋ 添加联系人</button></div>
                  </div>
                  <div className="cblock"><h3>默认交易习惯 <span className="muted" style={{ fontWeight: 400 }}>· 新建订单时自动带入</span></h3><div className="grid">
                    {fi('habits.incoterm', '贸易术语', { opts: INCOTERMS })}{fi('habits.place', '指定地点')}
                    {fi('habits.currency', '币种', { opts: CURRENCIES })}{fi('habits.pod', '目的港')}
                    {fi('habits.deliveryAddress', '默认交货地址（EXW / FCA / DAP / DDP 用）', { wide: true, ta: true })}
                    {fi('habits.payment', '付款方式', { opts: PAYMENTS })}{fi('habits.payCustom', '自定义付款方式（选「自定义」时填）')}
                    {fi('habits.payDeposit', '定金比例 %')}{fi('habits.payDays', '天数（信用证远期 / 赊销等）')}
                    <div className="fi w2"><label>付款条款预览</label><div className="note" style={{ margin: 0 }}>{payText(c.habits)}</div></div>
                    {fi('habits.marks', '唛头模板（{PO} {CTNS} 自动替换）', { wide: true, ta: true })}
                  </div></div>
                  <div className="cblock"><h3>历史订单</h3><div className="panel">
                    {st.os.length ? st.os.map((o) => (
                      <div key={o.id} className="orow" style={{ gridTemplateColumns: '90px 1fr 70px 110px', minWidth: 0 }} onClick={() => ui.openOrder(o.id)}>
                        <span className="no">{o.no}</span>
                        <span className="nm"><b>{o.name}</b><small>{o.items.map((i) => i.model).join(' · ')}</small></span>
                        <span><StatusPill status={o.status} /></span>
                        <span className="amt">{orderAmount(o)}</span>
                      </div>
                    )) : <div className="empty">暂无订单</div>}
                  </div></div>
                  <div className="cblock"><h3>跟进记录</h3>
                    <ul className="follow">{c.follow.map((f, i) => <li key={i}><span className="num">{f.d}</span><span>{f.t}</span></li>)}</ul>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <input className="cell" style={{ borderColor: 'var(--line-2)' }} placeholder="记录一次沟通，如：客户要求改交期到 11 月初" value={follow} onChange={(e) => setFollow(e.target.value)} />
                      <button className="btn" onClick={() => { if (!follow.trim()) return; updateCustomer(c.id, (x) => void x.follow.unshift({ d: today(), t: follow.trim() })); setFollow(''); }}>添加</button>
                    </div>
                  </div>
                  <div className="cblock"><h3>备注</h3><div className="grid">{fi('notes', '', { wide: true, ta: true })}</div></div>
                </div>
              );
            })()}
          </div>
        </div>
      </main>
    </>
  );
}

/* ---------- 合作方库 ---------- */
export function Partners() {
  const { partners, orders } = useData();
  const ui = useUI();
  const rows = partners.filter((p) => p.type === ui.ptype);
  return (
    <LibPage title="合作方库" right={<button className="btn" onClick={() => soon('新增合作方')}>＋ 新增</button>}>
      <div className="chips" style={{ marginBottom: 12 }}>
        {PARTNER_TYPES.map((t) => <button key={t} className={'chip' + (ui.ptype === t ? ' on' : '')} onClick={() => ui.set({ ptype: t })}>{t}</button>)}
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>名称</th><th>联系人</th><th>电话</th><th>备注</th><th>合作订单</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}><td><b>{p.name}</b></td><td>{p.contact}</td><td className="num">{p.phone}</td><td className="muted">{p.note}</td>
              <td className="num">{orders.filter((o) => Object.values(o.partners).includes(p.id)).length}</td></tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="empty">暂无</td></tr>}
        </tbody>
      </table></div>
    </LibPage>
  );
}

/* ---------- 产品库 ---------- */
export function Products() {
  const products = useData((s) => s.products);
  return (
    <LibPage title="产品库" right={<>
      <button className="btn" onClick={() => soon('批量导入 CSV / Excel')}>批量导入</button>
      <button className="btn" onClick={() => soon('导出产品图册')}>导出图册</button>
      <button className="btn pri" onClick={() => soon('新增产品')}>＋ 新增产品</button>
    </>}>
      <div className="tbl-wrap"><table className="tbl" style={{ minWidth: 960 }}>
        <thead><tr><th>型号</th><th>品名</th><th>规格</th><th>HS 编码</th><th>单位</th><th style={{ textAlign: 'right' }}>单价</th><th>每箱装</th><th>箱规 cm</th><th>净/毛重 kg</th></tr></thead>
        <tbody>{products.map((p) => (
          <tr key={p.id}>
            <td className="num">{p.model}</td>
            <td><b>{p.nameCn}</b><div className="muted" style={{ fontSize: 12 }}>{p.nameEn}</div></td>
            <td>{p.spec}</td><td className="num">{p.hs}</td><td>{p.unit}</td>
            <td className="num" style={{ textAlign: 'right' }}>${money(p.price)}</td><td className="num">{p.pcsPerCtn}</td>
            <td className="num">{p.l}×{p.w}×{p.h}</td><td className="num">{p.nw} / {p.gw}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </LibPage>
  );
}

/* ---------- HS 记忆库 ---------- */
export function HsMemory() {
  const products = useData((s) => s.products);
  return (
    <LibPage title="HS 记忆库" right={<button className="btn" onClick={() => soon('HS 编码查询（本地税则库）')}>查询税则</button>}>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>中文品名</th><th>商品编号</th><th>申报要素</th><th>退税率（示例）</th><th>来源</th></tr></thead>
        <tbody>{products.map((p) => <tr key={p.id}><td><b>{p.nameCn}</b></td><td className="num">{p.hs}</td><td>{p.elements}</td><td className="num">13%</td><td className="muted">订单录入自动记忆</td></tr>)}</tbody>
      </table></div>
      <div className="note">M2 起内置本地海关税则库（编码、申报要素模板、监管条件、退税率），随软件更新包更新；退税率为示例值，以当期政策为准。</div>
    </LibPage>
  );
}

/* ---------- 条款库 ---------- */
export function Clauses() {
  return (
    <LibPage title="条款库" right={<button className="btn" onClick={() => soon('新增条款')}>＋ 新增条款</button>}>
      <div className="cblock">
        <h3>销售合同条款 <span className="muted" style={{ fontWeight: 400 }}>· 在「合同 / PI → 合同条款」里一键插入</span></h3>
        <div className="panel">{CONTRACT_LIB.map((c) => (
          <div key={c.k} className="orow" style={{ gridTemplateColumns: '180px 1fr', minWidth: 0, cursor: 'default', alignItems: 'start' }}>
            <b>{c.t}</b><span className="muted" style={{ fontSize: 12.5 }}>{c.b}</span>
          </div>
        ))}</div>
      </div>
      {Object.entries(OTHER_CLAUSES).map(([g, list]) => (
        <div key={g} className="cblock"><h3>{g}</h3><div className="panel">{list.map((x) => (
          <div key={x} className="orow" style={{ gridTemplateColumns: '1fr', minWidth: 0, cursor: 'default' }}><span>{x}</span></div>
        ))}</div></div>
      ))}
    </LibPage>
  );
}

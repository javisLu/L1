import { useState } from 'react';
import { LibCrumbs, LibPage, StatusPill, TopBar, soon } from '../components/common';
import { openSmartPaste } from '../components/smartPaste';
import { ReqEditor } from '../components/requirements';
import { autoReqCount } from '../domain/requirements';
import { confirmAction } from '../components/confirm';
import { exportLibrary, startImport } from '../components/importer';
import { useData, getPath, setPath } from '../store/data';
import { toast, useUI } from '../store/ui';
import { money, payText, sym, today, calcOrder } from '../domain/calc';
import { CONTRACT_LIB, CURRENCIES, INCOTERMS, OTHER_CLAUSES, PARTNER_TYPES, PAYMENTS } from '../domain/constants';
import { controlText, elementsHint } from '../domain/hs';
import { orderAmount } from './Home';
import type { Customer, Product } from '../domain/types';

/* ---------- 客户库 ---------- */
function custStats(c: Customer, orders: ReturnType<typeof useData.getState>['orders']) {
  const os = orders.filter((o) => o.customerId === c.id);
  const by: Record<string, number> = {};
  os.forEach((o) => (by[o.terms.currency] = (by[o.terms.currency] ?? 0) + calcOrder(o).amount));
  return {
    os,
    total: Object.keys(by).map((x) => sym(x) + money(by[x])).join(' + ') || '—',
    last: os.map((o) => o.created).sort().pop() ?? '—',
  };
}

export function Customers() {
  const { customers, orders, updateCustomer, addCustomer, createOrder, deleteCustomer } = useData();
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => void startImport('customers')}>导入 Excel / CSV</button>
            <button className="btn" onClick={() => void exportLibrary('customers')}>导出</button>
            <button className="btn ghost" onClick={() => void exportLibrary('customers', true)}>下载模板</button>
            <button className="btn pri" onClick={() => { ui.set({ custId: addCustomer() }); toast('已新建客户，请完善资料'); }}>＋ 新建客户</button>
          </div>
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
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn ghost danger-t"
                        onClick={async () => {
                          const ok = await confirmAction({ title: '删除客户', danger: true, ok: '删除', body: <p>删除客户「{c.name}」？已建的 {st.os.length} 个订单保留（订单里存的是客户信息的副本），只是不再关联到客户库。</p> });
                          if (ok) { deleteCustomer(c.id); ui.set({ custId: null }); toast('已删除客户 ' + c.name); }
                        }}
                      >删除客户</button>
                      <button className="btn pri" onClick={() => { const o = createOrder(c.id, ''); ui.openOrder(o.id); toast(`已新建 ${o.no}，已带入 ${c.name} 的客户信息和交易习惯${autoReqCount(c.reqs) ? `，并按客户要求设置了 ${autoReqCount(c.reqs)} 项` : ''}`); }}>为该客户新建订单</button>
                    </div>
                  </div>
                  <div className="cstats">
                    <div className="stat"><b>{st.os.length}</b><span>历史订单</span></div>
                    <div className="stat"><b>{st.total}</b><span>累计金额</span></div>
                    <div className="stat"><b>{st.last}</b><span>最近下单</span></div>
                  </div>
                  <div className="cblock"><h3 className="cblock-h">基本信息
                    <button
                      className="btn sm"
                      title="粘贴客户的邮件签名或名片，自动拆成公司、地址、国家、税号和联系人"
                      onClick={() => openSmartPaste({
                        title: '智能粘贴 · 客户档案',
                        fields: ['name', 'address', 'country', 'tax', 'contact', 'title', 'phone', 'email', 'note'],
                        apply: (p) => updateCustomer(c.id, (x) => {
                          for (const k of ['name', 'address', 'country', 'tax'] as const) if (p[k]) x[k] = p[k]!;
                          if (p.note) x.notes = x.notes ? `${x.notes}\n${p.note}` : p.note;
                          if (p.contact || p.email || p.phone) {
                            // 第一位联系人是空的就填进去；已有别人时新增一位
                            const first = x.contacts[0];
                            const same = first && (!first.name || first.name === p.contact);
                            const k = same ? first : (x.contacts[x.contacts.push({ name: '', title: '', email: '', phone: '' }) - 1]);
                            if (p.contact) k.name = p.contact;
                            if (p.title) k.title = p.title;
                            if (p.email) k.email = p.email;
                            if (p.phone) k.phone = p.phone;
                          }
                        }),
                      })}
                    >智能粘贴</button>
                  </h3><div className="grid">
                    {fi('name', '公司名称', { wide: true })}{fi('address', '地址', { wide: true, ta: true })}
                    {fi('country', '国家')}{fi('tax', '税号 / VAT / EORI')}{fi('notify', '通知方')}{fi('level', '客户等级', { opts: ['A', 'B', 'C'] })}
                  </div></div>
                  <div className="cblock"><h3>联系人</h3>
                    <div className="tbl-wrap"><table className="tbl" style={{ minWidth: 560 }}>
                      <thead><tr><th>姓名</th><th>职位</th><th>邮箱</th><th>电话 / WhatsApp</th><th /></tr></thead>
                      <tbody>{c.contacts.map((k, i) => (
                        <tr key={i}>{(['name', 'title', 'email', 'phone'] as const).map((f) => (
                          <td key={f}><input className="cell" aria-label={f} value={k[f]} onChange={(e) => updateCustomer(c.id, (x) => void (x.contacts[i][f] = e.target.value))} /></td>
                        ))}<td>{c.contacts.length > 1 && <button className="del" title="删除联系人" onClick={() => updateCustomer(c.id, (x) => void x.contacts.splice(i, 1))}>✕</button>}</td></tr>
                      ))}</tbody>
                    </table></div>
                    <div className="tbl-tools"><button className="btn sm" onClick={() => updateCustomer(c.id, (x) => void x.contacts.push({ name: '', title: '', email: '', phone: '' }))}>＋ 添加联系人</button></div>
                  </div>
                  <div className="cblock"><h3>单据要求清单 <span className="muted" style={{ fontWeight: 400 }}>· 这个客户的规矩，新单自动套用、出货前逐条核对</span></h3>
                    <ReqEditor customer={c} />
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
  const { partners, orders, addPartner, updatePartner, deletePartner } = useData();
  const ui = useUI();
  const rows = partners.filter((p) => p.type === ui.ptype);
  const cell = (id: string, k: 'name' | 'contact' | 'phone' | 'note', v: string, ph: string) => (
    <input className="cell" aria-label={ph} placeholder={ph} value={v} onChange={(e) => updatePartner(id, (p) => void (p[k] = e.target.value))} />
  );
  return (
    <LibPage title="合作方库" right={<button className="btn pri" onClick={() => { addPartner(ui.ptype); toast(`已新增${ui.ptype}，请填写名称`); }}>＋ 新增{ui.ptype}</button>}>
      <div className="chips" style={{ marginBottom: 12 }}>
        {PARTNER_TYPES.map((t) => <button key={t} className={'chip' + (ui.ptype === t ? ' on' : '')} onClick={() => ui.set({ ptype: t })}>{t}（{partners.filter((p) => p.type === t).length}）</button>)}
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th style={{ minWidth: 240 }}>名称</th><th style={{ minWidth: 110 }}>联系人</th><th style={{ minWidth: 140 }}>电话</th><th style={{ minWidth: 180 }}>备注</th><th>合作订单</th><th /></tr></thead>
        <tbody>
          {rows.map((p) => {
            const used = orders.filter((o) => Object.values(o.partners).includes(p.id)).length;
            return (
              <tr key={p.id}>
                <td>{cell(p.id, 'name', p.name, '公司名称')}</td><td>{cell(p.id, 'contact', p.contact, '联系人')}</td>
                <td>{cell(p.id, 'phone', p.phone, '电话')}</td><td>{cell(p.id, 'note', p.note, '航线、擅长业务等')}</td>
                <td className="num" style={{ textAlign: 'center' }}>{used}</td>
                <td>
                  <button
                    className="del"
                    title="删除"
                    onClick={async () => {
                      const ok = await confirmAction({ title: '删除合作方', danger: true, ok: '删除', body: <p>删除「{p.name || '未命名'}」？{used ? `有 ${used} 个订单选择了它，删除后这些订单的该项会显示为未选择。` : ''}</p> });
                      if (ok) deletePartner(p.id);
                    }}
                  >✕</button>
                </td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={6} className="empty">还没有{ui.ptype}，点右上角新增</td></tr>}
        </tbody>
      </table></div>
    </LibPage>
  );
}

/* ---------- 产品库 ---------- */
const PRODUCT_FORM: { k: keyof Product; label: string; num?: boolean; wide?: boolean }[] = [
  { k: 'model', label: '型号 *' }, { k: 'cat', label: '分类' },
  { k: 'nameCn', label: '中文品名' }, { k: 'nameEn', label: '英文品名' },
  { k: 'spec', label: '规格', wide: true },
  { k: 'hs', label: 'HS 编码' }, { k: 'unit', label: '单位' },
  { k: 'price', label: '单价', num: true }, { k: 'pcsPerCtn', label: '每箱装', num: true },
  { k: 'l', label: '外箱长 cm', num: true }, { k: 'w', label: '外箱宽 cm', num: true },
  { k: 'h', label: '外箱高 cm', num: true }, { k: 'nw', label: '单箱净重 kg', num: true },
  { k: 'gw', label: '单箱毛重 kg', num: true },
  { k: 'elements', label: '申报要素', wide: true },
];

function ProductForm({ id }: { id: string }) {
  const p = useData((s) => s.products.find((x) => x.id === id));
  const { updateProduct, deleteProduct } = useData();
  const close = useUI((s) => s.closeModal);
  if (!p) return null;
  return (
    <>
      <div className="grid">
        {PRODUCT_FORM.map((f) => (
          <div key={f.k} className={'fi' + (f.wide ? ' w2' : '')}>
            <label htmlFor={'pf-' + f.k}>{f.label}</label>
            <input
              id={'pf-' + f.k}
              className={f.num ? 'num' : undefined}
              inputMode={f.num ? 'decimal' : undefined}
              value={String(p[f.k] ?? '')}
              onChange={(e) => updateProduct(id, (x) => void ((x as unknown as Record<string, unknown>)[f.k] = f.num ? (e.target.value === '' ? 0 : Number(e.target.value.replace(/[^\d.]/g, '')) || 0) : e.target.value))}
            />
          </div>
        ))}
      </div>
      <div className="modal-f" style={{ margin: '14px -20px -16px', justifyContent: 'space-between' }}>
        <button
          className="btn ghost danger-t"
          onClick={async () => {
            const name = p.model || '未命名产品';
            const ok = await confirmAction({ title: '删除产品', danger: true, ok: '删除', body: <p>删除产品「{name}」？已建订单里的货物不受影响。</p> });
            if (ok) { deleteProduct(id); toast('已删除 ' + name); }
          }}
        >删除产品</button>
        <button className="btn pri" onClick={() => { if (!p.model.trim()) return toast('请填写型号'); close(); }}>完成</button>
      </div>
    </>
  );
}

export function Products() {
  const { products, addProduct } = useData();
  const ui = useUI();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('全部');
  const cats = ['全部', ...Array.from(new Set(products.map((p) => p.cat).filter(Boolean)))];
  const kw = q.trim().toLowerCase();
  const list = products.filter((p) => (cat === '全部' || p.cat === cat) && (!kw || [p.model, p.nameCn, p.nameEn, p.hs, p.spec].join(' ').toLowerCase().includes(kw)));
  const edit = (id: string, title = '编辑产品') => ui.openModal({ title, body: <ProductForm id={id} /> });
  return (
    <LibPage title="产品库" right={<>
      <button className="btn" onClick={() => void startImport('products')}>导入 Excel / CSV</button>
      <button className="btn" onClick={() => void exportLibrary('products')}>导出</button>
      <button className="btn ghost" onClick={() => void exportLibrary('products', true)}>下载模板</button>
      <button className="btn pri" onClick={() => edit(addProduct(), '新增产品')}>＋ 新增产品</button>
    </>}>
      <div className="panel">
        <div className="toolbar">
          <label className="search"><span className="muted">搜索</span><input placeholder="型号 / 品名 / HS 编码" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="chips">{cats.map((c) => <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>
        </div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="tbl" style={{ minWidth: 960 }}>
          <thead><tr><th>型号</th><th>品名</th><th>规格</th><th>HS 编码</th><th>单位</th><th style={{ textAlign: 'right' }}>单价</th><th>每箱装</th><th>箱规 cm</th><th>净/毛重 kg</th><th>分类</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => edit(p.id)}>
                <td className="num">{p.model || <em className="muted">未填型号</em>}</td>
                <td><b>{p.nameCn}</b><div className="muted" style={{ fontSize: 12 }}>{p.nameEn}</div></td>
                <td>{p.spec}</td><td className="num">{p.hs}</td><td>{p.unit}</td>
                <td className="num" style={{ textAlign: 'right' }}>{money(p.price)}</td><td className="num">{p.pcsPerCtn || ''}</td>
                <td className="num">{p.l ? `${p.l}×${p.w}×${p.h}` : ''}</td><td className="num">{p.nw || p.gw ? `${p.nw} / ${p.gw}` : ''}</td>
                <td>{p.cat}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={10} className="empty">{products.length ? '没有符合条件的产品' : '产品库是空的：点「导入 Excel / CSV」批量导入，或「新增产品」逐个添加'}</td></tr>}
          </tbody>
        </table></div>
      </div>
      <div className="note">导入时自动识别表头（型号 / 货号、品名、单价、每箱装、外箱尺寸如 60x40x30、净毛重、HS 编码……），支持 Excel（.xlsx）和 CSV（含 GBK 编码）。点一行可编辑。</div>
    </LibPage>
  );
}

/* ---------- HS 记忆库 ---------- */
const SRC_TEXT = { order: '订单导出时记住', import: '导入', manual: '手工修改' } as const;

export function HsMemory() {
  const { hsLib, tariff, addHs, updateHs, deleteHs, clearTariff } = useData();
  const [tab, setTab] = useState<'lib' | 'tariff'>('lib');
  const [q, setQ] = useState('');
  const kw = q.trim().toLowerCase();
  const digits = kw.replace(/\D/g, '');
  const list = hsLib.filter((e) => !kw || e.nameCn.toLowerCase().includes(kw) || (digits.length >= 2 && e.hs.startsWith(digits)) || e.elements.toLowerCase().includes(kw));
  const tlist = !kw ? tariff.slice(0, 100) : tariff.filter((t) => (digits.length >= 2 && t.hs.startsWith(digits)) || t.name.toLowerCase().includes(kw)).slice(0, 200);
  const cell = (id: string, k: 'nameCn' | 'hs' | 'elements' | 'rebate', v: string, opt: { num?: boolean; ph?: string } = {}) => (
    <input className={'cell' + (opt.num ? ' num' : '')} aria-label={k} value={v} placeholder={opt.ph} inputMode={opt.num ? 'decimal' : undefined}
      onChange={(e) => updateHs(id, (x) => void (x[k] = k === 'hs' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value))} />
  );
  return (
    <LibPage title="HS 记忆库" right={tab === 'lib' ? <>
      <button className="btn" onClick={() => void startImport('hs')}>导入 Excel / CSV</button>
      <button className="btn" onClick={() => void exportLibrary('hs')}>导出</button>
      <button className="btn ghost" onClick={() => void exportLibrary('hs', true)}>下载模板</button>
      <button className="btn pri" onClick={() => { addHs(); setQ(''); }}>＋ 新增</button>
    </> : <>
      <button className="btn" onClick={() => void startImport('tariff')}>导入税则表</button>
      <button className="btn ghost" onClick={() => void exportLibrary('tariff', true)}>下载导入模板</button>
      {tariff.length > 0 && <button className="btn ghost danger-t" onClick={async () => {
        if (await confirmAction({ title: '清空税则表', danger: true, ok: '清空', body: <p>清空导入的 {tariff.length} 条税则？HS 记忆库不受影响，之后可以重新导入。</p> })) { clearTariff(); toast('已清空税则表'); }
      }}>清空</button>}
    </>}>
      <div className="seg" style={{ marginBottom: 12 }}>
        <button className={tab === 'lib' ? 'on' : ''} onClick={() => setTab('lib')}>记忆库 · {hsLib.length}</button>
        <button className={tab === 'tariff' ? 'on' : ''} onClick={() => setTab('tariff')}>税则表 · {tariff.length}</button>
      </div>
      <div className="panel">
        <div className="toolbar">
          <label className="search"><span className="muted">搜索</span><input placeholder={tab === 'lib' ? '品名 / 商品编号 / 申报要素' : '商品编号（前几位即可）/ 商品名称'} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {tab === 'tariff' && tariff.length > 0 && <span className="muted" style={{ fontSize: 12.5 }}>{kw ? `找到 ${tlist.length}${tlist.length === 200 ? '+' : ''} 条` : `共 ${tariff.length} 条，显示前 100 条，输入编号或名称查找`}</span>}
        </div>
        {tab === 'lib' ? (
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="tbl hs-tbl" style={{ minWidth: 900 }}>
            <thead><tr><th style={{ width: '22%' }}>中文品名</th><th style={{ width: 130 }}>商品编号</th><th>申报要素</th><th style={{ width: 84 }}>退税率 %</th><th style={{ width: 120 }}>来源</th><th style={{ width: 36 }} /></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td>{cell(e.id, 'nameCn', e.nameCn, { ph: '中文品名' })}</td>
                  <td>{cell(e.id, 'hs', e.hs, { ph: '10 位编码' })}</td>
                  <td>{cell(e.id, 'elements', e.elements, { ph: '如 0|0|展示用|铝合金|无品牌|AL-S200' })}</td>
                  <td>{cell(e.id, 'rebate', String(e.rebate ?? ''), { num: true })}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{SRC_TEXT[e.source]}{e.used ? <div>{e.used}</div> : null}</td>
                  <td><button className="del" aria-label={'删除 ' + e.nameCn} onClick={() => { deleteHs(e.id); toast(`已删除「${e.nameCn || '空白行'}」`, { label: '撤销', run: () => useData.setState((s) => ({ hsLib: [e, ...s.hsLib] })) }); }}>✕</button></td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={6} className="empty">{hsLib.length ? '没有符合条件的品名' : '记忆库是空的：订单导出后会自动记住填过的品名和编码，也可以导入 Excel'}</td></tr>}
            </tbody>
          </table></div>
        ) : (
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="tbl" style={{ minWidth: 900 }}>
            <thead><tr><th style={{ width: 120 }}>商品编号</th><th style={{ width: '24%' }}>商品名称</th><th>申报要素</th><th style={{ width: 80 }}>退税率</th><th style={{ width: 80 }}>法定单位</th><th style={{ width: 120 }}>监管条件</th></tr></thead>
            <tbody>
              {tlist.map((t) => (
                <tr key={t.hs}>
                  <td className="num">{t.hs}</td><td>{t.name}</td><td style={{ fontSize: 12.5 }}>{elementsHint(t)}</td>
                  <td className="num">{String(t.rebate) !== '' ? `${t.rebate}%` : ''}</td><td>{t.unit}</td><td style={{ fontSize: 12.5 }}>{controlText(t.control)}</td>
                </tr>
              ))}
              {!tlist.length && <tr><td colSpan={6} className="empty">{tariff.length ? '没有找到' : '还没有导入税则表：问报关行或货代要一份税则 Excel（商品编号、名称、申报要素、退税率、监管条件），点「导入税则表」即可；也可以先下载导入模板看格式'}</td></tr>}
            </tbody>
          </table></div>
        )}
      </div>
      <div className="note">
        {tab === 'lib'
          ? '订单每次导出，申报商品里填好的「中文品名 + 商品编号 + 申报要素」和采购明细里的退税率会自动记进来；下次在报关资料里输入同样的中文品名，编号、申报要素、退税率自动带出（只补空着的格子）。退税率以当期政策为准。'
          : '税则表用来按商品编号带出申报要素格式（报关资料里提示每项该填什么）、退税率（成本利润用），并检查编号是否存在、有没有监管条件。软件不内置官方税则，导入报关行给的即可。'}
      </div>
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

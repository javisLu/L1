import { OrderCrumbs, TopBar } from '../components/common';
import { openCustomerPicker } from '../components/form';
import { confirmAction } from '../components/confirm';
import { CheckPanel } from '../components/CheckPanel';
import { KeyDates } from '../components/today';
import { ReqPanel } from '../components/requirements';
import { SendHistory } from '../components/history';
import { pkgSummary } from '../domain/package';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { fixed, money, qtyTotal, sym, calcOrder } from '../domain/calc';
import { STATUSES } from '../domain/constants';
import { DOCNAMES, MODS, STEP_MOD, missing, neededMods, type DocKey, type ModKey } from '../modules/defs';
import { docState, shortStamp } from '../domain/exports';
import { orderAmount } from './Home';
import { profitOf } from '../domain/purchase';
import { planOf, receivedOf } from '../domain/receipts';
import { parseMT700, reviewLc, softClauses } from '../domain/lc';
import { checkBl } from '../domain/bl';
import { localDay } from '../domain/reminders';
import type { Order, PartnerType } from '../domain/types';

export function OrderMenu({ order: o }: { order: Order }) {
  const ui = useUI();
  const { customers, partners, setOrderField, duplicateOrder, deleteOrder } = useData();
  const k = calcOrder(o);
  const pk = pkgSummary(o, k);
  const need = neededMods(o);
  const cur = STATUSES.indexOf(o.status);
  const cust = customers.find((c) => c.id === o.customerId);
  const pf = profitOf(o);

  const partnerSelect = (type: PartnerType, key: 'forwarder' | 'broker' | 'factory') => (
    <select id={'in-partners-' + key} value={o.partners[key]} onChange={(e) => setOrderField(o.id, 'partners.' + key, e.target.value)}>
      <option value="">未选择</option>
      {partners.filter((p) => p.type === type).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );

  const card = (key: ModKey) => {
    const m = MODS[key];
    let st;
    let dls = null;
    if (m.special === 'payment') {
      const p = planOf(o), r = receivedOf(o), s = sym(o.terms.currency);
      st = !(o.receipts ?? []).length ? <span className="st ph">还没登记收款 · 应收 {s}{money(p.total)}</span>
        : r.outstanding > 0.005 ? <span className="st warn">已收 {s}{money(r.gross)} · 未收 {s}{money(r.outstanding)}</span>
        : <span className="st ok">✓ 已收齐 {s}{money(r.gross)}</span>;
      dls = <span className="pay-mini" aria-hidden><i style={{ width: `${Math.min(100, r.ratio * 100)}%` }} /></span>;
    } else if (m.special === 'bl') {
      const t = o.bl?.text ?? '';
      const bad = t.trim() ? checkBl(o, t).filter((c) => c.result === 'missing' || c.result === 'diff').length : 0;
      st = !t.trim() ? <span className="st ph">粘贴或上传货代的提单草稿</span>
        : bad ? <span className="st warn">{bad} 处要货代改</span>
        : <span className="st ok">✓ 草稿和订单一致</span>;
    } else if (m.special === 'lc') {
      const f = parseMT700(o.lc?.text ?? '');
      const n = Object.keys(f).length;
      const issues = n ? reviewLc(o, f, localDay()).filter((x) => x.level === 'error').length + softClauses(f).length : 0;
      st = !n ? <span className="st ph">粘贴信用证电文，自动审证</span>
        : issues ? <span className="st warn">{issues} 处要改证 · {f['20'] || '信用证'}</span>
        : <span className="st ok">✓ 已审，没有硬伤 · {f['20'] || '信用证'}</span>;
    } else if (m.special) {
      const last = Object.values(o.exports ?? {}).filter((x) => x?.to).sort((a, b) => b!.at.localeCompare(a!.at))[0];
      st = last ? <span className="st ok">上次打包 {shortStamp(last.at)} · 发给{last.to}</span> : <span className="st ph">按收件人选好单据，一键打包</span>;
    } else {
      const miss = (m.steps ?? []).flatMap((x) => missing(o, x));
      // 本模块自己的都填好了，但单据还用到别的模块里没填的资料
      const wait = [...new Set((m.uses ?? []).filter((x) => missing(o, x).length).map((x) => MODS[STEP_MOD[x]].name))];
      // 报关资料模块里的发票、箱单属于各自模块，这里只看报关预录入表
      const own = key === 'customs' ? (['customs'] as DocKey[]) : m.docs ?? [];
      const states = own.map((d) => ({ d, s: docState(o, d) }));
      const changed = states.filter((x) => x.s.kind === 'changed');
      if (miss.length) st = <span className="st warn" title={miss.slice(0, 12).join('、')}>缺 {miss.length} 项资料</span>;
      else if (wait.length) st = <span className="st warn" title="这些资料在其它模块填写，本模块的单据也会用到">等「{wait.join('」「')}」补齐资料</span>;
      else if (changed.length) st = <span className="st chg">⚠ 导出后又改过，需要重发</span>;
      else st = <span className="st ok">✓ 资料齐全</span>;
      dls = (
        <span className="dls">
          {states.map(({ d, s: x }) => (
            <span key={d} className={x.kind}>
              <i />{DOCNAMES[d]}
              <em>{x.kind === 'none' ? '未导出' : `${x.kind === 'changed' ? '改过 · ' : ''}${shortStamp(x.at)}${x.to ? ' ' + x.to : ''}`}</em>
            </span>
          ))}
        </span>
      );
    }
    return (
      <button key={key} className="mcard" onClick={() => ui.openMod(key)}>
        {!need.has(key) && <span className="need" title={key === 'purchase' ? '本单没选工厂、也没填采购价：自己是工厂的不用下采购单' : '按本单的运输方式和付款方式，一般用不到'}>本单可不做</span>}
        <span className="code">{m.code}</span>
        <b>{m.name}</b>
        <small>{m.desc}</small>
        {st}
        {dls}
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
              <span>数量</span><b className="num">{qtyTotal(k.rows).replace(/\n/g, ' · ')}</b>
              <span>件数</span><b className="num">{pk.mode === 'ctns' ? `${k.ctns} CTNS` : `${pk.count} ${pk.unitEn} / ${k.ctns} CTNS`}</b>
              <span>毛重 / 体积</span><b className="num">{fixed(pk.gw, 1)} kg / {fixed(pk.cbm, 2)} m³</b>
              {pf.hasCost && (
                <>
                  <span>预计利润</span>
                  <button className={'pf-mini num' + (pf.profit < 0 ? ' neg' : '')} title="在「工厂采购 → 成本利润」里看明细" onClick={() => { ui.openMod('purchase'); ui.set({ step: 'profit' }); }}>
                    ¥{money(pf.profit)} · {fixed(pf.margin * 100, 1)}%{pf.noCost.length ? ' · 部分未填采购价' : ''}
                  </button>
                </>
              )}
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
        <ReqPanel order={o} />
        <KeyDates order={o} />
        <SendHistory order={o} />
        <div className="mgroup">
          <div className="sec-title"><h2>单据</h2><span className="muted" style={{ fontSize: 12.5 }}>每项资料只在一个模块里填，所有单据自动共用；导出后再改动，会提示哪份单据需要重发</span></div>
          <div className="mods">{keys.filter((x) => MODS[x].grp === 'doc' && !MODS[x].ph).map(card)}</div>
        </div>
        <div className="mgroup">
          <div className="sec-title"><h2>收款与业务</h2><span className="muted" style={{ fontSize: 12.5 }}>不出单据，记本单的钱和进度</span></div>
          <div className="mods">{keys.filter((x) => MODS[x].grp === 'biz' && !MODS[x].ph).map(card)}</div>
        </div>
      </main>
    </>
  );
}

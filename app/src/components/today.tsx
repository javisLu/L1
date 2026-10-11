import { useState } from 'react';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { today } from '../domain/calc';
import { balanceDue, daysUntil, orderReminders, reminders, rel, type Reminder } from '../domain/reminders';
import type { Order } from '../domain/types';

/** 打开提醒对应的模块和步骤 */
function goTo(r: Reminder) {
  if (!r.go) return useUI.getState().openOrder(r.orderId);
  useUI.getState().set({ page: 'module', prev: 'home', orderId: r.orderId, mod: r.go.mod, step: r.go.step ?? null, doc: r.go.doc ?? null, expSel: null, expDoc: null });
}

function Row({ r, order, showOrder }: { r: Reminder; order: Order; showOrder: boolean }) {
  const { setOrderField, dismissReminder } = useData();
  const ui = useUI();
  return (
    <div className={'td-row ' + r.level}>
      <i className="td-dot" />
      {showOrder && <button className="td-ord" onClick={() => ui.openOrder(order.id)} title="打开订单">{order.no} <span>{order.name}</span></button>}
      <span className="td-t">{r.text}</span>
      <span className="td-acts">
        {r.act && (
          <button className="btn sm" onClick={() => { setOrderField(order.id, 'status', r.act!.status); toast(`${order.no} 状态已改为「${r.act!.status}」`); }}>{r.act.label}</button>
        )}
        {r.go && <button className="btn sm" onClick={() => goTo(r)}>去处理</button>}
        <button className="btn ghost sm" title="这条不再提醒（日期改了会重新提醒）" onClick={() => dismissReminder(order.id, r.key)}>知道了</button>
      </span>
    </div>
  );
}

/** 首页「今天要做」 */
export function TodayPanel() {
  const orders = useData((s) => s.orders);
  const [all, setAll] = useState(false);
  const list = reminders(orders, today());
  const active = orders.some((o) => o.status !== '完结');
  if (!active) return null;
  const shown = all ? list : list.slice(0, 5);
  const byId = new Map(orders.map((o) => [o.id, o]));
  return (
    <div className="panel today">
      <div className="today-h">
        <h2>今天要做{list.length ? <span className="td-n">{list.length}</span> : null}</h2>
        <span className="muted">按货好、截关、开船、到港、尾款和信用证日期自动提醒</span>
      </div>
      {list.length ? (
        <>
          {shown.map((r) => <Row key={r.orderId + r.key} r={r} order={byId.get(r.orderId)!} showOrder />)}
          {list.length > 5 && <button className="td-more" onClick={() => setAll(!all)}>{all ? '收起' : `还有 ${list.length - 5} 件，展开`}</button>}
        </>
      ) : (
        <div className="td-empty">✓ 今天没有要紧的事。在订单里填好货好时间、截关、开船日、尾款到期日，到时这里会提醒你。</div>
      )}
    </div>
  );
}

/** 订单页「关键日期」：时间线 + 本单提醒 */
export function KeyDates({ order: o }: { order: Order }) {
  const setOrderField = useData((s) => s.setOrderField);
  const t = today();
  const lc = /L\/C/.test(o.terms.payment);
  const bal = balanceDue(o);
  const cells: { path: string; label: string; v: string; hint?: string; auto?: string }[] = [
    { path: 'numbers.validUntil', label: '报价有效期', v: o.numbers.validUntil },
    { path: 'shipping.cargoReady', label: '货好时间', v: o.shipping.cargoReady ?? '' },
    ...(o.terms.transport !== '快递' ? [{ path: 'shipping.cutoff', label: '截关', v: o.shipping.cutoff ?? '' }] : []),
    { path: 'shipping.etd', label: '开船 ETD', v: o.shipping.etd },
    { path: 'shipping.eta', label: '到港 ETA', v: o.shipping.eta ?? '' },
    ...(lc
      ? [{ path: 'dates.lcLatest', label: '信用证最迟装运', v: o.dates?.lcLatest ?? '' }, { path: 'dates.lcExpiry', label: '信用证有效期', v: o.dates?.lcExpiry ?? '' }]
      : [{ path: 'dates.balanceDue', label: '尾款到期', v: o.dates?.balanceDue ?? '', auto: bal.auto && bal.date ? bal.date : '' }]),
  ];
  const mine = orderReminders(o, t);
  return (
    <div className="panel kd">
      <div className="today-h">
        <h2>关键日期</h2>
        <span className="muted">到期前会在首页「今天要做」提醒；和运输信息里的日期是同一份</span>
      </div>
      <div className="kd-line">
        {cells.map((c) => {
          const d = c.v ? daysUntil(c.v, t) : c.auto ? daysUntil(c.auto, t) : NaN;
          return (
            <label key={c.path} className={'kd-cell' + (c.v ? ' set' : '') + (!Number.isNaN(d) && d < 0 ? ' past' : '')}>
              <span className="kd-l">{c.label}</span>
              <input type="date" id={'in-' + c.path.replace(/\./g, '-')} value={c.v} onChange={(e) => setOrderField(o.id, c.path, e.target.value)} />
              <span className="kd-r">
                {c.v ? rel(d) : c.auto ? `自动：${c.auto.slice(5)} · ${rel(d)}` : '未填'}
              </span>
            </label>
          );
        })}
      </div>
      {!!mine.length && (
        <div className="kd-rem">
          {mine.map((r) => <Row key={r.key} r={r} order={o} showOrder={false} />)}
        </div>
      )}
    </div>
  );
}

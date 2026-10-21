import { OrderCrumbs, TopBar } from '../components/common';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { fixed, money, sym, today, toNum, uid } from '../domain/calc';
import { BALANCE_CN } from '../domain/constants';
import { RECEIPT_KINDS, actualProfit, isPaidStatus, nextReceipt, planOf, receivedOf } from '../domain/receipts';
import { profitOf } from '../domain/purchase';
import { balanceDue, daysUntil, localDay } from '../domain/reminders';
import { inputId } from '../modules/defs';
import type { Order, Receipt } from '../domain/types';

/** 收款记录：应收（定金 / 尾款）、每笔到账、实际利润 */
export function Payments({ order: o }: { order: Order }) {
  const ui = useUI();
  const { updateOrder, setOrderField } = useData();
  const c = o.terms.currency, s = sym(c);
  const plan = planOf(o), got = receivedOf(o);
  const list = o.receipts ?? [];
  const due = balanceDue(o).date;
  const dueIn = due ? daysUntil(due, localDay()) : null;
  const cny1 = c === 'CNY';
  const pf = profitOf(o), act = actualProfit(o);

  const add = () => {
    const n = nextReceipt(o);
    const r: Receipt = { id: uid(), date: today(), kind: n.kind, amount: n.amount || '', fee: '', rate: '', note: '' };
    updateOrder(o.id, (x) => void (x.receipts ??= []).push(r));
    setTimeout(() => document.getElementById(inputId(`receipts.${list.length}.amount`))?.focus(), 0);
  };
  const del = (i: number) => {
    const r = list[i];
    updateOrder(o.id, (x) => void x.receipts!.splice(i, 1));
    toast(`已删除 ${r.date} 的${r.kind}`, { label: '撤销', run: () => updateOrder(o.id, (x) => void (x.receipts ??= []).splice(i, 0, r)) });
  };
  const cell = (i: number, k: 'date' | 'amount' | 'fee' | 'rate' | 'note', opt: { num?: boolean; type?: string; ph?: string } = {}) => (
    <input className={'cell' + (opt.num ? ' num' : '')} id={inputId(`receipts.${i}.${k}`)} type={opt.type ?? 'text'} inputMode={opt.num ? 'decimal' : undefined}
      placeholder={opt.ph} value={String(list[i][k] ?? '')} aria-label={k} onChange={(e) => setOrderField(o.id, `receipts.${i}.${k}`, e.target.value)} />
  );
  const depOk = plan.deposit <= 0 || got.deposit >= plan.deposit - 0.005;
  const paidUp = got.outstanding <= 0.005;

  return (
    <>
      <TopBar><OrderCrumbs order={o} current="收款记录" /></TopBar>
      <div className="mod-head">
        <button className="btn ghost sm" onClick={() => ui.openOrder(o.id)}>← 订单菜单</button>
        <h1><span className="code">T/T</span>收款记录</h1>
        <span className="ord">{o.no} · {o.buyer.name || '未选择客户'}</span>
        <div className="r">
          {paidUp && !isPaidStatus(o) && list.length > 0 && (
            <button className="btn" onClick={() => { setOrderField(o.id, 'status', '收款'); toast('订单状态已改为「收款」'); }}>已收齐，标为「收款」</button>
          )}
          <button className="btn pri" onClick={add}>＋ 登记一笔收款</button>
        </div>
      </div>
      <main className="wrap pay">
        <div className="pay-sum">
          <div className="panel"><small>合同金额</small><b className="num">{s}{money(plan.total)}</b><span className="muted">{o.terms.paymentText || o.terms.payment}</span></div>
          <div className="panel"><small>已收</small><b className="num ok">{s}{money(got.gross)}</b><span className="muted">{fixed(got.ratio * 100, 0)}%{got.fees ? ` · 银行扣费 ${s}${money(got.fees)}` : ''}</span></div>
          <div className="panel">
            <small>未收</small>
            <b className={'num' + (got.outstanding > 0.005 ? ' warn' : ' ok')}>{got.outstanding > 0.005 ? `${s}${money(got.outstanding)}` : got.outstanding < -0.005 ? `多收 ${s}${money(-got.outstanding)}` : '已收齐'}</b>
            <span className="muted">
              {got.outstanding > 0.005 && due ? `尾款${dueIn! < 0 ? `已逾期 ${-dueIn!} 天` : dueIn === 0 ? '今天到期' : `${dueIn} 天后到期`}（${due}）` : got.outstanding > 0.005 ? '尾款到期日在订单的「关键日期」里填' : ''}
            </span>
          </div>
        </div>
        <div className="pay-bar" aria-hidden><i style={{ width: `${Math.min(100, got.ratio * 100)}%` }} /></div>

        <div className="panel pay-plan">
          <h3>应收</h3>
          {plan.deposit > 0 && (
            <div className="pay-line">
              <span>定金 {plan.pct}%</span><b className="num">{s}{money(plan.deposit)}</b>
              <em className={depOk ? 'ok' : 'warn'}>{depOk ? '✓ 已收' : got.deposit ? `已收 ${s}${money(got.deposit)}，差 ${s}${money(plan.deposit - got.deposit)}` : '未收'}</em>
            </div>
          )}
          <div className="pay-line">
            <span>{plan.deposit > 0 ? `尾款 ${100 - plan.pct}%` : '货款'}</span><b className="num">{s}{money(plan.deposit > 0 ? plan.balance : plan.total)}</b>
            <em className={paidUp ? 'ok' : 'muted'}>
              {paidUp ? '✓ 已收齐' : [o.terms.payment === 'T/T 电汇' && plan.deposit > 0 ? BALANCE_CN[o.terms.payBalanceAt] : '', due ? `到期 ${due}` : ''].filter(Boolean).join(' · ') || '—'}
            </em>
          </div>
        </div>

        <div className="panel">
          <h3>到账记录</h3>
          <div className="tbl-wrap" style={{ border: 0 }}>
            <table className="tbl pay-tbl" style={{ minWidth: 860 }}>
              <thead>
                <tr><th style={{ width: 140 }}>日期</th><th style={{ width: 90 }}>类型</th><th>客户汇来（{c}）</th><th>银行扣费（{c}）</th>{!cny1 && <th>结汇汇率</th>}{!cny1 && <th style={{ textAlign: 'right' }}>折人民币</th>}<th>备注</th><th style={{ width: 36 }} /></tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const net = toNum(r.amount) - toNum(r.fee);
                  return (
                    <tr key={r.id}>
                      <td>{cell(i, 'date', { type: 'date' })}</td>
                      <td>
                        <select className="cell" aria-label="类型" value={r.kind} onChange={(e) => setOrderField(o.id, `receipts.${i}.kind`, e.target.value)}>
                          {RECEIPT_KINDS.map((k) => <option key={k}>{k}</option>)}
                        </select>
                      </td>
                      <td>{cell(i, 'amount', { num: true })}</td>
                      <td>{cell(i, 'fee', { num: true, ph: '中间行 + 本行' })}</td>
                      {!cny1 && <td>{cell(i, 'rate', { num: true, ph: '没结汇留空' })}</td>}
                      {!cny1 && <td className="calc">{toNum(r.rate) ? `¥${money(net * toNum(r.rate))}` : <span className="muted">未结汇</span>}</td>}
                      <td>{cell(i, 'note', { ph: '如：水单号、付款人' })}</td>
                      <td><button className="del" aria-label="删除这笔" onClick={() => del(i)}>✕</button></td>
                    </tr>
                  );
                })}
                {!list.length && <tr><td colSpan={8} className="empty">还没有登记收款。客户付款到账后点右上角「登记一笔收款」，定金、尾款金额会自动带出。</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="note" style={{ marginTop: 10 }}>
            客户汇来的金额按水单填；中间行和本行扣的手续费填在「银行扣费」，实际到账 = 汇来 − 扣费。{cny1 ? '' : '结汇后填结汇汇率，还没结汇的留空（按参考汇率估）。'}
          </div>
        </div>

        <div className="panel">
          <h3>利润：预计 vs 实际</h3>
          {pf.hasCost ? (
            <div className="pay-pf">
              <div><small>下单时预计</small><b className="num">¥{money(pf.profit)}</b><span className="muted">利润率 {fixed(pf.margin * 100, 1)}% · 汇率 {pf.rate}{pf.rateRef ? '（参考）' : ''}</span></div>
              <div><small>{act.estimated ? '实际（未收 / 未结汇部分按汇率估）' : '实际'}</small><b className={'num' + (act.profit < 0 ? ' neg' : ' ok')}>¥{money(act.profit)}</b><span className="muted">利润率 {fixed(act.margin * 100, 1)}%</span></div>
              <div><small>差额</small><b className={'num' + (act.profit - pf.profit < 0 ? ' neg' : '')}>{act.profit - pf.profit >= 0 ? '+' : '−'}¥{money(Math.abs(act.profit - pf.profit))}</b><span className="muted">{!cny1 && Math.abs(act.fx) >= 0.5 ? `其中汇率差 ${act.fx >= 0 ? '+' : '−'}¥${money(Math.abs(act.fx))}` : '主要来自银行扣费和收款差额'}</span></div>
            </div>
          ) : (
            <div className="empty" style={{ padding: '14px 0' }}>在「工厂采购 → 采购明细」里填好采购价后，这里会对比预计利润和实际利润。</div>
          )}
          <div className="note" style={{ marginTop: 10 }}>实际利润里的银行手续费按上面登记的实际扣费算，成本利润费用清单里的「银行手续费」不再重复计。</div>
        </div>
      </main>
    </>
  );
}

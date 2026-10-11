import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { uid } from '../domain/calc';
import { REQS, REQ_GROUPS, applyReqs, autoReqCount, newReq, reqState, reqStrict } from '../domain/requirements';
import { jumpToField } from './jump';
import type { Customer, CustReq, Order, ReqKey } from '../domain/types';

/** 客户库：单据要求清单的编辑 */
export function ReqEditor({ customer: c }: { customer: Customer }) {
  const updateCustomer = useData((s) => s.updateCustomer);
  const reqs = c.reqs ?? [];
  const edit = (recipe: (list: CustReq[]) => void) => updateCustomer(c.id, (x) => recipe((x.reqs ??= [])));
  const add = (k: ReqKey) => {
    if (k !== 'note' && !REQS[k].param && reqs.some((r) => r.k === k)) return toast('这条要求已经在清单里了');
    edit((l) => void l.push(newReq(k, uid())));
  };
  return (
    <div className="req-ed">
      {reqs.map((r, i) => {
        const d = REQS[r.k];
        const p = d.param;
        const set = (v: string) => edit((l) => void (l[i].v = v));
        return (
          <div key={r.id} className={'req-row' + (r.k === 'note' ? ' note' : '')}>
            <span className="req-tag" title={d.apply ? '新建订单时自动设置，出货前自动检查' : d.check ? '出货前自动检查' : '每单手动勾选确认'}>
              {d.apply ? '自动设置' : d.check ? '自动检查' : '手动确认'}
            </span>
            <b>{r.k === 'note' ? '提醒' : d.label}</b>
            {p?.kind === 'select' && (
              <select aria-label={d.label} value={r.v} onChange={(e) => set(e.target.value)}>
                {p.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            )}
            {p?.kind === 'number' && (
              <span className="req-num"><input aria-label={d.label} inputMode="decimal" value={r.v} onChange={(e) => set(e.target.value)} />{p.unit}</span>
            )}
            {p?.kind === 'text' && (
              r.k === 'notify'
                ? <textarea aria-label={d.label} rows={2} value={r.v} placeholder={p.placeholder} onChange={(e) => set(e.target.value)} />
                : <input aria-label={d.label} value={r.v} placeholder={p.placeholder} onChange={(e) => set(e.target.value)} />
            )}
            {!p && <span />}
            <button className="del" aria-label="删除这条要求" onClick={() => edit((l) => void l.splice(i, 1))}>✕</button>
          </div>
        );
      })}
      <div className="req-add">
        <select aria-label="添加要求" value="" onChange={(e) => e.target.value && add(e.target.value as ReqKey)}>
          <option value="">＋ 添加一条要求…</option>
          {REQ_GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {(Object.keys(REQS) as ReqKey[]).filter((k) => REQS[k].group === g).map((k) => <option key={k} value={k}>{REQS[k].label}</option>)}
            </optgroup>
          ))}
        </select>
        <span className="muted">新建订单时，标「自动设置」的会直接改好；出货前单据检查逐条核对，不符合的一键改正；「手动确认」的每单勾选。</span>
      </div>
    </div>
  );
}

/** 订单页：这个客户的要求逐条显示是否符合 */
export function ReqPanel({ order: o }: { order: Order }) {
  const ui = useUI();
  const { customers, updateOrder } = useData();
  const c = customers.find((x) => x.id === o.customerId);
  if (!c) return null;
  const reqs = c.reqs ?? [];
  const edit = () => ui.set({ page: 'customers', prev: 'order', custId: c.id });
  if (!reqs.length)
    return (
      <div className="panel req-panel empty-req">
        <span><b>客户要求</b> · {c.short || c.name} 还没有单据要求。记下这个客户的规矩（唛头要 PO 号、发票注明某句话、每箱不超过 23 kg…），新单自动套用、出货前逐条核对。</span>
        <button className="btn sm" onClick={edit}>去添加</button>
      </div>
    );
  const states = reqs.map((r) => ({ r, st: reqState(o, r) }));
  const bad = states.filter((x) => x.st.kind === 'bad').length;
  const todo = states.filter((x) => x.st.kind === 'manual' && !x.st.done).length;
  const strict = reqStrict(o);
  return (
    <div className={'panel req-panel' + (bad && strict ? ' bad' : '')}>
      <div className="today-h">
        <h2>客户要求 <span className="muted" style={{ fontWeight: 400 }}>· {c.short || c.name}</span></h2>
        <span className={'req-sum' + (bad ? ' bad' : todo ? ' todo' : ' ok')}>
          {bad ? `${bad} 条不符合` : todo ? `${todo} 条待确认` : `全部 ${reqs.length} 条符合`}
        </span>
        <span className="req-acts">
          {autoReqCount(reqs) > 0 && (
            <button className="btn ghost sm" title="把能自动设置的要求重新套用到本单（如唛头、提单类型、注明文字）" onClick={() => {
              updateOrder(o.id, (x) => void applyReqs(x, reqs));
              toast(`已按客户要求重新设置 ${autoReqCount(reqs)} 项`);
            }}>重新套用</button>
          )}
          <button className="btn ghost sm" onClick={edit}>编辑要求</button>
        </span>
      </div>
      <div className="req-list">
        {states.map(({ r, st }) => {
          const d = REQS[r.k];
          return (
            <div key={r.id} className={'req-item ' + (st.kind === 'manual' ? (st.done ? 'ok' : 'todo') : st.kind)}>
              {st.kind === 'manual' ? (
                <label className="req-chk">
                  <input type="checkbox" checked={st.done} onChange={(e) => updateOrder(o.id, (x) => {
                    const l = (x.reqDone ??= []);
                    if (e.target.checked) { if (!l.includes(r.id)) l.push(r.id); } else l.splice(l.indexOf(r.id), 1);
                  })} />
                  <span>{d.describe(r.v)}</span>
                </label>
              ) : (
                <>
                  <i className="req-ic">{st.kind === 'ok' ? '✓' : '✗'}</i>
                  <span className="req-t">{d.describe(r.v)}{st.kind === 'bad' && <small>{st.problem.text}</small>}</span>
                </>
              )}
              <span className="req-r">
                {st.kind === 'bad' && d.apply && (
                  <button className="btn sm" onClick={() => { updateOrder(o.id, (x) => d.apply!(x, r.v)); toast('已按客户要求改好：' + d.describe(r.v)); }}>按要求改</button>
                )}
                {st.kind === 'bad' && <button className="btn ghost sm" onClick={() => jumpToField(st.problem.mod, st.problem.step, st.problem.path)}>去改</button>}
                {st.kind === 'ok' && <span className="muted">符合</span>}
                {st.kind === 'manual' && <span className="muted">{st.done ? '已确认' : '每单手动确认'}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { fixed, money, sym, uid } from '../domain/calc';
import { defaultPurchase, factoriesOf, factoryName, missingSellerCosts, poNo, poRows, poTotal, profitOf, purchaseOf } from '../domain/purchase';
import { inputId } from '../modules/defs';
import type { Order } from '../domain/types';

/** 采购条款：每个工厂一块——采购单号、交货日期、付款方式、备注 */
export function FactoryPOs({ order: o }: { order: Order }) {
  const partners = useData((s) => s.partners);
  const setField = useData((s) => s.setOrderField);
  const pos = purchaseOf(o).pos;
  const fids = factoriesOf(o);
  const input = (fid: string, key: 'no' | 'delivery' | 'payment' | 'note', label: string, opt: { type?: string; placeholder?: string; wide?: boolean } = {}) => {
    const path = `purchase.pos.${fid}.${key}`;
    return (
      <div className={'fi' + (opt.wide ? ' w2' : '')}>
        <label htmlFor={inputId(path)}>{label}</label>
        <input id={inputId(path)} type={opt.type ?? 'text'} value={pos[fid]?.[key] ?? ''} placeholder={opt.placeholder} onChange={(e) => setField(o.id, path, e.target.value)} />
      </div>
    );
  };
  return (
    <div className="w2 fpo-list">
      {fids.map((fid) => (
        <div key={fid} className="fpo">
          <div className="fpo-h">
            <b>{factoryName(partners, fid) || '未选择工厂'}</b>
            <span className="muted">{poRows(o, fid).length} 样货 · 采购金额 ¥{money(poTotal(o, fid))}</span>
          </div>
          <div className="grid">
            {input(fid, 'no', '采购单号', { placeholder: poNo(o, fid) || '如 CG-2026-003' })}
            {input(fid, 'delivery', '交货日期', { type: 'date' })}
            {input(fid, 'payment', '付款方式', { wide: true, placeholder: '如：30% 定金，70% 提货前付清；或月结 30 天' })}
            {input(fid, 'note', '备注', { wide: true })}
          </div>
        </div>
      ))}
      {!fids.some(Boolean) && (
        <div className="note">还没有选工厂：在订单菜单的「合作方 → 工厂」选一个，或在「采购明细」里每行单独选。工厂资料在「合作方库」里添加。</div>
      )}
    </div>
  );
}

/** 成本利润：费用清单（人民币，整票），可增删改名 */
export function FeeList({ order: o }: { order: Order }) {
  const setField = useData((s) => s.setOrderField);
  const updateOrder = useData((s) => s.updateOrder);
  const fees = purchaseOf(o).fees;
  const edit = (fn: (o: Order) => void) => updateOrder(o.id, (x) => { x.purchase ??= defaultPurchase(); fn(x); });
  return (
    <div className="w2">
      <div className="fee-list">
        {fees.map((f, i) => (
          <div key={f.id} className="fee">
            <input className="fee-n" id={inputId(`purchase.fees.${i}.name`)} aria-label="费用名称" value={f.name} onChange={(e) => setField(o.id, `purchase.fees.${i}.name`, e.target.value)} />
            <span className="fee-y">¥</span>
            <input className="fee-a num" id={inputId(`purchase.fees.${i}.amount`)} aria-label={f.name + '金额'} inputMode="decimal" value={String(f.amount ?? '')} placeholder="0" onChange={(e) => setField(o.id, `purchase.fees.${i}.amount`, e.target.value)} />
            <button className="del" aria-label={'删除' + f.name} onClick={() => {
              edit((x) => void x.purchase!.fees.splice(i, 1));
              toast(`已删除「${f.name}」`, { label: '撤销', run: () => edit((x) => void x.purchase!.fees.splice(i, 0, f)) });
            }}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn sm" onClick={() => edit((x) => void x.purchase!.fees.push({ id: uid(), name: '其他费用', amount: '' }))}>＋ 添加费用</button>
    </div>
  );
}

/** 成本利润：汇总（销售额、采购成本、退税、费用、利润、利润率） */
export function ProfitSummary({ order: o }: { order: Order }) {
  const p = profitOf(o);
  const goItems = () => useUI.getState().set({ step: 'purchaseItems' });
  const row = (l: string, v: string, cls = '', sub?: string) => (
    <div className={'pf-row ' + cls}><span>{l}{sub && <small>{sub}</small>}</span><b className="num">{v}</b></div>
  );
  return (
    <div className="w2 pf">
      {row('销售额', `¥${money(p.sales)}`, '', p.cur === 'CNY' ? undefined : `${sym(p.cur)}${money(p.salesFx)} × ${p.rate}${p.rateRef ? '（参考汇率）' : ''}`)}
      {row('+ 出口退税', `¥${money(p.rebate)}`, 'plus')}
      {row('− 采购成本（含税）', `¥${money(p.cost)}`, 'minus')}
      {row('− 费用', `¥${money(p.fees)}`, 'minus')}
      <div className={'pf-total' + (p.profit < 0 ? ' neg' : '')}>
        <span>预计利润</span>
        <b className="num">¥{money(p.profit)}</b>
        <em>利润率 {fixed(p.margin * 100, 1)}%</em>
      </div>
      {missingSellerCosts(o).length > 0 && (
        <div className="note">
          {o.terms.incoterm} 成交由我方付{missingSellerCosts(o).join('、')}，上面费用里还没填，利润偏高。
        </div>
      )}
      {p.noCost.length > 0 && (
        <div className="note">
          还有 {p.noCost.length} 行没填采购单价（第 {p.noCost.slice(0, 6).map((i) => i + 1).join('、')}{p.noCost.length > 6 ? ' 等' : ''} 行），利润偏高、不准。
          <button className="btn ghost sm" onClick={goItems}>去填采购价</button>
        </div>
      )}
    </div>
  );
}

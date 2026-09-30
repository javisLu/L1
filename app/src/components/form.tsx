import { useState } from 'react';
import { useData, getPath } from '../store/data';
import { toast, useUI } from '../store/ui';
import { calc, fixed, int, money, sym } from '../domain/calc';
import { CONTRACT_LIB } from '../domain/constants';
import { emptyItem, productToItem, syncPay } from '../domain/factory';
import { SRC_NAME, TABLES, dyn, inputId, type FieldDef, type TableKey } from '../modules/defs';
import type { Order } from '../domain/types';
import { uid } from '../domain/calc';

type FieldSpec = Extract<FieldDef, { kind: 'field' }>;

export function FieldView({ order, def }: { order: Order; def: FieldDef }) {
  const setField = useData((s) => s.setOrderField);
  const updateOrder = useData((s) => s.updateOrder);
  if (def.kind === 'head') {
    return (
      <div className="sub w2">
        <span>{def.label}</span>
        {def.tools === 'buyer' && <BuyerTools order={order} />}
      </div>
    );
  }
  if (def.kind === 'note') {
    const t = def.text(order);
    return t ? <div className="note w2" style={{ marginTop: -4 }}>{t}</div> : null;
  }
  const d: FieldSpec = def;
  if (d.show && !d.show(order)) return null;
  const id = inputId(d.path);
  const v = getPath<unknown>(order, d.path);
  const label = dyn(d.label, order);
  const req = dyn(d.req ?? false, order);
  const set = (val: unknown) => setField(order.id, d.path, val);

  if (d.type === 'checkbox') {
    return (
      <div className={'fi chk' + (d.wide ? ' w2' : '')}>
        <input type="checkbox" id={id} checked={!!v} onChange={(e) => set(e.target.checked)} />
        <label htmlFor={id}>{label}</label>
      </div>
    );
  }
  const tool = d.tool === 'payreset' ? (
    order.terms.paymentManual ? (
      <button
        className="btn ghost sm"
        style={{ marginLeft: 'auto' }}
        onClick={() => {
          updateOrder(order.id, (o) => {
            o.terms.paymentManual = false;
            syncPay(o);
          });
          toast('已按付款方式重新生成付款条款');
        }}
      >
        恢复自动生成
      </button>
    ) : (
      <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>根据上面的选项自动生成，可直接修改</span>
    )
  ) : null;

  let input;
  if (d.type === 'textarea') {
    input = <textarea id={id} rows={3} value={String(v ?? '')} placeholder={d.placeholder} onChange={(e) => set(e.target.value)} />;
  } else if (d.type === 'select') {
    const opts = d.options ?? [];
    const all = v && !opts.includes(String(v)) ? [String(v), ...opts] : opts;
    input = (
      <select id={id} value={String(v ?? '')} onChange={(e) => set(e.target.value)}>
        {all.map((x) => <option key={x} value={x}>{d.optionLabels?.[x] ?? x}</option>)}
      </select>
    );
  } else {
    input = <input id={id} type={d.type === 'date' ? 'date' : 'text'} value={String(v ?? '')} placeholder={d.placeholder} onChange={(e) => set(e.target.value)} />;
  }
  return (
    <div className={'fi' + (d.wide ? ' w2' : '')}>
      <label htmlFor={id}>
        {label}
        {req && <span className="req">*</span>}
        {d.src && <span className={'tag ' + d.src} title={'由' + SRC_NAME[d.src] + '提供'}>{d.src}</span>}
        {tool}
      </label>
      {input}
    </div>
  );
}

function BuyerTools({ order }: { order: Order }) {
  const save = useData((s) => s.saveBuyerToLibrary);
  return (
    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="btn sm" onClick={() => openCustomerPicker(order.id)}>从客户库选择</button>
      <button
        className="btn sm"
        onClick={() => {
          if (!order.buyer.name) return toast('请先填写买方公司名称');
          const r = save(order.id);
          toast(r.created ? '已保存到客户库，下次可直接调用' : '已同步更新客户库：' + r.name);
        }}
      >
        保存到客户库
      </button>
    </span>
  );
}

export function openCustomerPicker(orderId: string) {
  const { customers, applyCustomerToOrder } = useData.getState();
  const ui = useUI.getState();
  ui.openModal({
    title: '从客户库选择',
    body: customers.map((c) => (
      <button
        key={c.id}
        className="opt"
        style={{ width: '100%', textAlign: 'left', background: 'none' }}
        onClick={() => {
          applyCustomerToOrder(orderId, c.id);
          ui.closeModal();
          toast('已带入 ' + c.name + ' 的客户信息和默认交易习惯');
        }}
      >
        <span>
          <b>{c.name}</b>
          <small>{c.country} · {c.contacts[0]?.name} · 默认 {c.habits.incoterm} {c.habits.place} / {c.habits.payment}</small>
        </span>
      </button>
    )),
  });
}

function ProductPicker({ orderId }: { orderId: string }) {
  const products = useData((s) => s.products);
  const updateOrder = useData((s) => s.updateOrder);
  const close = useUI((s) => s.closeModal);
  const [sel, setSel] = useState<string[]>([]);
  return (
    <>
      {products.map((p) => (
        <label key={p.id} className="opt">
          <input type="checkbox" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />
          <span><b>{p.model} · {p.nameCn}</b><small>{p.nameEn} · ${money(p.price)} / {p.unit} · {p.pcsPerCtn} {p.unit}/箱</small></span>
        </label>
      ))}
      <div className="modal-f" style={{ margin: '12px -20px -16px' }}>
        <button className="btn" onClick={close}>取消</button>
        <button
          className="btn pri"
          onClick={() => {
            updateOrder(orderId, (o) => sel.forEach((id) => o.items.push(productToItem(products.find((p) => p.id === id)!))));
            close();
            if (sel.length) toast(`已添加 ${sel.length} 个产品，请填写数量`);
          }}
        >
          添加所选
        </button>
      </div>
    </>
  );
}

export function ItemTable({ order, table }: { order: Order; table: TableKey }) {
  const setField = useData((s) => s.setOrderField);
  const updateOrder = useData((s) => s.updateOrder);
  const openModal = useUI((s) => s.openModal);
  const k = calc(order.items);
  const cols = TABLES[table];
  const cur = order.terms.currency;
  const calcCell = (i: number, c: string) => {
    const r = k.rows[i];
    if (c === 'a') return money(r.a);
    if (c === 'q') return int(r.q);
    if (c === 'n') return String(r.n);
    if (c === 'cno') return r.n ? `${r.from}–${r.to}` : '—';
    if (c === 'cbmT') return fixed(r.cbmT, 3);
    return '';
  };
  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="ix">#</th>
              {cols.map((c) => <th key={c.label} style={{ minWidth: c.width }}>{c.label.replace('{CUR}', cur)}</th>)}
              {table === 'items' && <th />}
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={it.id}>
                <td className="ix">{i + 1}</td>
                {cols.map((c) =>
                  c.key ? (
                    <td key={c.key}>
                      <input
                        className={'cell' + (c.num ? ' num' : '')}
                        id={inputId(`items.${i}.${c.key}`)}
                        value={String((it as unknown as Record<string, unknown>)[c.key] ?? '')}
                        inputMode={c.num ? 'decimal' : undefined}
                        aria-label={c.label}
                        onChange={(e) => setField(order.id, `items.${i}.${c.key}`, e.target.value)}
                      />
                    </td>
                  ) : (
                    <td key={c.label} className="calc">{calcCell(i, c.calc!)}</td>
                  ),
                )}
                {table === 'items' && (
                  <td><button className="del" title="删除此行" onClick={() => updateOrder(order.id, (o) => void o.items.splice(i, 1))}>✕</button></td>
                )}
              </tr>
            ))}
          </tbody>
          {table === 'items' && (
            <tfoot><tr><td /><td colSpan={5}>合计</td><td style={{ textAlign: 'right' }}>{int(k.qty)}</td><td /><td style={{ textAlign: 'right' }}>{sym(cur) + money(k.amount)}</td><td /></tr></tfoot>
          )}
          {table === 'packing' && (
            <tfoot><tr><td /><td colSpan={6}>合计</td><td style={{ textAlign: 'right' }}>{fixed(k.nw, 2)}</td><td style={{ textAlign: 'right' }}>{fixed(k.gw, 2)}</td><td style={{ textAlign: 'right' }}>{k.ctns}</td><td /><td style={{ textAlign: 'right' }}>{fixed(k.cbm, 3)}</td></tr></tfoot>
          )}
        </table>
      </div>
      {table === 'items' && (
        <div className="tbl-tools">
          <button
            className="btn sm"
            onClick={() => {
              updateOrder(order.id, (o) => void o.items.push(emptyItem()));
              setTimeout(() => document.getElementById(inputId(`items.${order.items.length}.model`))?.focus(), 0);
            }}
          >
            ＋ 添加一行
          </button>
          <button className="btn sm" onClick={() => openModal({ title: '从产品库添加', body: <ProductPicker orderId={order.id} /> })}>从产品库添加</button>
          <button className="btn sm" onClick={() => toast('「粘贴 Excel / 导入 PO」将在 M1-4 提供')}>粘贴 Excel / 导入 PO</button>
        </div>
      )}
      {table === 'packing' && (
        <div className="note">箱数 = 数量 ÷ 每箱装（向上取整）；箱号段按行顺序连续编号；净毛重、体积按箱数累计。<br />总毛重、总体积会同步到发票、报关单和唛头。</div>
      )}
      {table === 'customsItems' && (
        <div className="note">申报要素格式示例：品牌类型|出口享惠情况|用途|材质|品牌|型号。录入后自动存入 HS 记忆库，下次同品名自动带出。</div>
      )}
    </>
  );
}

export function ClauseList({ order }: { order: Order }) {
  const setField = useData((s) => s.setOrderField);
  const updateOrder = useData((s) => s.updateOrder);
  const ui = useUI();
  const auto = ['装运港', '目的港', '成交方式'];
  if (order.terms.deliveryAddress || ['EXW', 'FCA', 'DAP', 'DPU', 'DDP'].includes(order.terms.incoterm)) auto.push('交货地点');
  auto.push('包装', '唛头', '付款方式', '装运期限', '保险');
  let n = auto.length;
  const list = order.contractClauses;
  const move = (i: number, d: number) =>
    updateOrder(order.id, (o) => {
      const a = o.contractClauses, j = i + d;
      if (j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]];
    });
  const openLib = () => {
    const have = list.map((c) => c.k);
    const rest = CONTRACT_LIB.filter((c) => !have.includes(c.k));
    ui.openModal({
      title: '从条款库插入',
      body: rest.length ? rest.map((c) => (
        <button
          key={c.k}
          className="opt"
          style={{ width: '100%', textAlign: 'left', background: 'none' }}
          onClick={() => {
            updateOrder(order.id, (o) => void o.contractClauses.push({ id: uid(), k: c.k, title: c.t, body: c.b, on: true }));
            ui.closeModal();
            toast('已插入：' + c.t);
          }}
        >
          <span><b>{c.t}</b><small>{c.b}</small></span>
        </button>
      )) : <div className="empty">条款库里的条款都已加入本合同</div>,
    });
  };
  return (
    <>
      <div className="eyebrow" style={{ marginBottom: 6 }}>第 1–{auto.length} 条由订单数据自动生成</div>
      <div className="auto-cl">{auto.map((x, i) => <span key={x}>{i + 1}. {x}</span>)}</div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>其他条款</div>
      {list.map((c, i) => (
        <div key={c.id} className={'cl' + (c.on ? '' : ' off')}>
          <div className="cl-h">
            <input type="checkbox" id={inputId(`contractClauses.${i}.on`)} checked={c.on} aria-label="启用此条款" onChange={(e) => setField(order.id, `contractClauses.${i}.on`, e.target.checked)} />
            <span className="cl-n">{c.on ? `${++n}.` : '—'}</span>
            <input className="cl-t" id={inputId(`contractClauses.${i}.title`)} value={c.title} aria-label="条款标题" onChange={(e) => setField(order.id, `contractClauses.${i}.title`, e.target.value)} />
            <span className="cl-tools">
              <button className="btn ghost sm" title="上移" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn ghost sm" title="下移" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="btn ghost sm" onClick={() => { updateOrder(order.id, (o) => void o.contractClauses.splice(i, 1)); toast('已删除条款：' + c.title); }}>删除</button>
            </span>
          </div>
          <textarea id={inputId(`contractClauses.${i}.body`)} rows={3} value={c.body} aria-label="条款内容" placeholder="输入条款内容，建议中英文对照" onChange={(e) => setField(order.id, `contractClauses.${i}.body`, e.target.value)} />
        </div>
      ))}
      <div className="tbl-tools">
        <button
          className="btn sm"
          onClick={() => {
            updateOrder(order.id, (o) => void o.contractClauses.push({ id: uid(), k: 'custom', title: '自定义条款 Custom Clause', body: '', on: true }));
            setTimeout(() => {
              const el = document.getElementById(inputId(`contractClauses.${list.length}.title`)) as HTMLInputElement | null;
              el?.focus();
              el?.select();
            }, 0);
          }}
        >
          ＋ 添加自定义条款
        </button>
        <button className="btn sm" onClick={openLib}>从条款库插入</button>
      </div>
      <div className="note">需要大改合同格式时，也可以把合同导出为 Word 再编辑。</div>
    </>
  );
}

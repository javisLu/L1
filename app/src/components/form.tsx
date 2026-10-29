import { useRef, useState } from 'react';
import { useData, getPath } from '../store/data';
import { toast, useUI } from '../store/ui';
import { fixed, int, money, qtyTotal, sym, calcOrder, toNum } from '../domain/calc';
import { CONTRACT_LIB } from '../domain/constants';
import { emptyItem, productToItem, syncPay } from '../domain/factory';
import { SRC_NAME, TABLES, dyn, inputId, type FieldDef, type TableKey } from '../modules/defs';
import type { Order } from '../domain/types';
import { uid } from '../domain/calc';
import { openItemImport } from './itemImport';
import { PackingTable } from './packing';
import { ContainerList } from './containers';
import { FactoryPOs, FeeList, ProfitSummary } from './purchase';
import { OriginAdvice } from './origin';
import { fillable, hsLookupUrl, normName } from '../domain/hs';
import { lookupHs } from './hsLookup';
import { openSmartPaste } from './smartPaste';
import { looksLikeContact } from '../domain/contact';

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
  if (def.kind === 'containers') return <ContainerList order={order} />;
  if (def.kind === 'factories') return <FactoryPOs order={order} />;
  if (def.kind === 'fees') return <FeeList order={order} />;
  if (def.kind === 'profit') return <ProfitSummary order={order} />;
  if (def.kind === 'coAdvice') return <OriginAdvice order={order} />;
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

  // 买方公司名、地址里粘进一整块签名 / 名片时，自动打开智能粘贴拆成各个字段
  const onPaste = d.path === 'buyer.name' || d.path === 'buyer.address'
    ? (e: React.ClipboardEvent) => {
        const t = e.clipboardData.getData('text');
        if (looksLikeContact(t)) { e.preventDefault(); openBuyerPaste(order, t); }
      }
    : undefined;
  let input;
  if (d.type === 'textarea') {
    input = <textarea id={id} rows={3} value={String(v ?? '')} placeholder={d.placeholder} onChange={(e) => set(e.target.value)} onPaste={onPaste} />;
  } else if (d.type === 'select') {
    const opts = d.options ?? [];
    const all = v && !opts.includes(String(v)) ? [String(v), ...opts] : opts;
    input = (
      <select id={id} value={String(v ?? '')} onChange={(e) => set(e.target.value)}>
        {all.map((x) => <option key={x} value={x}>{d.optionLabels?.[x] ?? x}</option>)}
      </select>
    );
  } else {
    input = <input id={id} type={d.type === 'date' ? 'date' : 'text'} value={String(v ?? '')} placeholder={d.placeholder} onChange={(e) => set(e.target.value)} onPaste={onPaste} />;
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
      <button className="btn sm" title="粘贴客户的邮件签名或名片，自动拆成公司、地址、联系人、电话、邮箱、税号" onClick={() => openBuyerPaste(order)}>智能粘贴</button>
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

function openBuyerPaste(order: Order, initial?: string) {
  openSmartPaste({
    title: '智能粘贴 · 买方信息',
    initial,
    fields: ['name', 'address', 'contact', 'phone', 'email', 'tax'],
    apply: (p) =>
      useData.getState().updateOrder(order.id, (o) => {
        for (const k of ['name', 'address', 'contact', 'phone', 'email', 'tax'] as const) if (p[k]) o.buyer[k] = p[k]!;
      }),
  });
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
  if (table === 'packing') return <PackingTable order={order} />;
  return <GoodsTable order={order} table={table} />;
}

function GoodsTable({ order, table }: { order: Order; table: TableKey }) {
  const setField = useData((s) => s.setOrderField);
  const updateOrder = useData((s) => s.updateOrder);
  const partners = useData((s) => s.partners);
  const hsLib = useData((s) => s.hsLib);
  const autoFillRow = useData((s) => s.autoFillRow);
  const fillFromLib = useData((s) => s.fillFromLib);
  const openModal = useUI((s) => s.openModal);
  const renameFill = useData((s) => s.renameFill);
  const learnRow = useData((s) => s.learnRow);
  const hsTools = table === 'customsItems' || table === 'purchase';
  const canFill = hsTools ? fillable(order, hsLib) : 0;
  /** 进入中文品名格子时的原值：离开时判断是不是改成了另一样货 */
  const before = useRef<{ i: number; name: string } | null>(null);
  const onEnter = (i: number, key: string) => {
    if (table === 'customsItems' && key === 'nameCn') before.current = { i, name: order.items[i].nameCn };
  };
  /**
   * 离开格子（申报商品）：
   * 中文品名改成了另一样货 → 按新品名整行换编号、申报要素、退税率（本单同品名的行或记忆库），找不到就提醒；
   * 品名没变 → 只补空着的；填好编号 / 申报要素 → 记进记忆库。
   */
  const onLeave = (i: number, key: string) => {
    if (table !== 'customsItems') return;
    const cur = useData.getState().orders.find((x) => x.id === order.id)?.items[i];
    if (!cur) return;
    if (key === 'nameCn') {
      const was = before.current?.i === i ? before.current.name : cur.nameCn;
      before.current = null;
      if (normName(was) !== normName(cur.nameCn) && normName(was)) {
        if (!cur.hs && !cur.elements) { autoFillRow(order.id, i); return; }
        if (renameFill(order.id, i) === 'replaced') toast(`第 ${i + 1} 行改成「${cur.nameCn}」，已换成它的商品编号、申报要素和退税率`);
        else if (cur.hs || cur.elements)
          toast(`第 ${i + 1} 行品名改了，但商品编号、申报要素还是「${was}」的，请确认`, {
            label: '清空编号和申报要素',
            run: () => updateOrder(order.id, (o) => { o.items[i].hs = ''; o.items[i].elements = ''; o.items[i].rebate = ''; }),
          }, 10000);
        return;
      }
      const n = autoFillRow(order.id, i);
      if (n) toast(`已按 HS 记忆库补全第 ${i + 1} 行（商品编号、申报要素、退税率里空着的）`);
      return;
    }
    if (key === 'hs') {
      const n = autoFillRow(order.id, i, true);
      if (n) toast(`已按记忆库带出第 ${i + 1} 行的退税率`);
    }
    if (key === 'hs' || key === 'elements') learnRow(order.id, i);
  };
  const k = calcOrder(order);
  const factories = partners.filter((p) => p.type === '工厂');
  const defFactory = factories.find((p) => p.id === order.partners.factory)?.name;
  const cols = TABLES[table];
  const cur = order.terms.currency;
  const purpose = table === 'items' ? 'items' : table === 'packing' ? 'packing' : 'customs';
  const focusCell = (row: number, key: string) => {
    const el = document.getElementById(inputId(`items.${row}.${key}`)) as HTMLInputElement | null;
    el?.focus();
    el?.select();
  };
  /** 回车 / ↓ 到下一行同一列（最后一行回车自动加一行），↑ 到上一行；中文输入法选字时不处理 */
  const onCellKey = (e: React.KeyboardEvent<HTMLInputElement>, i: number, key: string) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); focusCell(i - 1, key); }
    else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      if (i < order.items.length - 1) focusCell(i + 1, key);
      else if (e.key === 'Enter' && table === 'items') {
        updateOrder(order.id, (o) => void o.items.push(emptyItem()));
        setTimeout(() => focusCell(i + 1, key), 0);
      }
    }
  };
  const duplicateRow = (i: number) => {
    updateOrder(order.id, (o) => void o.items.splice(i + 1, 0, { ...o.items[i], id: uid() }));
    setTimeout(() => focusCell(i + 1, 'qty'), 0);
  };
  const deleteRow = (i: number) => {
    const removed = order.items[i];
    updateOrder(order.id, (o) => void o.items.splice(i, 1));
    toast(`已删除第 ${i + 1} 行${removed.model ? `（${removed.model}）` : ''}`, {
      label: '撤销',
      run: () => updateOrder(order.id, (o) => void o.items.splice(Math.min(i, o.items.length), 0, removed)),
    });
  };
  const calcCell = (i: number, c: string) => {
    const r = k.rows[i];
    if (c === 'a') return money(r.a);
    if (c === 'q') return int(r.q);
    if (c === 'n') return String(r.n);
    if (c === 'cno') return r.n ? `${r.from}–${r.to}` : '—';
    if (c === 'cbmT') return fixed(r.cbmT, 3);
    if (c === 'nm') return order.items[i].nameCn || order.items[i].nameEn;
    if (c === 'ca') return toNum(order.items[i].cost) ? money(toNum(r.q) * toNum(order.items[i].cost)) : '—';
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
              {table === 'items' && <th className="row-act" aria-label="操作">操作</th>}
              {table === 'customsItems' && <th className="row-act">查编码</th>}
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={it.id}>
                <td className="ix">{i + 1}</td>
                {cols.map((c) =>
                  c.key && c.sel === 'factory' ? (
                    <td key={c.key}>
                      <select className="cell" id={inputId(`items.${i}.${c.key}`)} aria-label={c.label} value={it.factory ?? ''} onChange={(e) => setField(order.id, `items.${i}.factory`, e.target.value)}>
                        <option value="">{defFactory ? `${defFactory}（默认）` : '（未选工厂）'}</option>
                        {factories.filter((p) => p.id !== order.partners.factory).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                  ) : c.key && c.ro ? (
                    <td key={c.key} className="calc ro">{String((it as unknown as Record<string, unknown>)[c.key] ?? '')}</td>
                  ) : c.key ? (
                    <td key={c.key}>
                      <input
                        className={'cell' + (c.num ? ' num' : '')}
                        id={inputId(`items.${i}.${c.key}`)}
                        value={String((it as unknown as Record<string, unknown>)[c.key] ?? '')}
                        inputMode={c.num ? 'decimal' : undefined}
                        aria-label={c.label}
                        list={table === 'customsItems' && c.key === 'nameCn' ? 'hs-names' : undefined}
                        onFocus={() => onEnter(i, c.key!)}
                        onBlur={() => onLeave(i, c.key!)}
                        onChange={(e) => setField(order.id, `items.${i}.${c.key}`, e.target.value)}
                        onKeyDown={(e) => onCellKey(e, i, c.key!)}
                        onPaste={(e) => {
                          // 从 Excel 复制了多个格子：打开导入窗口，按列识别
                          const t = e.clipboardData.getData('text');
                          if (t.includes('\t') || t.trim().split(/\r?\n/).length > 1) {
                            e.preventDefault();
                            openItemImport(order, t, purpose);
                          }
                        }}
                      />
                    </td>
                  ) : (
                    <td key={c.label} className="calc">{calcCell(i, c.calc!)}</td>
                  ),
                )}
                {table === 'customsItems' && (
                  <td className="row-act">
                    <button className="btn ghost sm" title={`在 HS 编码网查${it.hs.replace(/\D/g, '').length === 10 ? '这个编码的申报要素、监管条件、退税率' : '这个品名的编码'}：${hsLookupUrl(it.hs, it.nameCn)}`} onClick={() => lookupHs(it.hs, it.nameCn)}>网上查</button>
                  </td>
                )}
                {table === 'items' && (
                  <td className="row-act">
                    <button className="del" title="复制此行" aria-label="复制此行" onClick={() => duplicateRow(i)}>⧉</button>
                    <button className="del" title="删除此行" aria-label="删除此行" onClick={() => deleteRow(i)}>✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {table === 'items' && (
            <tfoot><tr><td /><td colSpan={5}>合计</td><td style={{ textAlign: 'right', whiteSpace: 'pre-line' }}>{qtyTotal(k.rows)}</td><td /><td style={{ textAlign: 'right' }}>{sym(cur) + money(k.amount)}</td><td /></tr></tfoot>
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
          <button className="btn sm" onClick={() => openItemImport(order, undefined, 'items')}>粘贴 Excel / 导入 PO</button>
          <span className="tbl-tip">提示：在表格里直接 Ctrl+V 粘贴从 Excel 复制的多行；回车 / ↑↓ 换行</span>
        </div>
      )}
      {table === 'customsItems' && (
        <datalist id="hs-names">{hsLib.slice(0, 300).map((e) => <option key={e.id} value={e.nameCn}>{e.hs}</option>)}</datalist>
      )}
      {hsTools && (
        <div className="tbl-tools">
          <button
            className="btn sm"
            onClick={() => {
              const n = fillFromLib(order.id);
              toast(n ? `已补全 ${n} 格（只补空着的）` : '没有能补的：空着的格子在本单其它行和记忆库里都找不到同品名的资料');
            }}
          >
            按记忆库补全{canFill ? `（${canFill} 格）` : ''}
          </button>
          <span className="tbl-tip">按同品名（本单其它行或 HS 记忆库）补空着的商品编号、申报要素、退税率</span>
        </div>
      )}
      {table === 'purchase' && (
        <div className="tbl-tools">
          <span className="tbl-tip">
            采购合计 <b>¥{money(order.items.reduce((a, it, i) => a + toNum(k.rows[i].q) * toNum(it.cost), 0))}</b>
            {factories.length ? '' : ' · 合作方库里还没有工厂，先去「合作方库」添加'}
          </span>
        </div>
      )}
      {table !== 'items' && table !== 'purchase' && (
        <div className="tbl-tools">
          <button className="btn sm" onClick={() => openItemImport(order, undefined, purpose)}>粘贴 Excel 导入</button>
          <span className="tbl-tip">按型号 / 品名对上现有货物，只更新文件里有的列；也可以在表格里直接 Ctrl+V</span>
        </div>
      )}
      {table === 'customsItems' && (
        <div className="note">
          中文品名可以从 HS 记忆库里选，离开格子自动带出商品编号、申报要素和退税率；改成另一样货时整行换成它的资料。填好的编号和申报要素会自动记进记忆库，下次同品名直接带出。
          不知道编码或申报要素怎么填：点每行的「网上查」，在 HS 编码网（hsbianma.com）上看——有 10 位编码按编码打开，没有就按品名搜。
        </div>
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

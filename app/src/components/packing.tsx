import { useState } from 'react';
import { useData } from '../store/data';
import { toast } from '../store/ui';
import { calcOrder, fixed, int, toNum, type Row } from '../domain/calc';
import { groupRows, ungroup } from '../domain/packs';
import { inputId } from '../modules/defs';
import { PKG_MODES, defaultPackaging, pkgSummary } from '../domain/package';
import { openItemImport } from './itemImport';
import type { Order, PkgMode } from '../domain/types';

/**
 * 箱单「包装装箱」表格。
 * 单独装箱的行照常填每箱装、箱规、每箱净毛重；
 * 混装（几样货物同一箱）：勾选几行 →「设为混装」，箱数、每箱毛重、箱规、箱号、体积合并成一格（像 Excel 合并单元格），
 * 每样货物仍填自己的每箱净重，整箱毛重按净重比例分摊到每一行。
 */
export function PackingTable({ order }: { order: Order }) {
  const { setOrderField, updateOrder } = useData();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const k = calcOrder(order);
  const packs = order.packs ?? [];
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const cell = (path: string, value: unknown, label: string, cls = 'cell num') => (
    <input
      className={cls}
      id={inputId(path)}
      value={String(value ?? '')}
      inputMode="decimal"
      aria-label={label}
      onChange={(e) => setOrderField(order.id, path, e.target.value)}
      onPaste={(e) => {
        const t = e.clipboardData.getData('text');
        if (t.includes('\t') || t.trim().split(/\r?\n/).length > 1) { e.preventDefault(); openItemImport(order, t, 'packing'); }
      }}
    />
  );

  const makeMix = () => {
    const ids = order.items.filter((x) => sel.has(x.id)).map((x) => x.id);
    updateOrder(order.id, (o) => void groupRows(o, ids));
    setSel(new Set());
    toast(`已把 ${ids.length} 行设为混装（同一箱）：请填写箱数、每箱毛重和箱规，每行填自己的净重`);
  };
  const split = (packId: string) => {
    updateOrder(order.id, (o) => ungroup(o, packId));
    toast('已拆开混装，各行恢复单独装箱，请核对每箱装和毛重');
  };

  const rowCells = (r: Row, i: number) => {
    const pi = r.pack ? packs.findIndex((p) => p.id === r.pack!.id) : -1;
    const mixed = pi >= 0;
    const lead = mixed && r.lead;
    const span = r.span || 1;
    const merged = (key: string, content: React.ReactNode, cls = '') =>
      lead ? <td key={key} rowSpan={span} className={'mixcell ' + cls}>{content}</td> : null;
    return (
      <tr key={r.id} className={mixed ? 'mixrow' + (lead ? ' mixlead' : '') : ''}>
        <td className="sel"><input type="checkbox" aria-label={`选择第 ${i + 1} 行`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></td>
        <td className="ix">{i + 1}</td>
        <td className="nm">{r.nameEn || r.nameCn || r.model || <span className="muted">（未填品名）</span>}{mixed && lead && <span className="mixtag">混装</span>}</td>
        <td className="calc">{int(r.q)}</td>
        {mixed ? (
          <td className="calc" title="混装：每箱里这样货物的数量 = 数量 ÷ 箱数">{r.packCtns ? fixed(r.q / r.packCtns, r.q % r.packCtns ? 2 : 0) : '—'}</td>
        ) : (
          <td>{cell(`items.${i}.pcsPerCtn`, r.pcsPerCtn, '每箱装')}</td>
        )}
        {mixed ? (
          <>
            {merged('l', cell(`packs.${pi}.l`, packs[pi].l, '混装箱 长'))}
            {merged('w', cell(`packs.${pi}.w`, packs[pi].w, '混装箱 宽'))}
            {merged('h', cell(`packs.${pi}.h`, packs[pi].h, '混装箱 高'))}
          </>
        ) : (
          <>
            <td>{cell(`items.${i}.l`, r.l, '长')}</td>
            <td>{cell(`items.${i}.w`, r.w, '宽')}</td>
            <td>{cell(`items.${i}.h`, r.h, '高')}</td>
          </>
        )}
        <td>{cell(`items.${i}.nw`, r.nw, '每箱净重')}</td>
        {mixed ? merged('gw', cell(`packs.${pi}.gw`, packs[pi].gw, '混装箱 每箱毛重')) : <td>{cell(`items.${i}.gw`, r.gw, '每箱毛重')}</td>}
        {mixed ? (
          merged('ctns', <>
            {cell(`packs.${pi}.ctns`, packs[pi].ctns, '混装箱 箱数')}
            <button className="btn ghost sm mixsplit" onClick={() => split(packs[pi].id)}>拆开</button>
          </>)
        ) : (
          <td className="calc">{r.n}</td>
        )}
        {mixed ? merged('cno', r.packCtns ? (r.from === r.to ? String(r.from) : `${r.from}–${r.to}`) : '—', 'calc') : <td className="calc">{r.n ? `${r.from}–${r.to}` : '—'}</td>}
        <td className="calc" title={mixed ? '毛重按净重比例分摊' : ''}>{fixed(r.nwT, 2)} / {fixed(r.gwT, 2)}</td>
        {mixed ? merged('cbm', fixed(toNum(r.packCtns) * (toNum(packs[pi].l) * toNum(packs[pi].w) * toNum(packs[pi].h)) / 1e6, 3), 'calc') : <td className="calc">{fixed(r.cbmT, 3)}</td>}
      </tr>
    );
  };

  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl pack-tbl">
          <thead>
            <tr>
              <th className="sel" />
              <th className="ix">#</th>
              <th style={{ minWidth: 170 }}>品名</th>
              <th>数量</th>
              <th>每箱装</th>
              <th>长 cm</th><th>宽 cm</th><th>高 cm</th>
              <th>净重/箱</th>
              <th>毛重/箱</th>
              <th>箱数</th>
              <th>箱号</th>
              <th title="每行的净重合计 / 毛重合计（混装行的毛重按净重比例分摊）">净 / 毛重合计</th>
              <th>体积 m³</th>
            </tr>
          </thead>
          <tbody>{k.rows.map(rowCells)}</tbody>
          <tfoot>
            <tr>
              <td /><td /><td>合计</td><td style={{ textAlign: 'right' }}>{int(k.qty)}</td>
              <td colSpan={6} /><td style={{ textAlign: 'right' }}>{k.ctns}</td><td />
              <td style={{ textAlign: 'right' }}>{fixed(k.nw, 2)} / {fixed(k.gw, 2)}</td>
              <td style={{ textAlign: 'right' }}>{fixed(k.cbm, 3)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="tbl-tools">
        <button className="btn sm" disabled={sel.size < 2} onClick={makeMix}>
          {sel.size >= 2 ? `把选中的 ${sel.size} 行设为混装（同一箱）` : '设为混装（先勾选 2 行以上）'}
        </button>
        {sel.size > 0 && <button className="btn ghost sm" onClick={() => setSel(new Set())}>取消选择</button>}
        <button className="btn sm" onClick={() => openItemImport(order, undefined, 'packing')}>粘贴 Excel / 导入工厂箱单</button>
      </div>
      <PackagingPanel order={order} />
      <div className="note">
        单独装箱：箱数 = 数量 ÷ 每箱装（向上取整），净毛重、体积按箱数累计。<br />
        <b>混装</b>（几样货物装在同一个箱子里）：勾选这几行 →「设为混装」。箱数、每箱毛重、箱规合并填写；每样货物填自己的<b>每箱净重</b>，
        整箱毛重按净重比例自动分摊到每一行，箱单和报关资料上每行都有净重和毛重。<br />
        导入工厂箱单时，Excel 里合并单元格的混装会自动识别。
      </div>
    </>
  );
}

/**
 * 总件数 / 外包装：散箱就是多少箱；打托盘、木箱时填件数、每件尺寸（可几种）和每件自重。
 * 箱单写 SAY TOTAL … PALLETS ONLY，报关资料的件数、包装种类、毛重随之变化。
 */
function PackagingPanel({ order }: { order: Order }) {
  const { setOrderField, updateOrder } = useData();
  const pk = pkgSummary(order);
  const p = order.pkg ?? defaultPackaging();
  const ensure = (o: Order) => (o.pkg ??= defaultPackaging());
  const setMode = (mode: PkgMode) =>
    updateOrder(order.id, (o) => {
      const g = ensure(o);
      g.mode = mode;
      if (mode !== 'ctns' && !g.sizes.length) g.sizes.push({ n: '', l: '', w: '', h: '' });
      o.customs.packageType = PKG_MODES[mode].customs;
    });
  const num = (path: string, value: unknown, label: string, cls = 'pkg-num') => (
    <input className={cls} id={inputId(path)} inputMode="decimal" aria-label={label} value={String(value ?? '')} onChange={(e) => setOrderField(order.id, path, e.target.value)} />
  );
  return (
    <div className="pkg-panel">
      <h3>总件数 / 外包装</h3>
      <div className="pkg-modes" role="radiogroup" aria-label="包装方式">
        {(Object.keys(PKG_MODES) as PkgMode[]).map((m) => (
          <label key={m} className={'lbl-opt' + (p.mode === m ? ' on' : '')}>
            <input type="radio" name="pkg-mode" checked={p.mode === m} onChange={() => setMode(m)} />
            <b>{PKG_MODES[m].name}</b>
          </label>
        ))}
      </div>
      {p.mode === 'ctns' ? (
        <p className="muted pkg-hint">散箱出货：总件数 = 箱数 <b>{pk.count}</b> {pk.unitEn}（自动），每箱尺寸在上面的表格里填。</p>
      ) : (
        <>
          <div className="pkg-row">
            <label>总件数 {num('pkg.count', p.count, '总件数')}</label>
            {p.mode === 'other' && <label>单位 <input className="pkg-unit" id={inputId('pkg.unit')} placeholder="如 BAGS" value={p.unit} onChange={(e) => setOrderField(order.id, 'pkg.unit', e.target.value)} /></label>}
            <label title="托盘、木箱本身的重量，会加到总毛重">每件自重 kg {num('pkg.tare', p.tare, '每件自重')}</label>
          </div>
          <div className="pkg-sizes">
            <div className="pkg-sizes-h">每件尺寸（cm，几种尺寸分行写）</div>
            {p.sizes.map((x, i) => (
              <div key={i} className="pkg-size">
                {num(`pkg.sizes.${i}.n`, x.n, '件数', 'pkg-num sm')}<span>件 @</span>
                {num(`pkg.sizes.${i}.l`, x.l, '长', 'pkg-num sm')}<span>×</span>
                {num(`pkg.sizes.${i}.w`, x.w, '宽', 'pkg-num sm')}<span>×</span>
                {num(`pkg.sizes.${i}.h`, x.h, '高', 'pkg-num sm')}<span>cm</span>
                <button className="del" aria-label="删除这种尺寸" onClick={() => updateOrder(order.id, (o) => void ensure(o).sizes.splice(i, 1))}>✕</button>
              </div>
            ))}
            <button className="btn ghost sm" onClick={() => updateOrder(order.id, (o) => void ensure(o).sizes.push({ n: '', l: '', w: '', h: '' }))}>＋ 加一种尺寸</button>
          </div>
        </>
      )}
      <div className="pkg-sum">
        <b>{pk.words}</b>
        {!!pk.contains && <span>{pk.contains}</span>}
        <span>总毛重 {fixed(pk.gw, 2)} kg{pk.tare ? `（含${pk.mode === 'pallet' ? '托盘' : pk.mode === 'case' ? '木箱' : '包装'}自重 ${fixed(pk.tare, 2)} kg）` : ''}</span>
        <span>总体积 {fixed(pk.cbm, 3)} m³</span>
      </div>
    </div>
  );
}

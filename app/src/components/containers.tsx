import { useData } from '../store/data';
import { calcOrder, fixed, toNum } from '../domain/calc';
import { pkgSummary } from '../domain/package';
import { CONTAINER_TYPES } from '../domain/shipping';
import { inputId } from '../modules/defs';
import type { ContainerRow, Order } from '../domain/types';

const blank = (): ContainerRow => ({ no: '', seal: '', type: '40HQ', pkgs: '', gw: '', cbm: '' });

/** 多柜明细：柜号、封号、柜型、每柜件毛体（SI 补料、装船通知按柜列出） */
export function ContainerList({ order }: { order: Order }) {
  const { setOrderField, updateOrder } = useData();
  const boxes = order.shipping.boxes ?? [];
  const pk = pkgSummary(order, calcOrder(order));
  const sum = boxes.reduce((a, b) => ({ pkgs: a.pkgs + toNum(b.pkgs), gw: a.gw + toNum(b.gw), cbm: a.cbm + toNum(b.cbm) }), { pkgs: 0, gw: 0, cbm: 0 });
  const add = () => updateOrder(order.id, (o) => {
    const list = (o.shipping.boxes ??= []);
    // 第一个柜子默认带入整票件毛体，之后按实际改
    list.push(list.length ? blank() : { ...blank(), no: o.shipping.container.split('/')[0].trim(), seal: o.shipping.seal, pkgs: pk.count, gw: Number(pk.gw.toFixed(2)), cbm: Number(pk.cbm.toFixed(3)) });
  });
  const cell = (i: number, k: keyof ContainerRow, label: string, num = false) => (
    <input className={'cell' + (num ? ' num' : '')} id={inputId(`shipping.boxes.${i}.${k}`)} aria-label={label} value={String(boxes[i][k] ?? '')} inputMode={num ? 'decimal' : undefined}
      onChange={(e) => setOrderField(order.id, `shipping.boxes.${i}.${k}`, e.target.value)} />
  );
  return (
    <div className="w2">
      {boxes.length > 0 && (
        <div className="tbl-wrap" style={{ marginBottom: 8 }}>
          <table className="tbl" style={{ minWidth: 640 }}>
            <thead><tr><th className="ix">#</th><th>柜号</th><th>封号</th><th>柜型</th><th>件数</th><th>毛重 kg</th><th>体积 m³</th><th /></tr></thead>
            <tbody>
              {boxes.map((b, i) => (
                <tr key={i}>
                  <td className="ix">{i + 1}</td>
                  <td>{cell(i, 'no', '柜号')}</td>
                  <td>{cell(i, 'seal', '封号')}</td>
                  <td>
                    <select className="cell" aria-label="柜型" value={b.type} onChange={(e) => setOrderField(order.id, `shipping.boxes.${i}.type`, e.target.value)}>
                      {CONTAINER_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </td>
                  <td>{cell(i, 'pkgs', '件数', true)}</td>
                  <td>{cell(i, 'gw', '毛重', true)}</td>
                  <td>{cell(i, 'cbm', '体积', true)}</td>
                  <td><button className="del" aria-label="删除这个柜子" onClick={() => updateOrder(order.id, (o) => void o.shipping.boxes!.splice(i, 1))}>✕</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td /><td colSpan={3}>合计（整票 {pk.count} {pk.unitCn} / {fixed(pk.gw, 2)} kg / {fixed(pk.cbm, 3)} m³）</td><td style={{ textAlign: 'right' }}>{sum.pkgs}</td><td style={{ textAlign: 'right' }}>{fixed(sum.gw, 2)}</td><td style={{ textAlign: 'right' }}>{fixed(sum.cbm, 3)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
      <button className="btn sm" onClick={add}>＋ 添加柜子</button>
    </div>
  );
}

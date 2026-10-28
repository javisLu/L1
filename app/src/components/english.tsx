import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { DOCNAMES, type DocKey } from '../modules/defs';
import { cnFields, toEnglish, translateOrder } from '../domain/english';
import { jumpToField } from './jump';
import type { Order } from '../domain/types';

/** 预览栏上的提示：这份单据上有中文（客户看不懂），点开逐项看、一键翻常见写法 */
export function CnBadge({ order, doc }: { order: Order; doc: DocKey }) {
  const n = cnFields(order, doc).length;
  if (!n) return null;
  return (
    <button className="cn-badge" title="发给客户的单据上有中文，点开看是哪些" onClick={() => useUI.getState().openModal({ title: `${DOCNAMES[doc]}上有中文`, wide: true, body: <CnList orderId={order.id} doc={doc} /> })}>
      ⚠ 单据上有中文 · {n}
    </button>
  );
}

function CnList({ orderId, doc }: { orderId: string; doc: DocKey }) {
  const o = useData((s) => s.orders.find((x) => x.id === orderId));
  const updateOrder = useData((s) => s.updateOrder);
  const close = useUI((s) => s.closeModal);
  if (!o) return null;
  const list = cnFields(o, doc);
  const can = list.filter((f) => toEnglish(f.text).text !== f.text).length;
  return (
    <div className="cn-list">
      {!list.length ? (
        <div className="empty">已经全部是英文了。</div>
      ) : (
        <>
          <p className="muted">报价单、PI、发票、箱单是发给客户的，下面这些格子里填了中文，会原样印到单据上。常见写法（有效期、交期、付款、质量异议、银行费用、溢短装、单位、港口等）可以一键翻成英文；公司名、地址、品名这类请自己改成英文。</p>
          <table className="tbl">
            <thead><tr><th style={{ width: 140 }}>哪里</th><th>现在写的</th><th>英文</th><th style={{ width: 70 }} /></tr></thead>
            <tbody>
              {list.map((f) => {
                const r = toEnglish(f.text);
                return (
                  <tr key={f.path}>
                    <td><b>{f.label}</b></td>
                    <td className="cn-txt">{f.text}</td>
                    <td className="cn-txt">{r.text !== f.text ? r.text : <span className="muted">需要自己改</span>}{r.left.length > 0 && r.text !== f.text && <small className="lc-hit">还剩：{r.left.join(' / ')}</small>}</td>
                    <td><button className="btn ghost sm" onClick={() => { close(); jumpToField('quote', undefined, f.path); }}>去改</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      <div className="modal-f" style={{ margin: '14px -20px -16px' }}>
        <button className="btn" onClick={close}>关闭</button>
        {can > 0 && (
          <button className="btn pri" onClick={() => {
            let left = 0;
            updateOrder(orderId, (x) => void (left = translateOrder(x, doc).left.length));
            toast(left ? `已翻好能认出的部分，还有 ${left} 处要自己改成英文` : '已全部翻成英文');
          }}>能翻的一键翻成英文（{can} 处）</button>
        )}
      </div>
    </div>
  );
}

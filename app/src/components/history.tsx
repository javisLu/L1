import { useState } from 'react';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { DOCNAMES, type DocKey } from '../modules/defs';
import { asOrder, changeNote, diffDoc, docVersions, noteLang, recordVersions, totalChanges } from '../domain/history';
import { docSig, shortStamp } from '../domain/exports';
import type { Order } from '../domain/types';

/** 打开改版对比：某份单据发出过的版本 ↔ 现在 */
export function openDiff(order: Order, doc: DocKey, base?: string) {
  useUI.getState().openModal({ title: `${DOCNAMES[doc]} · 改版对比`, wide: true, body: <DiffView orderId={order.id} doc={doc} base={base} /> });
}

function DiffView({ orderId, doc, base }: { orderId: string; doc: DocKey; base?: string }) {
  const o = useData((s) => s.orders.find((x) => x.id === orderId));
  const close = useUI((s) => s.closeModal);
  const versions = o ? docVersions(o, doc) : [];
  const [sel, setSel] = useState(base && versions.some((v) => v.snap === base) ? base : versions[versions.length - 1]?.snap);
  const [lang, setLang] = useState<'en' | 'zh'>(noteLang(doc));
  if (!o) return null;
  const v = versions.find((x) => x.snap === sel);
  const snap = sel ? o.snaps?.[sel] : undefined;
  if (!v || !snap)
    return <div className="empty">这份单据还没有可对比的发出记录。之后每次导出或打包都会自动留底，就能看到改了什么。</div>;
  const prev = asOrder(snap, o);
  const changes = [...diffDoc(prev, o, doc), ...totalChanges(prev, o, doc)];
  // 现在和最后发出的那版不一样，再发就是新的一版
  const next = docSig(o, doc) !== versions[versions.length - 1].sig ? versions.length + 1 : undefined;
  const note = changes.length ? changeNote(o, doc, changes, lang, next) : '';
  return (
    <div className="diff">
      <div className="diff-h">
        <label>
          对比
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            {[...versions].reverse().map((x) => <option key={x.snap} value={x.snap}>第 {x.v} 版 · {shortStamp(x.at)}{x.to ? ` · 发给${x.to}` : ''}</option>)}
          </select>
          <span>和现在</span>
        </label>
        <span className={'diff-n' + (changes.length ? ' on' : '')}>{changes.length ? `${changes.length} 处改动` : '没有改动'}</span>
      </div>
      {changes.length ? (
        <>
          <table className="diff-tbl">
            <thead><tr><th>改了什么</th><th>第 {v.v} 版（{shortStamp(v.at)}）</th><th>现在</th></tr></thead>
            <tbody>
              {changes.map((c, i) => (
                <tr key={i} className={'d-' + c.kind}>
                  <td>{c.label}</td>
                  <td className="from">{c.kind === 'add' ? '—' : c.from}</td>
                  <td className="to">{c.kind === 'del' ? '已删除' : c.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="diff-note">
            <div className="diff-note-h">
              <b>改版说明</b>
              <span className="seg sm">
                <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>英文（发客户）</button>
                <button className={lang === 'zh' ? 'on' : ''} onClick={() => setLang('zh')}>中文（发工厂 / 货代）</button>
              </span>
              <button className="btn sm" onClick={() => navigator.clipboard?.writeText(note).then(() => toast('改版说明已复制'), () => toast('复制失败，请手动选中复制'))}>复制</button>
            </div>
            <textarea readOnly value={note} aria-label="改版说明" rows={Math.min(14, note.split('\n').length + 1)} />
          </div>
        </>
      ) : (
        <div className="empty">和第 {v.v} 版相比没有改动。</div>
      )}
      <div className="modal-f" style={{ margin: '14px -20px -16px' }}><button className="btn" onClick={close}>关闭</button></div>
    </div>
  );
}

/** 订单页：发出记录（最近在前） */
export function SendHistory({ order: o }: { order: Order }) {
  const [all, setAll] = useState(false);
  const list = [...(o.sent ?? [])].reverse();
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 5);
  return (
    <div className="panel sent-panel">
      <div className="today-h">
        <h2>发出记录</h2>
        <span className="muted">每次导出、打包都自动留底；点单据可以看这一版之后改了什么</span>
      </div>
      {shown.map((r) => {
        const vs = recordVersions(o, r);
        return (
          <div key={r.id} className="sent-row">
            <span className="sent-at">{shortStamp(r.at)}</span>
            <span className={'sent-to' + (r.to ? '' : ' self')}>{r.to ? `发给${r.to}` : '导出'}</span>
            <span className="sent-docs">
              {r.docs.map((d) => (
                <button key={d} className="sent-doc" title="看这一版之后改了什么" onClick={() => openDiff(o, d as DocKey, r.snap)}>
                  {DOCNAMES[d as DocKey]}{vs[d] ? <em>v{vs[d]}</em> : null}
                </button>
              ))}
            </span>
            {r.file && <span className="sent-file" title={r.file}>{r.file}</span>}
          </div>
        );
      })}
      {list.length > 5 && <button className="td-more" onClick={() => setAll(!all)}>{all ? '收起' : `还有 ${list.length - 5} 条，展开`}</button>}
    </div>
  );
}

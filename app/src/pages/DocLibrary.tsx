import { useMemo, useState } from 'react';
import { LibPage } from '../components/common';
import { Preview } from '../components/Preview';
import { DocView } from '../docs/templates';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { blankForm } from '../domain/factory';
import { DOCNAMES, DOC_FMT, EXT, type DocKey, type Fmt } from '../modules/defs';
import { exportDoc } from '../export/actions';
import type { Order } from '../domain/types';

/** 软件自带的单据格式：发给谁、做什么用 */
const LIB: { doc: DocKey; to: string; desc: string }[] = [
  { doc: 'quote', to: '客户', desc: '报价、有效期、条款' },
  { doc: 'pi', to: '客户', desc: '形式发票，客户据此付款 / 开证' },
  { doc: 'contract', to: '客户', desc: '中英文销售合同，条款齐全，可导 Word 修改' },
  { doc: 'ci', to: '客户 / 报关行', desc: '商业发票，清关、结汇用' },
  { doc: 'pl', to: '客户 / 货代 / 报关行', desc: '装箱单：箱号、件数、净毛重、体积' },
  { doc: 'booking', to: '货代', desc: '订舱委托书（托书）：收发通、柜型、货好时间、运费条款' },
  { doc: 'si', to: '货代', desc: 'SI 提单补料：提单上的收发通、货描、唛头、柜号封号' },
  { doc: 'advice', to: '客户', desc: '装船通知：船名航次、提单号、开船 / 到港日期' },
  { doc: 'customs', to: '报关行', desc: '报关预录入表：申报要素、商品编号、件毛体' },
];

/** 单据页面宽 595、高 842（A4，pt） */
const THUMB = 0.3;

function Thumb({ order, doc }: { order: Order; doc: DocKey }) {
  const assets = useData((s) => s.settings.assets);
  const labels = useData((s) => s.settings.labels);
  return (
    <div className="dlib-thumb" aria-hidden>
      <div style={{ transform: `scale(${THUMB})`, transformOrigin: 'top left', width: 595, pointerEvents: 'none' }}>
        <DocView doc={doc} order={order} assets={assets} labels={{ ...labels, maxPages: 1 }} />
      </div>
    </div>
  );
}

async function downloadBlank(o: Order, doc: DocKey, fmt: Fmt) {
  const ui = useUI.getState();
  if (ui.busy) return;
  ui.set({ busy: true });
  toast(`正在生成空白「${DOCNAMES[doc]}」${fmt}…`, undefined, 60000, 'export');
  try {
    const { buildFile } = await import('../export/index');
    const { saveFiles, reveal } = await import('../export/save');
    const f = await buildFile(o, doc, fmt);
    const name = `空白-${DOCNAMES[doc]}.${EXT[fmt]}`;
    const r = await saveFiles('空白模板', [{ name, data: f.data }]);
    if (r.paths[0]) toast(`已保存 ${name}`, { label: '打开文件夹', run: () => void reveal(r.paths[0]).catch(() => undefined) }, undefined, 'export');
    else toast(`已保存 ${name}（已下载）`, undefined, undefined, 'export');
  } catch (e) {
    console.error(e);
    toast(`生成失败：${e instanceof Error ? e.message : String(e)}`, undefined, 8000, 'export');
  } finally {
    useUI.getState().set({ busy: false });
  }
}

function openPreview(o: Order, doc: DocKey, title: string) {
  useUI.getState().openModal({
    title, wide: true,
    body: <div className="dlib-pv"><Preview order={o} doc={doc} bar={<><span className="tab on">{DOCNAMES[doc]}</span><div className="r"><span className="tip">{o.id === '__blank__' ? '空白模板（只有我方公司信息）' : `${o.no} ${o.name}`}</span></div></>} /></div>,
  });
}

/**
 * 单据模板库：软件自带的各种单据格式。
 * 可以下载空白模板（只带我方公司信息，留给对方或自己手填），也可以选一个订单直接生成填好的单据。
 */
export function DocLibrary() {
  const { seller, settings, orders } = useData();
  const ui = useUI();
  const blank = useMemo(() => {
    const o = blankForm(seller, settings);
    o.docset.stamp = false; // 空白模板不盖章，避免被拿去乱用
    return o;
  }, [seller, settings]);
  const sorted = [...orders].sort((a, b) => b.no.localeCompare(a.no));
  const [oid, setOid] = useState(sorted[0]?.id ?? '');
  const order = orders.find((o) => o.id === oid);

  return (
    <LibPage
      title="单据模板库"
      right={
        <label className="dlib-pick">
          用订单生成：
          <select value={oid} onChange={(e) => setOid(e.target.value)} aria-label="用哪个订单生成">
            {sorted.map((o) => <option key={o.id} value={o.id}>{o.no} {o.name} · {o.buyer.name || '未选客户'}</option>)}
          </select>
        </label>
      }
    >
      <div className="note dlib-intro">
        软件自带的单据格式，要素齐全，客户、货代、报关行一般都认。
        <b>下载空白</b>：只带我方公司信息和 Logo（不盖章），发给对方或自己手填；
        <b>用订单生成</b>：选右上角的订单，直接生成填好的单据，和在订单里导出一样。
        Logo、公章、公司信息在「设置」里改，单据配色在订单的「编号与样式」里选。
      </div>
      <div className="dlib">
        {LIB.map(({ doc, to, desc }) => (
          <div key={doc} className="panel dlib-card">
            <button className="dlib-tb" onClick={() => openPreview(blank, doc, `${DOCNAMES[doc]} · 空白模板`)} title="点击放大预览">
              <Thumb order={blank} doc={doc} />
            </button>
            <div className="dlib-body">
              <b>{DOCNAMES[doc]}</b>
              <span className="pill">发给{to}</span>
              <small>{desc}</small>
            </div>
            <div className="dlib-acts">
              <div className="dlib-act">
                <span>下载空白</span>
                {DOC_FMT[doc].map((f) => <button key={f} className="btn sm" disabled={ui.busy} onClick={() => void downloadBlank(blank, doc, f)}>{f}</button>)}
              </div>
              <div className="dlib-act">
                <span>用订单生成</span>
                {order ? (
                  <>
                    {DOC_FMT[doc].map((f) => <button key={f} className="btn sm" disabled={ui.busy} onClick={() => void exportDoc(order, doc, f)}>{f}</button>)}
                    <button className="btn ghost sm" onClick={() => openPreview(order, doc, `${DOCNAMES[doc]} · ${order.no}`)}>预览</button>
                  </>
                ) : <span className="muted">还没有订单</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </LibPage>
  );
}

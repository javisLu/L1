import { useMemo } from 'react';
import { OrderCrumbs, TopBar } from '../components/common';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { pickFile, readBytes } from '../io/image';
import { blAskText, blNoIn, checkBl, type BlResult } from '../domain/bl';
import type { Order } from '../domain/types';

const RES: Record<BlResult, { icon: string; cls: string; text: string }> = {
  ok: { icon: '✓', cls: 'ok', text: '一致' },
  missing: { icon: '✕', cls: 'bad', text: '找不到' },
  diff: { icon: '✕', cls: 'bad', text: '不一致' },
  info: { icon: 'i', cls: 'info', text: '留意' },
};

/** 提单核对：粘贴货代发来的提单草稿（或上传能选中文字的 PDF），和订单逐项比对 */
export function BlCheck({ order: o }: { order: Order }) {
  const ui = useUI();
  const { setOrderField, partners } = useData();
  const text = o.bl?.text ?? '';
  const checks = useMemo(() => (text.trim() ? checkBl(o, text) : []), [o, text]);
  const bad = checks.filter((c) => c.result === 'missing' || c.result === 'diff');
  const ff = partners.find((p) => p.id === o.partners.forwarder);
  const ask = blAskText(o, checks, ff?.contact);
  const blNo = blNoIn(text);

  const upload = async () => {
    const f = await pickFile('.pdf,application/pdf');
    if (!f) return;
    toast('正在读取 PDF…', undefined, 20000, 'bl');
    try {
      const { pdfText } = await import('../io/pdftext');
      const t = await pdfText(await readBytes(f));
      if (!t.trim()) return toast('这个 PDF 里没有文字（可能是扫描件），请让货代发可以选中文字的 PDF，或把文字复制粘贴进来', undefined, 9000, 'bl');
      setOrderField(o.id, 'bl', { text: t, file: f.name });
      toast(`已读取 ${f.name}`, undefined, undefined, 'bl');
    } catch (e) {
      toast('读取 PDF 失败：' + (e instanceof Error ? e.message : String(e)), undefined, 8000, 'bl');
    }
  };

  return (
    <>
      <TopBar><OrderCrumbs order={o} current="提单核对" /></TopBar>
      <div className="mod-head">
        <button className="btn ghost sm" onClick={() => ui.openOrder(o.id)}>← 订单菜单</button>
        <h1><span className="code">B/L</span>提单核对</h1>
        <span className="ord">{o.no} · {o.buyer.name || '未选择客户'}</span>
        <div className="r">
          {blNo && blNo !== o.shipping.blNo && (
            <button className="btn" onClick={() => { setOrderField(o.id, 'shipping.blNo', blNo); toast(`提单号 ${blNo} 已填进订单`); }}>提单号 {blNo} 填进订单</button>
          )}
        </div>
      </div>
      <main className="wrap lc">
        <section className="panel lc-in">
          <div className="lc-in-h">
            <b>提单草稿{o.bl?.file ? ` · ${o.bl.file}` : ''}</b>
            <span style={{ display: 'flex', gap: 6 }}>
              <button className="btn sm" onClick={() => void upload()}>上传 PDF</button>
              {!!text && <button className="btn ghost sm" onClick={() => { const old = o.bl; setOrderField(o.id, 'bl', { text: '' }); toast('已清空', { label: '撤销', run: () => setOrderField(o.id, 'bl', old) }); }}>清空</button>}
            </span>
          </div>
          <textarea
            className="lc-text"
            aria-label="提单草稿文字"
            placeholder={'把货代发来的提单草稿（B/L DRAFT）文字整段粘贴进来，\n或点右上角「上传 PDF」（要能选中文字的 PDF）。\n\n软件拿订单里的收发通、港口、船名、柜号封号、件毛体、唛头、货描、运费去草稿里逐项找，\n找不到或数字对不上的标出来。扫描件（图片）读不出文字。'}
            value={text}
            onChange={(e) => setOrderField(o.id, 'bl', { text: e.target.value, file: o.bl?.file })}
          />
        </section>

        <section className="lc-out">
          {!checks.length ? (
            <div className="panel empty">粘贴或上传提单草稿后，这里逐项列出和订单对不对得上，并生成发给货代的修改意见。</div>
          ) : (
            <>
              <div className={'panel lc-sum ' + (bad.length ? 'bad' : 'ok')}>
                {bad.length ? `${bad.length} 处要货代改` : '提单草稿和订单一致'}
                <span className="muted">· 共核对 {checks.length} 项</span>
              </div>
              <div className="panel">
                <table className="tbl bl-tbl">
                  <thead><tr><th style={{ width: 90 }}>项目</th><th>订单里</th><th style={{ width: 210 }}>草稿</th></tr></thead>
                  <tbody>
                    {checks.map((c, i) => (
                      <tr key={i} className={RES[c.result].cls}>
                        <td><b>{c.item}</b></td>
                        <td>{c.expect}</td>
                        <td><span className={'bl-res ' + RES[c.result].cls}><i>{RES[c.result].icon}</i>{RES[c.result].text}</span>{c.found && <small className="lc-hit">{c.found}</small>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="note" style={{ marginTop: 10 }}>按文字查找比对，不分格式；「找不到」可能是草稿写法不同（缩写、换行断开），点开草稿再确认一眼。</div>
              </div>
              {ask && (
                <div className="panel">
                  <div className="diff-note-h">
                    <b>修改意见（发给货代）</b>
                    <button className="btn sm" onClick={() => navigator.clipboard?.writeText(ask).then(() => toast('修改意见已复制'), () => toast('复制失败，请手动选中复制'))}>复制</button>
                  </div>
                  <textarea readOnly className="lc-letter" value={ask} rows={Math.min(16, ask.split('\n').length + 1)} aria-label="修改意见" />
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}

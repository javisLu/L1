import { useEffect } from 'react';
import { OrderCrumbs, TopBar } from '../components/common';
import { ClauseList, FieldView, ItemTable } from '../components/form';
import { Preview } from '../components/Preview';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { fillMarks, calcOrder } from '../domain/calc';
import { LABEL_LAYOUTS, cartonLabels, labelPages } from '../domain/labels';
import { DOCNAMES, DOC_FMT, MODS, STEPS, missing, stepPaths, type DocKey, type ModKey, type StepKey } from '../modules/defs';
import { exportDoc } from '../export/actions';
import { flash } from '../components/jump';
import type { LabelLayout, Order } from '../domain/types';


export function Workbench({ order: o, mod }: { order: Order; mod: ModKey }) {
  const ui = useUI();
  const m = MODS[mod];
  const steps = m.steps!;
  const docs = m.docs!;
  const step: StepKey = ui.step && steps.includes(ui.step) ? ui.step : steps[0];
  const doc: DocKey = ui.doc && docs.includes(ui.doc) ? ui.doc : docs[0];
  const s = STEPS[step];
  const i = steps.indexOf(step);

  useEffect(() => {
    document.getElementById('form')?.scrollTo({ top: 0 });
  }, [step]);

  const goStep = (st: StepKey) => ui.set({ step: st, ...(st === 'contractClauses' && docs.includes('contract') ? { doc: 'contract' as DocKey } : {}) });

  const jumpTo = (path: string) => {
    const norm = path.replace(/^(items|contractClauses|packs)\.\d+\./, '$1.*.');
    const target = steps.find((st) => stepPaths(st).includes(norm));
    if (!target) return toast('这一项在本订单的其它模块里填写（如「合同 / PI」的货物明细）');
    ui.set({ step: target, expand: false });
    setTimeout(() => flash(path), 30);
  };

  const fmts = DOC_FMT[doc];
  return (
    <>
      <TopBar><OrderCrumbs order={o} current={m.name} /></TopBar>
      <div className="mod-head">
        <button className="btn ghost sm" onClick={() => ui.openOrder(o.id)}>← 订单菜单</button>
        <h1><span className="code">{m.code}</span>{m.name}</h1>
        <span className="ord">{o.no} · {o.buyer.name || '未选择客户'}</span>
        <div className="r">
          {fmts.filter((f) => f !== 'PDF').map((f) => <button key={f} className="btn" disabled={ui.busy} onClick={() => exportDoc(o, doc, f)}>导出 {f}</button>)}
          <button className="btn pri" disabled={ui.busy} onClick={() => exportDoc(o, doc, 'PDF')}>导出 PDF</button>
        </div>
      </div>
      <div className={'mod' + (ui.expand ? ' expand' : '')}>
        <aside className="steps">
          <div className="lbl">填写步骤</div>
          {steps.map((st) => {
            const mi = missing(o, st);
            return (
              <button key={st} className={'step' + (step === st ? ' on' : '')} onClick={() => goStep(st)}>
                <b>{STEPS[st].label}</b>
                {mi.length ? <small className="warn" title={mi.join('、')}>缺 {mi.length} 项</small> : <small className="ok">✓ 已完成</small>}
              </button>
            );
          })}
          <div className="hint">数据属于订单 <b>{o.no}</b>，这里改的内容会同步到本单所有单据。</div>
        </aside>
        <section className="form" id="form">
          <div className="form-head"><h2>{s.label}</h2><p>{s.hint}</p></div>
          {s.fields && <div className="grid">{s.fields.map((f, idx) => <FieldView key={idx} order={o} def={f} />)}</div>}
          {s.table && <div style={{ marginTop: s.fields ? 14 : 0 }}><ItemTable order={o} table={s.table} /></div>}
          {s.list && <ClauseList order={o} />}
          {step === 'marks' && <MarksTools order={o} />}
          <div className="form-foot">
            {i > 0 ? <button className="btn" onClick={() => goStep(steps[i - 1])}>← 上一步</button> : <span />}
            {i < steps.length - 1
              ? <button className="btn pri" onClick={() => goStep(steps[i + 1])}>下一步：{STEPS[steps[i + 1]].label} →</button>
              : <button className="btn pri" onClick={() => exportDoc(o, doc, 'PDF')}>完成，导出 PDF</button>}
          </div>
        </section>
        <Preview
          order={o}
          doc={doc}
          onJump={jumpTo}
          bar={
            <>
              {docs.map((d) => <button key={d} className={'tab' + (doc === d ? ' on' : '')} onClick={() => ui.set({ doc: d })}>{DOCNAMES[d]}</button>)}
              <div className="r">
                <span className="tip">点单据上的内容可直接跳到输入框</span>
                <button className="btn ghost sm" onClick={() => ui.set({ expand: !ui.expand })}>{ui.expand ? '收起预览' : '放大预览'}</button>
              </div>
            </>
          }
        />
      </div>
    </>
  );
}

function MarksTools({ order }: { order: Order }) {
  const { customers, setOrderField } = useData();
  return (
    <>
    <div className="tbl-tools">
      <button
        className="btn sm"
        onClick={() => {
          const c = customers.find((x) => x.id === order.customerId);
          setOrderField(order.id, 'shipping.marks', fillMarks(c ? c.habits.marks : '{PO}\nC/NO. 1-{CTNS}\nMADE IN CHINA', order));
          toast('已按客户唛头模板重新生成');
        }}
      >
        按客户习惯重新生成唛头
      </button>
    </div>
    <LabelTools order={order} />
    </>
  );
}

/** 箱贴批量打印：每箱一张，箱号自动编为 1/74、2/74……；版式记在设置里，下次沿用 */
function LabelTools({ order }: { order: Order }) {
  const ui = useUI();
  const { settings, updateSettings } = useData();
  const lab = settings.labels;
  const total = calcOrder(order).ctns;
  const range = ui.labelRange;
  const from = range?.from ?? 1, to = range?.to ?? total;
  const count = cartonLabels(order, from, to).length;
  const show = () => ui.doc !== 'labels' && ui.set({ doc: 'labels' });
  const setLab = (p: Partial<typeof lab>) => { updateSettings((s) => void Object.assign(s.labels, p)); show(); };
  const setRange = (f: number, t: number) => {
    ui.set({ labelRange: { from: Math.max(1, Math.min(f, total)), to: Math.max(1, Math.min(t, total)) } });
    show();
  };
  return (
    <div className="lbl-tools">
      <h3>箱贴批量打印</h3>
      <p className="muted">每箱一张，正唛里的箱号自动编为 1/{total || 'N'}、2/{total || 'N'}……；尾箱数量按实际余数打印。</p>
      <div className="lbl-lay" role="radiogroup" aria-label="箱贴版式">
        {(Object.keys(LABEL_LAYOUTS) as LabelLayout[]).map((k) => (
          <label key={k} className={'lbl-opt' + (lab.layout === k ? ' on' : '')}>
            <input type="radio" name="lbl-lay" checked={lab.layout === k} onChange={() => setLab({ layout: k })} />
            <b>{LABEL_LAYOUTS[k].name}</b><small>{LABEL_LAYOUTS[k].hint}</small>
          </label>
        ))}
      </div>
      <div className="lbl-row">
        <label className="chk-inline"><input type="checkbox" checked={lab.info} onChange={(e) => setLab({ info: e.target.checked })} />印货物信息（型号、每箱数量、净毛重、尺寸）</label>
      </div>
      <div className="lbl-row">
        <label className="chk-inline"><input type="radio" name="lbl-rng" checked={!range} onChange={() => { ui.set({ labelRange: null }); show(); }} />全部 {total} 箱</label>
        <label className="chk-inline">
          <input type="radio" name="lbl-rng" checked={!!range} onChange={() => setRange(1, total)} />指定箱号
        </label>
        <input className="lbl-num" type="number" min={1} max={total} aria-label="起始箱号" value={from} disabled={!range} onChange={(e) => setRange(Number(e.target.value) || 1, to)} />
        <span>–</span>
        <input className="lbl-num" type="number" min={1} max={total} aria-label="结束箱号" value={to} disabled={!range} onChange={(e) => setRange(from, Number(e.target.value) || total)} />
      </div>
      <div className="lbl-row">
        <span className="lbl-sum">共 <b>{count}</b> 张 · {labelPages(count, lab.layout)} 页</span>
        <button className="btn pri" disabled={!count || ui.busy} onClick={() => { show(); void exportDoc(order, 'labels', 'PDF'); }}>导出箱贴 PDF</button>
      </div>
    </div>
  );
}

export function Placeholder({ order: o, mod }: { order: Order; mod: ModKey }) {
  const ui = useUI();
  const m = MODS[mod];
  return (
    <>
      <TopBar><OrderCrumbs order={o} current={m.name} /></TopBar>
      <div className="mod-head">
        <button className="btn ghost sm" onClick={() => ui.openOrder(o.id)}>← 订单菜单</button>
        <h1><span className="code">{m.code}</span>{m.name}</h1>
        <span className="pill s-确认">规划中 · {m.ph}</span>
      </div>
      <div className="ph-body">
        <div className="panel" style={{ padding: '22px 24px' }}>
          <div className="eyebrow">这个模块会做什么</div>
          <h2 style={{ fontSize: 19, margin: '6px 0 10px' }}>{m.desc}</h2>
          <ul>{m.plan?.map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="note">它会直接使用本订单 <b>{o.no}</b> 已有的客户、货物、条款和装箱数据，不需要重新录入。</div>
        </div>
      </div>
    </>
  );
}

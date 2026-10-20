import { useEffect, useRef } from 'react';
import { OrderCrumbs, TopBar } from '../components/common';
import { ClauseList, FieldView, ItemTable } from '../components/form';
import { Preview } from '../components/Preview';
import { useData } from '../store/data';
import { savePref, toast, useUI } from '../store/ui';
import { fillMarks, calcOrder } from '../domain/calc';
import { LABEL_LAYOUTS, cartonLabels, labelPages } from '../domain/labels';
import { DOCNAMES, DOC_FMT, MODS, STEPS, STEP_MOD, missing, normPath, ownerOf, stepPaths, type DocKey, type ModKey, type StepKey } from '../modules/defs';
import { exportDoc, exportZip } from '../export/actions';
import { countErrors } from '../components/CheckPanel';
import { confirmAction } from '../components/confirm';
import { flash, jumpToField } from '../components/jump';
import { docState, shortStamp } from '../domain/exports';
import { docVersions } from '../domain/history';
import { openDiff } from '../components/history';
import { factoriesOf, factoryName } from '../domain/purchase';
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

  /** 去别的模块填写（共用信息只在一个模块里填），记住现在的位置，填完可以一键回来 */
  const goOther = (st: StepKey, path?: string) => {
    jumpToField(STEP_MOD[st], st, path);
    useUI.getState().set({ back: { mod, step, doc } });
  };

  const jumpTo = (path: string) => {
    const norm = normPath(path);
    const target = steps.find((st) => stepPaths(st).includes(norm));
    if (target) {
      ui.set({ step: target, expand: false });
      setTimeout(() => flash(path), 30);
      return;
    }
    const own = ownerOf(path);
    if (!own) return toast('这一项是自动生成的，改对应的资料即可');
    goOther(own.step, path);
    toast(`这一项在「${MODS[own.mod].name} · ${STEPS[own.step].label}」填写，已带你过去；填完点左上角「← 回到${m.name}」`);
  };
  const back = ui.back && ui.back.mod !== mod ? ui.back : null;

  // 填表格的步骤默认收起预览，表格占满宽度；预览可随时展开
  const collapsed = !!s.table && ui.tableWide && !ui.expand;
  const setWide = (v: boolean) => { ui.set({ tableWide: v }); savePref('tableWide', v); };
  const modRef = useRef<HTMLDivElement>(null);
  const startSplit = (e: React.PointerEvent) => {
    const el = modRef.current;
    if (!el) return;
    e.preventDefault();
    const box = el.getBoundingClientRect();
    const steps = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 188;
    const move = (ev: PointerEvent) => {
      const r = Math.min(0.7, Math.max(0.3, (box.right - ev.clientX) / (box.width - steps)));
      ui.set({ pvRatio: r });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      savePref('pvRatio', useUI.getState().pvRatio);
    };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const fmts = DOC_FMT[doc];
  const last = docState(o, doc);
  return (
    <>
      <TopBar><OrderCrumbs order={o} current={m.name} /></TopBar>
      <div className="mod-head">
        <button className="btn ghost sm" onClick={() => ui.openOrder(o.id)}>← 订单菜单</button>
        {back && (
          <button className="btn sm back-mod" onClick={() => { ui.openMod(back.mod); ui.set({ step: back.step, doc: back.doc }); }}>
            ← 回到{MODS[back.mod].name}
          </button>
        )}
        <h1><span className="code">{m.code}</span>{m.name}</h1>
        <span className="ord">{o.no} · {o.buyer.name || '未选择客户'}</span>
        <div className="r">
          {last.kind !== 'none' && (() => {
            const vs = docVersions(o, doc);
            const ver = vs.length ? ` · 第 ${vs[vs.length - 1].v} 版` : '';
            const txt = last.kind === 'changed' ? `⚠ ${shortStamp(last.at)} 导出后又改过` : `上次导出 ${shortStamp(last.at)}${ver}`;
            return vs.length
              ? <button className={'last-exp' + (last.kind === 'changed' ? ' warn' : '')} title="看发出后改了什么" onClick={() => openDiff(o, doc)}>{txt}{last.to ? ` · 发给${last.to}` : ''}{last.kind === 'changed' ? ' · 看改了什么' : ''}</button>
              : <span className={'last-exp' + (last.kind === 'changed' ? ' warn' : '')} title={last.at}>{txt}{last.to ? ` · 发给${last.to}` : ''}</span>;
          })()}
          {mod === 'customs' && <button className="btn" disabled={ui.busy} title="预录入表、商业发票、装箱单（PDF + Excel）和销售合同打成一个 zip" onClick={() => void packBroker(o)}>打包发报关行</button>}
          {fmts.filter((f) => f !== 'PDF').map((f) => <button key={f} className="btn" disabled={ui.busy} onClick={() => exportDoc(o, doc, f)}>导出 {f}</button>)}
          <button className="btn pri" disabled={ui.busy} onClick={() => exportDoc(o, doc, 'PDF')}>导出 PDF</button>
        </div>
      </div>
      <div
        ref={modRef}
        className={'mod' + (ui.expand ? ' expand' : '') + (collapsed ? ' wide' : '')}
        style={{ '--pvc': `calc((100% - 188px) * ${ui.pvRatio})` } as React.CSSProperties}
      >
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
          {!!m.uses?.length && (
            <>
              <div className="lbl uses-lbl">共用信息 · 在其它模块填</div>
              {m.uses.map((st) => {
                const mi = missing(o, st);
                return (
                  <button key={st} className="step use" onClick={() => goOther(st)} title={`到「${MODS[STEP_MOD[st]].name}」填写`}>
                    <b>{STEPS[st].label}<span className="use-mod">{MODS[STEP_MOD[st]].name} ›</span></b>
                    {mi.length ? <small className="warn" title={mi.join('、')}>缺 {mi.length} 项</small> : <small className="ok">✓ 已填好</small>}
                  </button>
                );
              })}
            </>
          )}
          <div className="hint">数据属于订单 <b>{o.no}</b>，每项资料只在一个模块里填，本单所有单据自动共用。</div>
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
        {collapsed ? (
          <button className="pv-strip" onClick={() => setWide(false)} title="表格已加宽；点这里显示单据预览">
            <span className="pv-strip-ic">◂</span>
            <span className="pv-strip-t">显示预览</span>
          </button>
        ) : (
          <Preview
            order={o}
            doc={doc}
            onJump={jumpTo}
            split={!ui.expand && <div className="pv-split" role="separator" aria-orientation="vertical" aria-label="拖动调整表单和预览的宽度" title="拖动调整宽度，双击恢复" onPointerDown={startSplit} onDoubleClick={() => { ui.set({ pvRatio: 0.52 }); savePref('pvRatio', 0.52); }} />}
            bar={
              <>
                {docs.map((d) => <button key={d} className={'tab' + (doc === d ? ' on' : '')} onClick={() => ui.set({ doc: d })}>{DOCNAMES[d]}</button>)}
                {doc === 'po' && <FactoryTabs order={o} />}
                <div className="r">
                  <span className="tip">点单据上的内容可直接跳到输入框</span>
                  {!!s.table && !ui.expand && <button className="btn ghost sm" onClick={() => setWide(true)}>收起，表格加宽</button>}
                  <button className="btn ghost sm" onClick={() => ui.set({ expand: !ui.expand })}>{ui.expand ? '收起预览' : '放大预览'}</button>
                </div>
              </>
            }
          />
        )}
      </div>
    </>
  );
}

/** 报关资料一键打包：预录入表、发票、箱单（PDF + Excel）+ 合同 PDF */
async function packBroker(o: Order) {
  const n = countErrors(o);
  if (n && !(await confirmAction({ title: '单据检查有错误', ok: '仍然打包', body: <p>单据检查发现 {n} 个错误，建议改好再发给报关行。仍然要打包吗？</p> }))) return;
  void exportZip(o, [
    { doc: 'customs', fmt: 'PDF' }, { doc: 'customs', fmt: 'Excel' }, { doc: 'ci', fmt: 'PDF' }, { doc: 'ci', fmt: 'Excel' },
    { doc: 'pl', fmt: 'PDF' }, { doc: 'pl', fmt: 'Excel' }, { doc: 'contract', fmt: 'PDF' },
  ], '报关行');
}

/** 几个工厂时：预览切换看给哪个工厂的采购单（导出时每个工厂各出一份） */
function FactoryTabs({ order }: { order: Order }) {
  const ui = useUI();
  const partners = useData((s) => s.partners);
  const fids = factoriesOf(order);
  if (fids.length < 2) return null;
  const cur = ui.poFactory != null && fids.includes(ui.poFactory) ? ui.poFactory : fids[0];
  return (
    <span className="seg sm pv-fac" role="tablist" aria-label="给哪个工厂">
      {fids.map((f) => <button key={f} className={cur === f ? 'on' : ''} onClick={() => ui.set({ poFactory: f })}>{factoryName(partners, f) || '未选工厂'}</button>)}
    </span>
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

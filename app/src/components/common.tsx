import type { ReactNode } from 'react';
import { useUI } from '../store/ui';
import { useData } from '../store/data';
import type { Order } from '../domain/types';

export function TopBar({ children }: { children?: ReactNode }) {
  const go = useUI((s) => s.go);
  const ui = useUI();
  const reset = useData((s) => s.resetDemo);
  return (
    <header className="top">
      <button className="brand" onClick={() => go('home')} aria-label="返回首页">
        <span className="seal">外</span>
        <span><b>外贸超级工作台</b><small>单证 · 报关 · 订单</small></span>
      </button>
      <nav className="crumbs">{children}</nav>
      <div className="top-r">
        <span className="proto">M1 开发版 · 示例数据</span>
        <button
          className="btn ghost sm"
          onClick={() => {
            reset();
            ui.set({ page: 'home', orderId: null, mod: null, q: '', status: 'all', custId: null, expSel: null });
            ui.toast('已恢复示例数据');
          }}
        >
          重置示例
        </button>
      </div>
    </header>
  );
}

export function Crumb({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <>
      <button onClick={onClick}>{children}</button>
      <span>/</span>
    </>
  );
}

export function OrderCrumbs({ order, current }: { order: Order; current?: string }) {
  const ui = useUI();
  return (
    <>
      <Crumb onClick={() => ui.go('home')}>首页</Crumb>
      {current ? (
        <>
          <Crumb onClick={() => ui.openOrder(order.id)}>{order.no} {order.name}</Crumb>
          <span className="cur">{current}</span>
        </>
      ) : (
        <span className="cur">{order.no} {order.name}</span>
      )}
    </>
  );
}

export function LibCrumbs({ title }: { title: string }) {
  const go = useUI((s) => s.go);
  return (
    <>
      <Crumb onClick={() => go('home')}>首页</Crumb>
      <span className="cur">{title}</span>
    </>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <span className={'pill s-' + status}>{status}</span>;
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  return (
    <div id="toast" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && <button className="toast-act" onClick={t.action.run}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

export function ModalHost() {
  const modal = useUI((s) => s.modal);
  const close = useUI((s) => s.closeModal);
  if (!modal) return null;
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={modal.title}>
        <div className="modal-h">
          <h2>{modal.title}</h2>
          <button className="btn ghost sm" onClick={close}>关闭</button>
        </div>
        <div className="modal-b">{modal.body}</div>
        {modal.foot && <div className="modal-f">{modal.foot}</div>}
      </div>
    </div>
  );
}

export function LibPage({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <>
      <TopBar><LibCrumbs title={title} /></TopBar>
      <main className="wrap">
        <div className="sec-title">
          <div><div className="eyebrow">资料库</div><h1 style={{ fontSize: 22 }}>{title}</h1></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{right}</div>
        </div>
        {children}
      </main>
    </>
  );
}

export const soon = (what: string) => useUI.getState().toast(`「${what}」将在后续版本提供`);

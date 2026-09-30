import type { ReactNode } from 'react';
import { useUI } from '../store/ui';

/** 二次确认对话框：删除、清空、恢复等不可撤销的操作前使用 */
export function confirmAction(opt: { title: string; body: ReactNode; ok: string; danger?: boolean }): Promise<boolean> {
  const ui = useUI.getState();
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      useUI.getState().closeModal();
      resolve(v);
    };
    ui.openModal({
      title: opt.title,
      body: <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{opt.body}</div>,
      foot: (
        <>
          <button className="btn" onClick={() => done(false)}>取消</button>
          <button className={'btn ' + (opt.danger ? 'danger' : 'pri')} onClick={() => done(true)}>{opt.ok}</button>
        </>
      ),
    });
  });
}

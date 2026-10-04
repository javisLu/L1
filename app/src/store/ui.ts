import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { Bundle, DocKey, ExpKey, ModKey, StepKey } from '../modules/defs';
import type { OrderStatus, PartnerType } from '../domain/types';

export type Page = 'home' | 'order' | 'module' | 'customers' | 'partners' | 'products' | 'hs' | 'clauses' | 'calc' | 'settings';

export interface ToastAction { label: string; run: () => void }
interface Toast { id: number; text: string; action?: ToastAction }

interface UIState {
  page: Page;
  /** 上一个页面（从订单、单据等处打开「设置」后可以返回） */
  prev: Page;
  orderId: string | null;
  mod: ModKey | null;
  step: StepKey | null;
  doc: DocKey | null;
  expand: boolean;
  q: string;
  status: OrderStatus | 'all';
  custId: string | null;
  cq: string;
  ptype: PartnerType;
  bundle: Bundle;
  expSel: ExpKey[] | null;
  expDoc: DocKey | null;
  expFmt: 'pdf' | 'edit' | 'both';
  toasts: Toast[];
  /** 箱贴只打印部分箱号（null = 全部） */
  labelRange: { from: number; to: number } | null;
  /** 正在导出（防止重复点击） */
  busy: boolean;
  modal: { title: string; body: ReactNode; foot?: ReactNode; wide?: boolean } | null;
  set: (p: Partial<UIState>) => void;
  go: (page: Page) => void;
  openOrder: (id: string) => void;
  openMod: (mod: ModKey) => void;
  toast: (text: string, action?: ToastAction, ms?: number) => void;
  openModal: (m: UIState['modal']) => void;
  closeModal: () => void;
}

let tid = 0;

export const useUI = create<UIState>()((set) => ({
  page: 'home', prev: 'home', orderId: null, mod: null, step: null, doc: null, expand: false,
  q: '', status: 'all', custId: null, cq: '', ptype: '货代',
  bundle: '客户', expSel: null, expDoc: null, expFmt: 'both',
  toasts: [], labelRange: null, busy: false, modal: null,
  set: (p) => set(p),
  go: (page) => set((s) => (s.page === page ? {} : { page, prev: s.page })),
  openOrder: (id) => set((s) => ({ page: 'order', prev: s.page, orderId: id, expSel: null, labelRange: s.orderId === id ? s.labelRange : null })),
  openMod: (mod) => set((s) => ({ page: 'module', prev: s.page, mod, step: null, doc: null, expSel: null, expDoc: null })),
  toast: (text, action, ms) => {
    const id = ++tid;
    set((s) => ({ toasts: [...s.toasts, { id, text, action }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms ?? (action ? 8000 : 3200));
  },
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
}));

export const toast = (t: string, action?: ToastAction, ms?: number) => useUI.getState().toast(t, action, ms);

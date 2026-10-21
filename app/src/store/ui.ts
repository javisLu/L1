import { create } from 'zustand';
import type { ReactNode } from 'react';
import type { Bundle, DocKey, ExpKey, ModKey, StepKey } from '../modules/defs';
import type { OrderStatus, PartnerType } from '../domain/types';

export type Page = 'home' | 'order' | 'module' | 'customers' | 'partners' | 'products' | 'hs' | 'clauses' | 'calc' | 'settings' | 'doclib' | 'rates' | 'words' | 'hsq';

export interface ToastAction { label: string; run: () => void }
interface Toast { id: number; text: string; action?: ToastAction; key?: string }

interface UIState {
  page: Page;
  /** 上一个页面（从订单、单据等处打开「设置」后可以返回） */
  prev: Page;
  orderId: string | null;
  mod: ModKey | null;
  step: StepKey | null;
  doc: DocKey | null;
  /** 从预览点到了别的模块填写：记住原来的位置，方便填完回去 */
  back: { mod: ModKey; step: StepKey; doc: DocKey } | null;
  /** 采购单预览 / 工厂资料包：给哪个工厂（null = 第一个） */
  poFactory: string | null;
  expand: boolean;
  /** 填表格（货物明细、装箱、申报商品）时收起预览，让表格占满宽度 */
  tableWide: boolean;
  /** 表单 / 预览分隔线位置：预览占右侧区域的比例（0.3–0.7） */
  pvRatio: number;
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
  /** key 相同的提示会替换上一条（如「正在生成…」→「已保存…」）；同时最多显示 3 条 */
  toast: (text: string, action?: ToastAction, ms?: number, key?: string) => void;
  openModal: (m: UIState['modal']) => void;
  closeModal: () => void;
}

let tid = 0;

/** 只用来记住个人的界面习惯；读不到时用默认值 */
const pref = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem('tw-ui-' + k);
    return v == null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
};
export const savePref = (k: string, v: unknown) => {
  try {
    localStorage.setItem('tw-ui-' + k, JSON.stringify(v));
  } catch {
    // 无法保存时只是下次恢复默认
  }
};

export const useUI = create<UIState>()((set) => ({
  page: 'home', prev: 'home', orderId: null, mod: null, step: null, doc: null, back: null, poFactory: null, expand: false,
  tableWide: pref('tableWide', true), pvRatio: pref('pvRatio', 0.52),
  q: '', status: 'all', custId: null, cq: '', ptype: '货代',
  bundle: '客户', expSel: null, expDoc: null, expFmt: 'both',
  toasts: [], labelRange: null, busy: false, modal: null,
  set: (p) => set(p),
  go: (page) => set((s) => (s.page === page ? {} : { page, prev: s.page })),
  openOrder: (id) => set((s) => ({ page: 'order', prev: s.page, orderId: id, back: null, poFactory: s.orderId === id ? s.poFactory : null, expSel: null, labelRange: s.orderId === id ? s.labelRange : null })),
  openMod: (mod) => set((s) => ({ page: 'module', prev: s.page, mod, step: null, doc: null, back: null, expSel: null, expDoc: null })),
  toast: (text, action, ms, key) => {
    const id = ++tid;
    set((s) => ({ toasts: [...s.toasts.filter((t) => !key || t.key !== key), { id, text, action, key }].slice(-3) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms ?? (action ? 8000 : 3200));
  },
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
}));

export const toast = (t: string, action?: ToastAction, ms?: number, key?: string) => useUI.getState().toast(t, action, ms, key);

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { appStorage } from './storage';
import { PAYMENT_KEYS } from './paths';
import { seed } from '../domain/seed';
import { applyCustomer, autoPlace, blankOrder, copyOrder, orderNo, syncPay } from '../domain/factory';
import { today, uid } from '../domain/calc';
import { defaultSettings } from '../domain/settings';
import { mergeCustomer, mergeProduct } from '../io/library';
import type { Customer, DataState, Order, Partner, PartnerType, Product, Seller, Settings } from '../domain/types';

export type ImportMode = 'overwrite' | 'skip';
export interface ImportResult { added: number; updated: number; skipped: number }

/** 数据只保存在本机（桌面版为应用数据目录下的文件），不上传任何服务器 */
export let hydrationError: unknown = null;

export function setPath(obj: unknown, path: string, value: unknown) {
  const ks = path.split('.');
  let a = obj as Record<string, unknown>;
  for (let i = 0; i < ks.length - 1; i++) {
    if (a[ks[i]] == null) a[ks[i]] = {};
    a = a[ks[i]] as Record<string, unknown>;
  }
  a[ks[ks.length - 1]] = value;
}
export function getPath<T = unknown>(obj: unknown, path: string): T {
  return path.split('.').reduce<unknown>((a, k) => (a == null ? a : (a as Record<string, unknown>)[k]), obj) as T;
}

interface Actions {
  /** 修改订单任意字段，并处理联动（付款条款、指定地点） */
  setOrderField: (id: string, path: string, value: unknown) => void;
  updateOrder: (id: string, recipe: (o: Order) => void) => void;
  createOrder: (customerId: string, name: string) => Order;
  duplicateOrder: (id: string) => Order;
  deleteOrder: (id: string) => void;
  applyCustomerToOrder: (orderId: string, customerId: string) => void;
  /** 把订单里的买方信息保存或同步到客户库；返回是否为新建 */
  saveBuyerToLibrary: (orderId: string) => { created: boolean; name: string };
  updateCustomer: (id: string, recipe: (c: Customer) => void) => void;
  addCustomer: () => string;
  deleteCustomer: (id: string) => void;
  /** 按公司名合并：同名覆盖或跳过 */
  importCustomers: (rows: Customer[], mode: ImportMode, fields: string[]) => ImportResult;
  updateSettings: (recipe: (s: Settings) => void) => void;
  updateSeller: (recipe: (s: Seller) => void) => void;
  /** 把「设置」里的公司信息同步到未完结订单，返回同步的订单数 */
  syncSellerToOpenOrders: () => number;
  addProduct: (p?: Partial<Product>) => string;
  updateProduct: (id: string, recipe: (p: Product) => void) => void;
  deleteProduct: (id: string) => void;
  /** 按型号合并：同型号覆盖或跳过 */
  importProducts: (rows: Product[], mode: ImportMode, fields: string[]) => ImportResult;
  addPartner: (type: PartnerType) => string;
  updatePartner: (id: string, recipe: (p: Partner) => void) => void;
  deletePartner: (id: string) => void;
  /** 从备份恢复：整体替换 */
  replaceAll: (d: DataState) => void;
  /** 清空订单与资料库（保留公司信息与设置），开始正式使用 */
  clearAll: () => void;
  resetDemo: () => void;
}

export type DataStore = DataState & Actions;

export const useData = create<DataStore>()(
  persist(
    immer((setState, getState) => ({
      ...seed(),

      setOrderField: (id, path, value) =>
        setState((s) => {
          const o = s.orders.find((x) => x.id === id);
          if (!o) return;
          setPath(o, path, value);
          o.updated = today();
          if (path === 'terms.incoterm') autoPlace(o);
          if (path === 'terms.paymentText') o.terms.paymentManual = true;
          else if (PAYMENT_KEYS.includes(path)) syncPay(o);
        }),

      updateOrder: (id, recipe) =>
        setState((s) => {
          const o = s.orders.find((x) => x.id === id);
          if (!o) return;
          recipe(o);
          o.updated = today();
        }),

      createOrder: (customerId, name) => {
        const st = getState();
        const n = st.seq;
        const o = blankOrder(st.seller, orderNo(n, st.settings.numbering), name || '外贸订单' + n, today(), st.settings);
        const c = st.customers.find((x) => x.id === customerId);
        if (c) applyCustomer(o, c);
        setState((s) => {
          s.orders.push(o);
          s.seq = n + 1;
        });
        return o;
      },

      duplicateOrder: (id) => {
        const st = getState();
        const src = st.orders.find((x) => x.id === id)!;
        const o = copyOrder(src, orderNo(st.seq, st.settings.numbering), st.settings.numbering);
        setState((s) => {
          s.orders.push(o);
          s.seq += 1;
        });
        return o;
      },

      deleteOrder: (id) => setState((s) => void (s.orders = s.orders.filter((o) => o.id !== id))),

      applyCustomerToOrder: (orderId, customerId) =>
        setState((s) => {
          const o = s.orders.find((x) => x.id === orderId);
          const c = s.customers.find((x) => x.id === customerId);
          if (!o || !c) return;
          applyCustomer(o, c);
          o.updated = today();
        }),

      saveBuyerToLibrary: (orderId) => {
        let created = false;
        let name = '';
        setState((s) => {
          const o = s.orders.find((x) => x.id === orderId);
          if (!o) return;
          const b = o.buyer;
          name = b.name;
          const c = s.customers.find((x) => x.id === o.customerId);
          if (c) {
            Object.assign(c, { name: b.name, address: b.address, tax: b.tax, notify: b.notify });
            if (c.contacts[0]) Object.assign(c.contacts[0], { name: b.contact, phone: b.phone, email: b.email });
            else c.contacts.push({ name: b.contact, title: '', email: b.email, phone: b.phone });
          } else {
            created = true;
            const t = o.terms;
            const nc: Customer = {
              id: uid(), name: b.name, short: '', country: '', address: b.address, tax: b.tax, notify: b.notify, level: 'B', source: '',
              contacts: [{ name: b.contact, title: '', email: b.email, phone: b.phone }],
              habits: {
                incoterm: t.incoterm, place: t.place, deliveryAddress: t.deliveryAddress, currency: t.currency, pod: t.pod, marks: o.shipping.marks,
                payment: t.payment, payDeposit: t.payDeposit, payBalanceAt: t.payBalanceAt, payDays: t.payDays, payCustom: t.payCustom,
              },
              notes: '', follow: [],
            };
            s.customers.push(nc);
            o.customerId = nc.id;
          }
        });
        return { created, name };
      },

      updateCustomer: (id, recipe) =>
        setState((s) => {
          const c = s.customers.find((x) => x.id === id);
          if (c) recipe(c);
        }),

      addCustomer: () => {
        const id = uid();
        setState((s) => {
          s.customers.unshift({
            id, name: 'New Customer Co., Ltd.', short: '', country: '', address: '', tax: '', notify: '', level: 'B', source: '',
            contacts: [{ name: '', title: '', email: '', phone: '' }],
            habits: { incoterm: 'FOB', place: 'Qingdao', deliveryAddress: '', currency: 'USD', pod: '', marks: '', payment: 'T/T 电汇', payDeposit: 30, payBalanceAt: 'before shipment', payDays: '', payCustom: '' },
            notes: '', follow: [],
          });
        });
        return id;
      },

      deleteCustomer: (id) => setState((s) => void (s.customers = s.customers.filter((c) => c.id !== id))),

      importCustomers: (rows, mode, fields) => {
        const r: ImportResult = { added: 0, updated: 0, skipped: 0 };
        setState((s) => {
          for (const row of rows) {
            const key = row.name.trim().toLowerCase();
            const ex = s.customers.find((c) => c.name.trim().toLowerCase() === key);
            if (!ex) { s.customers.push(row); r.added++; }
            else if (mode === 'overwrite') { mergeCustomer(ex, row, fields); r.updated++; }
            else r.skipped++;
          }
        });
        return r;
      },

      updateSettings: (recipe) => setState((s) => void recipe(s.settings)),
      updateSeller: (recipe) => setState((s) => void recipe(s.seller)),

      syncSellerToOpenOrders: () => {
        let n = 0;
        setState((s) => {
          for (const o of s.orders) {
            if (o.status === '完结') continue;
            o.seller = { ...s.seller };
            o.updated = today();
            n++;
          }
        });
        return n;
      },

      addProduct: (p) => {
        const id = uid();
        setState((s) => {
          s.products.unshift({ id, model: '', nameCn: '', nameEn: '', spec: '', hs: '', unit: 'PCS', price: 0, pcsPerCtn: 0, l: 0, w: 0, h: 0, nw: 0, gw: 0, elements: '', cat: '', ...p });
        });
        return id;
      },
      updateProduct: (id, recipe) =>
        setState((s) => {
          const p = s.products.find((x) => x.id === id);
          if (p) recipe(p);
        }),
      deleteProduct: (id) => setState((s) => void (s.products = s.products.filter((p) => p.id !== id))),

      importProducts: (rows, mode, fields) => {
        const r: ImportResult = { added: 0, updated: 0, skipped: 0 };
        setState((s) => {
          for (const row of rows) {
            const key = row.model.trim().toLowerCase();
            const ex = s.products.find((p) => p.model.trim().toLowerCase() === key);
            if (!ex) { s.products.push(row); r.added++; }
            else if (mode === 'overwrite') { mergeProduct(ex, row, fields); r.updated++; }
            else r.skipped++;
          }
        });
        return r;
      },

      addPartner: (type) => {
        const id = uid();
        setState((s) => void s.partners.push({ id, type, name: '', contact: '', phone: '', note: '' }));
        return id;
      },
      updatePartner: (id, recipe) =>
        setState((s) => {
          const p = s.partners.find((x) => x.id === id);
          if (p) recipe(p);
        }),
      deletePartner: (id) => setState((s) => void (s.partners = s.partners.filter((p) => p.id !== id))),

      replaceAll: (d) => setState(() => ({ ...d, settings: { ...defaultSettings(), ...d.settings } })),

      clearAll: () =>
        setState((s) => {
          s.orders = [];
          s.customers = [];
          s.partners = [];
          s.products = [];
          s.seq = 1;
        }),

      // 重置示例数据时保留用户在「设置」里的公司信息与设置
      resetDemo: () => setState((s) => ({ ...seed(), settings: s.settings })),
    })),
    {
      name: 'trade-workbench-data',
      version: 2,
      // v1 → v2：新增「设置」
      migrate: (persisted, from) => {
        const d = persisted as DataState;
        if (from < 2 || !d.settings) d.settings = defaultSettings();
        return d as never;
      },
      storage: createJSONStorage(() => appStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) hydrationError = error;
      },
      partialize: (s) => ({ settings: s.settings, seller: s.seller, products: s.products, customers: s.customers, partners: s.partners, orders: s.orders, seq: s.seq }),
    },
  ),
);

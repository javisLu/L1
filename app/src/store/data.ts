import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { appStorage } from './storage';
import { PAYMENT_KEYS } from './paths';
import { seed } from '../domain/seed';
import { applyCustomer, autoPlace, blankOrder, copyOrder, orderNo, syncPay } from '../domain/factory';
import { today, uid } from '../domain/calc';
import type { Customer, DataState, Order } from '../domain/types';

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
        const o = blankOrder(st.seller, orderNo(n), name || '外贸订单' + n);
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
        const o = copyOrder(src, orderNo(st.seq));
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

      resetDemo: () => setState(() => seed()),
    })),
    {
      name: 'trade-workbench-data',
      version: 1,
      storage: createJSONStorage(() => appStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) hydrationError = error;
      },
      partialize: (s) => ({ seller: s.seller, products: s.products, customers: s.customers, partners: s.partners, orders: s.orders, seq: s.seq }),
    },
  ),
);

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { appStorage } from './storage';
import { PAYMENT_KEYS } from './paths';
import { seed } from '../domain/seed';
import { applyCustomer, autoPlace, blankOrder, copyOrder, orderNo, syncPay } from '../domain/factory';
import { today, uid } from '../domain/calc';
import { docSig, nowStamp } from '../domain/exports';
import { asOrder, recordSend } from '../domain/history';
import type { DocKey } from '../modules/defs';
import { defaultSettings } from '../domain/settings';
import { defaultPurchase, setRefRates } from '../domain/purchase';
import { buildLib, fillItems, learn, normName, renameRow } from '../domain/hs';
import { defaultLeads } from '../domain/leads';
import { mergeCustomer, mergeProduct } from '../io/library';
import type { Customer, DataState, HsEntry, Order, OrderSnap, Partner, PartnerType, Product, Seller, Settings, LeadsState } from '../domain/types';

export type ImportMode = 'overwrite' | 'skip';
export interface ImportResult { added: number; updated: number; skipped: number }

/** 数据只保存在本机（桌面版为应用数据目录下的文件），不上传任何服务器 */
export let hydrationError: unknown = null;

/** 设置里缺的项用默认值补上（含汇率表里缺的币种），读取旧数据、恢复备份时用 */
export function withSettings(s?: Partial<Settings>): Settings {
  const d = defaultSettings();
  const out = { ...d, ...(s ?? {}) } as Settings;
  out.defaults = { ...d.defaults, ...(s?.defaults ?? {}) };
  out.numbering = { ...d.numbering, ...(s?.numbering ?? {}) };
  out.labels = { ...d.labels, ...(s?.labels ?? {}) };
  out.assets = { ...d.assets, ...(s?.assets ?? {}) };
  out.rates = { ...d.rates, ...(s?.rates ?? {}), cny: { ...d.rates.cny, ...(s?.rates?.cny ?? {}) } };
  return out;
}

/** 老订单补上工厂采购的默认值（升级、从备份恢复时） */
function withPurchase(d: DataState): DataState {
  for (const o of d.orders ?? []) o.purchase ??= defaultPurchase();
  // v6：HS 记忆库（老数据从产品库和订单生成）；v7：去掉导入税则表
  d.hsLib ??= buildLib(d.products ?? [], d.orders ?? []);
  // v8：商机（关键词按产品库生成）
  d.leads ??= defaultLeads(d.products ?? []);
  delete (d as { tariff?: unknown }).tariff;
  return d;
}

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
  /** 记下导出（不改「更新于」日期） */
  markExported: (id: string, rec: { docs: string[]; snap: OrderSnap; to?: string; file?: string }) => void;
  /** 首页提醒「知道了」 */
  dismissReminder: (id: string, key: string) => void;
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
  /** 离开中文品名 / 商品编号格子时：按记忆库和税则表补全这一行空着的编号、申报要素、退税率；返回补了几格 */
  autoFillRow: (orderId: string, row: number, rebateOnly?: boolean) => number;
  /** 整单按记忆库补全 */
  fillFromLib: (orderId: string) => number;
  /** 改了中文品名：按新品名换掉这一行的编号、申报要素、退税率；找不到返回 'none' */
  renameFill: (orderId: string, row: number) => 'replaced' | 'none';
  /** 填好一行的编号 / 申报要素时记进 HS 记忆库 */
  learnRow: (orderId: string, row: number) => void;
  addHs: () => string;
  updateHs: (id: string, recipe: (e: HsEntry) => void) => void;
  deleteHs: (id: string) => void;
  /** 按中文品名合并 */
  importHs: (rows: HsEntry[], mode: ImportMode, fields: string[]) => ImportResult;
  updateLeads: (recipe: (l: LeadsState) => void) => void;
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

      markExported: (id, { docs, snap, to, file }) =>
        setState((s) => {
          const o = s.orders.find((x) => x.id === id);
          if (!o) return;
          const at = nowStamp();
          const key = recordSend(o, { id: uid(), at, docs, to, file, snap });
          o.exports ??= {};
          for (const d of docs) o.exports[d] = { at, sig: docSig(asOrder(snap, o), d as DocKey), snap: key, ...(to ? { to } : {}) };
          // 导出过的品名、编号、申报要素、退税率记进 HS 记忆库
          learn((s.hsLib ??= []), snap.items);
        }),

      dismissReminder: (id, key) =>
        setState((s) => {
          const o = s.orders.find((x) => x.id === id);
          if (o && !o.dismissed?.includes(key)) (o.dismissed ??= []).push(key);
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

      replaceAll: (d) => setState(() => ({ ...withPurchase(d), settings: withSettings(d.settings) })),

      autoFillRow: (orderId, row, rebateOnly) => {
        let n = 0;
        setState((s) => {
          const o = s.orders.find((x) => x.id === orderId);
          if (!o) return;
          n = fillItems(o, s.hsLib, [row], rebateOnly).cells;
          if (n) o.updated = today();
        });
        return n;
      },
      fillFromLib: (orderId) => {
        let n = 0;
        setState((s) => {
          const o = s.orders.find((x) => x.id === orderId);
          if (!o) return;
          n = fillItems(o, s.hsLib).cells;
          if (n) o.updated = today();
        });
        return n;
      },
      renameFill: (orderId, row) => {
        let r: 'replaced' | 'none' = 'none';
        setState((s) => {
          const o = s.orders.find((x) => x.id === orderId);
          if (!o?.items[row]) return;
          r = renameRow(o, row, s.hsLib);
          if (r === 'replaced') o.updated = today();
        });
        return r;
      },
      learnRow: (orderId, row) =>
        setState((s) => {
          const it = s.orders.find((x) => x.id === orderId)?.items[row];
          if (it) learn(s.hsLib, [it]);
        }),
      addHs: () => {
        const id = uid();
        setState((s) => void s.hsLib.unshift({ id, nameCn: '', hs: '', elements: '', rebate: '', source: 'manual', used: today() }));
        return id;
      },
      updateHs: (id, recipe) =>
        setState((s) => {
          const e = s.hsLib.find((x) => x.id === id);
          if (e) { recipe(e); e.source = 'manual'; }
        }),
      deleteHs: (id) => setState((s) => void (s.hsLib = s.hsLib.filter((e) => e.id !== id))),
      updateLeads: (recipe) => setState((s) => void recipe((s.leads ??= defaultLeads(s.products)))),
      importHs: (rows, mode, fields) => {
        const r: ImportResult = { added: 0, updated: 0, skipped: 0 };
        setState((s) => {
          for (const row of rows) {
            const key = normName(row.nameCn);
            const ex = s.hsLib.find((e) => normName(e.nameCn) === key);
            if (!ex) { s.hsLib.push(row); r.added++; }
            else if (mode === 'overwrite') { for (const k of fields) (ex as unknown as Record<string, unknown>)[k] = (row as unknown as Record<string, unknown>)[k]; ex.source = 'import'; r.updated++; }
            else r.skipped++;
          }
        });
        return r;
      },

      clearAll: () =>
        setState((s) => {
          s.orders = [];
          s.customers = [];
          s.partners = [];
          s.products = [];
          s.hsLib = [];
          s.seq = 1;
        }),

      // 重置示例数据时保留用户在「设置」里的公司信息与设置
      resetDemo: () => setState((s) => ({ ...seed(), settings: s.settings, leads: s.leads })),
    })),
    {
      name: 'trade-workbench-data',
      version: 8,
      // v1 → v2：新增「设置」
      migrate: (persisted, from) => {
        const d = persisted as DataState;
        if (from < 2 || !d.settings) d.settings = defaultSettings();
        // v3：新增箱贴设置等，缺的设置项用默认值补上
        d.settings = withSettings(d.settings);
        // v4：去掉「上传自己的 Excel 模板」的数据（改为软件自带的单据模板库）
        delete (d as { templates?: unknown }).templates;
        // v5：订单新增工厂采购与成本利润；v6：HS 记忆库；v7：去掉税则表；v8：商机
        withPurchase(d);
        return d as never;
      },
      storage: createJSONStorage(() => appStorage),
      // 每次读取都把新增的设置项补上默认值（版本号没变也补），避免新功能读到旧数据里没有的设置
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DataState>;
        // 旧数据里没有的新模块按用户自己的数据生成，别拿示例数据的（关键词要按用户的产品库）
        return { ...current, ...p, settings: withSettings(p.settings), leads: p.leads ?? defaultLeads(p.products ?? current.products) } as typeof current;
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) hydrationError = error;
      },
      partialize: (s) => ({ settings: s.settings, seller: s.seller, products: s.products, customers: s.customers, partners: s.partners, orders: s.orders, seq: s.seq, hsLib: s.hsLib, leads: s.leads }),
    },
  ),
);

// 成本利润里没填汇率时用的参考汇率，跟着「汇率换算」里的表走
setRefRates(useData.getState().settings.rates?.cny);
useData.subscribe((s) => setRefRates(s.settings.rates?.cny));

import { CONTRACT_LIB, DEFAULT_CLAUSES, ORIGIN_TERMS } from './constants';
import { fillMarks, payText, today, uid } from './calc';
import type { Buyer, Customer, Item, Order, Product, Seller } from './types';

export function clausesFromLib(keys: string[]) {
  return keys.map((k) => {
    const c = CONTRACT_LIB.find((x) => x.k === k)!;
    return { id: uid(), k, title: c.t, body: c.b, on: true };
  });
}

export function blankOrder(seller: Seller, no: string, name: string, created = today()): Order {
  const order: Order = {
    id: uid(), no, name, status: '询价', created, updated: created, customerId: '',
    seller: { ...seller },
    buyer: { name: '', address: '', contact: '', phone: '', email: '', tax: '', notify: '' },
    terms: {
      incoterm: 'FOB', place: 'Qingdao', deliveryAddress: '', currency: 'USD',
      payment: 'T/T 电汇', payDeposit: 30, payBalanceAt: 'before shipment', payDays: '', payCustom: '',
      paymentText: '', paymentManual: false,
      pol: 'Qingdao, China', pod: '', transport: '海运', leadTime: '20-25 working days',
      shipment: 'Within 30 days after receipt of deposit', partial: 'Not Allowed', transship: 'Allowed',
      insurance: 'To be covered by the Buyer', packing: 'Export standard cartons, suitable for ocean transportation',
    },
    numbers: { quote: 'QT-' + no, pi: 'PI-' + no, contract: 'SC-' + no, ci: 'CI-' + no, po: '', date: created, validUntil: '', signedAt: 'Qingdao, China' },
    items: [],
    shipping: { vessel: '', blNo: '', container: '', seal: '', etd: '', origin: 'CHINA', marks: '', side: '' },
    customs: {
      exportPort: '青岛大港海关', supervision: '0110 一般贸易', exemption: '101 一般征税', license: '',
      tradeCountry: '', destCountry: '', sourceArea: '青岛', packageType: '纸制或纤维板制盒/箱', freight: '', insFee: '', docs: '',
    },
    partners: { forwarder: '', broker: '', factory: '' },
    docset: {
      theme: '藏青', stamp: true,
      remarks: 'Prices are based on current material costs. Goods are inspected before shipment.',
      clauses: 'All prices are subject to change without prior notice.\nClaims must be raised within 7 days after receipt of goods.\nForce majeure events excuse any delay in performance.',
    },
    contractClauses: clausesFromLib(DEFAULT_CLAUSES),
  };
  syncPay(order);
  return order;
}

export function syncPay(o: Order) {
  if (!o.terms.paymentManual) o.terms.paymentText = payText(o.terms);
}

export function snapCustomer(c: Customer): Buyer {
  const k = c.contacts[0];
  return { name: c.name, address: c.address, contact: k?.name ?? '', phone: k?.phone ?? '', email: k?.email ?? '', tax: c.tax, notify: c.notify };
}

const COUNTRY_CN = new Set(['新加坡', '美国', '丹麦', '德国', '英国', '法国', '日本', '澳大利亚', '加拿大', '阿联酋']);

/** 把客户信息与默认交易习惯带入订单（带入的是快照，之后改客户库不影响本单） */
export function applyCustomer(o: Order, c: Customer) {
  o.customerId = c.id;
  o.buyer = snapCustomer(c);
  const h = c.habits;
  const keys = ['incoterm', 'place', 'currency', 'pod', 'deliveryAddress', 'payment', 'payDeposit', 'payBalanceAt', 'payDays', 'payCustom'] as const;
  for (const k of keys) {
    const v = h[k];
    if (v != null && v !== '') (o.terms as unknown as Record<string, unknown>)[k] = v;
  }
  o.terms.insurance = ['CIF', 'CIP'].includes(h.incoterm)
    ? 'To be covered by the Seller for 110% of invoice value against All Risks'
    : 'To be covered by the Buyer';
  if (COUNTRY_CN.has(c.country)) {
    o.customs.tradeCountry = c.country;
    o.customs.destCountry = c.country;
  }
  o.terms.paymentManual = false;
  syncPay(o);
  o.shipping.marks = fillMarks(h.marks, o);
}

/** 切换贸易术语时，若指定地点是系统带出的（等于装运港城市或目的港），跟着切换 */
export function autoPlace(o: Order) {
  const t = o.terms;
  const polCity = (t.pol || '').split(',')[0].trim();
  const pod = (t.pod || '').trim();
  if (!t.place || t.place === polCity || t.place === pod) {
    t.place = ORIGIN_TERMS.includes(t.incoterm) ? polCity : pod;
  }
}

export function emptyItem(): Item {
  return { id: uid(), model: '', nameEn: '', nameCn: '', spec: '', hs: '', unit: 'PCS', qty: '', price: '', pcsPerCtn: '', l: '', w: '', h: '', nw: '', gw: '', elements: '' };
}

export function productToItem(p: Product, qty: number | string = ''): Item {
  return {
    id: uid(), model: p.model, nameEn: p.nameEn, nameCn: p.nameCn, spec: p.spec, hs: p.hs, unit: p.unit,
    qty, price: p.price, pcsPerCtn: p.pcsPerCtn, l: p.l, w: p.w, h: p.h, nw: p.nw, gw: p.gw, elements: p.elements,
  };
}

export function orderNo(seq: number, year = new Date().getFullYear()) {
  return `${year}-${String(seq).padStart(3, '0')}`;
}

/** 返单：复制客户、货物、条款，清空船名提单号，编号按新单号派生 */
export function copyOrder(src: Order, no: string): Order {
  const o: Order = JSON.parse(JSON.stringify(src));
  const d = today();
  o.id = uid();
  o.no = no;
  o.name = src.name + '（返单）';
  o.status = '询价';
  o.created = o.updated = d;
  o.numbers = { ...o.numbers, quote: 'QT-' + no, pi: 'PI-' + no, contract: 'SC-' + no, ci: 'CI-' + no, po: '', date: d };
  o.shipping = { ...o.shipping, vessel: '', blNo: '', container: '', seal: '', etd: '' };
  o.items.forEach((i) => (i.id = uid()));
  o.contractClauses.forEach((c) => (c.id = uid()));
  return o;
}

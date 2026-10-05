import { applyCustomer, blankOrder, productToItem } from './factory';
import { uid } from './calc';
import { defaultSettings } from './settings';
import type { Customer, DataState, Order, Partner, Product, Seller } from './types';

/** 首次启动的示例数据（全部为虚构公司），可在首页「重置示例」恢复 */
export function seed(): DataState {
  const seller: Seller = {
    name: 'Qingdao Hengyuan Industrial Co., Ltd.', nameCn: '青岛恒远实业有限公司',
    address: 'No. 18 Haier Road, Laoshan District, Qingdao, Shandong, China',
    phone: '+86 532 8888 6666', email: 'sales@hengyuan-demo.com', tax: '91370212MA3DEMO001',
    bank: 'Beneficiary: Qingdao Hengyuan Industrial Co., Ltd.\nBank: Bank of China, Qingdao Branch\nSWIFT: BKCHCNBJ500\nA/C No.: 2201 0000 0000 0000 (示例)',
  };
  const products: Product[] = [
    { id: uid(), model: 'AL-S200', nameCn: '铝合金展示架（标准款）', nameEn: 'Aluminium Display Rack - Standard', spec: '1200×450×1800 mm', hs: '9403200000', unit: 'PCS', price: 12.5, pcsPerCtn: 2, l: 122, w: 47, h: 20, nw: 14.5, gw: 16, elements: '0|0|展示用|铝合金|无品牌|AL-S200', cat: '展示架' },
    { id: uid(), model: 'AL-H500', nameCn: '铝合金展示架（加重款）', nameEn: 'Aluminium Display Rack - Heavy Duty', spec: '1500×600×2000 mm', hs: '9403200000', unit: 'SETS', price: 89, pcsPerCtn: 1, l: 155, w: 62, h: 28, nw: 28, gw: 31, elements: '0|0|展示用|铝合金|无品牌|AL-H500', cat: '展示架' },
    { id: uid(), model: 'AC-01', nameCn: '配件包（挂钩及螺栓）', nameEn: 'Accessory Kit (Hooks & Bolts)', spec: '20 pcs / kit', hs: '7318159001', unit: 'SETS', price: 3.2, pcsPerCtn: 50, l: 40, w: 30, h: 25, nw: 9, gw: 10, elements: '0|0|紧固用|钢制|无品牌|AC-01', cat: '配件' },
    { id: uid(), model: 'SH-80', nameCn: '钢制货架 80cm', nameEn: 'Steel Shelf 80cm, Powder Coated', spec: '800×400×1500 mm', hs: '9403200000', unit: 'PCS', price: 18.6, pcsPerCtn: 1, l: 82, w: 42, h: 12, nw: 11, gw: 12.2, elements: '0|0|仓储用|钢制|无品牌|SH-80', cat: '货架' },
  ];
  const customers: Customer[] = [
    {
      id: 'c1', name: 'Global Ventures Pte. Ltd.', short: 'GV', country: '新加坡', address: '88 Cross Street, #05-01, Singapore 048445', tax: 'UEN 201912345K', notify: 'SAME AS CONSIGNEE', level: 'A', source: '展会 · 广交会',
      contacts: [
        { name: 'David Kim', title: 'Purchasing Manager', email: 'purchase@globalventures-demo.sg', phone: '+65 6123 4567' },
        { name: 'Grace Tan', title: 'Logistics', email: 'logistics@globalventures-demo.sg', phone: '+65 6123 4570' },
      ],
      habits: { incoterm: 'FOB', place: 'Qingdao', deliveryAddress: '', payment: 'T/T 电汇', payDeposit: 30, payBalanceAt: 'before shipment', payDays: '', payCustom: '', currency: 'USD', pod: 'Singapore', marks: 'G.V.\nPO NO.: {PO}\nSINGAPORE\nC/NO. 1-{CTNS}\nMADE IN CHINA' },
      notes: '要求中性包装，外箱印 PO 号；付款准时。',
      follow: [{ d: '2026-09-20', t: '询价 3 款铝合金展架，要求 10 月底前出货' }, { d: '2026-08-02', t: '外贸订单1 已收尾款，客户反馈包装良好' }],
    },
    {
      id: 'c2', name: 'ABC Trading LLC', short: 'ABC', country: '美国', address: '123 Main St, Los Angeles, CA 90001, USA', tax: 'EIN 95-1234567', notify: 'ABC Logistics Inc., same address', level: 'A', source: '阿里巴巴国际站',
      contacts: [{ name: 'John Miller', title: 'Owner', email: 'john@abctrading-demo.com', phone: '+1 213 555 0100' }],
      habits: { incoterm: 'CIF', place: 'Los Angeles', deliveryAddress: '', payment: 'L/C 信用证', payDeposit: '', payBalanceAt: '', payDays: 0, payCustom: '', currency: 'USD', pod: 'Los Angeles', marks: 'ABC\nLOS ANGELES\nC/NO. 1-{CTNS}\nMADE IN CHINA' },
      notes: '信用证付款，单据要求严格，货描须与 L/C 一致。', follow: [{ d: '2026-09-02', t: 'L/C 已开到，最迟装期 10-15' }],
    },
    {
      id: 'c3', name: 'Nordhavn Supply ApS', short: 'NS', country: '丹麦', address: 'Havnegade 12, 1058 Copenhagen K, Denmark', tax: 'VAT DK12345678', notify: 'SAME AS CONSIGNEE', level: 'B', source: 'LinkedIn',
      contacts: [{ name: 'Mette Larsen', title: 'Buyer', email: 'mette@nordhavn-demo.dk', phone: '+45 33 12 34 56' }],
      habits: { incoterm: 'DAP', place: 'Aarhus', deliveryAddress: 'Nordhavn Supply ApS Warehouse, Industrivej 8, 8200 Aarhus N, Denmark', payment: 'O/A 赊销', payDeposit: '', payBalanceAt: '', payDays: 30, payCustom: '', currency: 'EUR', pod: 'Aarhus', marks: 'NORDHAVN\nAARHUS\nC/NO. 1-{CTNS}' },
      notes: '欧元结算，需 EORI 号。', follow: [],
    },
  ];
  const partners: Partner[] = [
    { id: 'p1', type: '货代', name: '青岛远航国际货运代理有限公司', contact: '王经理', phone: '138 0000 1111', note: '新加坡、东南亚航线' },
    { id: 'p2', type: '货代', name: '捷通物流（上海）有限公司', contact: '陈小姐', phone: '139 0000 2222', note: '美线、欧线' },
    { id: 'p3', type: '报关行', name: '青岛海通报关有限公司', contact: '李小姐', phone: '137 0000 3333', note: '青岛大港' },
    { id: 'p4', type: '工厂', name: '临沂金盛铝业有限公司', contact: '张厂长', phone: '136 0000 4444', note: '铝合金展架' },
    { id: 'p5', type: '船公司', name: 'COSCO SHIPPING', contact: '订舱部', phone: '—', note: '' },
  ];
  const P = (m: string) => products.find((p) => p.model === m)!;
  const make = (c: Customer, no: string, name: string, status: Order['status'], created: string, items: [string, number][], patch: (o: Order) => void) => {
    const o = blankOrder(seller, no, name, created);
    o.items = items.map(([m, q]) => productToItem(P(m), q));
    applyCustomer(o, c);
    o.status = status;
    patch(o);
    return o;
  };
  const orders: Order[] = [
    make(customers[0], '2026-003', '外贸订单3', '报价', '2026-09-26', [['AL-S200', 100], ['AL-H500', 20], ['AC-01', 200]], (o) => {
      o.numbers.po = 'GV-PO-7781';
      o.partners = { forwarder: 'p1', broker: 'p3', factory: 'p4' };
      applyCustomer(o, customers[0]);
    }),
    make(customers[1], '2026-002', '外贸订单2', '出货', '2026-09-05', [['AL-H500', 60], ['AL-S200', 300]], (o) => {
      o.numbers.po = 'ABC-2026-118';
      Object.assign(o.shipping, { vessel: 'COSCO SHIPPING ARIES V.045E', blNo: 'COSU6384521900', container: 'CSNU7234561 / 40HQ', seal: 'CN4471823', etd: '2026-10-08' });
      Object.assign(o.customs, { freight: 'USD 2,350', insFee: 'USD 30' });
      Object.assign(o.shipping, { equipment: '1×40HQ', cargoReady: '2026-10-02', eta: '2026-11-03' });
      o.partners = { forwarder: 'p2', broker: 'p3', factory: 'p4' };
    }),
    make(customers[2], '2026-001', '外贸订单1', '完结', '2026-07-12', [['SH-80', 500]], (o) => {
      Object.assign(o.shipping, { vessel: 'MAERSK EINDHOVEN V.231W', blNo: 'MAEU231889012', container: 'MSKU8812345 / 40GP', seal: 'ML882211', etd: '2026-08-01' });
      o.customs.freight = 'EUR 3,100';
      Object.assign(o.shipping, { equipment: '1×40GP', eta: '2026-09-02' });
      o.partners = { forwarder: 'p2', broker: 'p3', factory: '' };
    }),
  ];
  return { settings: defaultSettings(), seller, products, customers, partners, orders, seq: 4 };
}

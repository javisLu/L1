/** 输入框里的数字先按字符串保存，计算时再转换，避免输入到一半（如 "12."）被吞掉 */
export type Num = number | string;

export type Currency = 'USD' | 'EUR' | 'GBP' | 'CNY' | 'JPY' | 'AUD' | 'CAD' | 'HKD' | 'AED';

export type OrderStatus = '询价' | '报价' | '确认' | '生产' | '出货' | '收款' | '完结';

export interface Seller {
  name: string;
  nameCn: string;
  address: string;
  phone: string;
  email: string;
  tax: string;
  bank: string;
}

export interface Buyer {
  name: string;
  address: string;
  contact: string;
  phone: string;
  email: string;
  tax: string;
  notify: string;
}

/** 付款相关字段，订单与客户交易习惯共用 */
export interface PaymentHabit {
  payment: string;
  payDeposit: Num;
  payBalanceAt: string;
  payDays: Num;
  payCustom: string;
}

export interface Terms extends PaymentHabit {
  incoterm: string;
  place: string;
  deliveryAddress: string;
  currency: Currency;
  paymentText: string;
  paymentManual: boolean;
  pol: string;
  pod: string;
  transport: string;
  leadTime: string;
  shipment: string;
  partial: string;
  transship: string;
  insurance: string;
  packing: string;
}

export interface Item {
  id: string;
  model: string;
  nameEn: string;
  nameCn: string;
  spec: string;
  hs: string;
  unit: string;
  qty: Num;
  price: Num;
  pcsPerCtn: Num;
  l: Num;
  w: Num;
  h: Num;
  nw: Num;
  gw: Num;
  elements: string;
  /** 混装箱编号（与 Order.packs 对应）；空 = 单独装箱，按每箱装量算箱数 */
  mix?: string;
}

/**
 * 混装箱：几种货物装在同一种箱子里（Excel 里通常是合并单元格）。
 * 箱数、每箱毛重、外箱尺寸属于整箱；每种货物在 Item.nw 填自己的每箱净重。
 * 整箱毛重按各货物净重比例分摊到每一行，箱单、报关资料上每行都有净重和毛重。
 */
/** 外包装：散箱按箱数自动；托盘、木箱等自己填件数、每件尺寸和每件自重 */
export type PkgMode = 'ctns' | 'pallet' | 'case' | 'other';
export interface PkgSize { n: Num; l: Num; w: Num; h: Num }
export interface Packaging {
  mode: PkgMode;
  /** mode = other 时的单位（如 BAGS、BUNDLES） */
  unit: string;
  count: Num;
  /** 每件自重 kg（托盘、木箱本身），计入总毛重 */
  tare: Num;
  sizes: PkgSize[];
}

export interface MixPack {
  id: string;
  /** 这样的混装箱有几箱（每箱装的内容相同） */
  ctns: Num;
  /** 每箱毛重 kg */
  gw: Num;
  l: Num;
  w: Num;
  h: Num;
}

export interface Numbers {
  quote: string;
  pi: string;
  contract: string;
  ci: string;
  po: string;
  date: string;
  validUntil: string;
  signedAt: string;
}

export interface Shipping {
  vessel: string;
  blNo: string;
  container: string;
  seal: string;
  etd: string;
  origin: string;
  marks: string;
  side: string;
}

export interface Customs {
  exportPort: string;
  supervision: string;
  exemption: string;
  license: string;
  tradeCountry: string;
  destCountry: string;
  sourceArea: string;
  packageType: string;
  freight: string;
  insFee: string;
  docs: string;
}

export interface ContractClause {
  id: string;
  /** 条款库键；自定义条款为 custom */
  k: string;
  title: string;
  body: string;
  on: boolean;
}

export interface DocSettings {
  theme: string;
  stamp: boolean;
  remarks: string;
  clauses: string;
}

export interface Order {
  id: string;
  no: string;
  name: string;
  status: OrderStatus;
  created: string;
  updated: string;
  customerId: string;
  seller: Seller;
  buyer: Buyer;
  terms: Terms;
  numbers: Numbers;
  items: Item[];
  /** 混装箱（可选，老订单没有） */
  packs?: MixPack[];
  /** 总件数 / 外包装（散箱、托盘、木箱…；可选，老订单没有 = 散箱） */
  pkg?: Packaging;
  shipping: Shipping;
  customs: Customs;
  partners: { forwarder: string; broker: string; factory: string };
  docset: DocSettings;
  contractClauses: ContractClause[];
}

export interface Contact {
  name: string;
  title: string;
  email: string;
  phone: string;
}

export interface CustomerHabits extends PaymentHabit {
  incoterm: string;
  place: string;
  deliveryAddress: string;
  currency: Currency;
  pod: string;
  marks: string;
}

export interface Customer {
  id: string;
  name: string;
  short: string;
  country: string;
  address: string;
  tax: string;
  notify: string;
  level: string;
  source: string;
  contacts: Contact[];
  habits: CustomerHabits;
  notes: string;
  follow: { d: string; t: string }[];
}

export type PartnerType = '货代' | '报关行' | '工厂' | '船公司';

export interface Partner {
  id: string;
  type: PartnerType;
  name: string;
  contact: string;
  phone: string;
  note: string;
}

export interface Product {
  id: string;
  model: string;
  nameCn: string;
  nameEn: string;
  spec: string;
  hs: string;
  unit: string;
  price: number;
  pcsPerCtn: number;
  l: number;
  w: number;
  h: number;
  nw: number;
  gw: number;
  elements: string;
  cat: string;
}

/** 编号规则：订单号按模板生成，各单据编号 = 前缀 + 订单号 */
export interface Numbering {
  /** 可用：{YYYY} {YY} {MM} {SEQ} */
  orderPattern: string;
  seqDigits: number;
  quote: string;
  pi: string;
  contract: string;
  ci: string;
}

/** 新建订单时带入的默认值 */
export interface OrderDefaults {
  pol: string;
  place: string;
  transport: string;
  leadTime: string;
  shipment: string;
  packing: string;
  signedAt: string;
  exportPort: string;
  sourceArea: string;
  theme: string;
  stamp: boolean;
}

/** 图片以 data URL 保存（已压缩），用于单据抬头与签章 */
export interface Assets {
  logo: string;
  stamp: string;
  signature: string;
}

/** 箱贴版式：A4 每页几张，或标签打印机的标签尺寸（毫米） */
export type LabelLayout = 'a4-2' | 'a4-4' | 'a4-6' | 'a4-8' | '100x100' | '100x150';
export interface LabelSettings {
  layout: LabelLayout;
  /** 箱贴上印货物信息（型号、每箱数量、净毛重、尺寸） */
  info: boolean;
}

export interface Settings {
  numbering: Numbering;
  defaults: OrderDefaults;
  assets: Assets;
  labels: LabelSettings;
  /** 上次自动备份的日期 YYYY-MM-DD */
  lastAutoBackup: string;
}

export interface DataState {
  settings: Settings;
  seller: Seller;
  products: Product[];
  customers: Customer[];
  partners: Partner[];
  orders: Order[];
  seq: number;
}

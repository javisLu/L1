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
  /* —— M2-2 工厂采购（只出现在采购单和成本利润里，不上给客户的单据） —— */
  /** 供应工厂（合作方 id）；空 = 订单菜单里选的工厂 */
  factory?: string;
  /** 采购单价（人民币，含税） */
  cost?: Num;
  /** 出口退税率 % */
  rebate?: Num;
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
  /* —— 以下为 M2 订舱 / 提单补料用，老订单没有时按默认处理（见 domain/shipping.ts） —— */
  /** 收货人：同买方 / TO ORDER / 自定义 */
  consigneeMode?: 'buyer' | 'order' | 'custom';
  consignee?: string;
  /** 通知人：自动（收货人是买方 → SAME AS CONSIGNEE，TO ORDER → 买方）/ 同买方 / 自定义 */
  notifyMode?: 'auto' | 'buyer' | 'custom';
  notify?: string;
  /** 运费：空 = 按贸易术语自动 */
  freight?: '' | 'PREPAID' | 'COLLECT';
  /** 提单类型：正本 / 电放 / 海运单 */
  blType?: 'original' | 'telex' | 'seaway';
  /** 正本份数 */
  originals?: Num;
  /** 柜型柜量，如 1×40HQ、LCL 拼箱 */
  equipment?: string;
  /** 投保：空 = 按贸易术语自动（CIF / CIP 需要） */
  insure?: '' | 'yes' | 'no';
  /** 货好时间 */
  cargoReady?: string;
  eta?: string;
  /** 订舱特殊要求 */
  bookingNote?: string;
  /** 多柜明细（一个柜子时直接用 container / seal） */
  boxes?: ContainerRow[];
  /** 截关 / 截港时间 */
  cutoff?: string;
}

export interface ContainerRow { no: string; seal: string; type: string; pkgs: Num; gw: Num; cbm: Num }

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
  /** 发票 / 箱单上注明的文字（客户要求的声明，如 NO WOOD PACKING MATERIAL IS USED） */
  statement?: string;
}

/** 给某个工厂的采购单：编号、交货日期、付款方式、备注（每个工厂一份） */
export interface FactoryPO {
  no?: string;
  delivery?: string;
  payment?: string;
  note?: string;
}

/** 成本利润里的一项费用（人民币） */
export interface CostFee {
  id: string;
  name: string;
  amount: Num;
}

/** 工厂采购与成本利润（老订单没有，见 domain/purchase.ts 的默认值） */
export interface Purchase {
  /** 按工厂 id（未指定工厂为空字符串） */
  pos: Record<string, FactoryPO>;
  /** 交货地点（如：送到我司仓库 / 货代指定仓库 / 工厂装柜） */
  deliverTo: string;
  /** 质量要求 */
  quality: string;
  /** 包装要求（中文，给工厂看） */
  packing: string;
  /** 价格与发票说明（如：以上价格含 13% 增值税专用发票） */
  invoice: string;
  /** 汇率（1 外币 = ? 人民币）；空 = 用参考汇率 */
  rate: Num;
  /** 增值税率 %（算退税用） */
  vat: Num;
  fees: CostFee[];
}

/** 一笔到账：客户汇来的金额（外币）、银行扣费（外币）、结汇汇率（空 = 还没结汇） */
export interface Receipt {
  id: string;
  date: string;
  kind: '定金' | '尾款' | '全款' | '其他';
  amount: Num;
  fee: Num;
  rate: Num;
  note: string;
}

/** 产地证申请资料：证书类型、原产地标准、运输路线、备注、申报地点 */
export interface OriginCert {
  /** 证书（domain/origin.ts 的 CERTS 键）；空 = 按目的国推荐第一个 */
  type: string;
  /** 原产地标准（如 P、W、WO、PE、RVC 40%）；空 = 按证书常用的 */
  criterion: string;
  /** 第 3 栏运输方式和路线；空 = 按装运港、目的港自动 */
  route: string;
  /** 第 5 栏备注（如后发、第三方发票） */
  remarks: string;
  /** 第 11 栏申报地点（空 = 签约地点） */
  place: string;
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
  /** 工厂采购与成本利润（M2-2；老订单没有） */
  purchase?: Purchase;
  /** 产地证资料（M2-4；没填 = 按目的国推荐） */
  co?: OriginCert;
  /** 收款记录（M4-1） */
  receipts?: Receipt[];
  /** 关键日期（首页「今天要做」用；货好、ETD、ETA、截关在 shipping 里，报价有效期在 numbers 里） */
  dates?: KeyDates;
  /** 每份单据最近一次导出：时间、发给谁、单据指纹（用来判断导出后有没有改过） */
  exports?: Partial<Record<string, ExportMark>>;
  /** 首页提醒里点了「知道了」的条目（键里带日期，日期改了会重新提醒） */
  dismissed?: string[];
  /** 客户要求里「自定义提醒」本单已确认的条目 id */
  reqDone?: string[];
  /** 发出记录：每次导出 / 打包一条（最近 60 条） */
  sent?: SendRecord[];
  /** 发出时的数据留底，按内容去重（键 = 内容指纹），供改版对比 */
  snaps?: Record<string, OrderSnap>;
}

/** 单据用到的订单数据（不含导出记录、提醒等） */
export type OrderSnap = Pick<Order, 'seller' | 'buyer' | 'terms' | 'numbers' | 'items' | 'packs' | 'pkg' | 'shipping' | 'customs' | 'partners' | 'docset' | 'contractClauses' | 'purchase' | 'co'>;

export interface SendRecord {
  id: string;
  at: string;
  docs: string[];
  /** 打包时的收件人；单独导出为空 */
  to?: string;
  /** 文件名（单个文件或资料包） */
  file?: string;
  /** 留底的键（Order.snaps） */
  snap: string;
}

export interface KeyDates {
  /** 尾款到期日（空 = 按付款方式和 ETD 推算） */
  balanceDue?: string;
  /** 信用证有效期 */
  lcExpiry?: string;
  /** 信用证最迟装运期 */
  lcLatest?: string;
}

export interface ExportMark {
  at: string;
  /** 留底的键（Order.snaps）；升级前的记录没有 */
  snap?: string;
  sig: string;
  /** 打包时的收件人（客户 / 工厂 / 报关行 / 货代）；单独导出为空 */
  to?: string;
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
  /** 单据要求清单：新单自动套用、出货前逐条核对 */
  reqs?: CustReq[];
}

export type ReqKey =
  | 'note' | 'po' | 'hs' | 'spec' | 'tax' | 'statement' | 'origin'
  | 'marksPo' | 'marksText' | 'side'
  | 'consignee' | 'notify' | 'blType' | 'originals' | 'partial' | 'transship'
  | 'pkgMode' | 'maxGw' | 'maxPalletH';

/** 客户的一条单据要求：k = 规则（见 domain/requirements.ts），v = 参数（文字、份数、kg…） */
export interface CustReq {
  id: string;
  k: ReqKey;
  v: string;
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

/** 参考汇率：1 外币 = ? 元人民币 */
export interface RateTable {
  cny: Record<Currency, number>;
  /** 汇率日期 YYYY-MM-DD */
  date: string;
  /** 来源：软件内置 / 欧洲央行参考价 / 手工填写 */
  source: string;
}

export interface Settings {
  numbering: Numbering;
  defaults: OrderDefaults;
  assets: Assets;
  labels: LabelSettings;
  /** 上次自动备份的日期 YYYY-MM-DD */
  lastAutoBackup: string;
  /** 参考汇率（小工具 → 汇率换算） */
  rates: RateTable;
}

/** HS 记忆库的一条：中文品名 ↔ 商品编号 ↔ 申报要素 ↔ 退税率（导出过的订单自动记住，也可导入 / 手工改） */
export interface HsEntry {
  id: string;
  nameCn: string;
  hs: string;
  elements: string;
  /** 出口退税率 % */
  rebate: Num;
  source: 'order' | 'import' | 'manual';
  /** 最近一次用到（YYYY-MM-DD） */
  used: string;
}

export interface DataState {
  settings: Settings;
  seller: Seller;
  products: Product[];
  customers: Customer[];
  partners: Partner[];
  orders: Order[];
  seq: number;
  /** HS 记忆库（M2-3；老数据没有时由产品库和订单生成） */
  hsLib: HsEntry[];
}

import type { Currency, OrderStatus, PartnerType } from './types';

export const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
/** 这些术语的指定地点在出口国（装运港 / 工厂），其余在目的地 */
export const ORIGIN_TERMS = ['EXW', 'FCA', 'FAS', 'FOB'];
export const ADDRESS_REQUIRED_TERMS = ['EXW', 'FCA', 'DAP', 'DPU', 'DDP'];

export const INCO_HINT: Record<string, string> = {
  EXW: 'EXW 工厂交货：指定地点写卖方工厂所在地；下面填具体提货地址（买方来提货）。',
  FCA: 'FCA 货交承运人：指定地点写交货给承运人的地方（货代仓库、机场等）；下面填具体交货地址。',
  FAS: 'FAS 船边交货：指定地点写装运港。',
  FOB: 'FOB 船上交货：指定地点写装运港，如 Qingdao。风险在装运港装上船时转移。',
  CFR: 'CFR 成本加运费：指定地点写目的港；风险在装运港装船时转移，运费付到目的港。',
  CIF: 'CIF 成本、保险加运费：指定地点写目的港；卖方负责投保（通常 110% 发票金额）。',
  CPT: 'CPT 运费付至：指定地点写目的地。',
  CIP: 'CIP 运费和保险费付至：指定地点写目的地；卖方负责投保。',
  DAP: 'DAP 目的地交货：必须填写国外具体交货地址（客户仓库、门店等），卖方不负责进口清关。',
  DPU: 'DPU 卸货地交货：必须填写国外具体卸货交货地址。',
  DDP: 'DDP 完税后交货：必须填写国外具体交货地址；卖方负责进口清关、关税和送货上门。',
};

export const PAYMENTS = [
  'T/T 电汇', 'L/C 信用证', 'T/T + L/C 组合', 'D/P 付款交单', 'D/A 承兑交单', 'O/A 赊销',
  'CAD 交单付现', '信保订单 Trade Assurance', '西联 Western Union', 'PayPal', '信用卡 Credit Card', '自定义',
];
export const DAYS_PAYMENTS = ['L/C 信用证', 'T/T + L/C 组合', 'D/P 付款交单', 'D/A 承兑交单', 'O/A 赊销'];

export const BALANCE_AT = [
  'before shipment', 'against copy of B/L', 'within N days after B/L date',
  'upon arrival at destination port', 'upon receipt of goods',
];
export const BALANCE_CN: Record<string, string> = {
  'before shipment': '发货前付清',
  'against copy of B/L': '见提单副本付款',
  'within N days after B/L date': '提单日后 N 天内',
  'upon arrival at destination port': '货到目的港后',
  'upon receipt of goods': '收货后',
};

export const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'AUD', 'CAD', 'HKD', 'AED'];
export const CURRENCY_CN: Record<Currency, string> = {
  USD: 'USD 美元', EUR: 'EUR 欧元', GBP: 'GBP 英镑', CNY: 'CNY 人民币', JPY: 'JPY 日元',
  AUD: 'AUD 澳元', CAD: 'CAD 加元', HKD: 'HKD 港币', AED: 'AED 迪拉姆',
};
export const SYM: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CNY: '¥', JPY: 'JPY ', AUD: 'A$', CAD: 'C$', HKD: 'HK$', AED: 'AED ',
};
export const CUR_NAME: Record<string, string> = {
  USD: 'US DOLLARS', EUR: 'EUROS', GBP: 'POUNDS STERLING', CNY: 'CHINESE YUAN', JPY: 'JAPANESE YEN',
  AUD: 'AUSTRALIAN DOLLARS', CAD: 'CANADIAN DOLLARS', HKD: 'HONG KONG DOLLARS', AED: 'UAE DIRHAMS',
};

export const STATUSES: OrderStatus[] = ['询价', '报价', '确认', '生产', '出货', '收款', '完结'];
export const PARTNER_TYPES: PartnerType[] = ['货代', '报关行', '工厂', '船公司'];

export const THEMES: Record<string, string> = { 藏青: '#1d3f72', 墨黑: '#262626', 港绿: '#16615a', 酒红: '#7a1f2b' };

export const TRANSPORTS = ['海运', '空运', '铁路', '陆运', '快递'];
export const TRANSPORT_CD: Record<string, string> = {
  海运: '水路运输', 空运: '航空运输', 铁路: '铁路运输', 陆运: '公路运输', 快递: '其他运输',
};

export const SUPERVISION = ['0110 一般贸易', '1039 市场采购', '9610 跨境电商 B2C', '9710 跨境电商 B2B 直接出口', '9810 跨境电商出口海外仓', '1210 保税跨境电商'];
export const EXEMPTION = ['101 一般征税', '299 其他法定', '789 鼓励项目'];
export const PACKAGE_TYPES = ['纸制或纤维板制盒/箱', '木制或竹藤等植物性材料制盒/箱', '再生木托', '散装', '其他包装'];

export interface LibClause { k: string; t: string; b: string }

export const CONTRACT_LIB: LibClause[] = [
  { k: 'inspection', t: '检验 Inspection', b: "以卖方出厂检验为准，买方可在装运前自费验货或委托第三方检验。 The Seller's factory inspection shall be final; the Buyer may inspect, or appoint a third party to inspect, before shipment at its own cost." },
  { k: 'quality', t: '质量保证 Quality & Warranty', b: '卖方保证货物符合合同规格及确认样品，质保期为提单日起 12 个月。 The Seller warrants that the goods conform to the specifications and approved samples, with a warranty of 12 months from the B/L date.' },
  { k: 'claims', t: '索赔 Claims', b: '如货物质量或数量与合同不符，买方应在货到目的港后 30 天内凭第三方检验报告提出索赔。 Any claim on quality or quantity shall be lodged within 30 days after arrival of the goods at the destination, supported by a third-party inspection report.' },
  { k: 'late', t: '延迟交货 Late Delivery', b: '卖方每延迟交货 7 天，按延迟部分货款的 0.5% 支付违约金，累计不超过 5%。 For late delivery, the Seller shall pay 0.5% of the value of the delayed goods for every 7 days of delay, capped at 5%.' },
  { k: 'latepay', t: '逾期付款 Late Payment', b: '买方未按期付款的，卖方有权顺延交货期或解除合同，并按每日 0.05% 收取逾期利息。 If the Buyer fails to pay on time, the Seller may postpone delivery or terminate this Contract and charge interest at 0.05% per day.' },
  { k: 'fm', t: '不可抗力 Force Majeure', b: '因不可抗力导致延迟或无法交货，卖方不承担责任，但应及时通知买方并提供证明。 The Seller shall not be liable for delay or non-delivery caused by force majeure, provided that it notifies the Buyer promptly with supporting evidence.' },
  { k: 'arb', t: '仲裁 Arbitration', b: '因本合同引起的争议，双方应友好协商；协商不成的，提交中国国际经济贸易仲裁委员会仲裁，裁决为终局。 Disputes arising from this Contract shall be settled amicably; failing that, they shall be submitted to CIETAC for arbitration, and the award shall be final.' },
  { k: 'law', t: '适用法律 Governing Law', b: "本合同适用中华人民共和国法律及《联合国国际货物销售合同公约》。 This Contract shall be governed by the laws of the People's Republic of China and the CISG." },
  { k: 'ip', t: '知识产权 Intellectual Property', b: '买方提供的商标、图纸、设计由买方保证不侵犯第三方权利。 The Buyer warrants that the trademarks, drawings and designs it provides do not infringe any third-party rights.' },
  { k: 'conf', t: '保密 Confidentiality', b: '双方对本合同条款及价格负有保密义务。 Both parties shall keep the terms and prices of this Contract confidential.' },
  { k: 'docs', t: '单据 Documents', b: '卖方提供：商业发票、装箱单、全套正本提单、原产地证。 The Seller shall provide: commercial invoice, packing list, full set of original B/L and certificate of origin.' },
  { k: 'effect', t: '生效与份数 Validity', b: '本合同一式两份，双方各执一份，经双方签字（盖章）后生效，扫描件与原件具有同等效力。 This Contract is made in two originals, one for each party, and takes effect upon signature (and seal) by both parties; scanned copies are equally valid.' },
];
export const DEFAULT_CLAUSES = ['inspection', 'claims', 'fm', 'arb', 'effect'];

export const OTHER_CLAUSES: Record<string, string[]> = {
  付款条款: ['30% T/T deposit, 70% T/T before shipment.', '100% irrevocable L/C at sight.', '100% T/T within 30 days after B/L date.'],
  交货条款: ['Shipment within 30 days after receipt of deposit.', 'Partial shipment not allowed, transshipment allowed.'],
  质量与异议: ['Claims must be raised within 7 days after receipt of goods.', 'Quality based on the approved sample.'],
  其他: ['Force majeure events excuse any delay in performance.', 'All prices are subject to change without prior notice.'],
};

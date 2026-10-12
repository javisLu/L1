import { amountWords, calcOrder, today, toNum, type Row, type Totals } from './calc';
import { pkgSummary, type PkgSummary } from './package';
import { blTypeText, consigneeText, freightText, goodsLines, notifyText, shipperText } from './shipping';
import type { Order } from './types';

/**
 * Excel 模板可用的字段。
 * - 占位符写法：{{买方名称}}、{{货物.数量}}（货物字段所在的那一行按货物行数自动复制）
 * - 自动识别：模板里的标签文字（Shipper、Port of Loading、毛重…）按 alias 匹配，填到旁边或下面的空格
 */
export interface Ctx { o: Order; k: Totals; pk: PkgSummary }
export type Val = string | number;

export interface TplField {
  key: string;
  group: '我方' | '买方 / 收货人' | '编号日期' | '条款' | '运输' | '唛头货描' | '合计';
  get: (c: Ctx) => Val;
  /** 自动识别用：标签文字（已转小写、去掉标点空格）匹配 */
  alias?: RegExp;
}

export interface ItemField {
  key: string;
  get: (r: Row, i: number, c: Ctx) => Val;
  alias?: RegExp;
}

const n2 = (x: number) => Math.round(x * 100) / 100;
const n3 = (x: number) => Math.round(x * 1000) / 1000;
const nl = (...xs: (string | undefined)[]) => xs.filter(Boolean).join('\n');

export const FIELDS: TplField[] = [
  { key: '发货人', group: '我方', get: ({ o }) => shipperText(o), alias: /^(shipper|exporter|发货人|托运人|出口商|shipperexporter)/ },
  { key: '卖方名称', group: '我方', get: ({ o }) => o.seller.name, alias: /^(seller|卖方|供应商|supplier|beneficiary|vendor)$/ },
  { key: '卖方中文名', group: '我方', get: ({ o }) => o.seller.nameCn },
  { key: '卖方地址', group: '我方', get: ({ o }) => o.seller.address },
  { key: '卖方电话', group: '我方', get: ({ o }) => o.seller.phone },
  { key: '卖方邮箱', group: '我方', get: ({ o }) => o.seller.email },
  { key: '卖方税号', group: '我方', get: ({ o }) => o.seller.tax },
  { key: '收款银行', group: '我方', get: ({ o }) => o.seller.bank, alias: /^(bank|bankinformation|bankdetails|银行|收款银行)/ },

  { key: '收货人', group: '买方 / 收货人', get: ({ o }) => consigneeText(o), alias: /^(consignee|收货人)/ },
  { key: '通知人', group: '买方 / 收货人', get: ({ o }) => notifyText(o), alias: /^(notify|notifyparty|通知人|通知方)/ },
  { key: '买方', group: '买方 / 收货人', get: ({ o }) => nl(o.buyer.name, o.buyer.address), alias: /^(buyer|买方|soldto|messrs|customer|客户)$/ },
  { key: '买方名称', group: '买方 / 收货人', get: ({ o }) => o.buyer.name },
  { key: '买方地址', group: '买方 / 收货人', get: ({ o }) => o.buyer.address },
  { key: '买方联系人', group: '买方 / 收货人', get: ({ o }) => o.buyer.contact, alias: /^(attn|attention|联系人)$/ },
  { key: '买方电话', group: '买方 / 收货人', get: ({ o }) => o.buyer.phone },
  { key: '买方邮箱', group: '买方 / 收货人', get: ({ o }) => o.buyer.email },
  { key: '买方税号', group: '买方 / 收货人', get: ({ o }) => o.buyer.tax, alias: /^(vat|eori|taxid|税号)/ },

  { key: 'PO号', group: '编号日期', get: ({ o }) => o.numbers.po, alias: /^(po|pono|ponumber|ordernumber|orderno|purchaseorder(no|number)?|订单号|客户订单号)$/ },
  { key: 'PI号', group: '编号日期', get: ({ o }) => o.numbers.pi, alias: /^(pino|proformainvoiceno)/ },
  { key: '合同号', group: '编号日期', get: ({ o }) => o.numbers.contract, alias: /^(contractno|contractnumber|合同号|sc)$/ },
  { key: '发票号', group: '编号日期', get: ({ o }) => o.numbers.ci, alias: /^(invoiceno|invoicenumber|invno|发票号|发票编号)/ },
  { key: '单据日期', group: '编号日期', get: ({ o }) => o.numbers.date, alias: /^(date|invoicedate|日期|开票日期)$/ },
  { key: '订单号', group: '编号日期', get: ({ o }) => o.no },
  { key: '今天', group: '编号日期', get: () => today() },

  { key: '贸易术语', group: '条款', get: ({ o }) => `${o.terms.incoterm} ${o.terms.place}`.trim(), alias: /^(tradeterms?|terms?ofdelivery|deliveryterms?|incoterms?|pricetermsi?|成交方式|贸易术语|价格条款)/ },
  { key: '付款方式', group: '条款', get: ({ o }) => o.terms.paymentText, alias: /^(payment|paymentterms?|termsofpayment|付款方式|付款条件|结算方式)/ },
  { key: '币种', group: '条款', get: ({ o }) => o.terms.currency, alias: /^(currency|币种|币制)$/ },
  { key: '交期', group: '条款', get: ({ o }) => o.terms.leadTime, alias: /^(leadtime|deliverytime|交期|交货期)/ },
  { key: '装运期', group: '条款', get: ({ o }) => o.terms.shipment, alias: /^(timeofshipment|shipmentdate|latestshipment|装运期)/ },

  { key: '装运港', group: '运输', get: ({ o }) => o.terms.pol, alias: /^(portofloading|pol|loadingport|装运港|起运港|装货港)/ },
  { key: '目的港', group: '运输', get: ({ o }) => o.terms.pod, alias: /^(portofdischarge|portofdestination|destination|pod|dischargeport|目的港|卸货港|目的地)$/ },
  { key: '最终目的地', group: '运输', get: ({ o }) => o.terms.deliveryAddress || o.terms.pod, alias: /^(finaldestination|placeofdelivery|交货地|最终目的地)/ },
  { key: '运输方式', group: '运输', get: ({ o }) => o.terms.transport, alias: /^(shippedby|transport|运输方式)/ },
  { key: '船名航次', group: '运输', get: ({ o }) => o.shipping.vessel, alias: /^(vessel|vesselvoyage|vslvoy|oceanvessel|船名|船名航次)/ },
  { key: '提单号', group: '运输', get: ({ o }) => o.shipping.blNo, alias: /^(blno|billofladingno|提单号)/ },
  { key: '柜型柜量', group: '运输', get: ({ o }) => o.shipping.equipment ?? '', alias: /^(containertype|equipment|containerqty|柜型|柜型柜量|箱型箱量)/ },
  { key: '柜号', group: '运输', get: ({ o }) => o.shipping.container, alias: /^(containerno|containernumber|柜号|箱号柜号)/ },
  { key: '封号', group: '运输', get: ({ o }) => o.shipping.seal, alias: /^(sealno|sealnumber|封号|铅封号)/ },
  { key: '开船日期', group: '运输', get: ({ o }) => o.shipping.etd, alias: /^(etd|sailingdate|开船日期|船期)/ },
  { key: '到港日期', group: '运输', get: ({ o }) => o.shipping.eta ?? '', alias: /^(eta|到港日期)/ },
  { key: '货好时间', group: '运输', get: ({ o }) => o.shipping.cargoReady ?? '', alias: /^(cargoready|cargoreadydate|货好时间|备货时间)/ },
  { key: '截关时间', group: '运输', get: ({ o }) => o.shipping.cutoff ?? '', alias: /^(cutoff|cyclosing|截关|截港)/ },
  { key: '运费条款', group: '运输', get: ({ o }) => freightText(o), alias: /^(freight|freightterms?|运费|运费条款)$/ },
  { key: '提单类型', group: '运输', get: ({ o }) => blTypeText(o), alias: /^(bltype|typeofbl|提单类型|签单方式|放单方式)/ },
  { key: '原产地', group: '运输', get: ({ o }) => o.shipping.origin, alias: /^(origin|countryoforigin|原产地|原产国)/ },
  { key: '订舱要求', group: '运输', get: ({ o }) => o.shipping.bookingNote ?? '', alias: /^(specialrequirements?|特殊要求|订舱要求)/ },

  { key: '唛头', group: '唛头货描', get: ({ o }) => o.shipping.marks, alias: /^(marks|shippingmarks|marksandnos|marksnos|唛头|标记唛码)/ },
  { key: '货描', group: '唛头货描', get: ({ o, k }) => goodsLines(o, k, false).join('\n'), alias: /^(descriptionofgoods|goodsdescription|commodity|品名|货描|货物描述|货名)$/ },
  { key: 'HS编码', group: '唛头货描', get: ({ o }) => [...new Set(o.items.map((x) => x.hs).filter(Boolean))].join(' / '), alias: /^(hscode|hs|海关编码|商品编码)$/ },
  { key: '声明', group: '唛头货描', get: ({ o }) => o.docset.statement ?? '' },

  { key: '总件数', group: '合计', get: ({ pk }) => pk.count, alias: /^(packages|noofpackages|nofpkgs|pkgs|totalpackages|件数|总件数|包装件数)$/ },
  { key: '件数单位', group: '合计', get: ({ pk }) => pk.unitEn },
  { key: '件数带单位', group: '合计', get: ({ pk }) => `${pk.count} ${pk.unitEn}` },
  { key: '件数大写', group: '合计', get: ({ pk }) => pk.words },
  { key: '总箱数', group: '合计', get: ({ k }) => k.ctns, alias: /^(cartons|ctns|totalcartons|箱数|总箱数)$/ },
  { key: '总数量', group: '合计', get: ({ k }) => k.qty, alias: /^(totalquantity|totalqty|总数量)$/ },
  { key: '总毛重', group: '合计', get: ({ pk }) => n2(pk.gw), alias: /^(grossweight|gw|gwkgs?|totalgw|totalgrossweight|毛重|总毛重)/ },
  { key: '总净重', group: '合计', get: ({ k }) => n2(k.nw), alias: /^(netweight|nw|nwkgs?|totalnw|totalnetweight|净重|总净重)/ },
  { key: '总体积', group: '合计', get: ({ pk }) => n3(pk.cbm), alias: /^(measurement|meas|cbm|volume|totalcbm|体积|总体积|尺码)/ },
  { key: '总金额', group: '合计', get: ({ k }) => n2(k.amount), alias: /^(totalamount|amounttotal|总金额|总价)$/ },
  { key: '金额大写', group: '合计', get: ({ o, k }) => amountWords(k.amount, o.terms.currency), alias: /^(sayustotal|amountinwords|金额大写|大写金额)/ },
];

export const ITEM_FIELDS: ItemField[] = [
  { key: '序号', get: (_r, i) => i + 1, alias: /^(no|item|itemno|序号|编号)$/ },
  { key: '型号', get: (r) => r.model, alias: /^(model|modelno|art(icle)?no|itemcode|sku|型号|货号)$/ },
  { key: '品名', get: (r) => r.nameEn, alias: /^(description|descriptionofgoods|goods|product|productname|commodity|品名|英文品名|货物名称|货名)$/ },
  { key: '中文品名', get: (r) => r.nameCn, alias: /^(中文品名|中文名称)$/ },
  { key: '规格', get: (r) => r.spec, alias: /^(spec|specification|size|规格|尺寸)$/ },
  { key: 'HS', get: (r) => r.hs, alias: /^(hs|hscode|海关编码|商品编码)$/ },
  { key: '单位', get: (r) => r.unit, alias: /^(unit|单位)$/ },
  { key: '数量', get: (r) => r.q, alias: /^(qty|quantity|pcs|数量)/ },
  { key: '单价', get: (r) => r.p, alias: /^(unitprice|price|单价)/ },
  { key: '金额', get: (r) => n2(r.a), alias: /^(amount|totalprice|total|金额|总价)/ },
  { key: '每箱装', get: (r) => toNum(r.pcsPerCtn) || '', alias: /^(pcsctn|qtyctn|packing|每箱数量|装箱数|每箱装)$/ },
  { key: '箱数', get: (r) => r.n || '', alias: /^(ctns|cartons|ctn|箱数|件数)$/ },
  { key: '箱号', get: (r) => (r.n || r.packCtns ? (r.from === r.to ? String(r.from) : `${r.from}-${r.to}`) : ''), alias: /^(cno|cartonno|箱号)$/ },
  { key: '净重', get: (r) => n2(r.nwT), alias: /^(nw|netweight|nwkgs?|净重)/ },
  { key: '毛重', get: (r) => n2(r.gwT), alias: /^(gw|grossweight|gwkgs?|毛重)/ },
  { key: '体积', get: (r) => n3(r.cbmT), alias: /^(cbm|meas|measurement|volume|体积|尺码)/ },
  { key: '箱规', get: (r) => (r.l || r.w || r.h ? `${r.l}×${r.w}×${r.h}` : ''), alias: /^(cartonsize|ctnsize|dimension|dimensions|箱规|外箱尺寸)/ },
];

/** 货物表的合计：按货物字段对应 */
export const ITEM_TOTALS: Record<string, (c: Ctx) => Val> = {
  数量: ({ k }) => k.qty, 金额: ({ k }) => n2(k.amount), 箱数: ({ k }) => k.ctns, 净重: ({ k }) => n2(k.nw), 毛重: ({ k }) => n2(k.gw), 体积: ({ k }) => n3(k.cbm),
};

export const ctxOf = (o: Order): Ctx => {
  const k = calcOrder(o);
  return { o, k, pk: pkgSummary(o, k) };
};

/** 标签文字归一：小写、去掉标点、空格、冒号、括号里的英文单位等 */
export const normLabel = (s: string) => s.toLowerCase().replace(/\(.*?\)|（.*?）/g, '').replace(/[\s:：.,/&#*_\-'"]/g, '');

export const fieldByKey = (key: string) => FIELDS.find((f) => f.key === key);
export const itemFieldByKey = (key: string) => ITEM_FIELDS.find((f) => f.key === key);

export function matchField(label: string): TplField | undefined {
  const t = normLabel(label);
  if (!t || t.length > 30) return undefined;
  return FIELDS.find((f) => f.alias?.test(t));
}
export function matchItemField(label: string): ItemField | undefined {
  const t = normLabel(label);
  if (!t || t.length > 24) return undefined;
  return ITEM_FIELDS.find((f) => f.alias?.test(t));
}

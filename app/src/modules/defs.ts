import {
  BALANCE_AT, BALANCE_CN, CURRENCIES, CURRENCY_CN, DAYS_PAYMENTS, EXEMPTION, INCOTERMS, INCO_HINT,
  PACKAGE_TYPES, PAYMENTS, SUPERVISION, THEMES, TRANSPORTS,
} from '../domain/constants';
import { addrLabel, needAddr, toNum } from '../domain/calc';
import type { Order } from '../domain/types';
import { autoFreight, blTypeText, consigneeText, insureNeeded, notifyText } from '../domain/shipping';

/** 运输信息里的提示：当前运费条款、提单类型、是否投保 */
const shippingNote = (o: Order) =>
  `提单上会写：收货人 ${firstLine(consigneeText(o)) || '（未填）'} · 通知人 ${firstLine(notifyText(o)) || '（未填）'} · FREIGHT ${o.shipping.freight || autoFreight(o)}${o.shipping.freight ? '' : `（${o.terms.incoterm} 自动）`} · ${blTypeText(o)} · ${insureNeeded(o) ? '订舱委托书注明请货代代为投保' : '不投保'}`;
const firstLine = (s: string) => s.split('\n')[0];

export type DocKey = 'quote' | 'pi' | 'contract' | 'ci' | 'pl' | 'customs' | 'marks' | 'labels' | 'booking' | 'si' | 'advice';
export type StepKey = 'parties' | 'items' | 'packing' | 'customsItems' | 'terms' | 'contractClauses' | 'shipping' | 'customs' | 'docset' | 'marks';
export type ModKey = 'quote' | 'pi' | 'ci' | 'pl' | 'customs' | 'booking' | 'marks' | 'export' | 'bl' | 'lc' | 'payment';
export type Src = 'S' | 'B' | 'FF' | 'CB' | 'F';

export const SRC_NAME: Record<Src, string> = { S: '卖方', B: '买方', FF: '货代', CB: '报关行', F: '工厂' };

export interface ModDef {
  code: string;
  name: string;
  desc: string;
  grp: 'doc' | 'biz';
  docs?: DocKey[];
  steps?: StepKey[];
  /** 规划中：显示开发阶段 */
  ph?: string;
  plan?: string[];
  special?: 'export';
}

export const MODS: Record<ModKey, ModDef> = {
  quote: { code: 'QT', name: '报价单', desc: 'Quotation：报价、有效期、条款', grp: 'doc', docs: ['quote'], steps: ['parties', 'items', 'terms', 'docset'] },
  pi: { code: 'PI', name: '合同 / PI', desc: '形式发票 + 中英文销售合同，条款可自定义', grp: 'doc', docs: ['pi', 'contract'], steps: ['parties', 'items', 'terms', 'contractClauses', 'docset'] },
  ci: { code: 'CI', name: '商业发票', desc: 'Commercial Invoice：船名、提单号、原产地', grp: 'doc', docs: ['ci'], steps: ['parties', 'items', 'terms', 'shipping', 'docset'] },
  pl: { code: 'PL', name: '箱单', desc: 'Packing List：箱号、净毛重、体积自动计算', grp: 'doc', docs: ['pl'], steps: ['parties', 'packing', 'shipping', 'docset'] },
  customs: { code: 'CD', name: '报关资料', desc: '报关预录入表 + 发票 + 箱单，发报关行', grp: 'doc', docs: ['customs', 'ci', 'pl'], steps: ['customs', 'customsItems', 'packing'] },
  booking: { code: 'SI', name: '订舱 / 提单', desc: '订舱委托书、SI 提单补料、装船通知', grp: 'doc', docs: ['booking', 'si', 'advice'], steps: ['parties', 'shipping'] },
  marks: { code: 'SM', name: '唛头箱贴', desc: '正唛、侧唛，按箱号批量打印', grp: 'doc', docs: ['marks', 'labels'], steps: ['marks'] },
  export: { code: 'ZIP', name: '单据导出', desc: '按客户 / 工厂 / 报关行 / 货代一键打包', grp: 'doc', special: 'export' },
  bl: { code: 'B/L', name: '提单核对', desc: '货代提单确认件与订单自动比对', grp: 'biz', ph: 'M4', plan: ['上传货代提单确认件（PDF）或直接粘贴文字', '自动比对发货人、收货人、通知人、货描、唛头、件数、毛重、体积、柜号封号', '差异标红，一键生成修改意见发给货代', '文字版 PDF 离线可用；扫描件需在设置里配置自己的 AI Key'] },
  lc: { code: 'L/C', name: '信用证审证', desc: '条款解析、软条款风险、与订单比对', grp: 'biz', ph: 'M4 / M5', plan: ['粘贴 MT700 信用证原文，自动解析 31D / 44C / 48 / 39A / 43P / 46A / 47A 等条款', '规则层（离线）：日期冲突、金额容差、内置软条款特征库逐条匹配', '与本订单比对：金额、货描、港口、交期、贸易术语是否一致', 'AI 层（自带 Key）：结合内置 UCP600 / ISBP745 知识库，输出风险条款、原因、改证建议措辞', '按信用证要求生成单据，货描逐字一致'] },
  payment: { code: 'T/T', name: '收款记录', desc: '定金、尾款、手续费、实际利润', grp: 'biz', ph: 'M4', plan: ['登记定金、尾款、银行手续费、结汇汇率', '应收余额与到期提醒', '每单真实利润 vs 报价时的预算利润'] },
};

export const DOCNAMES: Record<DocKey, string> = {
  quote: '报价单', pi: 'PI 形式发票', contract: '销售合同', ci: '商业发票', pl: '装箱单', customs: '报关预录入表', marks: '唛头', labels: '箱贴',
  booking: '订舱委托书', si: 'SI 提单补料', advice: '装船通知',
};

export type Fmt = 'PDF' | 'Excel' | 'Word';
export const DOC_FMT: Record<DocKey, Fmt[]> = {
  quote: ['PDF', 'Excel'], pi: ['PDF', 'Excel'], contract: ['PDF', 'Word'], ci: ['PDF', 'Excel'], pl: ['PDF', 'Excel'], customs: ['PDF', 'Excel'], marks: ['PDF'], labels: ['PDF'],
  booking: ['PDF', 'Excel'], si: ['PDF', 'Excel'], advice: ['PDF'],
};
export const EXT: Record<Fmt, string> = { PDF: 'pdf', Excel: 'xlsx', Word: 'docx' };

export function docFile(o: Order, d: DocKey): string {
  return { quote: o.numbers.quote, pi: o.numbers.pi, contract: o.numbers.contract, ci: o.numbers.ci, pl: 'PL-' + o.no, customs: 'CD-' + o.no, marks: 'Marks-' + o.no, labels: 'Labels-' + o.no, booking: 'BK-' + o.no, si: 'SI-' + o.no, advice: 'SA-' + o.no }[d];
}

/* ---------- 表单字段 ---------- */

type Dyn<T> = T | ((o: Order) => T);
export const dyn = <T,>(v: Dyn<T>, o: Order): T => (typeof v === 'function' ? (v as (o: Order) => T)(o) : v);

export type FieldDef =
  | { kind: 'head'; label: string; tools?: 'buyer' }
  | { kind: 'note'; text: (o: Order) => string }
  | { kind: 'containers' }
  | {
      kind: 'field';
      path: string;
      label: Dyn<string>;
      type?: 'text' | 'textarea' | 'select' | 'date' | 'checkbox';
      options?: string[];
      optionLabels?: Record<string, string>;
      req?: Dyn<boolean>;
      wide?: boolean;
      src?: Src;
      placeholder?: string;
      show?: (o: Order) => boolean;
      /** 改动后需要重新渲染表单（影响其它字段的显示） */
      rerender?: boolean;
      tool?: 'payreset';
    };

const f = (path: string, label: Dyn<string>, opts: Partial<Extract<FieldDef, { kind: 'field' }>> = {}): FieldDef => ({ kind: 'field', path, label, ...opts });
const head = (label: string, tools?: 'buyer'): FieldDef => ({ kind: 'head', label, tools });

export type TableKey = 'items' | 'packing' | 'customsItems';
export interface ColDef { key?: string; calc?: 'a' | 'q' | 'n' | 'cno' | 'cbmT'; label: string; width: number; num?: boolean }

export interface StepDef { label: string; hint: string; fields?: FieldDef[]; table?: TableKey; list?: 'contractClauses' }

const currencyField = (label: string) => f('terms.currency', label, { type: 'select', options: CURRENCIES, optionLabels: CURRENCY_CN, req: true, src: 'S', rerender: true });

export const STEPS: Record<StepKey, StepDef> = {
  parties: {
    label: '双方信息', hint: '卖方信息来自「设置」，买方可从客户库一键调入。',
    fields: [
      head('卖方（我方）'),
      f('seller.name', '公司名称（英文）', { req: true, wide: true, src: 'S' }),
      f('seller.nameCn', '公司名称（中文）', { src: 'S' }),
      f('seller.tax', '统一社会信用代码', { src: 'S' }),
      f('seller.address', '地址', { req: true, wide: true, src: 'S' }),
      f('seller.phone', '电话', { src: 'S' }),
      f('seller.email', '邮箱', { src: 'S' }),
      f('seller.bank', '收款银行信息', { type: 'textarea', wide: true, src: 'S' }),
      head('买方（客户）', 'buyer'),
      f('buyer.name', '公司名称', { req: true, wide: true, src: 'B' }),
      f('buyer.address', '地址', { req: true, wide: true, type: 'textarea', src: 'B' }),
      f('buyer.contact', '联系人', { src: 'B' }),
      f('buyer.phone', '电话 / WhatsApp', { src: 'B' }),
      f('buyer.email', '邮箱', { src: 'B' }),
      f('buyer.tax', '税号 / VAT / EORI', { src: 'B' }),
      f('buyer.notify', '通知方 Notify Party', { wide: true, src: 'B' }),
    ],
  },
  items: { label: '货物明细', hint: '先选币种，单价和金额都按这个币种；本订单所有单据统一使用。', fields: [currencyField('币种')], table: 'items' },
  packing: { label: '包装装箱', hint: '填每箱装量和箱规，箱数、箱号段、净毛重、体积自动算。', table: 'packing' },
  customsItems: { label: '申报商品', hint: '中文品名、HS 编码、申报要素；录过的会进 HS 记忆库。', fields: [currencyField('币制')], table: 'customsItems' },
  terms: {
    label: '贸易条款', hint: '选好客户后，默认交易习惯已自动带入。',
    fields: [
      head('成交方式'),
      f('terms.incoterm', '贸易术语 Incoterms 2020', { type: 'select', options: INCOTERMS, req: true, src: 'S', rerender: true }),
      f('terms.place', '指定地点（写在术语后面）', { req: true, src: 'S' }),
      { kind: 'note', text: (o) => INCO_HINT[o.terms.incoterm] ?? '' },
      f('terms.deliveryAddress', addrLabel, { type: 'textarea', wide: true, req: needAddr, src: 'B', placeholder: '如：ABC Warehouse, 2500 E Olympic Blvd, Los Angeles, CA 90021, USA' }),
      head('付款'),
      f('terms.payment', '付款方式', { type: 'select', options: PAYMENTS, req: true, src: 'B', rerender: true }),
      f('terms.payCustom', '自定义付款方式', { req: true, src: 'B', show: (o) => o.terms.payment === '自定义' }),
      f('terms.payDeposit', '定金比例 %', { src: 'B', show: (o) => /T\/T/.test(o.terms.payment) }),
      f('terms.payBalanceAt', '尾款支付节点', { type: 'select', options: BALANCE_AT, optionLabels: BALANCE_CN, src: 'B', rerender: true, show: (o) => o.terms.payment === 'T/T 电汇' && toNum(o.terms.payDeposit) < 100 }),
      f('terms.payDays', '天数', { src: 'B', show: (o) => DAYS_PAYMENTS.includes(o.terms.payment) || (o.terms.payment === 'T/T 电汇' && o.terms.payBalanceAt === 'within N days after B/L date') }),
      f('terms.paymentText', '单据上显示的付款条款', { type: 'textarea', wide: true, req: true, tool: 'payreset' }),
      head('交货'),
      f('terms.pol', '装运港 POL', { req: true, src: 'FF' }),
      f('terms.pod', '目的港 POD', { req: true, src: 'B' }),
      f('terms.transport', '运输方式', { type: 'select', options: TRANSPORTS, src: 'FF' }),
      f('terms.leadTime', '交期 Lead Time', { src: 'F' }),
      f('terms.shipment', '装运期限', { wide: true, src: 'S' }),
      f('terms.partial', '分批装运', { type: 'select', options: ['Allowed', 'Not Allowed'] }),
      f('terms.transship', '转运', { type: 'select', options: ['Allowed', 'Not Allowed'] }),
      f('terms.insurance', '保险', { wide: true }),
      f('terms.packing', '包装要求', { wide: true, src: 'F' }),
    ],
  },
  contractClauses: { label: '合同条款', hint: '下列条款可以开关、修改、排序，也可以添加自定义条款或从条款库插入。', list: 'contractClauses' },
  shipping: {
    label: '运输信息', hint: '订舱、提单补料、装船通知都从这里取数；唛头会同步到箱单和唛头模块。',
    fields: [
      head('船期与柜子'),
      f('shipping.vessel', '船名航次', { wide: true, src: 'FF' }),
      f('shipping.blNo', '提单号 B/L No.', { src: 'FF' }),
      f('shipping.equipment', '柜型柜量', { src: 'S', placeholder: '如 1×40HQ、2×20GP、LCL 拼箱' }),
      f('shipping.cargoReady', '货好时间', { type: 'date', src: 'F' }),
      f('shipping.etd', '开船日期 ETD', { type: 'date', src: 'FF' }),
      f('shipping.eta', '到港日期 ETA', { type: 'date', src: 'FF' }),
      f('shipping.container', '柜号 / 柜型', { src: 'FF', placeholder: '如 CSNU7234561 / 40HQ' }),
      f('shipping.seal', '封号', { src: 'FF' }),
      f('shipping.origin', '原产地', { src: 'S' }),
      head('收货人与通知人（提单）'),
      f('shipping.consigneeMode', '收货人 Consignee', { type: 'select', options: ['buyer', 'order', 'custom'], optionLabels: { buyer: '同买方', order: 'TO ORDER（凭指示）', custom: '自定义' }, rerender: true, src: 'B' }),
      f('shipping.notifyMode', '通知人 Notify Party', { type: 'select', options: ['auto', 'buyer', 'custom'], optionLabels: { auto: '自动（推荐）', buyer: '同买方', custom: '自定义' }, rerender: true, src: 'B' }),
      f('shipping.consignee', '收货人（自定义）', { type: 'textarea', wide: true, show: (o) => o.shipping.consigneeMode === 'custom', placeholder: '公司名称、地址、电话' }),
      f('shipping.notify', '通知人（自定义）', { type: 'textarea', wide: true, show: (o) => o.shipping.notifyMode === 'custom', placeholder: '公司名称、地址、电话' }),
      head('提单与运费'),
      f('shipping.freight', '运费', { type: 'select', options: ['', 'PREPAID', 'COLLECT'], optionLabels: { '': '按贸易术语自动', PREPAID: '预付 FREIGHT PREPAID', COLLECT: '到付 FREIGHT COLLECT' }, rerender: true }),
      f('shipping.blType', '提单类型', { type: 'select', options: ['original', 'telex', 'seaway'], optionLabels: { original: '正本提单', telex: '电放', seaway: '海运单 Sea Waybill' }, rerender: true }),
      f('shipping.originals', '正本份数', { show: (o) => (o.shipping.blType ?? 'original') === 'original', placeholder: '3' }),
      f('shipping.insure', '投保', { type: 'select', options: ['', 'yes', 'no'], optionLabels: { '': '按贸易术语自动（CIF / CIP 需要）', yes: '需要，请货代代为投保', no: '不需要' } }),
      { kind: 'note', text: shippingNote },
      f('shipping.bookingNote', '订舱特殊要求', { type: 'textarea', wide: true, placeholder: '如：指定船公司、免柜期、危险品、需要熏蒸等' }),
      head('多柜明细（多个柜子时逐个填写；一个柜子填上面的柜号封号即可）'),
      { kind: 'containers' },
      f('shipping.marks', '唛头 Shipping Marks', { type: 'textarea', wide: true, src: 'B' }),
    ],
  },
  customs: {
    label: '报关要素', hint: '监管方式、征免性质等由报关行确认。',
    fields: [
      f('customs.exportPort', '出境关别', { req: true, src: 'CB' }),
      f('customs.supervision', '监管方式', { type: 'select', options: SUPERVISION, req: true, src: 'CB' }),
      f('customs.exemption', '征免性质', { type: 'select', options: EXEMPTION, req: true, src: 'CB' }),
      f('customs.license', '许可证号'),
      f('customs.tradeCountry', '贸易国（地区）', { req: true, src: 'B' }),
      f('customs.destCountry', '运抵国（地区）', { req: true, src: 'B' }),
      f('customs.sourceArea', '境内货源地', { req: true, src: 'F' }),
      f('customs.packageType', '包装种类', { type: 'select', options: PACKAGE_TYPES, src: 'F' }),
      f('customs.freight', '运费', { src: 'FF' }),
      f('customs.insFee', '保费'),
      f('customs.docs', '随附单证', { wide: true, src: 'CB' }),
    ],
  },
  docset: {
    label: '编号与样式', hint: '编号由订单号派生，可改。',
    fields: [
      f('numbers.quote', '报价单号'), f('numbers.pi', 'PI 号'),
      f('numbers.contract', '合同号'), f('numbers.ci', '发票号'),
      f('numbers.po', '客户 PO 号', { src: 'B' }), f('numbers.date', '单据日期', { type: 'date', req: true }),
      f('numbers.validUntil', '报价有效期至', { type: 'date' }), f('numbers.signedAt', '签约地点'),
      f('docset.remarks', '备注 Remarks', { type: 'textarea', wide: true }),
      f('docset.clauses', 'PI / 报价单条款（每行一条）', { type: 'textarea', wide: true }),
      f('docset.theme', '单据配色', { type: 'select', options: Object.keys(THEMES) }),
      f('docset.stamp', '显示公章位置', { type: 'checkbox' }),
    ],
  },
  marks: {
    label: '唛头内容', hint: '{PO}、{CTNS} 会自动替换为 PO 号和总箱数。',
    fields: [
      f('shipping.marks', '正唛 Main Mark', { type: 'textarea', wide: true, src: 'B' }),
      f('shipping.side', '侧唛 Side Mark（留空则自动生成）', { type: 'textarea', wide: true }),
    ],
  },
};

export const TABLES: Record<TableKey, ColDef[]> = {
  items: [
    { key: 'model', label: '型号', width: 92 }, { key: 'nameEn', label: '品名（英文）', width: 210 },
    { key: 'spec', label: '规格', width: 140 }, { key: 'hs', label: 'HS 编码', width: 110 },
    { key: 'unit', label: '单位', width: 70 }, { key: 'qty', label: '数量', width: 80, num: true },
    { key: 'price', label: '单价 ({CUR})', width: 92, num: true }, { calc: 'a', label: '金额 ({CUR})', width: 104 },
  ],
  packing: [
    { key: 'nameEn', label: '品名', width: 190 }, { calc: 'q', label: '数量', width: 64 },
    { key: 'pcsPerCtn', label: '每箱装', width: 64, num: true }, { key: 'l', label: '长 cm', width: 60, num: true },
    { key: 'w', label: '宽 cm', width: 60, num: true }, { key: 'h', label: '高 cm', width: 60, num: true },
    { key: 'nw', label: '净重/箱', width: 70, num: true }, { key: 'gw', label: '毛重/箱', width: 70, num: true },
    { calc: 'n', label: '箱数', width: 54 }, { calc: 'cno', label: '箱号', width: 74 }, { calc: 'cbmT', label: '体积 m³', width: 70 },
  ],
  customsItems: [
    { key: 'nameCn', label: '中文品名', width: 170 }, { key: 'hs', label: '商品编号', width: 110 },
    { key: 'elements', label: '申报要素', width: 250 }, { key: 'model', label: '型号', width: 90 }, { calc: 'q', label: '数量', width: 64 },
  ],
};

export function stepPaths(step: StepKey): string[] {
  const s = STEPS[step];
  const out: string[] = [];
  for (const fd of s.fields ?? []) if (fd.kind === 'field') out.push(fd.path);
  if (s.table) for (const c of TABLES[s.table]) if (c.key) out.push('items.*.' + c.key);
  if (s.table === 'packing') out.push('packs.*.ctns', 'packs.*.gw', 'packs.*.l', 'packs.*.w', 'packs.*.h', 'pkg.count', 'pkg.tare');
  if (s.list) out.push('contractClauses.*.title', 'contractClauses.*.body');
  return out;
}

const getPath = (o: unknown, p: string): unknown => p.split('.').reduce<unknown>((a, k) => (a == null ? a : (a as Record<string, unknown>)[k]), o);

/** 当前步骤缺哪些必填项（隐藏字段不计） */
export function missing(o: Order, step: StepKey): string[] {
  const s = STEPS[step];
  const out: string[] = [];
  for (const fd of s.fields ?? []) {
    if (fd.kind !== 'field' || (fd.show && !fd.show(o))) continue;
    const v = getPath(o, fd.path);
    if (dyn(fd.req ?? false, o) && !String(v ?? '').trim()) out.push(dyn(fd.label, o));
  }
  if (s.table === 'items') {
    if (!o.items.length) out.push('至少一行货物');
    o.items.forEach((it, i) => {
      if (!it.nameEn) out.push(`第${i + 1}行品名`);
      if (!toNum(it.qty)) out.push(`第${i + 1}行数量`);
      if (!toNum(it.price)) out.push(`第${i + 1}行单价`);
    });
  }
  if (s.table === 'packing') {
    const packs = o.packs ?? [];
    const inPack = (id?: string) => !!id && packs.some((p) => p.id === id);
    o.items.forEach((it, i) => {
      if (inPack(it.mix)) {
        // 混装行：只要求每样货物自己的净重（毛重按净重分摊）
        if (!toNum(it.nw)) out.push(`第${i + 1}行净重`);
        return;
      }
      if (!toNum(it.pcsPerCtn)) out.push(`第${i + 1}行每箱装`);
      if (!toNum(it.gw)) out.push(`第${i + 1}行毛重`);
      if (!(toNum(it.l) && toNum(it.w) && toNum(it.h))) out.push(`第${i + 1}行箱规`);
    });
    if (o.pkg && o.pkg.mode !== 'ctns' && !toNum(o.pkg.count)) out.push('总件数（托盘 / 木箱数）');
    for (const p of packs) {
      const rows = o.items.map((x, i) => (x.mix === p.id ? i + 1 : 0)).filter(Boolean);
      if (!rows.length) continue;
      const name = `混装箱（第${rows[0]}${rows.length > 1 ? '–' + rows[rows.length - 1] : ''}行）`;
      if (!toNum(p.ctns)) out.push(`${name}箱数`);
      if (!toNum(p.gw)) out.push(`${name}毛重`);
      if (!(toNum(p.l) && toNum(p.w) && toNum(p.h))) out.push(`${name}箱规`);
    }
  }
  if (s.table === 'customsItems')
    o.items.forEach((it, i) => {
      if (!it.nameCn) out.push(`第${i + 1}行中文品名`);
      if (!it.hs) out.push(`第${i + 1}行商品编号`);
    });
  return out;
}

export function modProgress(o: Order, key: ModKey) {
  const m = MODS[key];
  if (!m.steps) return null;
  return { done: m.steps.filter((s) => !missing(o, s).length).length, total: m.steps.length };
}

/** 按运输方式、付款方式标出本单需要的单据 */
export function neededMods(o: Order): Set<ModKey> {
  const n = new Set<ModKey>(['quote', 'pi', 'ci', 'pl', 'marks', 'export', 'payment']);
  if (o.terms.transport !== '快递') n.add('customs');
  if (o.terms.transport === '海运') {
    n.add('booking');
    n.add('bl');
  }
  if (/L\/C/.test(o.terms.payment)) n.add('lc');
  return n;
}

export const inputId = (p: string) => 'in-' + p.replace(/[.*]/g, '-');

/* ---------- 导出中心 ---------- */
export type ExpKey = DocKey | 'po';
export const EXPDOCS: { key: ExpKey; name: string; ph?: string }[] = [
  { key: 'quote', name: '报价单' }, { key: 'pi', name: 'PI 形式发票' }, { key: 'contract', name: '销售合同' },
  { key: 'ci', name: '商业发票' }, { key: 'pl', name: '装箱单' }, { key: 'customs', name: '报关预录入表' }, { key: 'marks', name: '唛头' },
  { key: 'labels', name: '箱贴（每箱一张）' },
  { key: 'booking', name: '订舱委托书' }, { key: 'si', name: 'SI 提单补料' }, { key: 'advice', name: '装船通知' },
  { key: 'po', name: '采购单（给工厂）', ph: 'M2' },
];
export type Bundle = '客户' | '工厂' | '报关行' | '货代';
export const BUNDLES: Record<Bundle, ExpKey[]> = {
  客户: ['pi', 'contract', 'ci', 'pl'], 工厂: ['po', 'marks', 'labels', 'pl'], 报关行: ['customs', 'ci', 'pl', 'contract'], 货代: ['pl', 'booking', 'si'],
};

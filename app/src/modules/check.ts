import { fillMarks, fixed, int, money, needAddr, toNum, calcOrder } from '../domain/calc';
import { STATUSES } from '../domain/constants';
import { CNO_LINE } from '../domain/labels';
import { pkgSummary } from '../domain/package';
import { autoFreight } from '../domain/shipping';
import { MODS, STEPS, STEP_MOD, missing, neededMods, ownerOf, type ModKey, type StepKey } from './defs';
import { REQS, reqState, reqStrict } from '../domain/requirements';
import { factoriesOf, missingSellerCosts, profitOf, purchaseOf } from '../domain/purchase';
import { parseMT700 } from '../domain/lc';
import { certOf, certsFor, destOf } from '../domain/origin';
import { planOf, receivedOf } from '../domain/receipts';
import { cnFields } from '../domain/english';
import type { CustReq, Order } from '../domain/types';

export type Level = 'error' | 'warn';
export interface Issue {
  level: Level;
  text: string;
  /** 点击后跳到哪个模块、哪一步、哪个输入框 */
  mod: ModKey;
  step?: StepKey;
  path?: string;
  /** 点击后回到订单页（客户要求清单在那里勾选） */
  toOrder?: boolean;
  /** 可以一键修正的问题 */
  fix?: { label: string; apply: (o: Order) => void };
}

/** 柜型装载参考：体积按实际可装（m³），重量按常见限重（kg） */
const CONTAINERS: { re: RegExp; name: string; cbm: number; kg: number }[] = [
  { re: /45\s*'?\s*(HQ|HC)/i, name: '45HQ', cbm: 78, kg: 27000 },
  { re: /40\s*'?\s*(HQ|HC)/i, name: '40HQ', cbm: 68, kg: 26000 },
  { re: /40\s*'?\s*(GP|DC|DV|')/i, name: '40GP', cbm: 58, kg: 26000 },
  { re: /20\s*'?\s*(GP|DC|DV|')/i, name: '20GP', cbm: 28, kg: 21000 },
];
const FREIGHT_TERMS = ['CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
const INSURANCE_TERMS = ['CIF', 'CIP'];
/** 出货前不必填完的步骤：缺项只作提醒 */
const LATER: StepKey[] = ['shipping', 'customs', 'customsItems', 'packing'];

/**
 * 单据一致性检查：本单需要的单据缺了什么、各单据之间有没有对不上的地方。
 * 所有单据共用订单数据，金额、数量这类不会不一致；这里查的是容易出错、需要人确认的地方。
 */
export function checkOrder(o: Order, reqs: CustReq[] = []): Issue[] {
  const out: Issue[] = [];
  const k = calcOrder(o);
  const shipped = STATUSES.indexOf(o.status) >= STATUSES.indexOf('出货');
  const need = neededMods(o);

  // 1. 必填项：每个步骤只属于一个模块，归到填写它的模块
  (Object.keys(MODS) as ModKey[]).filter((m) => need.has(m)).forEach((m) => {
    for (const st of MODS[m].steps ?? []) {
      // 采购价没填只在第 8 节提醒（填了一部分才提醒，没开始用采购单的不打扰）
      if (st === 'purchaseItems') continue;
      const mi = missing(o, st);
      if (!mi.length) continue;
      const later = LATER.includes(st) && !shipped;
      out.push({
        level: later ? 'warn' : 'error',
        text: `${STEPS[st].label}缺 ${mi.length} 项：${mi.slice(0, 4).join('、')}${mi.length > 4 ? ' 等' : ''}${later ? '（出货前补齐）' : ''}`,
        mod: m, step: st,
      });
    }
  });

  // 2. 货物与装箱
  const models = new Map<string, number>();
  k.rows.forEach((r, i) => {
    const name = `第 ${i + 1} 行${r.model ? ` ${r.model}` : ''}`;
    const per = toNum(r.pcsPerCtn), q = toNum(r.q);
    if (!r.pack && per > 0 && q > 0 && q % per !== 0) {
      out.push({ level: 'warn', text: `${name}：数量 ${int(q)} 不是每箱 ${int(per)} 的整数倍，最后一箱只有 ${int(q % per)} ${r.unit}（尾箱），确认箱数和唛头`, mod: 'pl', path: `items.${i}.pcsPerCtn` });
    }
    if (!r.pack && toNum(r.nw) > 0 && toNum(r.gw) > 0 && toNum(r.nw) > toNum(r.gw)) {
      out.push({ level: 'error', text: `${name}：每箱净重 ${r.nw} kg 大于毛重 ${r.gw} kg`, mod: 'pl', path: `items.${i}.gw` });
    }
    const hs = String(r.hs ?? '').replace(/\D/g, '');
    if (hs && hs.length !== 10 && need.has('customs')) {
      out.push({ level: 'warn', text: `${name}：HS 编码 ${r.hs} 是 ${hs.length} 位，中国海关申报需要 10 位`, mod: 'customs', path: `items.${i}.hs` });
    }
    if (r.model) models.set(r.model.trim().toUpperCase(), (models.get(r.model.trim().toUpperCase()) ?? 0) + 1);
  });
  // 混装箱：几样货物的每箱净重加起来不能超过整箱毛重
  for (const p of o.packs ?? []) {
    const mem = k.rows.filter((r) => r.pack?.id === p.id);
    const nw = mem.reduce((a, r) => a + toNum(r.nw), 0);
    if (mem.length && toNum(p.gw) > 0 && nw > toNum(p.gw)) {
      const i = k.rows.indexOf(mem[0]);
      out.push({ level: 'error', text: `混装箱（第 ${i + 1} 行起）：几样货物每箱净重合计 ${fixed(nw, 2)} kg 大于每箱毛重 ${p.gw} kg`, mod: 'pl', path: `packs.${(o.packs ?? []).indexOf(p)}.gw` });
    }
  }
  models.forEach((n, m) => {
    if (n > 1) out.push({ level: 'warn', text: `型号 ${m} 出现了 ${n} 次，如是不同规格请在规格里注明，否则建议合并`, mod: 'quote', step: 'items' });
  });

  // 3. 唛头与箱数、PO 号
  const marks = o.shipping.marks || '';
  const cno = marks.match(CNO_LINE)?.[2].match(/^1\s*[-–~～]\s*(\d+)/);
  if (cno && k.ctns > 0 && Number(cno[1]) !== k.ctns) {
    const total = k.ctns;
    out.push({
      level: 'error', text: `唛头写的是箱号 1-${cno[1]}，实际共 ${total} 箱`, mod: 'marks', path: 'shipping.marks',
      fix: { label: `改为 1-${total}`, apply: (x) => { x.shipping.marks = x.shipping.marks.replace(CNO_LINE, (_m, a: string, b: string) => a + b.replace(/^1\s*[-–~～]\s*\d+/, `1-${total}`)); } },
    });
  }
  const poInMarks = marks.match(/P\.?\s?O\.?\s*(?:NO\.?)?\s*[:：#]?\s*([A-Z0-9][\w\-/]*)/i)?.[1];
  if (poInMarks && o.numbers.po && poInMarks.toUpperCase() !== o.numbers.po.toUpperCase()) {
    out.push({ level: 'warn', text: `唛头里的 PO 号 ${poInMarks} 与订单 PO 号 ${o.numbers.po} 不一致`, mod: 'marks', path: 'shipping.marks' });
  }
  if (/\{(PO|CTNS)\}/.test(marks)) {
    out.push({
      level: 'error', text: '唛头里还有 {PO} / {CTNS} 没有替换', mod: 'marks', path: 'shipping.marks',
      fix: { label: '替换为实际值', apply: (x) => { x.shipping.marks = fillMarks(x.shipping.marks, x).replace(/\{(PO|CTNS)\}/g, (_m, t: string) => (t === 'PO' ? x.numbers.po || '—' : String(calcOrder(x).ctns || 'UP'))); } },
    });
  }

  // 4. 贸易术语相关
  const inc = o.terms.incoterm;
  if (needAddr(o) && !o.terms.deliveryAddress.trim()) {
    out.push({ level: 'error', text: `${inc} 需要写明交货地址`, mod: 'quote', path: 'terms.deliveryAddress' });
  }
  if (need.has('customs')) {
    if (FREIGHT_TERMS.includes(inc) && !String(o.customs.freight ?? '').trim()) {
      out.push({ level: shipped ? 'error' : 'warn', text: `${inc} 成交，报关单需要填运费`, mod: 'customs', path: 'customs.freight' });
    }
    if (INSURANCE_TERMS.includes(inc) && !String(o.customs.insFee ?? '').trim()) {
      out.push({ level: shipped ? 'error' : 'warn', text: `${inc} 成交，报关单需要填保费`, mod: 'customs', path: 'customs.insFee' });
    }
    if (['EXW', 'FCA', 'FOB', 'FAS'].includes(inc) && String(o.customs.freight ?? '').trim()) {
      out.push({ level: 'warn', text: `${inc} 成交，报关单一般不填运费（现在填了 ${o.customs.freight}）`, mod: 'customs', path: 'customs.freight' });
    }
  }
  // 报价单 / PI 是价格承诺：写「价格可随时变动」客户一般不接受
  if ((need.has('quote') || need.has('pi')) && /subject\s+to\s+change\s+without\s+(prior\s+)?notice/i.test(`${o.docset.clauses}\n${o.docset.remarks}`))
    out.push({ level: 'warn', text: '报价单 / PI 的条款写了「价格可随时变动、不另行通知」：PI 是价格承诺，客户一般会要求删掉，建议改成「价格 30 天内有效」', mod: 'quote', path: 'docset.clauses' });
  if (toNum(o.terms.payDeposit) > 100) out.push({ level: 'error', text: `定金比例 ${o.terms.payDeposit}% 超过 100%`, mod: 'quote', path: 'terms.payDeposit' });

  // 5. 柜型装载
  const ct = o.shipping.container;
  const box = CONTAINERS.find((c) => c.re.test(ct));
  const pk = pkgSummary(o, k);
  if (box && k.ctns) {
    const count = Number(ct.match(/(\d+)\s*[x×*]\s*(?:20|40|45)/i)?.[1] ?? 1) || 1;
    if (pk.cbm > box.cbm * count) out.push({ level: 'warn', text: `总体积 ${fixed(pk.cbm, 2)} m³ 超过 ${count > 1 ? count + '×' : ''}${box.name} 约 ${box.cbm * count} m³ 的装载量`, mod: 'booking', path: 'shipping.container' });
    if (pk.gw > box.kg * count) out.push({ level: 'warn', text: `总毛重 ${fixed(pk.gw, 0)} kg 超过 ${count > 1 ? count + '×' : ''}${box.name} 常见限重 ${box.kg * count} kg`, mod: 'booking', path: 'shipping.container' });
  }
  // 外包装：各尺寸的件数加起来应等于总件数
  if (o.pkg && o.pkg.mode !== 'ctns' && pk.count) {
    const n = (o.pkg.sizes ?? []).reduce((a, x) => a + toNum(x.n), 0);
    if (n && n !== pk.count) out.push({ level: 'warn', text: `外包装尺寸里一共写了 ${n} 件，总件数是 ${pk.count} ${pk.unitCn}`, mod: 'pl', path: 'pkg.count' });
  }

  // 6. 订舱 / 提单
  const sh = o.shipping;
  if (sh.consigneeMode === 'custom' && !sh.consignee?.trim()) out.push({ level: 'error', text: '收货人选了「自定义」但没有填写', mod: 'booking', path: 'shipping.consignee' });
  if (sh.notifyMode === 'custom' && !sh.notify?.trim()) out.push({ level: 'error', text: '通知人选了「自定义」但没有填写', mod: 'booking', path: 'shipping.notify' });
  if (sh.freight && sh.freight !== autoFreight(o)) out.push({ level: 'warn', text: `${inc} 成交一般是 FREIGHT ${autoFreight(o)}，现在选的是 FREIGHT ${sh.freight}`, mod: 'booking', path: 'shipping.freight' });
  // 信用证 / 托收：货款收到前货权要在自己（或银行）手里——提单做成 TO ORDER、出正本
  const lcPay = /L\/C/.test(o.terms.payment), coll = /D\/P|D\/A/.test(o.terms.payment);
  if (lcPay || coll) {
    const way = lcPay ? '信用证' : '托收（D/P、D/A）';
    const a46 = o.lc?.text ? (parseMT700(o.lc.text)['46A'] ?? '').toUpperCase() : '';
    // 信用证 46A 明确写了「CONSIGNED TO 买方」的按信用证办，不提醒
    const lcSaysBuyer = !!a46 && !/TO\s+(THE\s+)?ORDER/.test(a46) && /CONSIGNED\s+TO/.test(a46);
    if ((sh.consigneeMode ?? 'buyer') === 'buyer' && !lcSaysBuyer)
      out.push({
        level: 'warn', text: `${way}付款，提单收货人直接写了买方：钱还没收到货权就给了对方${lcPay ? '，银行审单也可能算不符点' : ''}。一般做成 TO ORDER（凭指示），通知人写买方`, mod: 'booking', path: 'shipping.consigneeMode',
        fix: { label: '收货人改为 TO ORDER', apply: (x) => { x.shipping.consigneeMode = 'order'; if (x.shipping.blType && x.shipping.blType !== 'original') x.shipping.blType = 'original'; } },
      });
    if (sh.blType === 'telex' || sh.blType === 'seaway')
      out.push({ level: 'warn', text: `${way}付款要交正本提单给银行，现在选的是${sh.blType === 'telex' ? '电放' : '海运单'}`, mod: 'booking', path: 'shipping.blType', fix: { label: '改为正本提单', apply: (x) => void (x.shipping.blType = 'original') } });
  }
  if (sh.consigneeMode === 'order' && sh.blType && sh.blType !== 'original' && !lcPay && !coll) out.push({ level: 'warn', text: '收货人是 TO ORDER 时一般出正本提单；电放、海运单需要写明收货人', mod: 'booking', path: 'shipping.blType' });
  if (need.has('booking') && !sh.equipment?.trim() && STATUSES.indexOf(o.status) >= STATUSES.indexOf('生产')) out.push({ level: 'warn', text: '订舱委托书还没填柜型柜量（如 1×40HQ、LCL 拼箱）', mod: 'booking', path: 'shipping.equipment' });
  const boxes = (sh.boxes ?? []).filter((b) => b.no || toNum(b.pkgs));
  if (boxes.length > 1 || (boxes.length === 1 && (sh.boxes ?? []).length === 1 && toNum(boxes[0].pkgs))) {
    const n = boxes.reduce((a, b) => a + toNum(b.pkgs), 0);
    if (n && n !== pk.count) out.push({ level: 'warn', text: `多柜明细里的件数合计 ${n} 与总件数 ${pk.count} ${pk.unitCn} 不一致`, mod: 'booking', step: 'shipping' });
  }

  // 7. 日期与出货状态
  const d = o.numbers.date;
  if (o.numbers.validUntil && d && o.numbers.validUntil < d) out.push({ level: 'warn', text: `报价有效期 ${o.numbers.validUntil} 早于单据日期 ${d}`, mod: 'quote', path: 'numbers.validUntil' });
  if (o.shipping.etd && d && o.shipping.etd < d) out.push({ level: 'warn', text: `开船日期 ${o.shipping.etd} 早于单据日期 ${d}`, mod: 'booking', path: 'shipping.etd' });
  if (shipped && (!o.shipping.vessel || !o.shipping.blNo)) out.push({ level: 'warn', text: '订单已出货，船名航次 / 提单号还没填', mod: 'booking', path: !o.shipping.vessel ? 'shipping.vessel' : 'shipping.blNo' });
  if (need.has('pi') && !o.seller.bank.trim()) out.push({ level: 'warn', text: 'PI 上没有收款银行信息，客户无法付款', mod: 'quote', path: 'seller.bank' });

  // 8. 工厂采购：采购单发给工厂前要有采购价、交货日期；按现在的价格会不会亏
  if (need.has('purchase')) {
    const pf = profitOf(o);
    const pur = purchaseOf(o);
    for (const fid of factoriesOf(o)) {
      const d = pur.pos[fid]?.delivery;
      const ready = o.shipping.cargoReady || o.shipping.etd;
      if (d && ready && d > ready)
        out.push({ level: 'warn', text: `${fid ? '有工厂' : '采购单'}交货日期 ${d} 晚于${o.shipping.cargoReady ? '货好时间' : '开船日期'} ${ready}`, mod: 'purchase', path: `purchase.pos.${fid}.delivery` });
    }
    if (pf.hasCost && pf.noCost.length)
      out.push({ level: 'warn', text: `第 ${pf.noCost.slice(0, 4).map((i) => i + 1).join('、')} 行没填采购单价，采购单和利润不完整`, mod: 'purchase', path: `items.${pf.noCost[0]}.cost` });
    const miss = missingSellerCosts(o);
    if (pf.hasCost && miss.length)
      out.push({ level: 'warn', text: `${inc} 成交由我方付${miss.join('、')}，费用里还没填，利润偏高`, mod: 'purchase', step: 'profit' });
    if (factoriesOf(o).length && /专用发票|专票/.test(pur.invoice) && !o.seller.invoiceInfo?.trim())
      out.push({ level: 'warn', text: '采购单上还没有我方开票信息（名称、税号、地址电话、开户行及账号），工厂开增值税专票要用', mod: 'purchase', path: 'seller.invoiceInfo' });
    if (pf.hasCost && !pf.noCost.length && pf.profit < 0)
      out.push({ level: 'warn', text: `按现在的采购价和费用，本单预计亏损 ¥${money(-pf.profit)}`, mod: 'purchase', step: 'profit' });
  }

  // 9. 产地证：知道目的国；目的国有自贸协定却选了一般原产地证；协定证书要有编码
  if (need.has('origin')) {
    const d = destOf(o), c = certOf(o), list = certsFor(d.cn);
    if (!d.cn) out.push({ level: 'warn', text: '产地证：还不知道目的国，在报关资料里填运抵国', mod: 'customs', path: 'customs.destCountry' });
    else if (c.key === 'general' && o.co?.type === 'general' && list.length > 1)
      out.push({ level: 'warn', text: `产地证：${d.cn}可以办${list[0].name}，客户进口能少交关税，确认是不是只要一般原产地证`, mod: 'origin', path: 'co.type' });
    if (d.cn && o.co?.type && !o.co.criterion?.trim())
      out.push({ level: 'warn', text: '产地证：原产地标准还没填（完全国产 / 含进口料件不同，按实际情况填）', mod: 'origin', path: 'co.criterion' });
    if (c.hs6) o.items.forEach((it, i) => {
      if (String(it.hs ?? '').replace(/\D/g, '').length < 6) out.push({ level: 'warn', text: `产地证：第 ${i + 1} 行没有商品编码，${c.name}要填前 6 位`, mod: 'customs', path: `items.${i}.hs` });
    });
  }

  // 10. 收款：生产了还没收定金、标了收款还没收齐、收多了
  if ((o.receipts ?? []).length || STATUSES.indexOf(o.status) >= STATUSES.indexOf('生产')) {
    const p = planOf(o), r = receivedOf(o), c = o.terms.currency;
    const st = STATUSES.indexOf(o.status);
    if (p.deposit > 0 && r.deposit < p.deposit - 0.005 && st >= STATUSES.indexOf('生产') && st < STATUSES.indexOf('收款'))
      out.push({ level: 'warn', text: `订单已到「${o.status}」，定金还没登记收齐（应收 ${c} ${money(p.deposit)}，已登记 ${c} ${money(r.deposit)}）`, mod: 'payment' });
    if (st >= STATUSES.indexOf('收款') && r.outstanding > Math.max(1, p.total * 0.005))
      out.push({ level: 'warn', text: `订单标为「${o.status}」，收款记录里还差 ${c} ${money(r.outstanding)}`, mod: 'payment' });
    if (r.outstanding < -Math.max(1, p.total * 0.01))
      out.push({ level: 'warn', text: `收款记录比合同金额多 ${c} ${money(-r.outstanding)}，确认是不是登记重了`, mod: 'payment' });
  }

  // 11. 发给客户的单据（报价单、PI、发票、箱单）上不能有中文
  const cn = cnFields(o);
  for (const f of cn.slice(0, 6))
    out.push({ level: 'warn', text: `客户单据上有中文：${f.label}「${f.text.replace(/\s+/g, ' ').slice(0, 24)}${f.text.length > 24 ? '…' : ''}」`, mod: 'quote', path: f.path });
  if (cn.length > 6) out.push({ level: 'warn', text: `客户单据上还有 ${cn.length - 6} 处中文，在报价单 / PI 页「单据上有中文」里一起看`, mod: 'quote' });

  // 12. 客户要求清单：确认之后不符合算错误（之前只提醒）；自定义提醒在生产之后还没勾选的提醒一下
  if (o.status !== '完结') {
    const strict = reqStrict(o);
    const late = STATUSES.indexOf(o.status) >= STATUSES.indexOf('生产');
    for (const r of reqs) {
      const st = reqState(o, r);
      if (st.kind === 'bad') {
        const d = REQS[r.k];
        out.push({ level: strict ? 'error' : 'warn', text: st.problem.text, mod: st.problem.mod, step: st.problem.step, path: st.problem.path,
          ...(d.apply ? { fix: { label: '按要求改', apply: (x: Order) => d.apply!(x, r.v) } } : {}) });
      } else if (st.kind === 'manual' && !st.done && late && r.v.trim())
        out.push({ level: 'warn', text: `客户要求（待确认）：${r.v.trim()}`, mod: 'export', toOrder: true });
    }
  }

  // 跳转一律去真正填写它的模块
  return out
    .map((x) => {
      const own = x.step ? STEP_MOD[x.step] : x.path ? ownerOf(x.path)?.mod : undefined;
      return own && own !== x.mod ? { ...x, mod: own } : x;
    })
    .sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}

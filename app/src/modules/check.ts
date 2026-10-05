import { fillMarks, fixed, int, needAddr, toNum, calcOrder } from '../domain/calc';
import { STATUSES } from '../domain/constants';
import { CNO_LINE } from '../domain/labels';
import { pkgSummary } from '../domain/package';
import { autoFreight } from '../domain/shipping';
import { MODS, STEPS, missing, neededMods, type ModKey, type StepKey } from './defs';
import type { Order } from '../domain/types';

export type Level = 'error' | 'warn';
export interface Issue {
  level: Level;
  text: string;
  /** 点击后跳到哪个模块、哪一步、哪个输入框 */
  mod: ModKey;
  step?: StepKey;
  path?: string;
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
export function checkOrder(o: Order): Issue[] {
  const out: Issue[] = [];
  const k = calcOrder(o);
  const shipped = STATUSES.indexOf(o.status) >= STATUSES.indexOf('出货');
  const need = neededMods(o);

  // 1. 必填项：每个步骤只报一次，归到第一个用到它的单据
  const seen = new Set<StepKey>();
  (['quote', 'pi', 'ci', 'pl', 'customs', 'marks'] as ModKey[]).filter((m) => need.has(m)).forEach((m) => {
    for (const st of MODS[m].steps ?? []) {
      if (seen.has(st)) continue;
      seen.add(st);
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
    if (n > 1) out.push({ level: 'warn', text: `型号 ${m} 出现了 ${n} 次，如是不同规格请在规格里注明，否则建议合并`, mod: 'pi', step: 'items' });
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
    out.push({ level: 'error', text: `${inc} 需要写明交货地址`, mod: 'pi', path: 'terms.deliveryAddress' });
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
  if (toNum(o.terms.payDeposit) > 100) out.push({ level: 'error', text: `定金比例 ${o.terms.payDeposit}% 超过 100%`, mod: 'pi', path: 'terms.payDeposit' });

  // 5. 柜型装载
  const ct = o.shipping.container;
  const box = CONTAINERS.find((c) => c.re.test(ct));
  const pk = pkgSummary(o, k);
  if (box && k.ctns) {
    const count = Number(ct.match(/(\d+)\s*[x×*]\s*(?:20|40|45)/i)?.[1] ?? 1) || 1;
    if (pk.cbm > box.cbm * count) out.push({ level: 'warn', text: `总体积 ${fixed(pk.cbm, 2)} m³ 超过 ${count > 1 ? count + '×' : ''}${box.name} 约 ${box.cbm * count} m³ 的装载量`, mod: 'pl', path: 'shipping.container' });
    if (pk.gw > box.kg * count) out.push({ level: 'warn', text: `总毛重 ${fixed(pk.gw, 0)} kg 超过 ${count > 1 ? count + '×' : ''}${box.name} 常见限重 ${box.kg * count} kg`, mod: 'pl', path: 'shipping.container' });
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
  if (sh.consigneeMode === 'order' && sh.blType && sh.blType !== 'original') out.push({ level: 'warn', text: '收货人是 TO ORDER 时一般出正本提单；电放、海运单需要写明收货人', mod: 'booking', path: 'shipping.blType' });
  if (need.has('booking') && !sh.equipment?.trim() && STATUSES.indexOf(o.status) >= STATUSES.indexOf('生产')) out.push({ level: 'warn', text: '订舱委托书还没填柜型柜量（如 1×40HQ、LCL 拼箱）', mod: 'booking', path: 'shipping.equipment' });
  const boxes = (sh.boxes ?? []).filter((b) => b.no || toNum(b.pkgs));
  if (boxes.length > 1 || (boxes.length === 1 && (sh.boxes ?? []).length === 1 && toNum(boxes[0].pkgs))) {
    const n = boxes.reduce((a, b) => a + toNum(b.pkgs), 0);
    if (n && n !== pk.count) out.push({ level: 'warn', text: `多柜明细里的件数合计 ${n} 与总件数 ${pk.count} ${pk.unitCn} 不一致`, mod: 'booking', step: 'shipping' });
  }

  // 7. 日期与出货状态
  const d = o.numbers.date;
  if (o.numbers.validUntil && d && o.numbers.validUntil < d) out.push({ level: 'warn', text: `报价有效期 ${o.numbers.validUntil} 早于单据日期 ${d}`, mod: 'quote', path: 'numbers.validUntil' });
  if (o.shipping.etd && d && o.shipping.etd < d) out.push({ level: 'warn', text: `开船日期 ${o.shipping.etd} 早于单据日期 ${d}`, mod: 'ci', path: 'shipping.etd' });
  if (shipped && (!o.shipping.vessel || !o.shipping.blNo)) out.push({ level: 'warn', text: '订单已出货，船名航次 / 提单号还没填', mod: 'ci', path: !o.shipping.vessel ? 'shipping.vessel' : 'shipping.blNo' });
  if (need.has('pi') && !o.seller.bank.trim()) out.push({ level: 'warn', text: 'PI 上没有收款银行信息，客户无法付款', mod: 'pi', path: 'seller.bank' });

  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}

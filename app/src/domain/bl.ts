import { calcOrder, fixed, int } from './calc';
import { pkgSummary } from './package';
import { consigneeText, containerRows, freightOf, notifyText } from './shipping';
import { parseMT700 } from './lc';
import type { Order } from './types';

/**
 * 提单核对（M4-2）：不按格式「识别」提单各栏（每家船公司、货代格式都不一样），
 * 而是拿订单里该出现的内容去提单草稿文字里逐项找：找不到、数字对不上的标出来，生成给货代的修改意见。
 */

export type BlResult = 'ok' | 'missing' | 'diff' | 'info';
export interface BlCheck {
  item: string;
  /** 订单里应该是什么 */
  expect: string;
  result: BlResult;
  /** 提单上找到的（对不上时） */
  found?: string;
  /** 给货代的修改意见（中文） */
  ask?: string;
}

/** 比较用：大写、标点变空格、空白合并 */
export const norm = (s: string) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9一-龥]+/g, ' ').replace(/\s+/g, ' ').trim();

const CORP = new Set(['CO', 'COMPANY', 'LTD', 'LIMITED', 'INC', 'CORP', 'CORPORATION', 'LLC', 'GMBH', 'PTE', 'PVT', 'SA', 'APS', 'THE', 'AND', 'OF']);
/** 名称的主要单词都在提单里（70% 以上） */
export function hasName(text: string, name: string): boolean {
  const words = norm(name).split(' ').filter((w) => w.length > 1 && !CORP.has(w));
  if (!words.length) return true;
  const t = ` ${norm(text)} `;
  return words.filter((w) => t.includes(` ${w} `)).length / words.length >= 0.7;
}
const has = (text: string, s: string) => !!norm(s) && ` ${norm(text)} `.includes(` ${norm(s)} `);

/** 提单里「数字 + 单位」：如 74 CARTONS、1,460.00 KGS、11.236 CBM */
export function numbersBefore(text: string, units: string): number[] {
  const re = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:${units})\\b`, 'gi');
  return [...String(text ?? '').matchAll(re)].map((m) => Number(m[1].replace(/,/g, ''))).filter((n) => !Number.isNaN(n));
}

/** 草稿里出现过这个数（1460 / 1,460.00 / 1460.000 都算）：表格里数字写在「G.W. (KGS)」表头下面、后面不跟单位时用 */
export function numberAppears(text: string, want: number, tol: number): boolean {
  return [...String(text ?? '').matchAll(/\d[\d,]*(?:\.\d+)?/g)].some((m) => Math.abs(Number(m[0].replace(/,/g, '')) - want) <= tol);
}

const PKG_UNITS = 'CARTONS?|CTNS?|PACKAGES?|PKGS?|PALLETS?|PLTS?|WOODEN\\s+CASES?|CASES?|BAGS?|BUNDLES?|ROLLS?|DRUMS?';
const city = (s: string) => s.split(',')[0].trim();

export function checkBl(o: Order, text: string): BlCheck[] {
  const out: BlCheck[] = [];
  const t = String(text ?? '');
  const add = (c: BlCheck) => out.push(c);
  const k = calcOrder(o), pk = pkgSummary(o, k);

  // 1. 收发通
  add(hasName(t, o.seller.name)
    ? { item: '托运人', expect: o.seller.name, result: 'ok' }
    : { item: '托运人', expect: o.seller.name, result: 'missing', ask: `托运人（SHIPPER）请写：${o.seller.name}` });
  const cons = consigneeText(o);
  const consOk = (o.shipping.consigneeMode ?? 'buyer') === 'order' ? /TO\s+(THE\s+)?ORDER/i.test(t) : hasName(t, cons.split('\n')[0]);
  add(consOk ? { item: '收货人', expect: cons.split('\n')[0], result: 'ok' } : { item: '收货人', expect: cons.split('\n')[0], result: 'missing', ask: `收货人（CONSIGNEE）请写：${cons.replace(/\n/g, ' ')}` });
  const notify = notifyText(o);
  if (notify) {
    const nOk = /SAME\s+AS\s+CONSIGNEE/i.test(notify) ? /SAME\s+AS\s+CONSIGNEE/i.test(t) || hasName(t, cons.split('\n')[0]) : hasName(t, notify.split('\n')[0]);
    add(nOk ? { item: '通知人', expect: notify.split('\n')[0], result: 'ok' } : { item: '通知人', expect: notify.split('\n')[0], result: 'missing', ask: `通知人（NOTIFY PARTY）请写：${notify.replace(/\n/g, ' ')}` });
  }

  // 2. 港口、船名、提单号
  for (const [item, v, en] of [['装运港', o.terms.pol, 'PORT OF LOADING'], ['卸货港', o.terms.pod, 'PORT OF DISCHARGE']] as const) {
    if (!v) continue;
    add(has(t, city(v)) ? { item, expect: v, result: 'ok' } : { item, expect: v, result: 'missing', ask: `${item}（${en}）请写：${v.toUpperCase()}` });
  }
  if (o.shipping.vessel) {
    const words = norm(o.shipping.vessel).split(' ').filter((w) => w.length > 2 && !['VOY', 'V'].includes(w));
    const hit = words.filter((w) => ` ${norm(t)} `.includes(` ${w} `)).length;
    add(hit >= Math.max(1, words.length - 1) ? { item: '船名航次', expect: o.shipping.vessel, result: 'ok' } : { item: '船名航次', expect: o.shipping.vessel, result: 'missing', ask: `船名航次请核对，订舱确认的是 ${o.shipping.vessel}` });
  }

  // 3. 柜号、封号（也列出提单上有、订单里没有的柜号）
  const boxes = containerRows(o, k);
  const inBl = [...new Set((t.toUpperCase().match(/\b[A-Z]{4}\s?\d{7}\b/g) ?? []).map((x) => x.replace(/\s/g, '')))];
  for (const b of boxes) {
    if (b.no) {
      const no = b.no.replace(/\s/g, '').toUpperCase();
      add(inBl.includes(no) ? { item: '柜号', expect: no, result: 'ok' } : { item: '柜号', expect: no, result: 'missing', ask: `柜号请写：${no}` });
    }
    if (b.seal) add(has(t, b.seal) ? { item: '封号', expect: b.seal, result: 'ok' } : { item: '封号', expect: b.seal, result: 'missing', ask: `封号请写：${b.seal}（柜号 ${b.no || '—'}）` });
  }
  const known = boxes.map((b) => b.no.replace(/\s/g, '').toUpperCase());
  const extra = inBl.filter((x) => !known.includes(x));
  if (extra.length && known.length) add({ item: '柜号', expect: known.join('、'), result: 'diff', found: extra.join('、'), ask: `提单上的柜号 ${extra.join('、')} 不是我们这票的，请核对` });
  if (!boxes.length && inBl.length) add({ item: '柜号', expect: '订单里还没填', result: 'info', found: inBl.join('、') });

  // 4. 件数、毛重、体积
  // bare：数字后面不跟单位也认（毛重、体积常这样写；件数不行，箱号「1-74」里也有这个数）
  const num = (item: string, want: number, units: string, fmt: (n: number) => string, unitEn: string, tol: number, bare = false) => {
    if (!want) return;
    const got = numbersBefore(t, units);
    if (got.some((n) => Math.abs(n - want) <= tol) || (bare && !got.length && numberAppears(t, want, tol))) add({ item, expect: `${fmt(want)} ${unitEn}`, result: 'ok' });
    else if (got.length) add({ item, expect: `${fmt(want)} ${unitEn}`, result: 'diff', found: [...new Set(got)].map((n) => `${fmt(n)} ${unitEn}`).join('、'), ask: `${item}应为 ${fmt(want)} ${unitEn}（草稿是 ${[...new Set(got)].map((n) => fmt(n)).join('、')}）` });
    else add({ item, expect: `${fmt(want)} ${unitEn}`, result: 'missing', ask: `${item}请写：${fmt(want)} ${unitEn}` });
  };
  num('件数', pk.count, PKG_UNITS, (n) => int(n), pk.unitEn, 0);
  if (pk.mode !== 'ctns' && k.ctns) {
    const got = numbersBefore(t, 'CARTONS?|CTNS?');
    if (got.length && !got.includes(k.ctns)) add({ item: '纸箱数', expect: `${k.ctns} CARTONS`, result: 'diff', found: got.join('、'), ask: `托盘内纸箱数应为 ${k.ctns} CARTONS` });
  }
  num('毛重', pk.gw, 'KGS?|KGM|KILOS?', (n) => fixed(n, 2), 'KGS', 0.01, true);
  num('体积', pk.cbm, 'CBM|M3|CUBIC\\s+METERS?', (n) => fixed(n, 3), 'CBM', 0.002, true);

  // 5. 唛头、货描
  const marks = String(o.shipping.marks ?? '').split('\n').map((x) => x.trim()).filter((x) => x && !/\{(PO|CTNS)\}/.test(x));
  if (marks.length) {
    const miss = marks.filter((m) => !has(t, m));
    add(!miss.length ? { item: '唛头', expect: marks.join(' / '), result: 'ok' } : { item: '唛头', expect: marks.join(' / '), result: 'missing', found: `缺：${miss.join(' / ')}`, ask: `唛头请按以下写全：${marks.join(' / ')}` });
  }
  const names = [...new Set(o.items.map((it) => String(it.nameEn || '').trim()).filter(Boolean))];
  for (const n of names) {
    const words = norm(n).split(' ').filter((w) => w.length > 2);
    const ok = words.length && words.filter((w) => ` ${norm(t)} `.includes(` ${w} `)).length / words.length >= 0.6;
    if (!ok) add({ item: '货描', expect: n.toUpperCase(), result: 'missing', ask: `货描请写：${n.toUpperCase()}` });
  }
  if (names.length && !out.some((c) => c.item === '货描')) add({ item: '货描', expect: names.map((n) => n.toUpperCase()).join(' / '), result: 'ok' });

  // 6. 运费、提单类型、信用证号
  const fr = freightOf(o);
  const other = fr === 'PREPAID' ? 'COLLECT' : 'PREPAID';
  if (new RegExp(`FREIGHT\\s+${other}|\\b${other}\\b`, 'i').test(t) && !new RegExp(`\\b${fr}\\b`, 'i').test(t))
    add({ item: '运费', expect: `FREIGHT ${fr}`, result: 'diff', found: `FREIGHT ${other}`, ask: `运费条款应为 FREIGHT ${fr}（草稿是 ${other}）` });
  else if (new RegExp(`\\b${fr}\\b`, 'i').test(t)) add({ item: '运费', expect: `FREIGHT ${fr}`, result: 'ok' });
  else add({ item: '运费', expect: `FREIGHT ${fr}`, result: 'missing', ask: `请注明 FREIGHT ${fr}` });
  const bt = o.shipping.blType ?? 'original';
  if (bt === 'telex' && !/TELEX|SURRENDER/i.test(t)) add({ item: '提单类型', expect: '电放 TELEX RELEASE', result: 'info', ask: '本票做电放，请确认电放安排' });
  if (bt === 'seaway' && !/SEA\s*WAY\s*BILL|WAYBILL/i.test(t)) add({ item: '提单类型', expect: '海运单 SEA WAYBILL', result: 'missing', ask: '本票出海运单（SEA WAYBILL），请改为海运单' });
  const lcNo = o.lc?.text ? parseMT700(o.lc.text)['20'] : '';
  if (lcNo) add(has(t, lcNo) ? { item: '信用证号', expect: lcNo, result: 'ok' } : { item: '信用证号', expect: lcNo, result: 'missing', ask: `请在提单上注明信用证号 L/C NO. ${lcNo}` });

  return out;
}

/** 提单草稿上的提单号（订单里还没填时可以填回去） */
export function blNoIn(text: string): string {
  // 同一行里、带字母（提单号一般以船公司代码开头），免得把下一行的日期当成提单号
  const m = String(text ?? '').match(/B\s*\/\s*L\s*(?:NO\.?|NUMBER)[ \t]*[:：#]?[ \t]*([A-Z0-9][A-Z0-9-]{5,})/i)?.[1]?.toUpperCase() ?? '';
  return /[A-Z]/.test(m) && /\d{4}/.test(m) ? m : '';
}

/** 给货代的修改意见（中文） */
export function blAskText(o: Order, checks: BlCheck[], contact = ''): string {
  const asks = checks.filter((c) => c.ask && (c.result === 'missing' || c.result === 'diff')).map((c) => c.ask!);
  if (!asks.length) return '';
  return `${contact || '您'}好：\n\n订单 ${o.no}${o.shipping.blNo ? `（提单号 ${o.shipping.blNo}）` : ''}的提单草稿请按以下修改：\n${asks.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\n其余内容确认无误，改好后请再发一次草稿确认，谢谢！\n\n${o.seller.nameCn || o.seller.name}`;
}

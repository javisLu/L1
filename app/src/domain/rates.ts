import type { Currency, RateTable } from './types';

/**
 * 汇率（M2-5）：人民币对各币种的参考中间价。可以手工改，也可以联网更新（欧洲央行数据，备用 exchangerate-api）。
 * 银行实际结汇价通常比中间价低一点；成本利润里没填汇率时按这里估算。
 */

export const RATE_CURS: Currency[] = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'HKD', 'AED', 'CNY'];

/** 2026-10-20 的参考中间价（1 外币 = ? 元） */
export const DEFAULT_RATES: RateTable = {
  cny: { USD: 6.68, EUR: 7.49, GBP: 8.91, JPY: 0.0422, AUD: 4.66, CAD: 4.75, HKD: 0.851, AED: 1.82, CNY: 1 },
  date: '2026-10-20',
  source: '软件内置',
};

/** 阿联酋迪拉姆钉住美元：1 USD = 3.6725 AED */
const AED_PER_USD = 3.6725;

/** 按人民币中转换算：amount from → to */
export function convert(amount: number, from: Currency, to: Currency, t: RateTable): number {
  const a = t.cny[from], b = t.cny[to];
  if (!a || !b) return 0;
  return (amount * a) / b;
}

/** 汇率显示：小于 0.1 的多给几位 */
export const fmtRate = (n: number) => (!n ? '—' : n < 0.1 ? n.toFixed(5) : n < 10 ? n.toFixed(4) : n.toFixed(2));

const round = (n: number) => Number(n.toPrecision(6));

/** 联网取最新参考价；两个来源都失败时抛错（界面提示手工填） */
export async function fetchRates(get: typeof fetch = fetch): Promise<RateTable> {
  const want = RATE_CURS.filter((c) => c !== 'CNY' && c !== 'AED');
  try {
    const r = await get(`https://api.frankfurter.dev/v1/latest?from=CNY&to=${want.join(',')}`);
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as { date: string; rates: Record<string, number> };
    const cny = { CNY: 1 } as Record<Currency, number>;
    for (const c of want) if (d.rates[c]) cny[c] = round(1 / d.rates[c]);
    if (!cny.USD) throw new Error('缺美元');
    cny.AED = round(cny.USD / AED_PER_USD);
    return { cny, date: d.date, source: '欧洲央行参考价' };
  } catch {
    const r = await get('https://open.er-api.com/v6/latest/CNY');
    if (!r.ok) throw new Error('联网更新失败（' + r.status + '）');
    const d = (await r.json()) as { result: string; time_last_update_unix: number; rates: Record<string, number> };
    if (d.result !== 'success') throw new Error('联网更新失败');
    const cny = { CNY: 1 } as Record<Currency, number>;
    for (const c of RATE_CURS) if (c !== 'CNY' && d.rates[c]) cny[c] = round(1 / d.rates[c]);
    const date = new Date(d.time_last_update_unix * 1000).toISOString().slice(0, 10);
    return { cny, date, source: 'ExchangeRate-API' };
  }
}

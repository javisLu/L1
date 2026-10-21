import { describe, expect, it } from 'vitest';
import { DEFAULT_RATES, convert, fetchRates, fmtRate } from './rates';
import { amountWords } from './calc';

const res = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

describe('汇率换算', () => {
  it('按人民币中转换算', () => {
    expect(convert(1000, 'USD', 'CNY', DEFAULT_RATES)).toBeCloseTo(6680, 6);
    expect(convert(6680, 'CNY', 'USD', DEFAULT_RATES)).toBeCloseTo(1000, 6);
    expect(convert(100, 'EUR', 'USD', DEFAULT_RATES)).toBeCloseTo((100 * 7.49) / 6.68, 6);
    expect(fmtRate(0.0422)).toBe('0.04220');
    expect(fmtRate(6.68)).toBe('6.6800');
  });

  it('联网更新：欧洲央行数据换成「1 外币 = ? 元」，迪拉姆按钉住美元算', async () => {
    const t = await fetchRates(async () => res({ date: '2026-10-20', rates: { USD: 0.14974, EUR: 0.13352, GBP: 0.1122, JPY: 23.679, AUD: 0.21438, CAD: 0.2104, HKD: 1.1753 } }));
    expect(t.date).toBe('2026-10-20');
    expect(t.source).toBe('欧洲央行参考价');
    expect(t.cny.USD).toBeCloseTo(6.6782, 3);
    expect(t.cny.JPY).toBeCloseTo(0.04223, 4);
    expect(t.cny.AED).toBeCloseTo(t.cny.USD / 3.6725, 4);
    expect(t.cny.CNY).toBe(1);
  });

  it('欧洲央行取不到时用备用来源；都取不到时报错', async () => {
    const calls: string[] = [];
    const t = await fetchRates(async (u) => {
      calls.push(String(u));
      return calls.length === 1 ? res({}, false) : res({ result: 'success', time_last_update_unix: 1792540952, rates: { USD: 0.1494, EUR: 0.1332, AED: 0.5488, GBP: 0.1119, JPY: 23.6, AUD: 0.2137, CAD: 0.2103, HKD: 1.1729 } });
    });
    expect(calls[1]).toContain('open.er-api.com');
    expect(t.source).toBe('ExchangeRate-API');
    expect(t.cny.AED).toBeCloseTo(1 / 0.5488, 4);
    await expect(fetchRates(async () => res({}, false))).rejects.toThrow('联网更新失败');
  });
});

describe('金额大写', () => {
  it('英文大写', () => {
    expect(amountWords(12345.6, 'USD')).toBe('SAY US DOLLARS TWELVE THOUSAND THREE HUNDRED AND FORTY-FIVE AND CENTS SIXTY ONLY');
  });
});

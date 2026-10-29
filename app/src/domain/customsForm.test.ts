import { describe, expect, it } from 'vitest';
import { codeName, curCn, unitCn, ymd8 } from './customsForm';

describe('报关单写法', () => {
  it('单位、日期、代码、币制', () => {
    expect([unitCn('PCS'), unitCn('sets'), unitCn('Pairs'), unitCn('KGS'), unitCn('CTN'), unitCn('台')]).toEqual(['个', '套', '双', '千克', '箱', '台']);
    expect(ymd8('2026-10-08')).toBe('20261008');
    expect(ymd8('')).toBe('');
    expect(codeName('0110 一般贸易')).toBe('一般贸易(0110)');
    expect(codeName('101 一般征税')).toBe('一般征税(101)');
    expect(codeName('一般贸易')).toBe('一般贸易');
    expect([curCn('USD'), curCn('EUR'), curCn('CNY')]).toEqual(['美元', '欧元', '人民币']);
  });
});

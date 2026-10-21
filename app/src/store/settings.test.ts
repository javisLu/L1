import { describe, expect, it } from 'vitest';
import { withSettings } from './data';
import { defaultSettings } from '../domain/settings';
import type { Settings } from '../domain/types';

describe('读取旧数据时补齐设置', () => {
  it('旧版本没有汇率表、箱贴设置等：用默认值补上，已有的设置保留', () => {
    const old = { ...defaultSettings(), lastAutoBackup: '2026-10-01' } as Partial<Settings>;
    delete old.rates;
    delete old.labels;
    old.defaults = { ...defaultSettings().defaults, pol: 'Ningbo, China' };
    const s = withSettings(old);
    expect(s.rates.cny.USD).toBe(defaultSettings().rates.cny.USD);
    expect(s.labels).toEqual(defaultSettings().labels);
    expect(s.defaults.pol).toBe('Ningbo, China');
    expect(s.lastAutoBackup).toBe('2026-10-01');
  });

  it('汇率表里缺的币种补上，用户改过的保留；什么都没有时给整套默认', () => {
    const s = withSettings({ rates: { cny: { USD: 6.5 } as Settings['rates']['cny'], date: '2026-10-21', source: '手工填写' } });
    expect(s.rates.cny.USD).toBe(6.5);
    expect(s.rates.cny.EUR).toBe(defaultSettings().rates.cny.EUR);
    expect(s.rates.source).toBe('手工填写');
    expect(withSettings(undefined)).toEqual(defaultSettings());
  });
});

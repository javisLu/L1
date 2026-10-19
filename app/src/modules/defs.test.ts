import { describe, expect, it } from 'vitest';
import { MODS, STEPS, STEP_MOD, ownerOf, stepPaths, type ModKey, type StepKey } from './defs';
import { checkOrder } from './check';
import { seed } from '../domain/seed';

const mods = Object.keys(MODS) as ModKey[];

describe('模块不重复：每项资料只在一个模块里填', () => {
  it('每个步骤只属于一个模块，每个步骤都有模块', () => {
    const all = mods.flatMap((m) => MODS[m].steps ?? []);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(Object.keys(STEPS)));
  });

  it('同一个输入框不会出现在两个步骤里', () => {
    const seen = new Map<string, StepKey>();
    for (const st of Object.keys(STEPS) as StepKey[])
      for (const p of stepPaths(st)) {
        expect(seen.get(p), `${p} 同时在 ${seen.get(p)} 和 ${st}`).toBeUndefined();
        seen.set(p, st);
      }
  });

  it('「共用信息」只列别的模块的步骤', () => {
    for (const m of mods) for (const st of MODS[m].uses ?? []) expect(STEP_MOD[st]).not.toBe(m);
  });

  it('按字段找到填写它的模块', () => {
    expect(ownerOf('buyer.name')).toEqual({ mod: 'quote', step: 'parties' });
    expect(ownerOf('items.3.qty')).toEqual({ mod: 'quote', step: 'items' });
    expect(ownerOf('items.0.hs')).toEqual({ mod: 'customs', step: 'customsItems' });
    expect(ownerOf('items.0.gw')).toEqual({ mod: 'pl', step: 'packing' });
    expect(ownerOf('numbers.po')).toEqual({ mod: 'pi', step: 'contractNo' });
    expect(ownerOf('shipping.origin')).toEqual({ mod: 'ci', step: 'invoice' });
    expect(ownerOf('shipping.marks')).toEqual({ mod: 'marks', step: 'marks' });
    expect(ownerOf('shipping.vessel')).toEqual({ mod: 'booking', step: 'shipping' });
    expect(ownerOf('contractClauses.2.body')).toEqual({ mod: 'pi', step: 'contractClauses' });
  });

  it('检查结果跳到真正填写的模块', () => {
    const o = seed().orders[1];
    o.items[0].nameEn = '';
    o.shipping.vessel = '';
    o.status = '出货';
    const iss = checkOrder(o);
    for (const x of iss) {
      if (x.step) expect(STEP_MOD[x.step]).toBe(x.mod);
      const own = x.path && ownerOf(x.path);
      if (own) expect(own.mod).toBe(x.mod);
    }
    expect(iss.find((x) => x.step === 'items')?.mod).toBe('quote');
    expect(iss.find((x) => x.path === 'shipping.vessel')?.mod).toBe('booking');
  });
});

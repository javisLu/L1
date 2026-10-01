import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import { unzlib } from './fflate-sync';

describe('png-js 同步解压', () => {
  it('回调在调用时立即触发（不依赖 Web Worker）', () => {
    const src = new Uint8Array(5000).map((_, i) => i % 7);
    let out: Uint8Array | undefined;
    unzlib(zlibSync(src), (err, data) => { expect(err).toBeNull(); out = data; });
    expect(out).toEqual(src);
  });
  it('数据损坏时回调收到错误', () => {
    let err: Error | null = null;
    unzlib(new Uint8Array([1, 2, 3]), (e) => { err = e; });
    expect(err).toBeInstanceOf(Error);
  });
});

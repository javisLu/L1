import { describe, expect, it } from 'vitest';
import { whiteToTransparent } from './image';

describe('去除白底', () => {
  it('白色变透明，红色印泥保留，浅灰半透明', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 200, 30, 40, 255, 225, 225, 225, 255, 20, 20, 20, 255]);
    whiteToTransparent(px);
    expect(px[3]).toBe(0);
    expect(px[7]).toBe(255);
    expect(px[11]).toBeGreaterThan(0);
    expect(px[11]).toBeLessThan(255);
    expect(px[15]).toBe(255);
  });
});

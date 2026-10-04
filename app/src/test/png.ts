import { zlibSync } from 'fflate';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function chunk(type: string, data: Uint8Array) {
  const td = new Uint8Array([...type].map((c) => c.charCodeAt(0)).concat([...data]));
  return [...be(data.length), ...td, ...be(crc32(td))];
}

/** 测试用：透明背景上的红色圆环（模拟去白底后的公章），返回 data URL */
export function ringPng(w = 120, h = 120): string {
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - w / 2, y - h / 2), on = Math.abs(d - Math.min(w, h) * 0.4) < Math.min(w, h) * 0.05;
      raw.set(on ? [200, 20, 20, 255] : [0, 0, 0, 0], y * (w * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = new Uint8Array([...be(w), ...be(h), 8, 6, 0, 0, 0]);
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', ihdr), ...chunk('IDAT', zlibSync(raw)), ...chunk('IEND', new Uint8Array())]);
  let bin = '';
  png.forEach((b) => (bin += String.fromCharCode(b)));
  return 'data:image/png;base64,' + btoa(bin);
}

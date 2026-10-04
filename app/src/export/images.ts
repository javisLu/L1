/** 「设置」里保存的图片（data URL）→ Excel / Word 嵌入用的字节与尺寸 */
export interface ImgInfo {
  bytes: Uint8Array;
  base64: string;
  ext: 'png' | 'jpeg';
  /** 原图像素尺寸 */
  w: number;
  h: number;
}

export function imageInfo(dataUrl: string): ImgInfo | null {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const base64 = m[2];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = m[1] === 'png' ? 'png' : 'jpeg';
  const size = ext === 'png' ? pngSize(bytes) : jpegSize(bytes);
  return size ? { bytes, base64, ext, ...size } : null;
}

/** 等比缩放到 maxW × maxH 以内 */
export function fit(img: ImgInfo, maxW: number, maxH: number) {
  const k = Math.min(maxW / img.w, maxH / img.h);
  return { width: Math.round(img.w * k), height: Math.round(img.h * k) };
}

const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

function pngSize(b: Uint8Array) {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  return { w: u32(b, 16), h: u32(b, 20) };
}

function jpegSize(b: Uint8Array) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    // SOF0–SOF15（不含 DHT C4、JPG C8、DAC CC）里存着图片尺寸
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: u16(b, i + 5), w: u16(b, i + 7) };
    i += 2 + u16(b, i + 2);
  }
  return null;
}

/** Uint8Array ↔ base64（模板文件存在本地数据里） */
export const toB64 = (u8: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromB64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

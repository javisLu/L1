import { unzlibSync } from 'fflate';

/**
 * 给 png-js（react-pdf 解码带透明通道的 PNG 时使用）的同步解压。
 * fflate 自带的异步 unzlib 会创建 blob: Web Worker，桌面版的内容安全策略不允许，
 * 回调永远不会触发，导出 PDF 就会一直卡在“正在生成”。图片都已压缩到几百像素，同步解压很快。
 */
export function unzlib(data: Uint8Array, cb: (err: Error | null, out?: Uint8Array) => void) {
  let out: Uint8Array;
  try {
    out = unzlibSync(data);
  } catch (e) {
    cb(e instanceof Error ? e : new Error(String(e)));
    return;
  }
  cb(null, out);
}

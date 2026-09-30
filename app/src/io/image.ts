/** 读取用户选择的图片：等比缩小到 maxSide 以内，可选把接近白色的像素变透明（去除公章扫描件的白底） */
export async function loadImage(file: File, opt: { maxSide: number; removeWhite?: boolean }): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('请选择 PNG 或 JPG 图片');
  if (file.size > 10 * 1024 * 1024) throw new Error('图片超过 10 MB，请先压缩');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const el = new Image();
      el.onload = () => ok(el);
      el.onerror = () => fail(new Error('无法读取这张图片'));
      el.src = url;
    });
    const k = Math.min(1, opt.maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    if (opt.removeWhite) {
      const data = ctx.getImageData(0, 0, w, h);
      whiteToTransparent(data.data);
      ctx.putImageData(data, 0, 0);
    }
    // 需要透明背景（去白底）或原图是 PNG 时保存 PNG，否则 JPG 更小
    return opt.removeWhite || file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 亮度高、饱和度低的像素视为白底：完全白 → 透明，接近白 → 半透明，边缘过渡自然 */
export function whiteToTransparent(px: Uint8ClampedArray, lo = 200, hi = 245) {
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const min = Math.min(r, g, b), max = Math.max(r, g, b);
    if (max - min > 40) continue; // 有颜色（红色印泥），保留
    if (min >= hi) px[i + 3] = 0;
    else if (min > lo) px[i + 3] = Math.round((px[i + 3] * (hi - min)) / (hi - lo));
  }
}

/** 让用户选择文件（桌面版同样可用，不需要文件系统权限） */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export const readBytes = async (f: File) => new Uint8Array(await f.arrayBuffer());

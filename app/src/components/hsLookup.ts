import { toast } from '../store/ui';
import { hsLookupUrl } from '../domain/hs';

/** 在系统浏览器里打开 HS 编码网：有编码查编码，没有按品名搜 */
export function lookupHs(hs: string, name: string) {
  if (!hs.replace(/\D/g, '') && !name.trim()) return toast('先填中文品名或商品编号，再网上查');
  const url = hsLookupUrl(hs, name);
  void import('../export/save').then(({ openWeb }) => openWeb(url)).catch((e) => toast('打不开浏览器：' + String(e)));
}

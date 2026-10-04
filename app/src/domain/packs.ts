import { toNum, uid } from './calc';
import type { MixPack, Order } from './types';

/**
 * 把选中的几行设为混装（同一箱）：新建混装箱，成员排到一起（放在选中的第一行的位置），
 * 箱子尺寸先沿用第一行的箱规，每箱毛重先按各行原来的每箱毛重相加（可改）。
 */
export function groupRows(o: Order, ids: string[]): MixPack | null {
  const sel = o.items.filter((x) => ids.includes(x.id));
  if (sel.length < 2) return null;
  const first = sel[0];
  const pack: MixPack = {
    id: uid(), ctns: 1,
    gw: sel.reduce((a, x) => a + toNum(x.gw), 0) || '',
    l: first.l, w: first.w, h: first.h,
  };
  o.packs = [...(o.packs ?? []), pack];
  const at = o.items.findIndex((x) => x.id === first.id);
  const rest = o.items.filter((x) => !ids.includes(x.id));
  const before = rest.filter((x) => o.items.indexOf(x) < at);
  for (const x of sel) x.mix = pack.id;
  o.items = [...before, ...sel, ...rest.slice(before.length)];
  prunePacks(o);
  return pack;
}

/** 拆开混装：成员恢复单独装箱（每箱装默认等于数量，即各自一箱，可改） */
export function ungroup(o: Order, packId: string) {
  const pack = o.packs?.find((p) => p.id === packId);
  for (const x of o.items) {
    if (x.mix !== packId) continue;
    x.mix = '';
    if (!toNum(x.pcsPerCtn)) x.pcsPerCtn = x.qty;
    if (pack && !toNum(x.l)) { x.l = pack.l; x.w = pack.w; x.h = pack.h; }
  }
  o.packs = (o.packs ?? []).filter((p) => p.id !== packId);
}

/** 删掉没有货物的混装箱；只剩一行的混装箱也拆开 */
export function prunePacks(o: Order) {
  const count = new Map<string, number>();
  for (const x of o.items) if (x.mix) count.set(x.mix, (count.get(x.mix) ?? 0) + 1);
  for (const p of o.packs ?? []) if ((count.get(p.id) ?? 0) === 1) ungroup(o, p.id);
  o.packs = (o.packs ?? []).filter((p) => (count.get(p.id) ?? 0) > 1);
  for (const x of o.items) if (x.mix && !o.packs.some((p) => p.id === x.mix)) x.mix = '';
}

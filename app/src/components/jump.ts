import { useUI } from '../store/ui';
import { MODS, inputId, stepPaths, type ModKey, type StepKey } from '../modules/defs';

/** 滚动到输入框、聚焦并闪一下 */
export function flash(path: string) {
  const el = document.getElementById(inputId(path));
  if (!el) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  (el as HTMLElement).focus({ preventScroll: true });
  el.classList.remove('flash');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('flash');
}

/** 某个字段在模块的哪一步填写（货物行、条款按列匹配） */
export function stepOf(mod: ModKey, path: string): StepKey | undefined {
  const norm = path.replace(/^(items|contractClauses|packs)\.\d+\./, '$1.*.');
  return MODS[mod].steps?.find((st) => stepPaths(st).includes(norm));
}

/** 打开模块的对应步骤并定位到字段 */
export function jumpToField(mod: ModKey, step?: StepKey, path?: string) {
  const ui = useUI.getState();
  ui.openMod(mod);
  ui.set({ step: step ?? (path ? stepOf(mod, path) : undefined) ?? null, expand: false });
  if (path) setTimeout(() => flash(path), 80);
}

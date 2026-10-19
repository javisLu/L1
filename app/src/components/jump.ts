import { useUI } from '../store/ui';
import { MODS, STEP_MOD, inputId, normPath, ownerOf, stepPaths, type ModKey, type StepKey } from '../modules/defs';

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
  const norm = normPath(path);
  return MODS[mod].steps?.find((st) => stepPaths(st).includes(norm));
}

/** 打开字段所在的模块和步骤并定位到字段；每个步骤只属于一个模块，按步骤 / 字段找到它真正填写的地方 */
export function jumpToField(mod: ModKey, step?: StepKey, path?: string) {
  const own = step ? { mod: STEP_MOD[step], step } : path ? ownerOf(path) : undefined;
  const target = own?.mod ?? mod;
  const ui = useUI.getState();
  ui.openMod(target);
  ui.set({ step: own?.step ?? (path ? stepOf(target, path) : undefined) ?? null, expand: false });
  if (path) setTimeout(() => flash(path), 80);
}

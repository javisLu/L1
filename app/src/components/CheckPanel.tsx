import { useState } from 'react';
import { checkOrder, type Issue } from '../modules/check';
import { MODS } from '../modules/defs';
import { jumpToField } from './jump';
import { useData } from '../store/data';
import { toast } from '../store/ui';
import type { Order } from '../domain/types';

/** 单据检查结果：错误在前，点一条跳到要改的地方 */
export function CheckPanel({ order, max = 5 }: { order: Order; max?: number }) {
  const [all, setAll] = useState(false);
  const updateOrder = useData((st) => st.updateOrder);
  const issues = checkOrder(order);
  const errors = issues.filter((x) => x.level === 'error').length;
  const warns = issues.length - errors;
  if (!issues.length) return <div className="chk-panel ok">✓ 单据检查：没有发现问题</div>;
  const shown = all ? issues : issues.slice(0, max);
  return (
    <div className={'chk-panel' + (errors ? ' bad' : '')}>
      <div className="chk-h">
        单据检查
        {errors > 0 && <span className="chk-n error">{errors} 个错误</span>}
        {warns > 0 && <span className="chk-n warn">{warns} 个提醒</span>}
      </div>
      <ul>
        {shown.map((x, i) => (
          <li key={i}>
            <button className={'chk-item ' + x.level} onClick={() => jumpToField(x.mod, x.step, x.path)} title={`到「${MODS[x.mod].name}」修改`}>
              <span className="dot" aria-label={x.level === 'error' ? '错误' : '提醒'} />
              <span className="t">{x.text}</span>
              <span className="go">{MODS[x.mod].name} →</span>
            </button>
            {x.fix && (
              <button className="btn sm chk-fix" onClick={() => { updateOrder(order.id, x.fix!.apply); toast('已修正：' + x.text); }}>{x.fix.label}</button>
            )}
          </li>
        ))}
      </ul>
      {issues.length > max && (
        <button className="btn ghost sm" onClick={() => setAll(!all)}>{all ? '收起' : `展开全部 ${issues.length} 条`}</button>
      )}
    </div>
  );
}

export const countErrors = (o: Order) => checkOrder(o).filter((x: Issue) => x.level === 'error').length;

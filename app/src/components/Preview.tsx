import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DocView } from '../docs/templates';
import type { DocKey } from '../modules/defs';
import { useData } from '../store/data';
import { useUI } from '../store/ui';
import type { Order } from '../domain/types';

const PAGE_W = 595;

/** A4 预览：按容器宽度自动缩放；点击单据上的字段回调 onJump(path) */
export function Preview({ order, doc, bar, onJump }: { order: Order; doc: DocKey; bar: ReactNode; onJump?: (path: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(842);
  const assets = useData((s) => s.settings.assets);
  const labels = useData((s) => s.settings.labels);
  const range = useUI((s) => s.labelRange);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1.6, Math.max(0.4, (el.clientWidth - 24) / PAGE_W)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (page.current) setHeight(page.current.offsetHeight);
  });

  return (
    <section className="pv">
      <div className="pv-bar">{bar}</div>
      <div className="pv-wrap" ref={wrap}>
        <div className="pv-hold" style={{ width: PAGE_W * scale, height: height * scale }}>
          <div
            className="pv-scale"
            ref={page}
            style={{ transform: `scale(${scale})` }}
            onClick={(e) => {
              const f = (e.target as HTMLElement).closest('[data-f]') as HTMLElement | null;
              if (f && onJump) onJump(f.dataset.f!);
            }}
          >
            <DocView doc={doc} order={order} assets={assets} labels={{ ...labels, ...range, maxPages: 1 }} />
          </div>
        </div>
      </div>
    </section>
  );
}

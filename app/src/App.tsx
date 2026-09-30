import { useEffect, useState } from 'react';
import { ModalHost, Toasts } from './components/common';
import { hydrationError, useData } from './store/data';
import { useUI } from './store/ui';
import { Home } from './pages/Home';
import { OrderMenu } from './pages/OrderMenu';
import { Placeholder, Workbench } from './pages/Workbench';
import { ExportCenter } from './pages/ExportCenter';
import { Clauses, Customers, HsMemory, Partners, Products } from './pages/Libraries';
import { QuoteCalc } from './pages/QuoteCalc';
import { MODS } from './modules/defs';

/** 等待本地数据载入；订阅后再检查一次，避免载入在订阅之前就已完成 */
function useHydrated(): 'loading' | 'ok' | 'error' {
  const [st, setSt] = useState<'loading' | 'ok' | 'error'>(useData.persist.hasHydrated() ? 'ok' : 'loading');
  useEffect(() => {
    const unsub = useData.persist.onFinishHydration(() => setSt('ok'));
    if (useData.persist.hasHydrated()) setSt('ok');
    const t = setInterval(() => {
      if (useData.persist.hasHydrated()) setSt('ok');
      else if (hydrationError) setSt('error');
    }, 200);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, []);
  return st;
}

function Screen() {
  const { page, orderId, mod } = useUI();
  const order = useData((s) => s.orders.find((o) => o.id === orderId));
  useEffect(() => window.scrollTo(0, 0), [page, orderId, mod]);

  if ((page === 'order' || page === 'module') && !order) return <Home />;
  switch (page) {
    case 'order': return <OrderMenu order={order!} />;
    case 'module': {
      const m = mod ? MODS[mod] : null;
      if (!m) return <OrderMenu order={order!} />;
      if (m.special) return <ExportCenter order={order!} />;
      if (m.ph) return <Placeholder order={order!} mod={mod!} />;
      return <Workbench order={order!} mod={mod!} />;
    }
    case 'customers': return <Customers />;
    case 'partners': return <Partners />;
    case 'products': return <Products />;
    case 'hs': return <HsMemory />;
    case 'clauses': return <Clauses />;
    case 'calc': return <QuoteCalc />;
    default: return <Home />;
  }
}

export function App() {
  const hydrated = useHydrated();
  if (hydrated === 'loading') return <div className="empty">正在载入本地数据…</div>;
  if (hydrated === 'error')
    return (
      <div className="empty">
        本地数据读取失败：{String(hydrationError)}
        <br />
        <button className="btn" style={{ marginTop: 12 }} onClick={() => location.reload()}>重试</button>
      </div>
    );
  return (
    <>
      <Screen />
      <ModalHost />
      <Toasts />
    </>
  );
}

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useUI } from '../store/ui';

/** 页面出错时显示原因与返回按钮，避免整个窗口白屏 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面出错', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="ph-body">
        <div className="panel" style={{ padding: '22px 24px' }}>
          <div className="eyebrow">页面出错了</div>
          <h2 style={{ fontSize: 18, margin: '6px 0 10px' }}>这个页面没能正常显示，数据不受影响</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--surface-2)', padding: 12, borderRadius: 6, maxHeight: 280, overflow: 'auto' }}>
            {String(error.message)}{'\n'}{error.stack}
          </pre>
          <p className="muted" style={{ fontSize: 13 }}>请截图发给开发者，然后点下面的按钮返回首页。</p>
          <button
            className="btn pri"
            onClick={() => {
              useUI.getState().set({ page: 'home', orderId: null, mod: null });
              this.setState({ error: null });
            }}
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }
}

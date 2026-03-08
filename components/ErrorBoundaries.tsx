/**
 * 에러 바운더리 컴포넌트들 (App.tsx에서 분리)
 */
import React from 'react';

// 갤러리 에러 바운더리
export class GalleryErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <div className="bg-red-900/30 border border-red-500/50 rounded-2xl p-8">
            <h2 className="text-red-400 text-xl font-bold mb-4">갤러리 로딩 오류</h2>
            <pre className="text-red-300 text-xs text-left p-4 rounded-xl overflow-auto max-h-64" style={{ backgroundColor: 'var(--bg-surface)' }}>
              {this.state.error.message}{'\n'}{this.state.error.stack}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// 전역 에러 바운더리
export class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const token = localStorage.getItem('c2gen_session_token');
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'logClientError',
        token,
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {});
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-base)' }}>
          <div className="max-w-md w-full bg-red-900/30 border border-red-500/50 rounded-2xl p-8 text-center">
            <h2 className="text-red-400 text-xl font-bold mb-2">오류가 발생했습니다</h2>
            <p className="text-red-300 text-sm mb-4">{this.state.error.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all text-sm"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// 전역 JS 에러 리포팅
export function setupGlobalErrorReporting() {
  if (typeof window === 'undefined') return;

  const reportClientError = (message: string, stack?: string) => {
    const token = localStorage.getItem('c2gen_session_token');
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'logClientError', token, message, stack,
        url: window.location.href, userAgent: navigator.userAgent,
      }),
    }).catch(() => {});
  };

  window.onerror = (msg, _src, _line, _col, error) => {
    reportClientError(String(msg), error?.stack);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportClientError(
      reason?.message || String(reason),
      reason?.stack
    );
  });
}

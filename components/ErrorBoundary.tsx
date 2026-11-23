import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public handleRetry = () => {
    try { sessionStorage.removeItem('qms_lazy_chunk_reloaded'); } catch {}
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const rawMsg = this.state.error?.message || '';
      const isChunkError =
        /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk/i.test(rawMsg);
      return (
        <div className="flex flex-col items-center justify-center p-8 min-h-[300px] w-full text-center">
          <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl max-w-lg w-full flex flex-col items-center gap-4 shadow-sm">
            <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-full text-red-600 dark:text-red-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {this.props.fallbackTitle || 'Đã xảy ra lỗi khi tải giao diện'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {isChunkError
                  ? 'Module vừa được cập nhật hoặc kết nối bị gián đoạn. Vui lòng nhấn Tải lại trang để đồng bộ phiên bản mới nhất.'
                  : (rawMsg || 'Không thể hiển thị nội dung phần này.')}
              </p>
            </div>
            <button
              onClick={this.handleRetry}
              className="min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

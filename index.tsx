import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import App from './App';
import { ThemeProvider } from './src/context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';

try {
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    throw new Error('Không tìm thấy phần tử gốc #root');
  }
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ErrorBoundary fallbackTitle="Không thể khởi động ứng dụng QMS">
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
  requestAnimationFrame(() => {
    if (!document.getElementById('qms-boot-splash')) {
      (window as any).__QMS_MARK_MOUNTED__?.();
    }
  });
} catch (err) {
  console.error('Bootstrap mount failed:', err);
  (window as any).__QMS_BOOT_FAIL__?.(err);
}

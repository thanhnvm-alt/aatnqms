
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log("App initializing...");

const rootElement = document.getElementById('root');

if (!rootElement) {
  const msg = "FATAL ERROR: Could not find root element to mount to";
  console.error(msg);
  document.body.innerHTML = `<div style="color:red; padding:20px;">${msg}</div>`;
  throw new Error(msg);
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("App mounted successfully");
} catch (e) {
  console.error("Error mounting React app:", e);
  // Hiển thị lỗi chi tiết ra màn hình để debug nếu App sập ngay khi khởi động
  rootElement.innerHTML = `
    <div style="padding: 20px; text-align: center; color: #ef4444; font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <h1 style="font-size: 24px; margin-bottom: 10px;">Application Error</h1>
      <p style="margin-bottom: 20px;">Đã xảy ra lỗi nghiêm trọng khi khởi động ứng dụng.</p>
      <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; text-align: left; max-width: 600px; overflow: auto;">
        <p style="font-weight: bold; margin-bottom: 5px;">Chi tiết lỗi:</p>
        <pre style="white-space: pre-wrap; word-break: break-all; color: #b91c1c;">${e instanceof Error ? e.message + "\n\n" + e.stack : JSON.stringify(e)}</pre>
      </div>
      <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 5px; cursor: pointer;">Tải lại trang</button>
    </div>
  `;
}
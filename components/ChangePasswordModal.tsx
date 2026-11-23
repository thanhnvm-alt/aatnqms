import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Eye, EyeOff, Loader2, LogOut, Check, AlertCircle } from 'lucide-react';
import { changePassword } from '../services/apiService';
import { User } from '../types';

interface ChangePasswordModalProps {
  onClose: () => void;
  onSuccess?: (updatedUser: User) => void;
  forcing?: boolean;
  onLogout?: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ 
  onClose, 
  onSuccess, 
  forcing = false,
  onLogout 
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Password complex validation rules:
  // - Minimum length >= 6
  // - Contains lowercase letter
  // - Contains uppercase letter
  const checkLength = newPassword.length >= 6;
  const checkLowercase = /[a-z]/.test(newPassword);
  const checkUppercase = /[A-Z]/.test(newPassword);
  const isPasswordValid = checkLength && checkLowercase && checkUppercase;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isPasswordValid) {
      setErrorMsg('Mật khẩu không đáp ứng đầy đủ yêu cầu an toàn.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu mới và xác nhận mật khẩu không khớp.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await changePassword(currentPassword, newPassword);
      if (response && response.success) {
        alert('Đổi mật khẩu thành công!');
        if (onSuccess && response.user) {
          onSuccess(response.user);
        }
        onClose();
      } else {
        setErrorMsg(response.error || 'Đổi mật khẩu thất bại.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Lỗi không thể đổi mật khẩu, vui lòng liên hệ Admin.');
    } finally {
      setIsLoading(false);
    }
  };

  const modalNode = (
    <div className="fixed inset-0 z-[240] flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 min-w-0">
            <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 shrink-0" />
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200 truncate">
              {forcing ? 'Yêu cầu đổi mật khẩu' : 'Đổi mật khẩu'}
            </h2>
          </div>
          {!forcing && (
            <button 
              onClick={onClose}
              disabled={isLoading}
              aria-label="Đóng"
              className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1.5 sm:-my-0.5 -mr-1.5 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 flex flex-col gap-3.5 sm:gap-4">
          {forcing && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs text-amber-800 dark:text-amber-300 font-medium">
              Đây là lần đầu bạn đăng nhập hoặc mật khẩu của bạn đã được Admin đặt lại. Để bảo mật thông tin nội bộ QMS, vui lòng thiết lập mật khẩu mới trước khi tiếp tục.
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Current Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Mật khẩu hiện tại <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <div className="relative">
              <input 
                type={showCurrentPassword ? "text" : "password"}
                required
                disabled={isLoading}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Nhập mật khẩu hiện tại"
                className="w-full min-h-[44px] pl-3 pr-12 py-2.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-400"
              />
              <button 
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                aria-label={showCurrentPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="absolute inset-y-0 right-0 min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                tabIndex={-1}
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Mật khẩu mới <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <div className="relative">
              <input 
                type={showNewPassword ? "text" : "password"}
                required
                disabled={isLoading}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nhập mật khẩu mới"
                className="w-full min-h-[44px] pl-3 pr-12 py-2.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-400"
              />
              <button 
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                aria-label={showNewPassword ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"}
                className="absolute inset-y-0 right-0 min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Realtime Complexity Check Feedback */}
            <div className="mt-1 p-2.5 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-150 dark:border-slate-800/80 flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tiêu chuẩn mật khẩu an toàn:</span>
              
              <div className="flex items-center gap-2 text-[11px]">
                {checkLength ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 flex select-none" />
                )}
                <span className={checkLength ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-500"}>
                  Độ dài tối thiểu 6 ký tự
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px]">
                {checkLowercase && checkUppercase ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 flex select-none" />
                )}
                <span className={(checkLowercase && checkUppercase) ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-slate-500"}>
                  Bắt buộc chứa chữ Hoa (A-Z) và chữ thường (a-z)
                </span>
              </div>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
              Xác nhận mật khẩu mới <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <div className="relative">
              <input 
                type={showConfirmPassword ? "text" : "password"}
                required
                disabled={isLoading}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Xác nhận mật khẩu mới"
                className="w-full min-h-[44px] pl-3 pr-12 py-2.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-400"
              />
              <button 
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Ẩn xác nhận mật khẩu" : "Hiện xác nhận mật khẩu"}
                className="absolute inset-y-0 right-0 min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          </div>
          {/* Actions Bar */}
          <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-2 sm:py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 shrink-0">
            <div>
              {forcing && onLogout && (
                <button 
                  type="button"
                  onClick={onLogout}
                  disabled={isLoading}
                  className="min-h-[44px] sm:min-h-[36px] flex items-center gap-1.5 px-3 py-2 sm:py-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                  Đăng xuất
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {!forcing && (
                <button 
                  type="button" 
                  onClick={onClose}
                  disabled={isLoading}
                  className="min-h-[44px] sm:min-h-[36px] px-3.5 sm:px-4 py-2 sm:py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  Hủy
                </button>
              )}
              <button 
                type="submit" 
                disabled={isLoading || !isPasswordValid || (newPassword !== confirmPassword)}
                className={`min-h-[44px] sm:min-h-[36px] flex items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-1.5 rounded-xl text-xs font-bold text-white transition-all shadow-sm whitespace-nowrap shrink-0 ${
                  isLoading || !isPasswordValid || (newPassword !== confirmPassword)
                    ? 'bg-slate-300 dark:bg-slate-800 cursor-not-allowed text-slate-400 dark:text-slate-600'
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                }`}
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Đổi mật khẩu
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};

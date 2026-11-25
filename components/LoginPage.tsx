import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Lock, User as UserIcon, Loader2, Info, Eye, EyeOff, CheckSquare, Database, KeyRound, Mail, ArrowLeft, ShieldCheck } from 'lucide-react';
import { verifyUserCredentials, changePassword, forgotPassword, resetPassword } from '../services/apiService';
import { getProxyImageUrl } from '../src/utils';

interface LoginPageProps {
  onLoginSuccess: (user: User, remember: boolean) => void;
  users: User[];
  dbReady?: boolean; 
}

export function LoginPage({ onLoginSuccess, users, dbReady = false }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // First-time password change modal state
  const [showForceChangeModal, setShowForceChangeModal] = useState(false);
  const [tempLoggedInUser, setTempLoggedInUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);

  // Forgot password modal state
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'email' | 'code'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [successNotice, setSuccessNotice] = useState('');

  useEffect(() => {
    const savedUsername = localStorage.getItem('aatn_saved_username');
    if (savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbReady) return; 
    
    setError('');
    setSuccessNotice('');
    setIsLoading(true);

    try {
        const loginData = await verifyUserCredentials(username, password);
        
        if (loginData && loginData.user) {
            if (rememberMe) {
                localStorage.setItem('aatn_saved_username', username);
            } else {
                localStorage.removeItem('aatn_saved_username');
            }

            if (loginData.token) {
                localStorage.setItem('aatn_qms_token', loginData.token);
            }

            // Check if user requires password change on first login
            if (loginData.user.requirePasswordChange || loginData.user.require_password_change) {
                setTempLoggedInUser(loginData.user);
                setShowForceChangeModal(true);
            } else {
                onLoginSuccess(loginData.user, rememberMe);
            }
        } else {
            setError('Tên đăng nhập hoặc mật khẩu không đúng');
        }
    } catch (err: any) {
        console.error("Login attempt failed", err);
        setError(`Lỗi hệ thống: ${err.message || "Không thể kết nối Database"}`);
    } finally {
        setIsLoading(false);
    }
  };

  const handleForceChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError('');

    if (newPassword !== confirmNewPassword) {
        setChangeError('Mật khẩu mới và xác nhận mật khẩu không khớp');
        return;
    }

    if (newPassword.length < 6) {
        setChangeError('Mật khẩu mới phải có tối thiểu 6 ký tự');
        return;
    }

    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword)) {
        setChangeError('Mật khẩu mới bắt buộc phải chứa cả ký tự hoa và thường');
        return;
    }

    setChangeLoading(true);
    try {
        await changePassword(password, newPassword);
        setShowForceChangeModal(false);
        // Theo yêu cầu: Đăng xuất và yêu cầu đăng nhập lại bằng mật khẩu mới
        localStorage.removeItem('aatn_qms_token');
        sessionStorage.removeItem('aatn_qms_token');
        setPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setTempLoggedInUser(null);
        setSuccessNotice('Đổi mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.');
    } catch (err: any) {
        setChangeError(err.message || 'Đổi mật khẩu thất bại');
    } finally {
        setChangeLoading(false);
    }
  };

  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotMessage('');
    if (!forgotEmail) {
        setForgotError('Vui lòng nhập địa chỉ email');
        return;
    }

    setForgotLoading(true);
    try {
        const res = await forgotPassword(forgotEmail);
        setForgotMessage(res.message || 'Mã xác thực đã được gửi.');
        setForgotStep('code');
    } catch (err: any) {
        setForgotError(err.message || 'Không tìm thấy tài khoản với email này');
    } finally {
        setForgotLoading(false);
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotMessage('');

    if (forgotNewPassword !== forgotConfirmPassword) {
        setForgotError('Mật khẩu mới và xác nhận mật khẩu không khớp');
        return;
    }

    if (forgotNewPassword.length < 6) {
        setForgotError('Mật khẩu mới phải có tối thiểu 6 ký tự');
        return;
    }

    if (!/[a-z]/.test(forgotNewPassword) || !/[A-Z]/.test(forgotNewPassword)) {
        setForgotError('Mật khẩu mới bắt buộc phải chứa cả ký tự hoa và thường');
        return;
    }

    setForgotLoading(true);
    try {
        const res = await resetPassword(forgotEmail, resetCode, forgotNewPassword);
        setShowForgotPasswordModal(false);
        setForgotStep('email');
        setForgotEmail('');
        setResetCode('');
        setForgotNewPassword('');
        setForgotConfirmPassword('');
        setPassword('');
        setSuccessNotice(res?.message || 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới.');
    } catch (err: any) {
        setForgotError(err.message || 'Đặt lại mật khẩu thất bại');
    } finally {
        setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800/50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0">
          <img 
            src={getProxyImageUrl("https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1920")} 
            alt="Background" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"></div>
      </div>

      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-10 animate-in fade-in zoom-in duration-300">
        
        {/* Header with Logo */}
        <div className="bg-white dark:bg-slate-900 p-8 pb-4 text-center flex flex-col items-center border-b border-slate-50">
            <div className="mb-2 relative w-full flex justify-center">
                <div className="flex flex-col items-center">
                    <img 
                        src={getProxyImageUrl("https://lh3.googleusercontent.com/d/1bDMxj465lBlBF0IJY7R-93MxkulDeMND")} 
                        alt="AA Corporation Logo" 
                        className="h-24 object-contain" 
                        referrerPolicy="no-referrer"
                    />
                </div>
            </div>
            
            <h2 className="text-lg font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide mt-2">Hệ thống QA/QC</h2>
        </div>

        {/* Form */}
        <div className="p-8 pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!dbReady && (
              <div className="bg-blue-50 dark:bg-slate-800/80 border border-blue-100 dark:border-slate-700 p-4 rounded-xl flex items-center gap-3 animate-pulse">
                <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div className="flex-1">
                  <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest leading-none">Database Initialization</p>
                  <p className="text-[10px] text-blue-500 font-bold mt-1">Đang cấu hình dữ liệu ISO... Vui lòng đợi trong giây lát.</p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Tên đăng nhập</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                </div>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={!dbReady || isLoading}
                  className="pl-10 pr-3 block w-full min-h-[44px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-lg py-2.5 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:bg-slate-900 focus:border-transparent transition-all disabled:opacity-50"
                  placeholder="Nhập tên đăng nhập..."
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1 ml-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">Mật khẩu</label>
                <button
                  type="button"
                  onClick={() => setShowForgotPasswordModal(true)}
                  className="min-h-[44px] lg:min-h-[32px] px-2 -mr-2 inline-flex items-center text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline rounded-lg"
                >
                  Quên mật khẩu?
                </button>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!dbReady || isLoading}
                  className="pl-10 pr-12 block w-full min-h-[44px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-lg py-2.5 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white dark:bg-slate-900 focus:border-transparent transition-all disabled:opacity-50"
                  placeholder="••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  className="absolute inset-y-0 right-0 min-w-[44px] flex items-center justify-center text-slate-400 hover:text-blue-600 focus:outline-none transition-colors rounded-r-lg"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            
            {/* Remember Me Checkbox */}
            <div 
                className={`flex items-center min-h-[44px] py-1 cursor-pointer group ${(!dbReady || isLoading) ? 'pointer-events-none opacity-50' : ''}`} 
                onClick={() => dbReady && !isLoading && setRememberMe(!rememberMe)}
            >
                <div className={`mr-3 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all ${rememberMe ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 group-hover:border-blue-400'}`}>
                    {rememberMe && <CheckSquare className="w-4 h-4 text-white" />}
                </div>
                <div className="flex flex-col select-none">
                    <span className={`text-sm font-bold ${rememberMe ? 'text-blue-700' : 'text-slate-600 dark:text-slate-400'}`}>
                        Ghi nhớ đăng nhập
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                        Tự động điền thông tin & Giữ phiên đăng nhập
                    </span>
                </div>
            </div>

            {successNotice && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs p-3 rounded-lg flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <span>{successNotice}</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 text-red-600 dark:text-red-400 text-sm p-3 rounded-lg flex items-center animate-shake">
                 <Info className="w-4 h-4 mr-2 flex-shrink-0" />
                 {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !dbReady}
              className="w-full min-h-[44px] flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-lg shadow-blue-700/30 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:shadow-none disabled:cursor-not-allowed transition-all transform active:scale-[0.98]"
            >
              {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ĐANG XÁC THỰC...
                  </>
              ) : !dbReady ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ĐANG KHỞI TẠO CƠ SỞ DỮ LIỆU...
                </>
              ) : (
                'ĐĂNG NHẬP'
              )}
            </button>
          </form>
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-white/80 font-medium shadow-sm">
        © 2024 AA Corporation. Interior Solutions Since 1989.
      </p>

      {/* First-time Force Change Password Modal */}
      {showForceChangeModal && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-slate-900/70 backdrop-blur-sm animate-in fade-in overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden">
            <div className="bg-blue-600 p-4 sm:p-6 text-white text-center shrink-0">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <ShieldCheck className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-bold">Đổi Mật Khẩu Lần Đầu</h3>
              <p className="text-xs text-blue-100 mt-1">Tài khoản của bạn đang dùng mật khẩu mặc định hoặc cần cập nhật mật khẩu mới theo chính sách bảo mật hệ thống.</p>
            </div>

            <form onSubmit={handleForceChangePassword} className="p-4 sm:p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
              {changeError && (
                <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg flex items-center">
                  <Info className="w-4 h-4 mr-2 flex-shrink-0" />
                  {changeError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mật khẩu mới</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự (có chữ hoa & thường)"
                  className="w-full min-h-[44px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full min-h-[44px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={changeLoading}
                  className="w-full min-h-[44px] py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center disabled:opacity-50"
                >
                  {changeLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : 'XÁC NHẬN & VÀO HỆ THỐNG'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forgot Password Modal */}
      {showForgotPasswordModal && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-slate-900/70 backdrop-blur-sm animate-in fade-in overflow-hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden">
            <div className="bg-slate-800 p-4 sm:p-6 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-600/30 rounded-full flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Khôi phục mật khẩu</h3>
                  <p className="text-xs text-slate-400">Xác thực qua email nhân viên</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowForgotPasswordModal(false);
                  setForgotStep('email');
                  setForgotError('');
                  setForgotMessage('');
                }}
                aria-label="Đóng"
                className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>

            {forgotStep === 'email' ? (
              <form onSubmit={handleRequestResetCode} className="p-4 sm:p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
                {forgotError && (
                  <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg flex items-center">
                    <Info className="w-4 h-4 mr-2 flex-shrink-0" />
                    {forgotError}
                  </div>
                )}
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Nhập địa chỉ email đã đăng ký của bạn. Chúng tôi sẽ gửi mã xác thực gồm 6 chữ số để bạn thiết lập lại mật khẩu mới.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email nhân viên</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="vd: ten.nv@aacorporation.com"
                      className="pl-10 w-full min-h-[44px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="pt-2 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowForgotPasswordModal(false)}
                    className="flex-1 min-h-[44px] py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 min-h-[44px] py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm shadow-md transition-all flex items-center justify-center disabled:opacity-50"
                  >
                    {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Gửi mã xác thực'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmResetPassword} className="p-4 sm:p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
                {forgotError && (
                  <div className="bg-red-50 text-red-600 text-xs p-3 rounded-lg flex items-center">
                    <Info className="w-4 h-4 mr-2 flex-shrink-0" />
                    {forgotError}
                  </div>
                )}
                {forgotMessage && (
                  <div className="bg-emerald-50 text-emerald-700 text-xs p-3 rounded-lg flex items-center">
                    <Info className="w-4 h-4 mr-2 flex-shrink-0" />
                    {forgotMessage}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mã xác thực (6 số)</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="Nhập 6 số..."
                    className="w-full min-h-[44px] text-center tracking-widest font-mono text-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg p-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mật khẩu mới</label>
                  <input
                    type="password"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự (có chữ hoa & thường)"
                    className="w-full min-h-[44px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Xác nhận mật khẩu mới</label>
                  <input
                    type="password"
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full min-h-[44px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="pt-2 flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setForgotStep('email')}
                    className="min-h-[44px] py-2.5 px-4 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" /> Quay lại
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 min-h-[44px] py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm shadow-md transition-all flex items-center justify-center disabled:opacity-50"
                  >
                    {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Đặt lại mật khẩu'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

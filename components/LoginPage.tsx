
import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Lock, User as UserIcon, Loader2, Info, Eye, EyeOff, CheckSquare, Square } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (user: User, remember: boolean) => void;
  users: User[]; // Pass the dynamic list of users to verify against
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, users }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);

  // Load saved username on mount
  useEffect(() => {
    const savedUsername = localStorage.getItem('aatn_saved_username');
    if (savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true); // Default to checked if we have a saved username
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Simulate network delay
    setTimeout(() => {
        const foundUser = users.find(u => u.username === username && u.password === password);
        
        if (foundUser) {
            // Logic lưu username để điền sẵn cho lần sau (kể cả khi đã logout)
            if (rememberMe) {
                localStorage.setItem('aatn_saved_username', username);
            } else {
                localStorage.removeItem('aatn_saved_username');
            }

            // NEVER pass the password back up, strict security
            const { password: _, ...safeUser } = foundUser; 
            // Re-construct user object for the app state without password
            onLoginSuccess(foundUser as User, rememberMe);
        } else {
            setError('Tên đăng nhập hoặc mật khẩu không đúng');
        }
        setIsLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1920" 
            alt="Background" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"></div>
      </div>

      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-10 animate-in fade-in zoom-in duration-300">
        
        {/* Header with Logo */}
        <div className="bg-white p-8 pb-4 text-center flex flex-col items-center border-b border-slate-50">
            {/* Logo Container */}
            <div className="mb-4 relative w-full flex justify-center">
                 {!logoError ? (
                    <img 
                        src="https://aacorporation.com/wp-content/uploads/2020/06/logo.png" 
                        alt="AA Corporation" 
                        className="h-32 w-auto object-contain"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            setLogoError(true);
                        }}
                    />
                 ) : (
                    <div className="flex flex-col items-center">
                        <h1 className="text-5xl font-bold text-red-600 tracking-tighter" style={{ fontFamily: 'serif' }}>AA</h1>
                        <span className="text-xl font-bold text-slate-800">Corporation</span>
                         <div className="h-1 w-16 bg-orange-500 rounded-full my-2"></div>
                         <span className="text-xs text-slate-500 uppercase tracking-widest">Interior Solutions Since 1989</span>
                    </div>
                 )}
            </div>
            
            <h2 className="text-lg font-bold text-slate-600 uppercase tracking-wide mt-2">Hệ thống QA/QC</h2>
        </div>

        {/* Form */}
        <div className="p-8 pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
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
                  className="pl-10 block w-full border border-slate-200 bg-slate-50 rounded-lg py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all"
                  placeholder="Nhập tên đăng nhập..."
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Mật khẩu</label>
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
                  className="pl-10 pr-10 block w-full border border-slate-200 bg-slate-50 rounded-lg py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white focus:border-transparent transition-all"
                  placeholder="••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-blue-600 focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            
            {/* Remember Me Checkbox */}
            <div 
                className="flex items-start cursor-pointer group" 
                onClick={() => setRememberMe(!rememberMe)}
            >
                <div className={`mt-0.5 mr-3 w-5 h-5 rounded border flex items-center justify-center transition-all ${rememberMe ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white group-hover:border-blue-400'}`}>
                    {rememberMe && <CheckSquare className="w-4 h-4 text-white" />}
                </div>
                <div className="flex flex-col select-none">
                    <span className={`text-sm font-bold ${rememberMe ? 'text-blue-700' : 'text-slate-600'}`}>
                        Ghi nhớ đăng nhập
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                        Tự động điền thông tin & Giữ phiên đăng nhập
                    </span>
                </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm p-3 rounded-lg flex items-center animate-pulse">
                 <Info className="w-4 h-4 mr-2 flex-shrink-0" />
                 {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg shadow-blue-700/30 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-[0.98]"
            >
              {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    Đang xử lý...
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
    </div>
  );
};


import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    MessageSquare, 
    X, 
    Send, 
    Bot, 
    User as UserIcon, 
    Loader2, 
    Maximize2, 
    Minimize2,
    Sparkles,
    Trash2,
    RefreshCw,
    ShieldCheck
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { generateAIChatResponse } from '../services/aiService';
import { User } from '../types';

interface Message {
    role: 'user' | 'model';
    text: string;
    timestamp: Date;
}

interface ChatAIProps {
    user: User;
}

export const ChatAI: React.FC<ChatAIProps> = ({ user }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const constraintRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
            // On mobile, focusing immediately might trigger keyboard and hide content unexpectedly
            if (window.innerWidth > 640) {
                inputRef.current?.focus();
            }
        }
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        const newUserMsg: Message = { role: 'user', text: userMsg, timestamp: new Date() };
        setMessages(prev => [...prev, newUserMsg]);
        setIsLoading(true);

        try {
            const response = await generateAIChatResponse(userMsg, history);
            const modelMsg: Message = { 
                role: 'model', 
                text: response.text || "Xin lỗi, tôi không thể trả lời ngay lúc này.", 
                timestamp: new Date() 
            };
            setMessages(prev => [...prev, modelMsg]);
            if (response.history) setHistory(response.history);
        } catch (error) {
            console.error("Chat error:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const clearChat = () => {
        setMessages([]);
        setHistory([]);
    };

    return (
        <div ref={constraintRef} className="fixed inset-0 pointer-events-none z-[999] overflow-hidden">
            <AnimatePresence>
                {isOpen && !isMinimized && (
                    <div className="absolute inset-0 flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-6 pointer-events-none">
                        <motion.div
                            initial={{ opacity: 0, y: 100, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 100, scale: 0.95 }}
                            className="bg-white/95 backdrop-blur-xl w-full sm:w-[420px] h-[90svh] sm:h-[600px] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col overflow-hidden pointer-events-auto"
                        >
                            {/* Header */}
                            <header className="bg-slate-900 text-white p-5 sm:p-6 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
                                        <Sparkles className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest flex items-center gap-2 truncate">
                                            AA QMS Assistant
                                            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shrink-0"></span>
                                        </h3>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight truncate">AI TRỢ LÝ ISO & DỮ LIỆU</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={clearChat}
                                        className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                                        title="Xóa cuộc hội thoại"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => setIsMinimized(true)}
                                        className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                                    >
                                        <Minimize2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => setIsOpen(false)}
                                        className="p-2 hover:bg-slate-800 rounded-xl text-red-400 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </header>

                            {/* Messages Area */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 no-scrollbar bg-slate-50/50">
                                {messages.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-4 sm:p-8 space-y-4">
                                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 animate-bounce cursor-default">
                                            <Bot className="w-8 h-8 sm:w-10 sm:h-10" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-2">Xin chào {user.name.split(' ').pop()}!</h4>
                                            <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-[280px]">
                                                Tôi có thể giúp bạn kiểm tra tình trạng phiếu, thống kê NCR hoặc giải đáp các quy trình ISO 9001. Bạn muốn hỏi gì không?
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 w-full pt-4 max-w-[320px]">
                                            {[
                                                "Thống kê các NCR đang mở?",
                                                "Dự án P24001 tiến độ thế nào?",
                                                "Quy trình kiểm tra IQC là gì?"
                                            ].map((q, i) => (
                                                <button 
                                                    key={i}
                                                    onClick={() => setInput(q)}
                                                    className="p-3 text-[10px] font-black text-slate-600 uppercase tracking-widest bg-white border border-slate-100 rounded-2xl hover:bg-blue-50 hover:border-blue-200 transition-all text-left"
                                                >
                                                    {q}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {messages.map((msg, i) => (
                                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`flex gap-2 sm:gap-3 max-w-[90%] sm:max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                                                msg.role === 'user' ? 'bg-slate-900 text-white' : 'bg-blue-600 text-white'
                                            }`}>
                                                {msg.role === 'user' ? <UserIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                                            </div>
                                            <div className={`p-3 sm:p-4 rounded-2xl sm:rounded-3xl shadow-sm border ${
                                                msg.role === 'user' 
                                                    ? 'bg-slate-900 text-white border-slate-800 rounded-tr-none' 
                                                    : 'bg-white text-slate-800 border-slate-100 rounded-tl-none font-medium'
                                            }`}>
                                                <div className="prose prose-sm max-w-none prose-slate markdown-body text-[13px] leading-relaxed">
                                                    <ReactMarkdown>
                                                        {msg.text}
                                                    </ReactMarkdown>
                                                </div>
                                                <p className={`text-[8px] mt-2 font-bold uppercase tracking-tighter opacity-40 ${
                                                    msg.role === 'user' ? 'text-right' : 'text-left'
                                                }`}>
                                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {isLoading && (
                                    <div className="flex justify-start">
                                        <div className="flex gap-2 sm:gap-3 items-center">
                                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                                                <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                            </div>
                                            <div className="bg-white p-3 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-100 flex items-center gap-2">
                                                <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 animate-spin" />
                                                <p className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Đang truy xuất dữ liệu...</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input Area */}
                            <footer className="p-4 sm:p-6 bg-white border-t border-slate-100 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                                <div className="relative flex items-end gap-2 bg-slate-50 rounded-[1.5rem] sm:rounded-[2rem] p-1.5 sm:p-2 border border-slate-100 focus-within:border-blue-300 focus-within:bg-white transition-all shadow-inner">
                                    <textarea
                                        ref={inputRef}
                                        rows={1}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={handleKeyPress}
                                        placeholder="Hỏi về QMS..."
                                        className="flex-1 bg-transparent border-none focus:ring-0 text-[14px] sm:text-sm font-medium py-2 sm:py-3 px-3 sm:px-4 resize-none no-scrollbar placeholder:text-slate-400 placeholder:font-black placeholder:uppercase placeholder:tracking-widest"
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!input.trim() || isLoading}
                                        className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl transition-all shadow-lg active:scale-95 ${
                                            input.trim() && !isLoading 
                                                ? 'bg-blue-600 text-white shadow-blue-200' 
                                                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                        }`}
                                    >
                                        <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                </div>
                                <p className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-tighter mt-3 flex items-center justify-center gap-1 opacity-70">
                                    <ShieldCheck className="w-2.5 h-2.5" /> ISO 9001 AI ASSISTANT
                                </p>
                            </footer>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Float Button - Optimized Draggable */}
            <motion.div
                drag
                dragConstraints={constraintRef}
                dragElastic={0.1}
                dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
                whileDrag={{ scale: 1.1, cursor: 'grabbing' }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.9 }}
                initial={{ x: window.innerWidth - 88, y: window.innerHeight - 88 }}
                className="absolute pointer-events-auto flex items-center gap-3 cursor-grab"
                style={{ zIndex: 1000 }}
            >
                {isOpen && isMinimized && (
                    <button
                        onClick={() => setIsMinimized(false)}
                        className="bg-slate-900 text-white px-5 sm:px-6 py-3 sm:py-4 rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl flex items-center gap-2 sm:gap-3 border border-white/10"
                    >
                        <div className="relative">
                            <Bot className="w-4 h-4 sm:w-5 h-5" />
                            <span className="absolute -top-1 -right-1 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse"></span>
                        </div>
                        <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest whitespace-nowrap">Tiếp tục chat</span>
                        <div className="flex gap-0.5 sm:gap-1 ml-1 scale-75 sm:scale-100">
                            <span className="w-1 h-1 bg-white/30 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-1 h-1 bg-white/30 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-1 h-1 bg-white/30 rounded-full animate-bounce"></span>
                        </div>
                    </button>
                )}
                
                {!isOpen && (
                    <button
                        onClick={() => setIsOpen(true)}
                        className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-600 text-white rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl shadow-blue-300 flex items-center justify-center group overflow-hidden relative"
                    >
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent md:opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7 relative z-10" />
                        <motion.div 
                            animate={{ 
                                opacity: [0.5, 1, 0.5],
                                scale: [1, 1.2, 1]
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute -top-1 -right-1"
                        >
                            <Sparkles className="w-5 h-5 text-amber-300 fill-amber-300" />
                        </motion.div>
                    </button>
                )}
            </motion.div>
        </div>
    );
};

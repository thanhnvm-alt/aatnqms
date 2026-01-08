
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Inspection, PlanItem, InspectionStatus } from '../types';
import { 
  Send, X, MessageSquare, Sparkles, Bot, Loader2, 
  Eraser, ShieldCheck, Move, Minimize2, GripVertical, AlertCircle
} from 'lucide-react';

interface AIChatboxProps {
  inspections: Inspection[];
  plans: PlanItem[];
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

const FormattedText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        let formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-blue-900">$1</strong>');
        const isBullet = line.trim().startsWith('* ') || line.trim().startsWith('- ');
        if (isBullet) {
          return (
            <div key={i} className="flex gap-2 ml-1">
              <span className="text-blue-500 font-bold">•</span>
              <span dangerouslySetInnerHTML={{ __html: formattedLine.replace(/^[*|-]\s/, '') }} />
            </div>
          );
        }
        return <p key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: formattedLine }} />;
      })}
    </div>
  );
};

export const AIChatbox: React.FC<AIChatboxProps> = ({ inspections, plans }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [btnPos, setBtnPos] = useState({ x: window.innerWidth - 60, y: window.innerHeight - 130 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartOffset = useRef({ x: 0, y: 0 });
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Chào bạn! Tôi là **AATN Assistant**. Tôi có thể giúp bạn tra cứu tiến độ và lỗi QC. Hãy nhập mã dự án hoặc mã nhà máy để bắt đầu.',
      timestamp: new Date()
    }
  ]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, isLoading]);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartOffset.current = { x: clientX - btnPos.x, y: clientY - btnPos.y };
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const newX = Math.min(Math.max(10, clientX - dragStartOffset.current.x), window.innerWidth - 60);
      const newY = Math.min(Math.max(10, clientY - dragStartOffset.current.y), window.innerHeight - 60);
      setBtnPos({ x: newX, y: newY });
    };
    const handleEnd = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging]);

  // Tạo Summary Context để AI trả lời được các câu hỏi tổng quát
  const dataSummary = useMemo(() => {
    const projectStats: Record<string, { plans: number, qc: number }> = {};
    
    plans.forEach(p => {
        const code = String(p.ma_ct || 'N/A');
        if (!projectStats[code]) projectStats[code] = { plans: 0, qc: 0 };
        projectStats[code].plans++;
    });
    
    inspections.forEach(i => {
        const code = String(i.ma_ct || 'N/A');
        if (!projectStats[code]) projectStats[code] = { plans: 0, qc: 0 };
        projectStats[code].qc++;
    });

    const summaryLines = Object.entries(projectStats)
        .slice(0, 30) // Giới hạn chỉ gửi 30 dự án tiêu biểu trong summary
        .map(([code, stats]) => `- ${code}: ${stats.plans} KH, ${stats.qc} QC`);

    return `TÓM TẮT HỆ THỐNG:
- Tổng số kế hoạch: ${plans.length}
- Tổng số phiếu kiểm tra: ${inspections.length}
- Một số dự án tiêu biểu:
${summaryLines.join('\n')}`;
  }, [inspections, plans]);

  const handleSendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text, timestamp: new Date() }]);
    setInput('');
    setIsLoading(true);

    try {
      // Fixed: Always use direct process.env.API_KEY for GoogleGenAI initialization as per guidelines
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // LOGIC LỌC DỮ LIỆU AN TOÀN (Safe String Handling)
      const keywords = text.toUpperCase().split(/\s+/).filter(k => k.length > 1);
      
      let relevantPlans = plans;
      let relevantInspections = inspections;

      if (keywords.length > 0) {
          relevantPlans = plans.filter(p => 
              keywords.some(k => 
                  (p.ma_ct && String(p.ma_ct).toUpperCase().includes(k)) || 
                  (p.ma_nha_may && String(p.ma_nha_may).toUpperCase().includes(k)) ||
                  (p.headcode && String(p.headcode).toUpperCase().includes(k)) ||
                  (p.ten_hang_muc && String(p.ten_hang_muc).toUpperCase().includes(k))
              )
          );
          relevantInspections = inspections.filter(i => 
              keywords.some(k => 
                  (i.ma_ct && String(i.ma_ct).toUpperCase().includes(k)) || 
                  (i.ma_nha_may && String(i.ma_nha_may).toUpperCase().includes(k)) ||
                  (i.headcode && String(i.headcode).toUpperCase().includes(k)) ||
                  (i.ten_hang_muc && String(i.ten_hang_muc).toUpperCase().includes(k))
              )
          );
      }

      // Giới hạn Token khắt khe hơn (Safe Limits: ~1000 records total)
      // Nếu có từ khóa, ưu tiên kết quả lọc. Nếu không, lấy 100 bản ghi mới nhất.
      const finalPlans = keywords.length > 0 ? relevantPlans.slice(0, 800) : plans.slice(0, 200);
      const finalInspections = keywords.length > 0 ? relevantInspections.slice(0, 200) : inspections.slice(0, 50);

      const dynamicContext = `
DỮ LIỆU CHI TIẾT (Lọc theo yêu cầu):
${finalInspections.map(i => `QC|${i.ma_ct}|${i.ma_nha_may}|${i.ten_hang_muc}|${i.score}%|${i.status}`).join('\n')}
${finalPlans.map(p => `KH|${p.ma_ct}|${p.ma_nha_may}|${p.ten_hang_muc}|${p.plannedDate}|SL:${p.so_luong_ipo}`).join('\n')}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: text,
        config: {
          systemInstruction: `Bạn là trợ lý dữ liệu QA/QC chuyên nghiệp cho hệ thống AATN.
          
          NGỮ CẢNH DỮ LIỆU:
          ${dataSummary}
          
          ${dynamicContext}

          HƯỚNG DẪN TRẢ LỜI:
          1. Trả lời cực kỳ ngắn gọn và chính xác dựa trên DỮ LIỆU CHI TIẾT.
          2. Nếu tìm thấy mã dự án/nhà máy, liệt kê tiến độ theo danh sách.
          3. Sử dụng **in đậm** cho các mã số và trạng thái quan trọng.
          4. Nếu không thấy trong danh sách lọc, hãy dùng TÓM TẮT HỆ THỐNG để trả lời tổng quát.`,
          temperature: 0.1,
        },
      });

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text || "Tôi không tìm thấy thông tin phù hợp.",
        timestamp: new Date()
      }]);
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      let errorMsg = "Lỗi kết nối AI. Vui lòng thử lại sau.";
      
      const errorStr = JSON.stringify(error);
      if (errorStr.includes("token count exceeds") || errorStr.includes("400")) {
          errorMsg = "Dữ liệu tra soát quá lớn. Vui lòng hỏi cụ thể hơn về một mã dự án hoặc mã nhà máy duy nhất.";
      } else if (errorStr.includes("toUpperCase")) {
          errorMsg = "Lỗi định dạng dữ liệu (String Error). Vui lòng báo cáo kỹ thuật.";
      }
      
      setMessages(prev => [...prev, { 
        id: 'err', 
        role: 'model', 
        text: errorMsg, 
        timestamp: new Date() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {!isOpen && (
        <button 
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          onClick={() => { if (!isDragging) setIsOpen(true); }}
          className={`fixed z-[999] w-12 h-12 bg-blue-600 text-white rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-90 border-2 border-white/20 group ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{ left: btnPos.x, top: btnPos.y, touchAction: 'none' }}
        >
          <Sparkles className="w-6 h-6 animate-pulse" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-sm"></div>
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:right-6 sm:bottom-6 z-[1000] bg-white/95 backdrop-blur-xl sm:w-[380px] sm:h-[580px] sm:rounded-[2rem] flex flex-col shadow-2xl border border-slate-200 animate-in slide-in-from-bottom-4 duration-300 overflow-hidden">
          <div className="bg-slate-900 p-4 flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg"><Bot className="w-5 h-5" /></div>
                <div>
                    <h3 className="font-black text-xs uppercase tracking-wider">AATN Assistant</h3>
                    <p className="text-[9px] text-blue-400 font-bold uppercase mt-0.5">Gemini 3 Flash Online</p>
                </div>
            </div>
            <div className="flex items-center gap-1">
                <button onClick={() => setMessages([messages[0]])} className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors" title="Xóa lịch sử"><Eraser className="w-4 h-4"/></button>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-red-500/20 rounded-xl text-slate-400 hover:text-red-400 transition-colors"><X className="w-5 h-5"/></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 no-scrollbar">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                {msg.role === 'model' && (
                    <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white mr-2 shrink-0 shadow-sm mt-1">
                        <Sparkles className="w-4 h-4" />
                    </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs shadow-sm ${
                    msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none font-medium'
                }`}>
                  <FormattedText text={msg.text} />
                  <div className={`text-[8px] mt-2 text-right font-black uppercase opacity-40 ${msg.role === 'user' ? 'text-white' : 'text-slate-500'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
                <div className="flex justify-start animate-pulse">
                    <div className="w-7 h-7 rounded-lg bg-slate-200 mr-2"></div>
                    <div className="bg-white px-5 py-3 rounded-2xl border border-slate-50 shadow-sm flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                        <span className="text-[10px] text-slate-400 font-black uppercase">Đang phân tích dữ liệu...</span>
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-slate-100">
            <div className="flex gap-2 items-end">
                <textarea 
                    value={input} 
                    onChange={e => setInput(e.target.value)} 
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none shadow-inner max-h-24 font-medium transition-all" 
                    placeholder="Hỏi về mã CT, mã NM, số lượng..." 
                    rows={1}
                />
                <button 
                    onClick={handleSendMessage} 
                    disabled={isLoading || !input.trim()}
                    className="p-3.5 bg-blue-600 text-white rounded-2xl shadow-xl hover:bg-blue-700 disabled:opacity-30 transition-all active:scale-90 shrink-0"
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>
            <div className="text-[9px] text-center text-slate-300 font-black uppercase tracking-[0.1em] mt-3 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3 h-3" /> Trợ lý AI có thể nhầm lẫn thông tin.
            </div>
          </div>
        </div>
      )}
    </>
  );
};

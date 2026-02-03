


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
  
  // Fixed: Removed erroneous initial `x: ` in the `btnPos` state initialization
  const [btnPos, setBtnPos] = useState({ x: window.innerWidth - 60, y: window.innerHeight - 130 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartOffset = useRef({ x: 0, y: 0 }); // Initialize dragStartOffset correctly

  const chatMessages = useRef<HTMLDivElement>(null);

  const [conversation, setConversation] = useState<Message[]>([]);

  // Correct: Wrapped the JSX with `return (...)`
  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseDown={(e) => {
          setBtnPos({ x: e.clientX, y: e.clientY });
          setIsDragging(true);
          dragStartOffset.current = { x: e.clientX - btnPos.x, y: e.clientY - btnPos.y };
        }}
        onMouseMove={(e) => {
          if (isDragging) {
            setBtnPos({ x: e.clientX - dragStartOffset.current.x, y: e.clientY - dragStartOffset.current.y });
          }
        }}
        onMouseUp={() => setIsDragging(false)}
        style={{
          position: 'fixed',
          left: `${btnPos.x}px`,
          top: `${btnPos.y}px`,
          transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.2, 0, 0, 1)',
        }}
        className="w-14 h-14 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-xl shadow-blue-500/30 active:scale-95 z-[100] border-4 border-white"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
      </button>

      {isOpen && (
        <div className="fixed bottom-0 right-0 z-[99] bg-white w-full max-w-sm md:max-w-md h-full md:h-[calc(100vh-100px)] rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-2 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 rounded-t-3xl md:rounded-t-3xl flex justify-between items-center shadow-lg">
            <div className="flex items-center gap-3">
              <Bot className="w-7 h-7 text-white" />
              <div>
                <h3 className="text-white text-lg font-bold">Gemini Assistant</h3>
                <p className="text-blue-100 text-xs font-medium">Your smart QA/QC companion</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-2 text-white hover:bg-white/20 rounded-full">
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>

          {/* Chat Area */}
          <div ref={chatMessages} className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-slate-50">
            {conversation.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Sparkles className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-center font-medium text-sm">How can I help you today?</p>
              </div>
            ) : (
              conversation.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-2xl shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-500 text-white rounded-br-none'
                        : 'bg-white text-slate-800 rounded-bl-none border border-slate-100'
                    }`}
                  >
                    <FormattedText text={msg.text} />
                    <p className="text-right text-[8px] mt-2 opacity-60">
                      {msg.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-bl-none bg-white text-slate-800 border border-slate-100 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-sm">Typing...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask me anything..."
              className="flex-1 p-3 bg-slate-100 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !input.trim()}
              className="p-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 active:scale-95 disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );

  function handleSendMessage() {
    // Gemini API Key must be obtained exclusively from the environment variable process.env.API_KEY.
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      alert("Gemini API Key is not configured. Please set process.env.API_KEY.");
      return;
    }

    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date(),
    };
    setConversation((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Concatenate existing conversation for context
    const fullConversation = conversation
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Model'}: ${msg.text}`)
      .join('\n');

    // Add relevant data to the prompt for grounding (e.g., summary of inspections)
    const inspectionSummary = inspections
      .slice(0, 5) // Limit context to recent inspections
      .map(
        (i) =>
          `Inspection ${i.id} (${i.type}): Project ${i.ma_ct}, Item ${
            i.ten_hang_muc
          }, Status ${i.status}, Score ${i.score}`
      )
      .join('; ');

    const planSummary = plans
      .slice(0, 5) // Limit context to recent plans
      .map(
        (p) =>
          `Plan ${p.ma_ct}: Item ${p.ten_hang_muc}, Qty ${p.so_luong_ipo} ${p.dvt}`
      )
      .join('; ');

    const prompt = `
      You are a helpful QA/QC assistant for a manufacturing/construction company. 
      Here's some context about the user's data:
      Recent Inspections: ${inspectionSummary || 'None'}
      Recent Production Plans: ${planSummary || 'None'}
      
      Current conversation:
      ${fullConversation}
      
      User: ${userMessage.text}
      
      Based on the context, please provide a concise and helpful response.
      `;

    const ai = new GoogleGenAI({ apiKey: apiKey });

    ai.models
      .generateContent({
        model: 'gemini-3-flash-preview', // Using a suitable model
        contents: prompt,
      })
      .then((result) => {
        const botResponseText = result.text || 'Sorry, I could not generate a response.';
        const botMessage: Message = {
          id: Date.now().toString(),
          role: 'model',
          text: botResponseText,
          timestamp: new Date(),
        };
        setConversation((prev) => [...prev, botMessage]);
      })
      .catch((error) => {
        console.error('Gemini API Error:', error);
        const errorMessage: Message = {
          id: Date.now().toString(),
          role: 'model',
          text: 'Oops! Something went wrong. Please try again.',
          timestamp: new Date(),
        };
        setConversation((prev) => [...prev, errorMessage]);
      })
      .finally(() => {
        setIsLoading(false);
        if (chatMessages.current) {
          chatMessages.current.scrollTop = chatMessages.current.scrollHeight;
        }
      });
  }
};

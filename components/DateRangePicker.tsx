import React, { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  label: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ startDate, endDate, onStartDateChange, onEndDateChange, label }) => {
  const [isOpen, setIsOpen] = useState(false);

  const displayFormat = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getDate()} thg ${date.getMonth() + 1}, ${date.getFullYear()}`;
  };

  const displayValue = () => {
    if (startDate && endDate) {
      return `${displayFormat(startDate)} - ${displayFormat(endDate)}`;
    }
    if (startDate) return `Từ ${displayFormat(startDate)}`;
    if (endDate) return `Đến ${displayFormat(endDate)}`;
    return 'Chọn ngày...';
  };

  const handleQuickSelect = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    
    onEndDateChange(end.toISOString().split('T')[0]);
    onStartDateChange(start.toISOString().split('T')[0]);
    setIsOpen(false);
  };

  return (
    <div className="space-y-1 relative col-span-2 md:col-span-1">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <div 
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 h-[42px] flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-xs font-bold text-slate-700 truncate">
          {displayValue()}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-4 animate-in fade-in slide-in-from-top-2">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleQuickSelect(0)} className="py-2 px-3 text-xs font-bold text-slate-600 bg-slate-50 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors">Hôm nay</button>
                <button onClick={() => handleQuickSelect(7)} className="py-2 px-3 text-xs font-bold text-slate-600 bg-slate-50 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors">7 ngày qua</button>
                <button onClick={() => handleQuickSelect(30)} className="py-2 px-3 text-xs font-bold text-slate-600 bg-slate-50 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors">30 ngày qua</button>
                <button onClick={() => {onStartDateChange(''); onEndDateChange(''); setIsOpen(false)}} className="py-2 px-3 text-xs font-bold text-slate-600 bg-slate-50 rounded-xl hover:bg-red-50 hover:text-red-600 transition-colors">Xóa lọc</button>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Từ ngày</label>
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => onStartDateChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Đến ngày</label>
                  <input 
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => onEndDateChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

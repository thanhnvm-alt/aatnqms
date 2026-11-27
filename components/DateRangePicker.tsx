import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onRangeChange?: (startDate: string, endDate: string) => void;
  label: string;
}

function getGmt7DateStr(daysAgo = 0): string {
  const targetMs = Date.now() - daysAgo * 86400000;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(targetMs));
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fallback below
  }
  return new Date(targetMs).toISOString().split('T')[0];
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onRangeChange,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const displayFormat = (dateStr: string) => {
    if (!dateStr) return '';
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return `${Number(match[3])} thg ${Number(match[2])}, ${match[1]}`;
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
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

  const applyRange = (nextStart: string, nextEnd: string) => {
    if (onRangeChange) {
      onRangeChange(nextStart, nextEnd);
    } else {
      onStartDateChange(nextStart);
      onEndDateChange(nextEnd);
    }
  };

  const handleQuickSelect = (days: number) => {
    const endStr = getGmt7DateStr(0);
    const startStr = getGmt7DateStr(days);
    applyRange(startStr, endStr);
    setIsOpen(false);
  };

  return (
    <div className="space-y-0.5 relative col-span-2 lg:col-span-1">
      <label className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest pl-1">{label}</label>
      <div 
        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 min-h-[44px] lg:min-h-[40px] flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-xs font-bold text-black dark:text-white truncate">
          {displayValue()}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 z-50 p-4 animate-in fade-in slide-in-from-top-2">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => handleQuickSelect(0)} className="min-h-[44px] lg:min-h-[38px] py-2.5 lg:py-2 px-3 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800/80 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Hôm nay</button>
                <button type="button" onClick={() => handleQuickSelect(7)} className="min-h-[44px] lg:min-h-[38px] py-2.5 lg:py-2 px-3 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800/80 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">7 ngày qua</button>
                <button type="button" onClick={() => handleQuickSelect(30)} className="min-h-[44px] lg:min-h-[38px] py-2.5 lg:py-2 px-3 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800/80 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">30 ngày qua</button>
                <button type="button" onClick={() => { applyRange('', ''); setIsOpen(false); }} className="min-h-[44px] lg:min-h-[38px] py-2.5 lg:py-2 px-3 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors">Xóa lọc</button>
              </div>
              <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 block">Từ ngày</label>
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => onStartDateChange(e.target.value)}
                    className="w-full px-3 py-2.5 lg:py-2 min-h-[44px] lg:min-h-[40px] bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 block">Đến ngày</label>
                  <input 
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => onEndDateChange(e.target.value)}
                    className="w-full px-3 py-2.5 lg:py-2 min-h-[44px] lg:min-h-[40px] bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all"
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


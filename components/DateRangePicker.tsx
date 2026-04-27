import React from 'react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  label: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ startDate, endDate, onStartDateChange, onEndDateChange, label }) => {
  return (
    <div className="space-y-1 col-span-2 md:col-span-1">
      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</label>
      <div className="flex bg-slate-50 border border-slate-200 rounded-lg overflow-hidden h-[38px] items-center text-sm font-medium text-slate-700">
        <input 
          type="date"
          className="w-full h-full bg-transparent px-3 py-2 outline-none font-medium"
          value={startDate}
          onChange={e => onStartDateChange(e.target.value)}
        />
        <span className="text-slate-400 px-1">-</span>
        <input 
          type="date"
          className="w-full h-full bg-transparent px-3 py-2 outline-none font-medium"
          value={endDate}
          onChange={e => onEndDateChange(e.target.value)}
        />
      </div>
    </div>
  );
};

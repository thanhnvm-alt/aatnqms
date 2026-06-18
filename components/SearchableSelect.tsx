
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, CheckSquare } from 'lucide-react';
import { removeVietnameseTones } from '../lib/utils';

interface SearchableSelectProps {
  label: string;
  values: string[];
  options: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  className?: string;
  optionLabels?: Record<string, string>;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({ 
  label, values, options, onChange, placeholder = '- TẤT CẢ -', className, optionLabels, disabled 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const getLabel = (opt: string) => optionLabels?.[opt] || opt;

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    
    const cleanSearch = removeVietnameseTones(search.toLowerCase().trim());
    const searchWords = cleanSearch.split(/\s+/).filter(Boolean);
    
    return options.filter(opt => {
      const optLower = removeVietnameseTones(opt.toLowerCase());
      const labelLower = removeVietnameseTones(getLabel(opt).toLowerCase());
      
      // Traditional exact substring match first (faster)
      if (optLower.includes(cleanSearch) || labelLower.includes(cleanSearch)) return true;
      
      // Word-by-word match (flexible order)
      if (searchWords.length > 1) {
        return searchWords.every(word => 
          optLower.includes(word) || labelLower.includes(word)
        );
      }
      
      return false;
    });
  }, [options, search, optionLabels]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (opt: string) => {
    if (disabled) return;
    if (values.includes(opt)) {
      onChange(values.filter(v => v !== opt));
    } else {
      onChange([...values, opt]);
    }
  };

  const displayValue = values.length > 0 ? (values.length === 1 ? getLabel(values[0]) : `${values.length} mục đã chọn`) : placeholder;

  return (
    <div className={`space-y-1 relative ${className} ${disabled ? 'opacity-50 pointer-events-none' : ''}`} ref={containerRef}>
      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</label>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-[12px] font-bold flex items-center justify-between transition-all h-[42px] ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800'}`}
      >
        <span className={`truncate ${values.length > 0 ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>
          {displayValue}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[1.5rem] shadow-2xl z-[100] max-h-64 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50/50">
            <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
               <input 
                 autoFocus
                 type="text"
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 placeholder="Tìm nhanh..."
                 className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100"
                 onClick={(e) => e.stopPropagation()}
               />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 no-scrollbar p-2">
            <div 
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className={`px-3 py-2.5 text-xs font-black rounded-xl cursor-pointer hover:bg-blue-50 dark:bg-slate-800/80 transition-all mb-1 uppercase tracking-tight ${values.length === 0 ? 'bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 dark:text-slate-500'}`}
            >
              - TẤT CẢ -
            </div>
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1 mx-2" />
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div 
                  key={opt}
                  onClick={(e) => { e.stopPropagation(); handleToggle(opt); }}
                  className={`px-3 py-2.5 text-xs font-black flex items-center justify-between rounded-xl cursor-pointer hover:bg-blue-50 dark:bg-slate-800/80 transition-all mb-0.5 tracking-tight ${values.includes(opt) ? 'bg-blue-50 dark:bg-slate-800/80 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 dark:text-slate-500'}`}
                >
                  <span className="truncate uppercase">{getLabel(opt)}</span>
                  {values.includes(opt) && <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Không tìm thấy</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

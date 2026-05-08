
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, ChevronDown, CheckSquare } from 'lucide-react';

interface SearchableSelectProps {
  label: string;
  values: string[];
  options: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  className?: string;
  optionLabels?: Record<string, string>;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({ 
  label, values, options, onChange, placeholder = '- TẤT CẢ -', className, optionLabels 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const getLabel = (opt: string) => optionLabels?.[opt] || opt;
  const normalize = (s: string) => s.normalize('NFC').trim();

  const filteredOptions = useMemo(() => {
    // Ensure uniqueness and normalization of input options
    const uniqueOptions = Array.from(new Set(options.map(normalize)));
    if (!search) return uniqueOptions;
    
    const searchLower = search.toLowerCase();
    return uniqueOptions.filter(opt => 
      opt.toLowerCase().includes(searchLower) || 
      getLabel(opt).toLowerCase().includes(searchLower)
    );
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
    if (values.includes(opt)) {
      onChange(values.filter(v => v !== opt));
    } else {
      onChange([...values, opt]);
    }
  };

  const displayValue = values.length > 0 ? (values.length === 1 ? getLabel(values[0]) : `${values.length} mục đã chọn`) : placeholder;

  return (
    <div className={`space-y-1 relative ${className}`} ref={containerRef}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-bold flex items-center justify-between cursor-pointer hover:bg-slate-100 transition-all h-[42px]"
      >
        <span className={`truncate ${values.length > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
          {displayValue}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-[1.5rem] shadow-2xl z-[100] max-h-64 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-3 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
               <input 
                 autoFocus
                 type="text"
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 placeholder="Tìm nhanh..."
                 className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100"
                 onClick={(e) => e.stopPropagation()}
               />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 no-scrollbar p-2">
            <div 
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className={`px-3 py-2.5 text-xs font-black rounded-xl cursor-pointer hover:bg-blue-50 transition-all mb-1 uppercase tracking-tight ${values.length === 0 ? 'bg-blue-50 text-blue-600' : 'text-slate-500'}`}
            >
              - TẤT CẢ -
            </div>
            <div className="h-px bg-slate-100 my-1 mx-2" />
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div 
                  key={opt}
                  onClick={(e) => { e.stopPropagation(); handleToggle(opt); }}
                  className={`px-3 py-2.5 text-xs font-black flex items-center justify-between rounded-xl cursor-pointer hover:bg-blue-50 transition-all mb-0.5 tracking-tight ${values.includes(opt) ? 'bg-blue-50 text-blue-600' : 'text-slate-500'}`}
                >
                  <span className="truncate uppercase">{getLabel(opt)}</span>
                  {values.includes(opt) && <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />}
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Không tìm thấy</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

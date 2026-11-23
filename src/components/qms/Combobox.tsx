import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';

export interface ComboboxOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

interface ComboboxProps<T extends string = string> {
  value: T | null;
  onChange: (value: T | null) => void;
  options: ComboboxOption<T>[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  allowClear?: boolean;
  name?: string;
  className?: string;
  ariaLabel?: string;
}

function normalizeVietnamese(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function Combobox<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Chọn...',
  searchPlaceholder = 'Tìm nhanh...',
  emptyText = 'Không tìm thấy kết quả',
  disabled = false,
  allowClear = true,
  name,
  className = '',
  ariaLabel,
}: ComboboxProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => (value !== null ? options.find((opt) => opt.value === value) || null : null),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const normQuery = normalizeVietnamese(query);
    return options.filter((opt) => {
      const normLabel = normalizeVietnamese(opt.label);
      const normVal = normalizeVietnamese(opt.value);
      return normLabel.includes(normQuery) || normVal.includes(normQuery);
    });
  }, [options, query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleToggleOpen = () => {
    if (disabled) return;
    if (!isOpen && containerRef.current && typeof window !== 'undefined') {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenUpward(spaceBelow < 280 && spaceAbove > spaceBelow);
    }
    setIsOpen((prev) => !prev);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {name && <input type="hidden" name={name} value={value ?? ''} />}
      <div className="relative flex items-center">
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel || placeholder}
          aria-expanded={isOpen}
          onClick={handleToggleOpen}
          className={`w-full min-h-[44px] lg:min-h-[38px] flex items-center justify-between gap-2 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <span
            className={`truncate ${
              selectedOption
                ? 'text-slate-900 dark:text-slate-100 font-medium'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {allowClear && value !== null && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Xóa lựa chọn"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                  setQuery('');
                }}
                className="min-w-[32px] min-h-[32px] inline-flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
              </span>
            )}
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          </span>
        </button>
      </div>

      {isOpen && (
        <div
          className={`absolute left-0 right-0 min-w-full max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-[130] overflow-hidden ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full min-h-[44px] lg:min-h-[36px] pl-8 pr-10 lg:pr-7 py-2 lg:py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] lg:min-w-[28px] lg:min-h-[28px] flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Xóa từ khóa lọc"
                >
                  <X className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                {emptyText}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        if (allowClear) onChange(null);
                      } else {
                        onChange(opt.value);
                      }
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className={`w-full min-h-[44px] lg:min-h-[36px] flex items-center justify-between gap-2 px-3 py-2.5 lg:py-2 text-sm rounded-md text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate">{opt.label}</div>
                      {opt.description && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {opt.description}
                        </div>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

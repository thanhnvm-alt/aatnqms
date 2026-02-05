
import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowUpDown, ArrowUp, ArrowDown, Filter, 
  Calendar, Hash, Type, AlignLeft, AlertCircle,
  MoreHorizontal, Download, Eye, EyeOff
} from 'lucide-react';

interface ColumnDef {
  key: string;
  label: string;
  type: string;
  visible: boolean;
  width?: string;
}

interface IpoTableProps {
  data: any[];
  isLoading: boolean;
  onRefresh: () => void;
  onRowClick?: (row: any) => void;
}

const formatColumnName = (name: string) => {
  return name
    .replace(/_/g, ' ')
    .replace(/ma /i, 'Mã ')
    .replace(/ten /i, 'Tên ')
    .replace(/ngay /i, 'Ngày ')
    .replace(/so luong/i, 'SL ')
    .replace(/\b\w/g, c => c.toUpperCase());
};

const getColumnIcon = (dataType: string) => {
  if (dataType.includes('timestamp') || dataType.includes('date')) return <Calendar className="w-3 h-3 text-slate-400" />;
  if (dataType.includes('int') || dataType.includes('numeric') || dataType.includes('float')) return <Hash className="w-3 h-3 text-slate-400" />;
  return <Type className="w-3 h-3 text-slate-400" />;
};

const formatCellData = (key: string, value: any, type: string) => {
  if (value === null || value === undefined) return <span className="text-slate-300 italic">null</span>;
  
  if (type.includes('timestamp') || type.includes('date')) {
    try {
        if (typeof value === 'number') return new Date(value * 1000).toLocaleDateString('vi-VN');
        return new Date(value).toLocaleDateString('vi-VN');
    } catch(e) { return String(value); }
  }
  
  if (key === 'status') {
      const colors: any = {
          'COMPLETED': 'bg-green-100 text-green-700 border-green-200',
          'PENDING': 'bg-orange-50 text-orange-700 border-orange-200',
          'FLAGGED': 'bg-red-50 text-red-700 border-red-200',
          'IN_PROGRESS': 'bg-blue-50 text-blue-700 border-blue-200'
      };
      return (
          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${colors[value] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {String(value)}
          </span>
      );
  }

  return String(value);
};

export const IpoTable: React.FC<IpoTableProps> = ({ data, isLoading, onRefresh, onRowClick }) => {
  const [schema, setSchema] = useState<any[]>([]);
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch Schema
  useEffect(() => {
    const fetchSchema = async () => {
      try {
        const res = await fetch('/api/ipos/schema');
        
        // Handle non-JSON responses (like 404 HTML from Vite dev server)
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            console.warn("Schema endpoint returned non-JSON:", contentType);
            // Fallback columns if schema fails
            const fallbackCols = [
                { key: 'ma_ct', label: 'Mã CT', type: 'text', visible: true },
                { key: 'ten_hang_muc', label: 'Tên Hạng Mục', type: 'text', visible: true },
                { key: 'so_luong_ipo', label: 'SL IPO', type: 'number', visible: true },
                { key: 'ma_nha_may', label: 'Mã NM', type: 'text', visible: true },
                { key: 'status', label: 'Trạng Thái', type: 'text', visible: true },
            ];
            setColumns(fallbackCols);
            return;
        }

        const json = await res.json();
        if (json.success && json.data && Array.isArray(json.data) && json.data.length > 0) {
          setSchema(json.data);
          
          // Initial Columns Configuration
          const hiddenCols = ['created_at', 'updated_at', 'id', 'data']; // Default hidden
          const cols: ColumnDef[] = json.data.map((col: any) => ({
            key: col.column_name,
            label: formatColumnName(col.column_name),
            type: col.data_type,
            visible: !hiddenCols.includes(col.column_name)
          }));
          setColumns(cols);
        } else {
             // Fallback if data is empty
             const fallbackCols = [
                { key: 'ma_ct', label: 'Mã CT', type: 'text', visible: true },
                { key: 'ten_hang_muc', label: 'Tên Hạng Mục', type: 'text', visible: true },
                { key: 'so_luong_ipo', label: 'SL IPO', type: 'number', visible: true },
                { key: 'ma_nha_may', label: 'Mã NM', type: 'text', visible: true },
                { key: 'status', label: 'Trạng Thái', type: 'text', visible: true },
            ];
            setColumns(fallbackCols);
        }
      } catch (e: any) {
        console.error("Failed to load schema", e);
        setError("Không thể tải cấu trúc bảng");
        // Fallback
        const fallbackCols = [
            { key: 'ma_ct', label: 'Mã CT', type: 'text', visible: true },
            { key: 'ten_hang_muc', label: 'Tên Hạng Mục', type: 'text', visible: true },
            { key: 'so_luong_ipo', label: 'SL IPO', type: 'number', visible: true },
            { key: 'status', label: 'Trạng Thái', type: 'text', visible: true },
        ];
        setColumns(fallbackCols);
      }
    };
    fetchSchema();
  }, []);

  // 2. Sort Logic
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = useMemo(() => {
    if (!sortConfig) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig]);

  const toggleColumn = (key: string) => {
      setColumns(prev => prev.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  };

  const visibleColumns = columns.filter(c => c.visible);

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-2">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                <AlignLeft className="w-4 h-4 text-blue-600" /> 
                Dữ liệu bảng
            </h3>
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold rounded-full">
                {data.length} records
            </span>
            {error && <span className="text-[9px] text-red-500 font-bold ml-2">{error} (Using fallback)</span>}
        </div>
        
        <div className="flex items-center gap-2 relative">
            <button 
                onClick={() => setColumnMenuOpen(!columnMenuOpen)}
                className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-blue-600 transition-all border border-transparent hover:border-slate-200 shadow-sm"
                title="Cấu hình cột"
            >
                <MoreHorizontal className="w-4 h-4" />
            </button>
            
            {columnMenuOpen && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-2 animate-in fade-in zoom-in-95 duration-200">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 py-1 mb-1">Hiển thị cột</h4>
                    <div className="max-h-60 overflow-y-auto space-y-0.5 no-scrollbar">
                        {columns.map(col => (
                            <button 
                                key={col.key}
                                onClick={() => toggleColumn(col.key)}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${col.visible ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
                            >
                                <span>{col.label}</span>
                                {col.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-slate-300" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* Dynamic Table */}
      <div className="flex-1 overflow-auto relative">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              {visibleColumns.map((col) => (
                <th 
                    key={col.key}
                    className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none whitespace-nowrap group"
                    onClick={() => handleSort(col.key)}
                >
                    <div className="flex items-center gap-1.5">
                        {getColumnIcon(col.type)}
                        <span>{col.label}</span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            {sortConfig?.key === col.key ? (
                                sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />
                            ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-300" />
                            )}
                        </div>
                    </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                        {visibleColumns.map((c, j) => (
                            <td key={j} className="px-4 py-4"><div className="h-4 bg-slate-100 rounded w-2/3 animate-pulse"></div></td>
                        ))}
                    </tr>
                ))
            ) : sortedData.length === 0 ? (
                <tr>
                    <td colSpan={visibleColumns.length} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-300">
                            <AlertCircle className="w-10 h-10 mb-2 opacity-20" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Không có dữ liệu hiển thị</p>
                        </div>
                    </td>
                </tr>
            ) : (
                sortedData.map((row, idx) => (
                    <tr 
                        key={idx} 
                        onClick={() => onRowClick && onRowClick(row)}
                        className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                    >
                        {visibleColumns.map((col) => (
                            <td key={`${idx}-${col.key}`} className="px-4 py-3 text-[11px] font-medium text-slate-700 border-r border-transparent group-hover:border-slate-100 last:border-0 whitespace-nowrap max-w-xs truncate">
                                {formatCellData(col.key, row[col.key], col.type)}
                            </td>
                        ))}
                    </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

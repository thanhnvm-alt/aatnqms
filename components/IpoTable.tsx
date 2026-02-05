
import React, { useState, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  SortingState,
  ColumnDef,
} from '@tanstack/react-table';
import { 
  ArrowUpDown, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  Calendar,
  Hash,
  Type,
  AlertCircle,
  EyeOff
} from 'lucide-react';
import { format } from 'date-fns';

interface ColumnSchema {
  column_name: string;
  data_type: string;
  is_nullable: string;
  ordinal_position: number;
}

interface IpoTableProps {
  data: any[];
  schema: ColumnSchema[];
  isLoading: boolean;
}

const formatHeader = (key: string) => {
  return key
    .replace(/_/g, ' ')
    .replace(/ma /i, 'Mã ')
    .replace(/ten /i, 'Tên ')
    .replace(/ngay /i, 'Ngày ')
    .replace(/so luong/i, 'SL ')
    .replace(/\b\w/g, c => c.toUpperCase());
};

const formatCellValue = (value: any, type: string) => {
  if (value === null || value === undefined) return <span className="text-slate-300">-</span>;

  // Timestamps / Dates
  if (type.includes('timestamp') || type.includes('date')) {
    try {
      const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
      if (isNaN(date.getTime())) return String(value);
      return <span className="font-mono text-slate-600">{format(date, 'dd/MM/yyyy')}</span>;
    } catch { return String(value); }
  }

  // Numbers
  if (type.includes('int') || type.includes('numeric') || type.includes('float') || type.includes('double')) {
    return <span className="font-mono font-bold text-blue-600">{Number(value).toLocaleString('vi-VN')}</span>;
  }

  // Status Badge Logic (Heuristic based on column name or value)
  if (String(value).match(/^(PENDING|APPROVED|REJECTED|COMPLETED|FLAGGED|OPEN|CLOSED)$/i)) {
    const status = String(value).toUpperCase();
    const colors: Record<string, string> = {
      'COMPLETED': 'bg-green-100 text-green-700 border-green-200',
      'APPROVED': 'bg-green-100 text-green-700 border-green-200',
      'PENDING': 'bg-orange-50 text-orange-700 border-orange-200',
      'FLAGGED': 'bg-red-50 text-red-700 border-red-200',
      'REJECTED': 'bg-red-50 text-red-700 border-red-200',
      'IN_PROGRESS': 'bg-blue-50 text-blue-700 border-blue-200',
      'OPEN': 'bg-slate-100 text-slate-700 border-slate-200'
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${colors[status] || 'bg-slate-50 text-slate-600'}`}>
        {status}
      </span>
    );
  }

  // Default Text
  return <span className="text-slate-700 font-medium truncate block max-w-[200px]" title={String(value)}>{String(value)}</span>;
};

const getColumnIcon = (type: string) => {
  if (type.includes('timestamp') || type.includes('date')) return <Calendar className="w-3 h-3 text-slate-400" />;
  if (type.includes('int') || type.includes('numeric')) return <Hash className="w-3 h-3 text-slate-400" />;
  return <Type className="w-3 h-3 text-slate-400" />;
};

export const IpoTable: React.FC<IpoTableProps> = ({ data, schema, isLoading }) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  // 1. Dynamic Column Definition
  const columns = useMemo<ColumnDef<any>[]>(() => {
    if (!schema || schema.length === 0) return [];

    // Filter out technical columns if needed, or keep all
    const visibleSchema = schema.filter(col => !['data', 'vector'].includes(col.column_name));

    return visibleSchema.map((col) => ({
      accessorKey: col.column_name,
      header: ({ column }) => {
        return (
          <div 
            className="flex items-center gap-1.5 cursor-pointer select-none group"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            {getColumnIcon(col.data_type)}
            <span className="uppercase tracking-wider text-[10px] font-black text-slate-500 group-hover:text-blue-600 transition-colors">
              {formatHeader(col.column_name)}
            </span>
            <ArrowUpDown className={`w-3 h-3 transition-colors ${column.getIsSorted() ? 'text-blue-600' : 'text-slate-300 group-hover:text-slate-400'}`} />
          </div>
        );
      },
      cell: ({ getValue }) => formatCellValue(getValue(), col.data_type),
      enableSorting: true,
      enableGlobalFilter: true, // Allow searching this column
    }));
  }, [schema]);

  // 2. TanStack Table Instance
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
        pagination: {
            pageSize: 50,
        }
    }
  });

  if (isLoading && schema.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-3"></div>
              <p className="text-xs font-bold uppercase tracking-widest">Detecting Schema...</p>
          </div>
      );
  }

  if (schema.length === 0 && !isLoading) {
      return (
          <div className="flex flex-col items-center justify-center h-64 text-red-400 bg-red-50 rounded-2xl border border-red-100">
              <AlertCircle className="w-10 h-10 mb-2" />
              <p className="text-xs font-bold uppercase tracking-widest">Không thể tải cấu trúc bảng</p>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Search Bar integrated into Table Component */}
      <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Hiển thị {table.getRowModel().rows.length} / {data.length} bản ghi
          </div>
          <div className="flex items-center gap-2">
             <input 
                value={globalFilter ?? ''}
                onChange={e => setGlobalFilter(e.target.value)}
                placeholder="Lọc nhanh dữ liệu bảng..."
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-100 w-64 transition-all"
             />
          </div>
      </div>

      <div className="flex-1 overflow-auto relative">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th key={header.id} className="px-4 py-3 border-b border-slate-200 whitespace-nowrap bg-slate-50">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {table.getRowModel().rows.length === 0 ? (
                <tr>
                    <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center gap-2">
                            <EyeOff className="w-8 h-8 opacity-20" />
                            <span className="text-xs font-bold uppercase tracking-widest">Không có dữ liệu</span>
                        </div>
                    </td>
                </tr>
            ) : (
                table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-blue-50/30 transition-colors group">
                    {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-2.5 text-[11px] border-r border-transparent group-hover:border-slate-100 last:border-0">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                    ))}
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="p-3 border-t border-slate-100 bg-white flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Trang</span>
            <span className="font-mono text-xs font-bold text-slate-800">
                {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
        </div>
        <div className="flex items-center gap-1">
            <button
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
            >
                <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
            >
                <ChevronLeft className="w-4 h-4" />
            </button>
            <button
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
            >
                <ChevronRight className="w-4 h-4" />
            </button>
            <button
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
            >
                <ChevronsRight className="w-4 h-4" />
            </button>
        </div>
      </div>
    </div>
  );
};

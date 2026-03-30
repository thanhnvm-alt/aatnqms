import React from 'react';
import { IPOItem } from '../types';
import { ArrowLeft, FileText, Package, Ruler, Info } from 'lucide-react';

interface IPODetailProps {
  item: IPOItem;
  onBack: () => void;
  onCreateInspection: () => void;
  onViewInspection: () => void;
  onUpdatePlan: (item: Partial<IPOItem>) => Promise<void>;
}

export const IPODetail: React.FC<IPODetailProps> = ({ item, onBack }) => {
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-4 border-b border-slate-200 flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h2 className="text-lg font-black text-slate-800 uppercase">IPO DETAIL: {item.ma_nha_may}</h2>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Mã Dự Án</p>
            <p className="font-black text-slate-800">{item.ma_ct}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Tên Công Trình</p>
            <p className="font-black text-slate-800">{item.ten_ct}</p>
          </div>
          <div className="col-span-2 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Tên Hạng Mục</p>
            <p className="font-black text-slate-800">{item.ten_hang_muc}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Số Lượng IPO</p>
            <p className="font-black text-slate-800">{item.so_luong_ipo} {item.dvt}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

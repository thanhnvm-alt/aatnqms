import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, BookOpen, Clock, ShieldCheck, CheckCircle2, FileText, Users, AlertTriangle } from 'lucide-react';

interface SubcontractorSlideGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SubcontractorSlideGuideModal({ isOpen, onClose }: SubcontractorSlideGuideModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  if (!isOpen) return null;

  const slides = [
    {
      title: "Tổng quan: Lịch nghiệm thu GCN",
      subtitle: "Hệ thống quản lý lịch nghiệm thu gia công ngoài và nhà thầu phụ",
      icon: BookOpen,
      color: "bg-blue-600",
      content: (
        <div className="space-y-4 text-slate-700 dark:text-slate-300">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-4 rounded-xl">
            <h4 className="font-bold text-blue-900 dark:text-blue-300 text-base mb-1">Mục đích module</h4>
            <p className="text-sm">Quản lý toàn bộ tiến độ, đặt lịch kiểm tra và nghiệm thu chất lượng sản phẩm gia công vệ tinh / nhà thầu phụ theo tiêu chuẩn ISO của AA Corporation.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <h5 className="font-bold text-slate-900 dark:text-slate-100 text-sm mb-1">Đối tượng sử dụng</h5>
              <ul className="text-xs space-y-1 list-disc list-inside text-slate-600 dark:text-slate-400">
                <li>Nhà thầu phụ / Xưởng gia công</li>
                <li>Đội ngũ QC thẩm định</li>
                <li>Quản lý QA/QC & Quản đốc</li>
              </ul>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <h5 className="font-bold text-slate-900 dark:text-slate-100 text-sm mb-1">Giá trị cốt lõi</h5>
              <ul className="text-xs space-y-1 list-disc list-inside text-slate-600 dark:text-slate-400">
                <li>Truy xuất nguồn gốc ISO 100%</li>
                <li>Kiểm soát thời gian biểu nghiêm ngặt</li>
                <li>Giảm thiểu tối đa lỗi sản xuất</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Quy định cốt lõi: Đặt lịch trước 24h & Mốc 15:00",
      subtitle: "Quy chế thời gian biểu tự động tuân thủ giờ Việt Nam (ICT, UTC+7)",
      icon: Clock,
      color: "bg-amber-600",
      content: (
        <div className="space-y-4 text-slate-700 dark:text-slate-300">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-amber-900 dark:text-amber-300 text-sm mb-1">Quy tắc 24 tiếng & Mốc 15:00</h4>
              <p className="text-xs leading-relaxed">Hệ thống tự động kiểm tra thời gian đặt lịch dựa trên mốc 15:00 hàng ngày.</p>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="font-bold text-emerald-600 dark:text-emerald-400">Trường hợp 1 (Trước 15:00):</span> 
              <p className="mt-0.5 text-slate-600 dark:text-slate-400">Được phép đặt lịch nghiệm thu sớm nhất từ <strong>ngày mai</strong> trở đi.</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="font-bold text-rose-600 dark:text-rose-400">Trường hợp 2 (Sau 15:00):</span> 
              <p className="mt-0.5 text-slate-600 dark:text-slate-400">Đã quá giờ nhận lịch trong ngày. Ngày nghiệm thu bắt buộc phải chọn từ <strong>ngày mốt</strong> trở đi (không được chọn ngày mai).</p>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Hướng dẫn lập phiếu đặt lịch",
      subtitle: "Các bước thao tác chi tiết để tạo mới lịch nghiệm thu",
      icon: FileText,
      color: "bg-emerald-600",
      content: (
        <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
          <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">1</div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-slate-100">Chọn Dự án & Mã Factory Order (IPO)</h5>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">Hệ thống liên kết trực tiếp với dữ liệu IPO read-only để đồng bộ thông tin vật tư và mã tender.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">2</div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-slate-100">Điền thông tin hạng mục & Ngày yêu cầu</h5>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">Xác định số lượng, xưởng gia công, nhà thầu phụ và chọn ngày theo quy định 24h.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">3</div>
            <div>
              <h5 className="font-bold text-slate-900 dark:text-slate-100">Gửi yêu cầu & Chờ phân công</h5>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">Phiếu chuyển sang trạng thái chờ xử lý để Quản lý QC phân công nhân sự kiểm tra.</p>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Phân quyền & Phân công QC kiểm tra",
      subtitle: "Quy trình điều phối nhân sự thẩm định chất lượng",
      icon: Users,
      color: "bg-purple-600",
      content: (
        <div className="space-y-4 text-xs text-slate-700 dark:text-slate-300">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
              <h5 className="font-bold text-purple-900 dark:text-purple-300 mb-1">Quản lý / Trưởng nhóm QC</h5>
              <p className="text-slate-600 dark:text-slate-400">Nhận danh sách lịch hẹn, kiểm tra lịch trống và phân công chuyên viên QC phụ trách trực tiếp.</p>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
              <h5 className="font-bold text-purple-900 dark:text-purple-300 mb-1">Chuyên viên QC</h5>
              <p className="text-slate-600 dark:text-slate-400">Thực hiện nghiệm thu thực tế tại xưởng, nhập kết quả đạt/lỗi và đính kèm biên bản/hình ảnh.</p>
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="font-bold text-slate-900 dark:text-slate-100">Nguyên tắc phân quyền:</span> Đảm bảo tuân thủ Ma trận phân quyền RBAC, chống xung đột quyền hạn và ghi log Audit Trail đầy đủ.
          </div>
        </div>
      )
    },
    {
      title: "Theo dõi trạng thái & Vòng đời phiếu",
      subtitle: "Các mốc trạng thái chuẩn theo ISO QMS State Machine",
      icon: ShieldCheck,
      color: "bg-indigo-600",
      content: (
        <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200">
              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded text-[10px]">PENDING</span>
              <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">Chờ tiếp nhận lịch hẹn</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200">
              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded text-[10px]">ASSIGNED</span>
              <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">Đã phân công QC</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200">
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">APPROVED</span>
              <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">Nghiệm thu đạt chuẩn</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200">
              <span className="px-2 py-0.5 bg-slate-200 text-slate-800 font-bold rounded text-[10px]">LOCKED</span>
              <p className="mt-1 font-bold text-slate-900 dark:text-slate-100">Khóa vĩnh viễn (Immutable)</p>
            </div>
          </div>
          <p className="text-slate-500 dark:text-slate-400 italic text-center mt-2">Mọi biến động dữ liệu đều được lưu vết vĩnh viễn trên hệ thống Audit Log.</p>
        </div>
      )
    }
  ];

  const slide = slides[currentSlide];
  const IconComponent = slide.icon;

  const modalNode = (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)]">
        
        {/* Header */}
        <div className={`${slide.color} px-4 py-2.5 sm:py-3 text-white flex items-center justify-between gap-2 transition-colors duration-300 shrink-0`}>
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <IconComponent className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-black tracking-widest bg-white/20 px-2 py-0.5 rounded inline-block">
                Slide {currentSlide + 1} / {slides.length}
              </span>
              <h3 className="text-sm sm:text-base font-bold mt-0.5 truncate">{slide.title}</h3>
            </div>
          </div>
          <button 
            onClick={onClose}
            aria-label="Đóng"
            className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1 -mr-1.5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subtitle / Progress */}
        <div className="bg-slate-100 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 shrink-0">
          <span>{slide.subtitle}</span>
          <div className="flex items-center gap-1">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                aria-label={`Slide ${idx + 1}`}
                className="min-w-[28px] min-h-[28px] flex items-center justify-center"
              >
                <span className={`block h-2 rounded-full transition-all ${idx === currentSlide ? 'w-6 bg-blue-600' : 'w-2 bg-slate-300 dark:bg-slate-600'}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Slide Content Body */}
        <div className="p-3.5 sm:p-5 flex-1 min-h-0 overflow-y-auto">
          {slide.content}
        </div>

        {/* Footer controls */}
        <div className="px-4 py-2 sm:py-2.5 bg-slate-50/80 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={() => setCurrentSlide((prev) => Math.max(0, prev - 1))}
            disabled={currentSlide === 0}
            className="min-h-[44px] sm:min-h-[36px] px-3.5 sm:px-4 py-2 sm:py-1.5 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center whitespace-nowrap shrink-0 transition-all"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Trước
          </button>

          <span className="text-xs font-bold text-slate-500">
            {currentSlide + 1} của {slides.length}
          </span>

          <button
            onClick={() => {
              if (currentSlide < slides.length - 1) {
                setCurrentSlide(prev => prev + 1);
              } else {
                onClose();
              }
            }}
            className="min-h-[44px] sm:min-h-[36px] px-4 sm:px-5 py-2 sm:py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-md shadow-blue-600/30 flex items-center whitespace-nowrap shrink-0 transition-all"
          >
            {currentSlide === slides.length - 1 ? 'Hoàn thành' : 'Tiếp theo'} <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
}

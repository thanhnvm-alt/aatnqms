# Implementation Plan - Tutorial Slides for "Lịch nghiệm thu GCN" Module

## User Requirements
1. **In-app presentation slides**: Create an interactive tutorial slide viewer integrated directly inside the app for the "Lịch nghiệm thu GCN" module.
2. **Emphasized content**:
   - Booking process & 24-hour cutoff rule before 15:00 VN time.
   - Step-by-step booking creation and status tracking.
   - Role-based permissions and QC assignment workflow.

## Proposed Components & Changes

### 1. New Component: `SubcontractorSlideGuideModal.tsx`
- Interactive slideshow with 5 professional structured slides:
  - **Slide 1**: Giới thiệu module "Lịch nghiệm thu GCN" & Mục đích QA/QC.
  - **Slide 2**: Quy định cốt lõi - Đặt lịch trước 24h và Quy tắc mốc 15:00 (ICT).
  - **Slide 3**: Hướng dẫn thao tác lập phiếu & Chọn thông tin dự án/nhà máy.
  - **Slide 4**: Phân quyền hệ thống & Phân công QC thẩm định.
  - **Slide 5**: Vòng đời trạng thái phiếu & Báo cáo biên bản.
- Controls: Previous, Next, Slide Indicator Dots, Close, Print/Export option.

### 2. Integration in `SubcontractorBookingManagement.tsx`
- Add a prominent "📖 Hướng dẫn sử dụng (Slide)" button in the module header so users can launch the tutorial slides anytime.

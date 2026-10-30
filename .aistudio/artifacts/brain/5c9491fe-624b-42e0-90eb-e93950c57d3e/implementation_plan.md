# Sequential Multi-File PDF Upload with Progress Tracking

Enhance the PDF document upload component in `SubcontractorBookingManagement` to support multi-file selection, sequential queue processing (1 by 1), itemized & overall percentage progress bars, and individual file error recovery.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following design choices were confirmed in Phase 1:

- **Upload Flow**: The "Tải PDF" button or drag-and-drop input allows selecting multiple `.pdf` files. Selected files are placed in an active queue and uploaded sequentially from file #1 to the end.
- **Progress UI**: Displays an overall progress bar (e.g. `Đang tải 2/4 file · 50%`) at the top of the PDF section, along with individual percentage indicators and progress bars on each document card (`1. Spec Vật Tư`, `2. Mẫu Duyệt`, `3. Bản Vẽ Thi Công`, `4. Biên Bản MoU`).
- **Error Handling**: If a file upload fails, it is marked with an error state, a "Tải lại" (Retry) button appears for that item, and the queue automatically proceeds to upload the next files in line.

---

## 1. Overview & Core Concept

Currently, users upload PDF technical documents one by one via single-file inputs (`materialSpecUrl`, `approvedSampleUrl`, `shopdrawingUrl`, `qualityAgreementUrl`). 

This update introduces:
1. **Multi-File Queue Engine**: Accepts multiple PDF files selected at once or mapped across the 4 standard document categories (`materialSpecUrl`, `approvedSampleUrl`, `shopdrawingUrl`, `qualityAgreementUrl`).
2. **Sequential Upload Loop**: Processes files asynchronously in strict order (File 1 → File 2 → File 3 → File 4), calculating real-time progress for each active item and overall completion percentage.
3. **Resilient UI State**: Shows visual upload states (`PENDING`, `UPLOADING`, `COMPLETED`, `ERROR`) on each document slot with animated percentage progress bars and inline Retry controls.

---

## 2. User Experience & Visual Design

### Key User Flow

1. **File Selection**: User clicks "Tải PDF" on any slot or uses a "Tải Hàng Loạt / Chọn Nhiều File PDF" button. A file picker opens allowing selection of multiple `.pdf` files simultaneously.
2. **Sequential Processing**: 
   - Overall progress header appears above the 4 document slots: `Đang tải hồ sơ kỹ thuật (2/4) - 50% [==========>          ]`.
   - Slot 1 shows `Đã hoàn tất (100%)` with green checkmark.
   - Slot 2 shows active progress bar `75%` with blue spinning indicator.
   - Slot 3 and 4 show `Đang chờ...`.
3. **Error Recovery**: If Slot 3 fails due to network drop:
   - Slot 3 displays `⚠️ Lỗi tải file` and a red `[Tải lại]` button.
   - Queue continues to upload Slot 4 without freezing the entire process.
4. **Completion State**: When all files complete, the overall progress bar transforms into a success banner: `✓ Đã tải hoàn tất 4/4 hồ sơ PDF`.

---

## 3. Technical Architecture & Data Strategy

### Upload Queue State Structure

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Upload Queue Manager                            │
│                                                                        │
│  Selected Files Queue: [ File 1, File 2, File 3, File 4 ]              │
│  State per Key: {                                                      │
│    status: 'IDLE' | 'QUEUED' | 'UPLOADING' | 'SUCCESS' | 'ERROR',      │
│    progress: 0..100,                                                   │
│    fileUrl?: string,                                                   │
│    errorMsg?: string                                                   │
│  }                                                                     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Sequential Loop (async/await)                      │
│                                                                        │
│  for (const item of queue) {                                           │
│    updateState(item, 'UPLOADING', progress);                           │
│    try {                                                               │
│      const url = await uploadFileToStorage(file, name, onProgress);    │
│      updateState(item, 'SUCCESS', 100, url);                           │
│    } catch (err) {                                                     │
│      updateState(item, 'ERROR', 0, null, err);                         │
│    }                                                                   │
│  }                                                                     │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Component State Additions in `SubcontractorBookingManagement.tsx`

1. **Queue Tracking State**:
   ```typescript
   interface DocUploadItemState {
     docKey: 'materialSpecUrl' | 'approvedSampleUrl' | 'shopdrawingUrl' | 'qualityAgreementUrl';
     label: string;
     file: File;
     status: 'QUEUED' | 'UPLOADING' | 'SUCCESS' | 'ERROR';
     progress: number; // 0 to 100
     errorMsg?: string;
   }
   ```
2. **Overall Progress Indicator Component**:
   - Renders top banner with overall percentage: `Math.round((completedCount / totalCount) * 100)`.
   - Individual progress bars per document card with color-coded status badges (Green = Success, Blue = Uploading %, Red = Error with Retry button, Slate = Pending/Idle).

---

## 4. Execution Plan

1. **Refactor Storage Upload Handler**: Enhance `uploadFileToStorage` or create progress-aware upload helper in `apiService.ts` / local component to report chunk/XHR progress callback if supported, or simulated smooth progress curve during fetch.
2. **Implement Sequential Queue Runner**: Create a robust `processBatchPdfUpload` function in `SubcontractorBookingManagement.tsx` that iterates through queued items sequentially, updating document URLs in state upon success and logging errors per item without throwing unhandled exceptions.
3. **Upgrade PDF UI Cards**: Update the 4 PDF upload slots in both Create and Edit modals with multi-file input triggers, progress bars, percentage readouts, and individual retry buttons.
4. **Build & Verify**: Compile applet and test with multi-file uploads.

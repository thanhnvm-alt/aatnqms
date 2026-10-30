# Scanning & Mapping Historical SQC Inspection Reports on Supplier Map

Scanning all completed SQC inspection reports (`SQC_BTP`, `SQC_TP`, `SQC_VT`) in the system to automatically generate and display historical inspection locations on the **Supplier Map** (`Bản Đồ Nhà Cung Cấp`), with color-coded PO result badges (PASS / REJECT / CONDITIONAL_PASS) and direct report detail view popups.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following design choices were confirmed by the user in clarification turns:

1. **Data Scanning Sources**:
   - Scans **all completed SQC inspection reports** across the system, including `SQC_BTP`, `SQC_TP`, and `SQC_VT` inspection records in addition to subcontractor booking records.
2. **Display & Visual Design**:
   - Displays workshop location, list of inspected POs grouped by supplier, with **color-coded result status badges** for each PO:
     - 🟢 **PASS**: Green / Emerald badge (`ĐẠT`)
     - 🔴 **REJECT**: Red badge (`KHÔNG ĐẠT`)
     - 🟡 **CONDITIONAL PASS**: Amber / Orange badge (`ĐẠT CÓ ĐIỀU KIỆN`)
3. **Interactive Report Detail Popups**:
   - Clicking a PO or report in the map view opens a detail modal displaying the full SQC inspection report (items checked, defect summary, inspector signatures, photos).

---

## 1. Overview & Core Concept

Currently, the Supplier Map aggregates locations from Subcontractor Bookings. To provide a complete historical quality audit map, the system will also fetch all general SQC inspection reports from the `inspections` database (`fetchInspections({ loai_phieu: ['SQC_BTP', 'SQC_TP', 'SQC_VT'] })`), extract supplier names, workshop addresses, PO numbers, inspection dates, and inspection outcomes, and merge them into the Supplier Map locations dataset.

---

## 2. Technical Architecture & Component Updates

### Data Fetching & State Integration (`components/SubcontractorBookingManagement.tsx`)

1. **Fetch Historical SQC Reports**:
   - In `loadData()`, call `fetchInspections()` to load completed SQC inspection reports (`SQC_BTP`, `SQC_TP`, `SQC_VT`).
   - Store reports in state `sqcInspections: Inspection[]`.

2. **Merged Supplier Map Aggregation**:
   - Merge locations from both `bookings` and `sqcInspections`.
   - For each supplier location, build a combined list of POs inspected with their result statuses (`PASS`, `REJECT`, `CONDITIONAL_PASS`).
   - Categorize location type:
     - 🔵 **Vị Trí Đặt Lịch**: Locations with pending/assigned bookings.
     - 🟢 **Vị Trí Báo Cáo QC**: Locations with completed SQC inspection reports.
     - 🟣 **Cả 2 Lượt Book & QC**: Locations with both bookings and historical SQC reports.

3. **UI Enhancements on Supplier Map (`SUPPLIER_MAP` Tab)**:
   - **PO Badges with Result Colors**:
     - 🟢 `PO-123 (PASS)`
     - 🔴 `PO-456 (REJECT)`
     - 🟡 `PO-789 (CONDITIONAL PASS)`
   - **Clickable Inspection Detail Popup**:
     - Clicking any SQC report opens the inspection report detail modal (`selectedSqcInspection`) showing defect photos, items status, and signatures.

---

## 3. Verification & Compliance

- Ensure strict adherence to **AGENTS.md** policies (Read-only `ipo` and `material` tables).
- Run `lint_applet` (`tsc --noEmit`) to verify zero TypeScript errors.
- Run `compile_applet` to confirm successful build.

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Inspection } from '../../types';
import { fetchInspectionsDates, fetchInspectionsProjects, fetchInspections } from '../../services/apiService';
import { getGmt7DayBounds, getGmt7MonthBounds } from '../../lib/utils';

// [Update - Danh Sách Phiếu] - [v3.1.0] - Bổ sung quản lý lỗi, làm sạch query params và reset danh sách dự án theo luồng 4 cột
interface InspectionContextType {
  inspections: Inspection[];
  setInspections: (items: Inspection[]) => void;
  isDatesLoading: boolean;
  isProjectsLoading: boolean;
  isInspectionsLoading: boolean;
  datesError: string | null;
  projectsError: string | null;
  dates: any[];
  projects: any[];
  setProjects: (items: any[]) => void;
  loadDates: (filters: any) => Promise<void>;
  loadProjects: (filters: any, selectedDateDesktop?: string | null, selectedMonthDesktop?: {year: number, month: number} | null) => Promise<void>;
  loadInspections: (filters: any, page?: number) => Promise<void>;
}

const InspectionContext = createContext<InspectionContextType | undefined>(undefined);

function cleanFilterParams(filters: any = {}): Record<string, string> {
  const cleaned: Record<string, string> = {};
  Object.entries(filters || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      cleaned[k] = String(v);
    }
  });
  return cleaned;
}

export const InspectionProvider: React.FC<{ children: ReactNode; autoInit?: boolean }> = ({ children, autoInit = false }) => {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [dates, setDates] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isDatesLoading, setIsDatesLoading] = useState(false);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [isInspectionsLoading, setIsInspectionsLoading] = useState(false);
  const [datesError, setDatesError] = useState<string | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const loadDates = useCallback(async (filters: any) => {
    setIsDatesLoading(true);
    setDatesError(null);
    try {
      const res = await fetchInspectionsDates(cleanFilterParams(filters));
      setDates(Array.isArray(res) ? res : []);
    } catch (e: any) {
      console.error(e);
      setDatesError(e?.message || 'Không thể tải danh sách ngày');
    } finally {
      setIsDatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoInit && !isInitialized) {
      loadDates({}).then(() => setIsInitialized(true));
    }
  }, [autoInit, isInitialized, loadDates]);

  const loadProjects = useCallback(async (filters: any, selectedDateDesktop?: string | null, selectedMonthDesktop?: {year: number, month: number} | null) => {
    setIsProjectsLoading(true);
    setProjectsError(null);
    try {
      const args = cleanFilterParams(filters);
      if (selectedDateDesktop && selectedDateDesktop !== 'ALL') {
        const bounds = getGmt7DayBounds(selectedDateDesktop);
        args.unixStart = String(bounds.unixStart);
        args.unixEnd = String(bounds.unixEnd);
      } else if (selectedMonthDesktop && selectedDateDesktop !== 'ALL') {
        const { year, month } = selectedMonthDesktop;
        const bounds = getGmt7MonthBounds(year, month);
        args.unixStart = String(bounds.unixStart);
        args.unixEnd = String(bounds.unixEnd);
      }

      const res = await fetchInspectionsProjects(args);
      const list = Array.isArray(res) ? res : [];
      setProjects(list.sort((a, b) => (a.ten_ct || a.ma_ct || '').localeCompare(b.ten_ct || b.ma_ct || '')));
    } catch (e: any) {
      console.error(e);
      setProjects([]);
      setProjectsError(e?.message || 'Không thể tải danh sách dự án');
    } finally {
      setIsProjectsLoading(false);
    }
  }, []);

  const loadInspections = useCallback(async (filters: any, page: number = 1) => {
    setIsInspectionsLoading(true);
    try {
      const result = await fetchInspections(cleanFilterParams(filters), page, 50);
      setInspections(result.items || []);
    } catch (e) {
      console.error("Load inspections failed", e);
    } finally {
      setIsInspectionsLoading(false);
    }
  }, []);

  return (
    <InspectionContext.Provider value={{
      inspections,
      setInspections,
      isDatesLoading,
      isProjectsLoading,
      isInspectionsLoading,
      datesError,
      projectsError,
      dates,
      projects,
      setProjects,
      loadDates,
      loadProjects,
      loadInspections
    }}>
      {children}
    </InspectionContext.Provider>
  );
};

export const useInspectionContext = () => {
  const context = useContext(InspectionContext);
  if (!context) throw new Error('useInspectionContext must be used within InspectionProvider');
  return context;
};

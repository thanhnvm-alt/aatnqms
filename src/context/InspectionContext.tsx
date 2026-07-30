import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Inspection } from '../../types';
import { fetchInspectionsDates, fetchInspectionsProjects, fetchInspections } from '../../services/apiService';
import { getGmt7DayBounds, getGmt7MonthBounds } from '../../lib/utils';

interface InspectionContextType {
  inspections: Inspection[];
  setInspections: (items: Inspection[]) => void;
  isDatesLoading: boolean;
  isProjectsLoading: boolean;
  isInspectionsLoading: boolean;
  dates: any[];
  projects: any[];
  loadDates: (filters: any) => Promise<void>;
  loadProjects: (filters: any, selectedDateDesktop?: string | null, selectedMonthDesktop?: {year: number, month: number} | null) => Promise<void>;
  loadInspections: (filters: any, page?: number) => Promise<void>;
}

const InspectionContext = createContext<InspectionContextType | undefined>(undefined);

export const InspectionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [dates, setDates] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isDatesLoading, setIsDatesLoading] = useState(false);
  const [isProjectsLoading, setIsProjectsLoading] = useState(false);
  const [isInspectionsLoading, setIsInspectionsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
        loadDates({}).then(() => setIsInitialized(true));
    }
  }, []); // Load dates only once on mount

  const loadDates = useCallback(async (filters: any) => {
    setIsDatesLoading(true);
    try {
      const res = await fetchInspectionsDates(filters);
      setDates(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDatesLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async (filters: any, selectedDateDesktop?: string | null, selectedMonthDesktop?: {year: number, month: number} | null) => {
    setIsProjectsLoading(true);
    try {
      const args = { ...filters };
      if (selectedDateDesktop && selectedDateDesktop !== 'ALL') {
          const bounds = getGmt7DayBounds(selectedDateDesktop);
          args.unixStart = bounds.unixStart;
          args.unixEnd = bounds.unixEnd;
      } else if (selectedMonthDesktop) {
          const { year, month } = selectedMonthDesktop;
          const bounds = getGmt7MonthBounds(year, month);
          args.unixStart = bounds.unixStart;
          args.unixEnd = bounds.unixEnd;
      }

      const res = await fetchInspectionsProjects(args);
      setProjects(res.sort((a, b) => (a.ten_ct || '').localeCompare(b.ten_ct || '')));
    } catch (e) {
      console.error(e);
      setProjects([]);
    } finally {
      setIsProjectsLoading(false);
    }
  }, []);

  const loadInspections = useCallback(async (filters: any, page: number = 1) => {
    setIsInspectionsLoading(true);
    try {
      const result = await fetchInspections(filters, page, 50);
      setInspections(result.items || []);
    } catch (e) {
      console.error("Load inspections failed", e);
    } finally {
      setIsInspectionsLoading(false);
    }
  }, []);

  return (
    <InspectionContext.Provider value={{ inspections, setInspections, isDatesLoading, isProjectsLoading, isInspectionsLoading, dates, projects, loadDates, loadProjects, loadInspections }}>
      {children}
    </InspectionContext.Provider>
  );
};

export const useInspectionContext = () => {
  const context = useContext(InspectionContext);
  if (!context) throw new Error('useInspectionContext must be used within InspectionProvider');
  return context;
};

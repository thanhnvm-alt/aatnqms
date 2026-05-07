import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Inspection } from '../../types';
import { fetchInspectionsDates, fetchInspectionsProjects, fetchInspections } from '../../services/apiService';

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
          const [d, m, y] = selectedDateDesktop.split('/');
          const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
          const start = Math.floor(dateObj.getTime() / 1000);
          const end = start + 86399; // 24h later
          args.unixStart = start;
          args.unixEnd = end;
      } else if (selectedMonthDesktop) {
          const { year, month } = selectedMonthDesktop;
          const mapDays = new Date(year, month, 0).getDate();
          const start = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
          const end = Math.floor(new Date(year, month - 1, mapDays, 23, 59, 59, 999).getTime() / 1000);
          args.unixStart = start;
          args.unixEnd = end;
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
      const result = await fetchInspections(filters, page);
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

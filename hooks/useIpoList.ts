
import { useState, useEffect, useCallback } from 'react';
import { IpoEntity, IpoListResponse } from '../types/ipo.types';

interface UseIpoListReturn {
  ipos: IpoEntity[];
  isLoading: boolean;
  error: string | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  refresh: () => Promise<void>;
}

export const useIpoList = (): UseIpoListReturn => {
  const [ipos, setIpos] = useState<IpoEntity[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchIpos = useCallback(async (search: string = '') => {
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('aatn_auth_storage');
      let headers: HeadersInit = { 'Content-Type': 'application/json' };
      
      if (token) {
        try {
          const u = JSON.parse(token);
          if (u.id) headers['Authorization'] = `Bearer ${u.id}`;
        } catch (e) {}
      }

      const params = new URLSearchParams();
      if (search) params.append('q', search);

      const response = await fetch(`/api/ipo/list?${params.toString()}`, { headers });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.success && result.data?.data) {
        setIpos(result.data.data);
      } else {
        setIpos([]);
      }
    } catch (err: any) {
      console.error('Failed to fetch IPOs:', err);
      setError(err.message || 'Lỗi kết nối server');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchIpos(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchIpos]);

  return {
    ipos,
    isLoading,
    error,
    searchTerm,
    setSearchTerm,
    refresh: () => fetchIpos(searchTerm)
  };
};

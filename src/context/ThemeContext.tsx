import React, { createContext, useContext, useState, useEffect } from 'react';

type ThemeMode = 'light' | 'dark' | 'auto';
type DensityMode = 'comfortable' | 'compact';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  density: DensityMode;
  setDensity: (density: DensityMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const safeGetStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetStorage = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage restrictions in embedded iframes
  }
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = safeGetStorage('theme_mode') as ThemeMode | null;
    if (saved === 'light' || saved === 'dark' || saved === 'auto') {
      return saved;
    }
    return 'light';
  });
  
  const [density, setDensityState] = useState<DensityMode>(() => {
    return (safeGetStorage('density_mode') as DensityMode) || 'comfortable';
  });

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = window.document.documentElement;
    let isSystemDark = false;
    try {
      isSystemDark = Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    } catch {}
    
    const applyDark = theme === 'dark' || (theme === 'auto' && isSystemDark);
    setIsDark(applyDark);

    if (applyDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    safeSetStorage('theme_mode', theme);
  }, [theme]);

  // Listen to system theme change if auto
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === 'auto') {
        const root = window.document.documentElement;
        setIsDark(e.matches);
        if (e.matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => setThemeState(newTheme);
  
  const setDensity = (newDensity: DensityMode) => {
    setDensityState(newDensity);
    safeSetStorage('density_mode', newDensity);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, density, setDensity, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    return {
      theme: 'auto' as const,
      setTheme: () => {},
      density: 'comfortable' as const,
      setDensity: () => {},
      isDark: false
    };
  }
  return context;
};


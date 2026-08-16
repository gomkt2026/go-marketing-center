import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsMobile } from '@/hooks/useMediaQuery';

interface LayoutContextValue {
  isMobile: boolean;
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

const LayoutContext = createContext<LayoutContextValue | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  useEffect(() => {
    closeSidebar();
  }, [location.pathname, closeSidebar]);

  useEffect(() => {
    if (!isMobile) closeSidebar();
  }, [isMobile, closeSidebar]);

  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeSidebar();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen, closeSidebar]);

  const value = useMemo<LayoutContextValue>(
    () => ({ isMobile, sidebarOpen, openSidebar, closeSidebar, toggleSidebar }),
    [isMobile, sidebarOpen, openSidebar, closeSidebar, toggleSidebar],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
  return ctx;
}

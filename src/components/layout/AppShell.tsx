import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { LayoutProvider } from '@/context/LayoutContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

function AppShellInner({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main-col">
        <TopBar />
        <main className="app-main">
          {/* 只做進場動畫;AnimatePresence mode="wait" 在「切品牌同時導航」時
              退場動畫會被中斷卡住,導致新頁面永遠不掛載(主內容區空白) */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0.72 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.08, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LayoutProvider>
      <AppShellInner>{children}</AppShellInner>
    </LayoutProvider>
  );
}

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <main style={{ flex: 1, padding: '24px 28px', maxWidth: 1280, width: '100%', margin: '0 auto' }}>
          {/* 只做進場動畫;AnimatePresence mode="wait" 在「切品牌同時導航」時
              退場動畫會被中斷卡住,導致新頁面永遠不掛載(主內容區空白) */}
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

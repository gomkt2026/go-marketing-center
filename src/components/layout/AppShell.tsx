import { useEffect, type ReactNode } from 'react';
import { LayoutProvider } from '@/context/LayoutContext';
import { prefetchEditorPages } from '@/lib/prefetch-pages';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

function AppShellInner({ children }: { children: ReactNode }) {
  useEffect(() => {
    const idle = window.requestIdleCallback
      ?? ((cb: IdleRequestCallback) => window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 400));
    const id = idle(() => prefetchEditorPages());
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(id as number);
      else window.clearTimeout(id as number);
    };
  }, []);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main-col">
        <TopBar />
        <main className="app-main">{children}</main>
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

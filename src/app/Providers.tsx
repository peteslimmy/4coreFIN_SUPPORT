'use client';

import type { ReactNode } from 'react';
import { AppProvider } from '../context/AppContext';
import { ToastProvider } from '../hooks/useToast';
import ToastContainer from '../components/ui/Toast';
import { useTheme } from '../hooks/useTheme';

function ThemeBootstrap() {
  useTheme();
  return null;
}

/**
 * Next.js mount of the Vite entry's provider stack (src/main.tsx). The SPA
 * shell (App) requires AppProvider — which itself nests UiProvider — plus the
 * toast layer and the theme bootstrap that syncs the light/dark class onto
 * <html>. Rendered client-only by the catch-all page (ssr: false) because
 * useTheme touches document/window during mount.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppProvider>
        <ThemeBootstrap />
        {children}
        <ToastContainer />
      </AppProvider>
    </ToastProvider>
  );
}

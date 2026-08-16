import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App.tsx';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './hooks/useToast';
import ToastContainer from './components/ui/Toast';
import { queryClient } from './lib/queryClient';
import { useTheme } from './hooks/useTheme';
import './index.css';

function ThemeBootstrap() {
  useTheme();
  return null;
}

export { ThemeBootstrap };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppProvider>
          <ThemeBootstrap />
          <App />
          <ToastContainer />
        </AppProvider>
      </ToastProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
);

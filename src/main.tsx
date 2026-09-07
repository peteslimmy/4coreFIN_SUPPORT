import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './hooks/useToast';
import ToastContainer from './components/ui/Toast';
import { useTheme } from './hooks/useTheme';
import './index.css';

function ThemeBootstrap() {
  useTheme();
  return null;
}

export { ThemeBootstrap };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AppProvider>
        <ThemeBootstrap />
        <App />
        <ToastContainer />
      </AppProvider>
    </ToastProvider>
  </StrictMode>,
);

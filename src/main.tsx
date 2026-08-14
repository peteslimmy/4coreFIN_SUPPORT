import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App.tsx';
import { AppProvider } from './context/AppContext';
import { ToastProvider } from './hooks/useToast';
import ToastContainer from './components/ui/Toast';
import { queryClient } from './lib/queryClient';
import { hydrateQueryCache, persistQueryCache, setupOnlineListeners } from './lib/db';
import { api } from './lib/api';
import { useTheme } from './hooks/useTheme';
import './index.css';

function ThemeBootstrap() {
  useTheme();
  return null;
}

export { ThemeBootstrap };


// Replay queued offline mutations against the API in order.
async function replayOfflineMutation(type: string, payload: Record<string, unknown>): Promise<unknown> {
  switch (type) {
    case 'ticket:create':
      return api.createTicket(payload);
    case 'ticket:update':
      {
        const { id, patch } = payload as { id: string; patch: unknown };
        return api.updateTicket(id, patch);
      }
    case 'ticket:transition':
      {
        const { id, status } = payload as { id: string; status: string };
        return api.transitionTicket(id, status);
      }
    case 'comment:create':
      return api.createComment(payload);
    case 'evidence:delete':
      {
        const { id } = payload as { id: string };
        return api.deleteEvidence(id);
      }
    default:
      return api.updateTicket(payload?.id as string, payload as unknown);
  }
}

// Initialize query cache persistence
hydrateQueryCache(queryClient).then(() => {
  // Persist cache periodically
  setInterval(() => persistQueryCache(queryClient), 30_000);

  // Persist on page unload
  window.addEventListener('beforeunload', () => persistQueryCache(queryClient));

  // Sync offline mutations when connectivity returns
  setupOnlineListeners(queryClient, replayOfflineMutation);
});

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
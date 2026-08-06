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
import './index.css';

// Replay queued offline mutations against the API in order.
async function replayOfflineMutation(type: string, payload: any): Promise<unknown> {
  switch (type) {
    case 'ticket:create':
      return api.createTicket(payload);
    case 'ticket:update':
      return api.updateTicket(payload.id, payload.patch);
    case 'ticket:transition':
      return api.transitionTicket(payload.id, payload.status);
    case 'comment:create':
      return api.createComment(payload);
    case 'evidence:delete':
      return api.deleteEvidence(payload.id);
    default:
      return api.updateTicket(payload?.id, payload);
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
          <App />
          <ToastContainer />
        </AppProvider>
      </ToastProvider>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
);

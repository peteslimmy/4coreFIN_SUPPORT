/* eslint-disable react-hooks/refs */
import { useRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '../hooks/useToast';
import { AppProvider, useApp } from './AppContext';
import { UiProvider, useUi } from './UiContext';

vi.mock('../lib/api', () => ({
  hasSession: () => false,
  connectEvents: () => ({ disconnect: () => {} }),
  api: {
    login: vi.fn(async () => { throw new Error('blocked'); }),
    logout: vi.fn(async () => {}),
    me: vi.fn(async () => { throw new Error('no session'); }),
    bootstrap: vi.fn(async () => ({})),
  },
}));

function AppProbe() {
  const app = useApp();
  void app.isLoading;
  const renders = useRef(0);
  renders.current += 1;
  return <span data-testid="app-renders">{renders.current}</span>;
}

function UiWriter() {
  const { setCommentText, setSearchQuery, setActiveTicketId } = useUi();
  return (
    <button
      data-testid="fire"
      onClick={() => {
        setCommentText('hello');
        setSearchQuery('query');
        setActiveTicketId('T-2');
      }}
    >
      fire
    </button>
  );
}

function UiReader() {
  const { commentText, searchQuery, activeTicketId } = useUi();
  return (
    <span data-testid="reader">
      {commentText}|{searchQuery}|{activeTicketId}
    </span>
  );
}

describe('UiContext decoupling', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('useApp consumers do not re-render when commentText/searchQuery change', async () => {
    render(
      <ToastProvider>
        <AppProvider>
          <AppProbe />
          <UiWriter />
        </AppProvider>
      </ToastProvider>
    );

    await act(async () => {});
    await act(async () => {});
    const baseline = Number(screen.getByTestId('app-renders').textContent);
    expect(baseline).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(screen.getByTestId('fire'));
    });

    expect(Number(screen.getByTestId('app-renders').textContent)).toBe(baseline);
  });

  it('activeTicketId updates flow through UiContext without re-rendering useApp consumers', async () => {
    render(
      <ToastProvider>
        <AppProvider>
          <AppProbe />
          <UiWriter />
          <UiReader />
        </AppProvider>
      </ToastProvider>
    );

    await act(async () => {});
    await act(async () => {});
    const baseline = Number(screen.getByTestId('app-renders').textContent);

    await act(async () => {
      fireEvent.click(screen.getByTestId('fire'));
    });

    expect(screen.getByTestId('reader').textContent).toBe('hello|query|T-2');
    expect(Number(screen.getByTestId('app-renders').textContent)).toBe(baseline);
  });
});

describe('UiContext behavior', () => {
  it('shares state across consumers within UiProvider', async () => {
    // URL state persists across renders in the shared jsdom window — start
    // from a clean app URL so the provider's initial state is deterministic.
    window.history.replaceState(null, '', '/app/tickets');
    render(
      <UiProvider>
        <UiWriter />
        <UiReader />
      </UiProvider>
    );

    // No selection until a ticket is chosen (or restored from the URL).
    expect(screen.getByTestId('reader').textContent).toBe('||');

    await act(async () => {
      fireEvent.click(screen.getByTestId('fire'));
    });

    expect(screen.getByTestId('reader').textContent).toBe('hello|query|T-2');
  });
});
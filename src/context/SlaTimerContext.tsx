import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface SlaTimerContextType {
  now: number;
}

const SlaTimerContext = createContext<SlaTimerContextType>({ now: Date.now() });

export function useSlaTimer() {
  return useContext(SlaTimerContext);
}

/**
 * Shared SLA timer that runs a single 1-second interval for the entire app.
 * Components consume `now` from this context instead of creating their own timers.
 * This prevents N independent timers (one per ticket card) from overwhelming the browser.
 */
export function SlaTimerProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <SlaTimerContext.Provider value={{ now }}>
      {children}
    </SlaTimerContext.Provider>
  );
}

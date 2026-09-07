'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// Mount the existing React application inside Next.js. All routing is
// client-side (App.tsx reads window.location); this catch-all page ensures
// every path renders the SPA shell. Dynamic import with ssr:false keeps
// window-dependent bootstrap code out of the server render.
const App = dynamic(() => import('../../App'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-text-secondary text-body-sm">Loading 4CoreFinSupport…</div>
    </div>
  ),
});

export default function CatchAllPage() {
  const pathname = usePathname();
  // Normalize trailing slashes so the SPA's pathname checks stay stable.
  useEffect(() => {
    if (pathname && pathname.length > 1 && pathname.endsWith('/')) {
      window.history.replaceState(null, '', pathname.slice(0, -1));
    }
  }, [pathname]);
  return <App />;
}

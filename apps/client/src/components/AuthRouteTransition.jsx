import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { Routes, useLocation } from 'react-router-dom';
import useMediaQuery from '@mui/material/useMediaQuery';

export const AUTH_COVER_MS = 1200;
const AuthTransitionContext = createContext(null);
const isAuthPath = (pathname) => pathname === '/login' || pathname === '/signup';

/** Keep the outgoing route and its context intact until the rounded cover hides the swap. */
export default function AuthRouteTransition({ children }) {
  const location = useLocation();
  const desktop = useMediaQuery('(min-width: 900px)');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [displayed, setDisplayed] = useState(location);
  const [switching, setSwitching] = useState(false);
  const previousLocation = useRef(location);
  const betweenAuthRoutes = isAuthPath(location.pathname) && isAuthPath(displayed.pathname);

  useLayoutEffect(() => {
    const previous = previousLocation.current;
    previousLocation.current = location;
    const animate =
      desktop &&
      !reducedMotion &&
      isAuthPath(previous.pathname) &&
      isAuthPath(location.pathname) &&
      previous.pathname !== location.pathname;
    if (!animate) {
      setDisplayed(location);
      setSwitching(false);
      return;
    }

    setSwitching(true);
    const swap = window.setTimeout(() => setDisplayed(location), AUTH_COVER_MS / 2);
    const finish = window.setTimeout(() => setSwitching(false), AUTH_COVER_MS);
    return () => {
      window.clearTimeout(swap);
      window.clearTimeout(finish);
    };
  }, [location, desktop, reducedMotion]);

  return (
    <AuthTransitionContext.Provider value={{ location, switching: betweenAuthRoutes && switching }}>
      <Routes location={betweenAuthRoutes ? displayed : undefined}>{children}</Routes>
    </AuthTransitionContext.Provider>
  );
}

export function useAuthRouteTransition() {
  return useContext(AuthTransitionContext);
}

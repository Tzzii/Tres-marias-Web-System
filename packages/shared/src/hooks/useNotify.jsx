import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import useMediaQuery from '@mui/material/useMediaQuery';
import { ThemeProvider } from '@mui/material/styles';
import { surfaceThemeForMode } from '../theme/createTheme.js';
import { useColorMode } from '../theme/colorMode.jsx';

// Shares the notify() function with every component below NotifyProvider
const NotifyContext = createContext(() => {});
const TOAST_DURATION_MS = 3000;

/** App-wide toast messages: notify('Saved', 'success'). */
export function NotifyProvider({ children }) {
  const { mode, animate } = useColorMode();
  // The toast currently shown: { message, severity, key }
  const [toast, setToast] = useState(null);
  const nextKey = useRef(0);
  // On phones the bottom of the screen holds navigation and sticky action bars, so toasts sit at the top
  const isPhone = useMediaQuery('(max-width:899px)');

  // Show a toast. A new `key` each time restarts the timer even if the same message is shown twice.
  const notify = useCallback((message, severity = 'success') => {
    setToast({ message, severity, key: ++nextKey.current });
  }, []);

  // Own the deadline so hovering, focusing the toast or leaving the window cannot pause it.
  // A replacement message gets its own three seconds; an old timer cannot close the new one.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => {
      setToast((current) => (current?.key === toast.key ? null : current));
    }, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => notify, [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <ThemeProvider theme={surfaceThemeForMode(mode, animate)}>
        <Snackbar
          key={toast ? toast.key : undefined}
          open={Boolean(toast)}
          disableWindowBlurListener
          // Click-away does not dismiss it; the fixed timer above handles automatic dismissal.
          onClose={(_, reason) => reason !== 'clickaway' && setToast(null)}
          anchorOrigin={{ vertical: isPhone ? 'top' : 'bottom', horizontal: 'center' }}
          sx={isPhone ? { top: { xs: 78 } } : undefined}
        >
          {toast ? (
            <Alert
              onClose={() => setToast(null)}
              severity={toast.severity}
              variant="filled"
              sx={{ width: '100%', fontSize: 13.5, fontWeight: 600, boxShadow: '0 12px 30px -10px rgba(0,0,0,0.5)' }}
            >
              {toast.message}
            </Alert>
          ) : undefined}
        </Snackbar>
      </ThemeProvider>
    </NotifyContext.Provider>
  );
}

/** Hook that returns notify(message, severity) for showing a toast. */
export const useNotify = () => useContext(NotifyContext);

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import useMediaQuery from '@mui/material/useMediaQuery';
import { ThemeProvider } from '@mui/material/styles';
import { lightTheme } from '../theme/createTheme.js';

// Shares the notify() function with every component below NotifyProvider
const NotifyContext = createContext(() => {});

/** App-wide toast messages: notify('Saved', 'success'). */
export function NotifyProvider({ children }) {
  // The toast currently shown: { message, severity, key }
  const [toast, setToast] = useState(null);
  // On phones the bottom of the screen holds navigation and sticky action bars, so toasts sit at the top
  const isPhone = useMediaQuery('(max-width:899px)');

  // Show a toast. A new `key` each time restarts the timer even if the same message is shown twice.
  const notify = useCallback((message, severity = 'success') => {
    setToast({ message, severity, key: Date.now() });
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <ThemeProvider theme={lightTheme}>
        <Snackbar
          key={toast ? toast.key : undefined}
          open={Boolean(toast)}
          autoHideDuration={4500}
          // Close after 4.5 s, but not just because the user clicked somewhere else on the page
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

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { ColorModeProvider, NotifyProvider, themeForMode, useColorMode } from '@tm/shared';
import '@tm/shared/theme/global.css';
import App from './App.jsx';
import { AuthProvider } from './auth.js';

// Entry point: mounts the admin app into <div id="root"> in index.html.
// Wrappers from outside in: dark/light mode -> the matching theme -> CSS reset -> URL routing
// -> admin session -> toast messages.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ColorModeProvider>
      <ThemedApp />
    </ColorModeProvider>
  </React.StrictMode>
);

/**
 * Dresses the dashboard in the navy or the warm ivory theme, following the switch in the top bar.
 * useTransitions={false} keeps React Router 6's way of changing pages (React Router 7 wraps every page
 * change in React.startTransition): "Log out" goes to the sign-in page and ends the session in one step,
 * so the signed-out dashboard never redirects on its own and leaves "?next=" behind.
 */
function ThemedApp() {
  const { mode } = useColorMode();
  return (
    <ThemeProvider theme={themeForMode(mode)}>
      <CssBaseline />
      <BrowserRouter useTransitions={false}>
        <AuthProvider>
          <NotifyProvider>
            <App />
          </NotifyProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

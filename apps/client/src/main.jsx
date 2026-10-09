import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { ColorModeProvider, NotifyProvider, themeForMode, useColorMode } from '@tm/shared';
import '@tm/shared/theme/global.css';
import App from './App.jsx';
import { AuthProvider } from './auth.js';

// Entry point: mounts the customer app into <div id="root"> in index.html.
// Wrappers from outside in: dark/light mode -> the matching theme -> CSS reset -> URL routing
// -> customer session -> toast messages.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ColorModeProvider>
      <ThemedApp />
    </ColorModeProvider>
  </React.StrictMode>
);

/**
 * Dresses the app in the navy or the warm ivory theme, following the switch in the portal top bar.
 * useTransitions={false} keeps React Router 6's way of changing pages (React Router 7 wraps every page
 * change in React.startTransition): "Log out" goes to the home page and ends the session in one step, so
 * the signed-out portal never shows for a moment and sends the customer to the log-in page instead.
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

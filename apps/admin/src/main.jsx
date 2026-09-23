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

/** Dresses the dashboard in the navy or the warm ivory theme, following the switch in the top bar. */
function ThemedApp() {
  const { mode } = useColorMode();
  return (
    <ThemeProvider theme={themeForMode(mode)}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <NotifyProvider>
            <App />
          </NotifyProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

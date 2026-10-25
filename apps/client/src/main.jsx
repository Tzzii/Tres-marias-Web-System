import React, { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useMatch } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { ColorModeProvider, NotifyProvider, themeForMode, useColorMode } from '@tm/shared';
import '@tm/shared/theme/global.css';
import './styles/portalMotion.css';
import App from './App.jsx';
import { AuthProvider } from './auth.js';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter useTransitions={false}>
      <CustomerApp />
    </BrowserRouter>
  </React.StrictMode>
);

function CustomerApp() {
  const inPortal = Boolean(useMatch('/portal/*'));

  // Scope body-level dialogs and shared controls too, and restore public-page motion on exit.
  useLayoutEffect(() => {
    if (!inPortal) return undefined;
    document.documentElement.dataset.tmPortal = 'customer';
    return () => {
      delete document.documentElement.dataset.tmPortal;
    };
  }, [inPortal]);

  return (
    <ColorModeProvider animate={!inPortal} animateThemeChanges>
      <ThemedApp />
    </ColorModeProvider>
  );
}

function ThemedApp() {
  const { mode, animate } = useColorMode();
  return (
    <ThemeProvider theme={themeForMode(mode, animate)}>
      <CssBaseline />
      <AuthProvider>
        <NotifyProvider>
          <App />
        </NotifyProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

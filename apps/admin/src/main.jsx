import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { ColorModeProvider, NotifyProvider, themeForMode, useColorMode } from '@tm/shared';
import '@tm/shared/theme/global.css';
import './styles/motion.css';
import App from './App.jsx';
import { AuthProvider } from './auth.js';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ColorModeProvider animate={false}>
      <ThemedApp />
    </ColorModeProvider>
  </React.StrictMode>
);

function ThemedApp() {
  const { mode, animate } = useColorMode();
  return (
    <ThemeProvider theme={themeForMode(mode, animate)}>
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

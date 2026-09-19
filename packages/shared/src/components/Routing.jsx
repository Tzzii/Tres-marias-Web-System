import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { tokens } from '../theme/tokens.js';
import { BrandLogo } from './Brand.jsx';

/** Scrolls to the top on every route change (keeps #hash links working). */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname, hash]);
  return null;
}

/** 404 page with a button back to `homePath`. */
export function NotFoundPage({ homePath = '/', homeLabel = 'Go to home' }) {
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 3, textAlign: 'center', backgroundImage: tokens.gradientCentered }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <BrandLogo size={120} />
        <Typography sx={{ mt: 2, fontSize: 13, fontWeight: 700, letterSpacing: '0.16em', color: tokens.gold }}>ERROR 404</Typography>
        <Typography component="h1" sx={{ fontSize: { xs: 26, md: 34 }, fontWeight: 700, color: tokens.textLight }}>
          This page is not on the menu
        </Typography>
        <Typography sx={{ maxWidth: 420, fontSize: 14, color: tokens.textOnDarkSoft }}>
          The link may be old or mistyped. Let us take you back somewhere familiar.
        </Typography>
        <Button variant="contained" onClick={() => navigate(homePath)} sx={{ mt: 1, px: 4, py: 1.2, borderRadius: 999 }}>
          {homeLabel}
        </Button>
      </Box>
    </Box>
  );
}

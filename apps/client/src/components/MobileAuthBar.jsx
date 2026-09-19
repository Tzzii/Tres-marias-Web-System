import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { useAuth } from '../auth.js';
import { site } from '../theme/siteTheme.js';

/**
 * Sticky bottom bar on phones (1m) that keeps Log in / Sign up reachable
 * without opening the menu. Hidden once signed in.
 */
export default function MobileAuthBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Signed-in customers don't need the bar
  if (user) return null;
  return (
    <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1050, display: { xs: 'grid', sm: 'none' }, gridTemplateColumns: '1fr 1fr', gap: 1, p: 1.25, pb: 'calc(10px + env(safe-area-inset-bottom))', backgroundColor: 'rgba(251, 247, 240, 0.97)', backdropFilter: 'blur(14px)', borderTop: `1px solid ${site.border}`, boxShadow: '0 -10px 30px -22px rgba(60, 42, 20, 0.45)' }}>
      <Button onClick={() => navigate('/login')} sx={{ py: 1.1, borderRadius: 999, color: site.ink, border: `1px solid ${site.border}` }}>
        Log in
      </Button>
      <Button variant="contained" onClick={() => navigate('/signup')} sx={{ py: 1.1, borderRadius: 999 }}>
        Sign up
      </Button>
    </Box>
  );
}

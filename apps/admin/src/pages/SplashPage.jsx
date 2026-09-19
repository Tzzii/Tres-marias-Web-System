import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';
import { BrandLogo, tokens, useDocumentTitle } from '@tm/shared';
import { useAuth } from '../auth.js';

// Logo fades and grows in once when the page opens
const enter = keyframes`
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
`;
// While hovered, the gold aura slowly swells and fades
const breathe = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.08); }
`;

/** First screen of the admin site: a large round logo. Clicking it opens the admin sign in. */
export default function SplashPage() {
  useDocumentTitle('Welcome', 'Tres Marias Admin');
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  // Already signed in: go straight to the dashboard
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <Box component="main" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', px: 2, py: 5, backgroundImage: tokens.gradientCentered }}>
      {/* Entrance animation lives on this wrapper so it doesn't block the hover transform on the button */}
      <Box sx={{ animation: `${enter} 600ms ease-out both` }}>
        <Box
          component="button"
          type="button"
          // Keep ?next= and ?reason=idle so login shows the timeout notice and returns to the last page
          onClick={() => navigate(`/login${location.search}`)}
          aria-label="Open admin sign in"
          sx={{
            position: 'relative',
            display: 'block',
            p: 0,
            border: 0,
            background: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            transition: 'transform 450ms cubic-bezier(0.22, 1, 0.36, 1)',
            // The aura: a soft gold glow behind the logo, hidden until hover
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: '-22%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(212, 175, 55, 0.55) 0%, rgba(212, 175, 55, 0.22) 38%, rgba(212, 175, 55, 0) 70%)',
              filter: 'blur(12px)',
              opacity: 0,
              transform: 'scale(0.7)',
              transition: 'opacity 450ms ease, transform 600ms cubic-bezier(0.22, 1, 0.36, 1)',
              pointerEvents: 'none',
              zIndex: 0
            },
            '& > *': { position: 'relative', zIndex: 1, transition: 'box-shadow 450ms ease' },
            '&:hover, &:focus-visible': {
              transform: 'translateY(-8px) scale(1.06)',
              '&::before': { opacity: 1, transform: 'scale(1)', animation: `${breathe} 2.6s ease-in-out 600ms infinite` },
              '& > *': { boxShadow: '0 0 40px 6px rgba(212, 175, 55, 0.55), 0 24px 60px rgba(0, 0, 0, 0.5)' }
            },
            '&:active': { transform: 'translateY(-4px) scale(1.02)' },
            '&:focus-visible': { outline: 'none' }
          }}
        >
          <BrandLogo size={540} />
        </Box>
      </Box>
    </Box>
  );
}

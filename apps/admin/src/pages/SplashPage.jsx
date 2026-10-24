import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import { BrandLogo, tokens, useDocumentTitle } from '@tm/shared';
import { useAuth } from '../auth.js';

export default function SplashPage() {
  useDocumentTitle('Welcome', 'Tres Marias Admin');
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, locked } = useAuth();

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: 5,
        backgroundImage: tokens.gradientCentered
      }}
    >
      <Box>
        <Box
          component="button"
          type="button"
          onClick={() => navigate(`${locked ? '/locked' : '/login'}${location.search}`)}
          aria-label="Open admin sign in"
          sx={{
            position: 'relative',
            display: 'block',
            p: 0,
            border: 0,
            background: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: '-22%',
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(212, 175, 55, 0.55) 0%, rgba(212, 175, 55, 0.22) 38%, rgba(212, 175, 55, 0) 70%)',
              filter: 'blur(12px)',
              opacity: 0,
              pointerEvents: 'none',
              zIndex: 0
            },
            '& > *': { position: 'relative', zIndex: 1 },
            '&:hover, &:focus-visible': {
              '&::before': {
                opacity: 1
              },
              '& > *': { boxShadow: '0 0 40px 6px rgba(212, 175, 55, 0.55), 0 24px 60px rgba(0, 0, 0, 0.5)' }
            },
            '&:focus-visible': { outline: 'none' }
          }}
        >
          <BrandLogo size={540} />
        </Box>
      </Box>
    </Box>
  );
}

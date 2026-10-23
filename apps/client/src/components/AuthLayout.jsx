import { useLayoutEffect, useRef } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { BrandLogo, formatDateLong, safeNextPath, shakeSx, tokens } from '@tm/shared';
import { site } from '../theme/siteTheme.js';
import { AUTH_COVER_MS, useAuthRouteTransition } from './AuthRouteTransition.jsx';

const COVER_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';
const formIn = keyframes`
  from { opacity: 0; transform: translateX(var(--auth-enter-x, 18px)); }
  to { opacity: 1; transform: translateX(0); }
`;
const welcome = {
  login: {
    headline: 'Welcome to your celebrations.',
    perks: [
      'Follow every reservation from request to event day',
      'Pay securely and keep every receipt',
      'Message the admin directly'
    ],
    prompt: 'New to Tres Marias?',
    action: 'Sign up'
  },
  signup: {
    headline: 'One account, every celebration you host.',
    perks: [
      'Reserve dates and follow each request live',
      'See quotations, contracts and receipts in one place',
      'Save drafts and finish your booking any time'
    ],
    prompt: 'Already have an account?',
    action: 'Log in'
  }
};

/** The rounded cover hides the route swap at its midpoint, then reveals the opposite form. */
export default function AuthLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { location: targetLocation, switching } = useAuthRouteTransition();
  const params = new URLSearchParams(targetLocation.search);
  const previousLocation = useRef(location);
  const formPanel = useRef(null);
  const isSignup = targetLocation.pathname === '/signup';
  const mode = isSignup ? 'signup' : 'login';
  const displayedSignup = location.pathname === '/signup';
  const continuingBooking = isSignup
    ? params.get('continue') === 'booking'
    : safeNextPath(params.get('next'), '/portal').startsWith('/portal/book');
  const loginPath = continuingBooking ? '/login?next=/portal/book' : '/login';
  const signupPath = continuingBooking ? '/signup?continue=booking' : '/signup';

  useLayoutEffect(() => {
    if (previousLocation.current.pathname !== location.pathname) {
      if (formPanel.current) formPanel.current.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    previousLocation.current = location;
  }, [location]);

  useLayoutEffect(() => {
    if (!switching) {
      formPanel.current?.querySelector('h1')?.focus({ preventScroll: true });
    }
  }, [location, switching]);

  return (
    <Box
      className="tm-auth-layout"
      data-auth-mode={mode}
      data-auth-displayed={displayedSignup ? 'signup' : 'login'}
      data-auth-switching={switching ? 'true' : 'false'}
      sx={{
        position: 'relative',
        isolation: 'isolate',
        minHeight: '100dvh',
        height: { md: '100dvh' },
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
        gridTemplateRows: { xs: 'auto 1fr', md: 'minmax(0, 1fr)' },
        overflowX: 'clip',
        overflow: { md: 'hidden' },
        backgroundColor: site.ivory,
        color: site.ink
      }}
    >
      <Box
        className="tm-auth-cover"
        aria-hidden="true"
        sx={{
          display: { xs: 'none', md: 'block' },
          position: 'absolute',
          zIndex: 2,
          pointerEvents: 'none',
          top: 0,
          bottom: 0,
          left: '-150%',
          width: '200%',
          borderRadius: 'clamp(80px, 12vw, 180px)',
          background: 'radial-gradient(ellipse at 50% 15%, #f5e9d2 0%, #ead6b2 55%, #dfc18b 100%)',
          transform: isSignup ? 'translateX(100%)' : 'translateX(0)',
          transition: `transform ${AUTH_COVER_MS}ms ${COVER_EASING}`,
          [REDUCED_MOTION]: { transition: 'none' }
        }}
      />
      {['login', 'signup'].map((panelMode) => {
        const active = mode === panelMode;
        const copy = welcome[panelMode];
        return (
          <Box
            key={panelMode}
            component="section"
            className="tm-auth-brand-panel"
            aria-label="Tres Marias Catering Services"
            aria-hidden={!active}
            inert={!active ? '' : undefined}
            sx={{
              gridColumn: { xs: 1, md: panelMode === 'signup' ? 2 : 1 },
              gridRow: 1,
              minWidth: 0,
              minHeight: 0,
              position: 'relative',
              zIndex: 3,
              display: { xs: active ? 'flex' : 'none', md: 'flex' },
              transform: {
                xs: 'none',
                md: active ? 'translateX(0)' : panelMode === 'login' ? 'translateX(-100%)' : 'translateX(100%)'
              },
              transition: { xs: 'none', md: `transform 420ms ${COVER_EASING}` },
              transitionDelay: { xs: '0ms', md: active ? '720ms' : '0ms' },
              [REDUCED_MOTION]: { transition: 'none', transitionDelay: '0ms' },
              flexDirection: { xs: 'row', md: 'column' },
              alignItems: 'center',
              justifyContent: 'safe center',
              overflowY: { md: 'auto' },
              gap: { xs: 2, md: 3 },
              px: { xs: 3, md: 6 },
              py: { xs: 3, md: 7 },
              textAlign: { xs: 'left', md: 'center' },
              background: { xs: site.gradientHero, md: 'none' },
              borderBottom: { xs: `1px solid ${site.border}`, md: 'none' }
            }}
          >
            <BrandLogo size={176} sx={{ width: { xs: 56, md: 176 }, height: { xs: 56, md: 176 }, flexShrink: 0 }} />
            <Box sx={{ maxWidth: 380 }}>
              <Typography sx={{ fontFamily: site.fontSerif, fontSize: { xs: 20, md: 36 }, fontWeight: 600 }}>
                Tres Marias
              </Typography>
              <Typography
                sx={{
                  mt: 0.5,
                  fontSize: { xs: 10.5, md: 12.5 },
                  fontWeight: 600,
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  color: site.goldText
                }}
              >
                Catering Services
              </Typography>
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <Typography
                  sx={{ mt: 2.5, fontFamily: site.fontSerif, fontSize: 24, fontWeight: 500, lineHeight: 1.45 }}
                >
                  {copy.headline}
                </Typography>
                <Box
                  component="ul"
                  sx={{ mt: 3, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.25 }}
                >
                  {copy.perks.map((perk) => (
                    <Box
                      key={perk}
                      component="li"
                      sx={{ display: 'flex', gap: 1.25, fontSize: 13.5, textAlign: 'left', color: site.inkSoft }}
                    >
                      <CheckRoundedIcon sx={{ fontSize: 17, color: site.goldText, mt: '2px' }} />
                      {perk}
                    </Box>
                  ))}
                </Box>
                <Typography sx={{ mt: 3, mb: 1.25, fontSize: 13.5, color: site.inkSoft }}>{copy.prompt}</Typography>
                <Button
                  component={RouterLink}
                  to={panelMode === 'login' ? signupPath : loginPath}
                  variant="outlined"
                  disabled={switching}
                  sx={{
                    minWidth: 154,
                    minHeight: 44,
                    borderRadius: '12px',
                    borderColor: site.inkSoft,
                    color: site.ink,
                    '&:hover': { borderColor: site.ink, backgroundColor: 'rgba(255,255,255,0.25)' }
                  }}
                >
                  {copy.action}
                </Button>
              </Box>
            </Box>
          </Box>
        );
      })}
      <Box
        component="main"
        className="tm-auth-form-panel"
        ref={formPanel}
        aria-busy={switching}
        inert={switching ? '' : undefined}
        sx={{
          gridColumn: { xs: 1, md: 2 },
          gridRow: { xs: 2, md: 1 },
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          zIndex: 1,
          // Relocate only while the sweeping cover conceals both halves.
          transform: { xs: 'none', md: displayedSignup ? 'translateX(-100%)' : 'translateX(0)' },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          overflowY: { md: 'auto' },
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          px: { xs: 2, sm: 4, lg: 6 },
          py: { xs: 3, md: 5 }
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: tokens.formMax,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            my: { md: 'auto' },
            flexShrink: 0
          }}
        >
          <Button
            onClick={() => navigate('/')}
            startIcon={<ArrowBackRoundedIcon sx={{ fontSize: 16 }} />}
            sx={{
              alignSelf: 'flex-start',
              px: 1,
              fontSize: 13,
              fontWeight: 500,
              color: site.inkSoft,
              '&:hover': { color: site.goldText, backgroundColor: 'transparent' }
            }}
          >
            Back to browsing
          </Button>
          <Box
            key={location.pathname}
            className="tm-auth-form-content"
            sx={{
              '--auth-enter-x': displayedSignup ? '-24px' : '24px',
              animation: `${formIn} 400ms ${COVER_EASING} both`,
              [REDUCED_MOTION]: { animation: 'none' }
            }}
          >
            <Outlet />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export function FormCard({ shake, onAnimationEnd, children, component = 'div', ...rest }) {
  return (
    <Paper
      component={component}
      elevation={0}
      onAnimationEnd={onAnimationEnd}
      {...rest}
      sx={{
        p: { xs: 2.5, sm: 3.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        backgroundColor: site.card,
        color: site.ink,
        border: `1px solid ${site.border}`,
        borderRadius: 3,
        boxShadow: site.shadowPanel,
        ...shakeSx(shake),
        [REDUCED_MOTION]: { animation: 'none' }
      }}
    >
      {children}
    </Paper>
  );
}

export function BookingIntentBanner({ intent }) {
  if (!intent) return null;
  const parts = [
    intent.packageName,
    intent.date && formatDateLong(intent.date),
    intent.guests && `${intent.guests} guests`
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.25,
        px: 1.75,
        py: 1.5,
        borderRadius: 1.5,
        backgroundColor: 'rgba(197, 160, 89, 0.1)',
        border: '1px solid rgba(197, 160, 89, 0.4)'
      }}
    >
      <EventAvailableOutlinedIcon sx={{ fontSize: 19, color: site.goldText, mt: '1px' }} />
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: site.ink }}>{parts.join(' · ')}</Typography>
        <Typography sx={{ fontSize: 12, color: site.inkSoft }}>Saved and carried over to your reservation.</Typography>
      </Box>
    </Box>
  );
}

import { useLayoutEffect, useRef } from 'react';
import { Link as RouterLink, Outlet, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
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

const contentIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;
const PANEL_TRANSITION = 'transform 780ms cubic-bezier(0.76, 0, 0.24, 1)';
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce)';
const contentMotionSx = {
  animation: `${contentIn} 480ms ${tokens.easeStandard} both`,
  [REDUCED_MOTION]: { animation: 'none' }
};

/** Both routes share this frame so the panels slide continuously when the form changes. */
export default function AuthLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const isSignup = Boolean(useMatch('/signup'));
  const mode = isSignup ? 'signup' : 'login';
  const formPanel = useRef(null);
  const previousPath = useRef(pathname);
  const continuingBooking = isSignup
    ? params.get('continue') === 'booking'
    : safeNextPath(params.get('next'), '/portal').startsWith('/portal/book');
  const loginPath = continuingBooking ? '/login?next=/portal/book' : '/login';
  const signupPath = continuingBooking ? '/signup?continue=booking' : '/signup';
  const headline = isSignup ? 'One account, every celebration you host.' : 'Welcome to your celebrations.';
  const perks = isSignup
    ? [
        'Reserve dates and follow each request live',
        'See quotations, contracts and receipts in one place',
        'Save drafts and finish your booking any time'
      ]
    : [
        'Follow every reservation from request to event day',
        'Pay securely and keep every receipt',
        'Message the admin directly'
      ];

  useLayoutEffect(() => {
    if (previousPath.current !== pathname) {
      // The long sign-up form has its own desktop scroll area. Reset it when switching forms.
      if (formPanel.current) formPanel.current.scrollTop = 0;
      formPanel.current?.querySelector('h1')?.focus({ preventScroll: true });
    }
    previousPath.current = pathname;
  }, [pathname]);

  return (
    <Box
      className="tm-auth-layout"
      data-auth-mode={mode}
      sx={{
        minHeight: '100vh',
        height: { md: '100dvh' },
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
        gridTemplateRows: { xs: 'auto 1fr', md: 'minmax(0, 1fr)' },
        overflow: { md: 'hidden' },
        backgroundColor: site.ivory,
        color: site.ink
      }}
    >
      <Box
        component="section"
        className="tm-auth-brand-panel"
        aria-label="Tres Marias Catering Services"
        sx={{
          gridColumn: 1,
          gridRow: 1,
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          zIndex: 2,
          transform: { xs: 'none', md: isSignup ? 'translateX(100%)' : 'translateX(0)' },
          transition: { xs: 'none', md: PANEL_TRANSITION },
          [REDUCED_MOTION]: { transition: 'none' },
          display: 'flex',
          flexDirection: { xs: 'row', md: 'column' },
          alignItems: 'center',
          justifyContent: 'safe center',
          overflowY: { md: 'auto' },
          gap: { xs: 2, md: 3 },
          px: { xs: 3, md: 6 },
          py: { xs: 3, md: 8 },
          textAlign: { xs: 'left', md: 'center' },
          background: site.gradientHero,
          borderInline: { md: `1px solid ${site.border}` },
          borderBottom: { xs: `1px solid ${site.border}`, md: 'none' }
        }}
      >
        <BrandLogo
          size={200}
          sx={{ width: { xs: 64, md: 200 }, height: { xs: 64, md: 200 }, outlineOffset: { xs: '2px', md: '4px' } }}
        />
        <Box sx={{ maxWidth: 420 }}>
          <Box key={mode} sx={contentMotionSx}>
            <Typography
              sx={{ fontFamily: site.fontSerif, fontSize: { xs: 20, md: 36 }, fontWeight: 600, color: site.ink }}
            >
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
            <Typography
              sx={{
                display: { xs: 'none', md: 'block' },
                mt: 2.5,
                fontFamily: site.fontSerif,
                fontSize: 21,
                fontWeight: 500,
                lineHeight: 1.5,
                color: site.ink
              }}
            >
              {headline}
            </Typography>
            {perks && (
              <Box
                component="ul"
                sx={{
                  display: { xs: 'none', md: 'flex' },
                  mt: 3,
                  p: 0,
                  listStyle: 'none',
                  flexDirection: 'column',
                  gap: 1.25
                }}
              >
                {perks.map((perk) => (
                  <Box
                    key={perk}
                    component="li"
                    sx={{ display: 'flex', gap: 1.25, fontSize: 13.5, textAlign: 'left', color: site.inkSoft }}
                  >
                    <CheckRoundedIcon sx={{ fontSize: 17, color: site.gold, mt: '2px' }} />
                    {perk}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Box
        component="main"
        className="tm-auth-form-panel tm-scroll"
        ref={formPanel}
        sx={{
          gridColumn: { xs: 1, md: 2 },
          gridRow: { xs: 2, md: 1 },
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
          zIndex: 1,
          transform: { xs: 'none', md: isSignup ? 'translateX(-100%)' : 'translateX(0)' },
          transition: { xs: 'none', md: PANEL_TRANSITION },
          [REDUCED_MOTION]: { transition: 'none' },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          overflowY: { md: 'auto' },
          scrollbarGutter: { md: 'stable' },
          px: { xs: 2, sm: 4 },
          py: { xs: 3, md: 4 },
          backgroundColor: site.ivory
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
            component="nav"
            aria-label="Account access"
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 0.5,
              p: 0.5,
              borderRadius: '14px',
              border: `1px solid ${site.border}`,
              backgroundColor: site.sand
            }}
          >
            {[
              { label: 'Log in', to: loginPath, active: !isSignup },
              { label: 'Sign up', to: signupPath, active: isSignup }
            ].map(({ label, to, active }) => (
              <Button
                key={label}
                component={RouterLink}
                to={to}
                aria-current={active ? 'page' : undefined}
                sx={{
                  minHeight: 42,
                  color: active ? site.ink : site.inkSoft,
                  backgroundColor: active ? site.card : 'transparent',
                  boxShadow: active ? '0 2px 6px rgba(60, 42, 20, 0.08)' : 'none',
                  borderRadius: '10px',
                  '&:hover': { backgroundColor: active ? site.card : site.goldTint }
                }}
              >
                {label}
              </Button>
            ))}
          </Box>
          <Box key={mode} sx={contentMotionSx}>
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

import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import { BrandLogo, formatDateLong, shakeSx, tokens } from '@tm/shared';
import { site } from '../theme/siteTheme.js';

/**
 * Two-panel layout for Sign up (1d) and Log in (1e) in the light website look: brand on a warm
 * sand panel on the left, the form card on ivory on the right. The brand panel collapses to a slim header on phones.
 */
export default function AuthLayout({ headline, perks, children, backTo = '/', backLabel = 'Back to browsing' }) {
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, backgroundColor: site.ivory, color: site.ink }}>
      {/* Left: logo, headline and perks (headline/perks hidden on phones) */}
      <Box
        component="section"
        sx={{
          display: 'flex',
          flexDirection: { xs: 'row', md: 'column' },
          alignItems: 'center',
          justifyContent: 'center',
          gap: { xs: 2, md: 3 },
          px: { xs: 3, md: 6 },
          py: { xs: 3, md: 8 },
          textAlign: { xs: 'left', md: 'center' },
          background: site.gradientHero,
          borderRight: { md: `1px solid ${site.border}` },
          borderBottom: { xs: `1px solid ${site.border}`, md: 'none' }
        }}
      >
        <BrandLogo size={200} sx={{ width: { xs: 64, md: 200 }, height: { xs: 64, md: 200 }, outlineOffset: { xs: '2px', md: '4px' } }} />
        <Box sx={{ maxWidth: 420 }}>
          <Typography sx={{ fontFamily: site.fontSerif, fontSize: { xs: 20, md: 36 }, fontWeight: 600, color: site.ink }}>Tres Marias</Typography>
          <Typography sx={{ mt: 0.5, fontSize: { xs: 10.5, md: 12.5 }, fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', color: site.goldText }}>Catering Services</Typography>
          <Typography sx={{ display: { xs: 'none', md: 'block' }, mt: 2.5, fontFamily: site.fontSerif, fontSize: 21, fontWeight: 500, lineHeight: 1.5, color: site.ink }}>
            {headline}
          </Typography>
          {perks && (
            <Box component="ul" sx={{ display: { xs: 'none', md: 'flex' }, mt: 3, p: 0, listStyle: 'none', flexDirection: 'column', gap: 1.25 }}>
              {perks.map((perk) => (
                <Box key={perk} component="li" sx={{ display: 'flex', gap: 1.25, fontSize: 13.5, textAlign: 'left', color: site.inkSoft }}>
                  <CheckRoundedIcon sx={{ fontSize: 17, color: site.gold, mt: '2px' }} />
                  {perk}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {/* Right: back button and the form passed in as children */}
      <Box component="main" sx={{ display: 'flex', alignItems: { xs: 'flex-start', md: 'center' }, justifyContent: 'center', px: { xs: 2, sm: 4 }, py: { xs: 3, md: 6 }, backgroundColor: site.ivory }}>
        <Box sx={{ width: '100%', maxWidth: tokens.formMax, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Button onClick={() => navigate(backTo)} startIcon={<ArrowBackRoundedIcon sx={{ fontSize: 16 }} />} sx={{ alignSelf: 'flex-start', px: 1, fontSize: 13, fontWeight: 500, color: site.inkSoft, '&:hover': { color: site.goldText, backgroundColor: 'transparent' } }}>
            {backLabel}
          </Button>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

/** The white card the auth forms sit in (fields and buttons follow the light website theme). */
export function FormCard({ shake, onAnimationEnd, children, component = 'div', ...rest }) {
  return (
      <Paper
        component={component}
        elevation={0}
        onAnimationEnd={onAnimationEnd}
        {...rest}
        sx={{ p: { xs: 2.5, sm: 3.5 }, display: 'flex', flexDirection: 'column', gap: 2, backgroundColor: site.card, color: site.ink, border: `1px solid ${site.border}`, borderRadius: 3, boxShadow: site.shadowPanel, ...shakeSx(shake) }}
      >
        {children}
      </Paper>
  );
}

/** Confirms the booking picked while browsing was kept (1d banner). */
export function BookingIntentBanner({ intent }) {
  if (!intent) return null;
  // Keep only the details that were actually picked, e.g. "Classic · Oct 3, 2026 · 80 guests"
  const parts = [intent.packageName, intent.date && formatDateLong(intent.date), intent.guests && `${intent.guests} guests`].filter(Boolean);
  if (!parts.length) return null;
  return (
    <Box sx={{ display: 'flex', gap: 1.25, px: 1.75, py: 1.5, borderRadius: 1.5, backgroundColor: 'rgba(197, 160, 89, 0.1)', border: '1px solid rgba(197, 160, 89, 0.4)' }}>
      <EventAvailableOutlinedIcon sx={{ fontSize: 19, color: site.goldText, mt: '1px' }} />
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: site.ink }}>{parts.join(' · ')}</Typography>
        <Typography sx={{ fontSize: 12, color: site.inkSoft }}>Saved and carried over to your reservation.</Typography>
      </Box>
    </Box>
  );
}

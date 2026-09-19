import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Toolbar from '@mui/material/Toolbar';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LocalPhoneOutlinedIcon from '@mui/icons-material/LocalPhoneOutlined';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { BUSINESS, BrandMark, firstName, initials, tokens } from '@tm/shared';
import { useAuth } from '../auth.js';
import { site } from '../theme/siteTheme.js';

// Home page sections as [element id, link label]
export const NAV_LINKS = [
  ['packages', 'Packages'],
  ['services', 'Services'],
  ['gallery', 'Gallery'],
  ['faq', 'FAQ'],
  ['contact', 'Contact']
];

// Contact strip items are plain text (not links), so there is no hover colour or pointer cursor
const utilityItemSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.875,
  fontSize: 12,
  letterSpacing: '0.03em',
  color: site.onEspressoSoft
};

/**
 * Public site header (1a / 1b): an espresso contact strip above a sticky ivory navigation bar.
 * Section links scroll on the home page and route back to it from elsewhere.
 */
export default function SiteNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false); // page scrolled down: nav turns solid ivory with a soft shadow
  const [menuOpen, setMenuOpen] = useState(false); // phone/tablet slide-out menu

  // Watch the scroll position; remove the listener when the nav unmounts
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // On the home page: smooth-scroll to the section. On other pages: go to the home page at that section.
  const goToSection = (id) => {
    setMenuOpen(false);
    if (location.pathname === '/') {
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${id}`);
    } else {
      navigate(`/#${id}`);
    }
  };

  return (
    <>
      {/* Thin contact strip (desktop only): service area, phone and email shown as plain, non-clickable text */}
      <Box sx={{ height: 38, display: { xs: 'none', md: 'flex' }, alignItems: 'center', backgroundColor: site.espresso, borderBottom: `1px solid ${site.espressoBorder}` }}>
        <Container maxWidth={false} sx={{ maxWidth: tokens.containerMax, display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={utilityItemSx}>
            <PlaceOutlinedIcon sx={{ fontSize: 14 }} />
            Serving {BUSINESS.serviceArea}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
            <Box sx={utilityItemSx}>
              <LocalPhoneOutlinedIcon sx={{ fontSize: 14 }} />
              {BUSINESS.phone}
            </Box>
            <Box sx={utilityItemSx}>
              <EmailOutlinedIcon sx={{ fontSize: 14 }} />
              {BUSINESS.email}
            </Box>
          </Box>
        </Container>
      </Box>

      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          top: 0,
          zIndex: 1100,
          color: site.ink,
          backgroundColor: scrolled ? 'rgba(251, 247, 240, 0.97)' : 'rgba(251, 247, 240, 0.85)',
          backdropFilter: 'blur(14px)',
          borderBottom: `1px solid ${site.border}`,
          boxShadow: scrolled ? '0 10px 30px -22px rgba(60, 42, 20, 0.45)' : 'none',
          transition: 'background 0.3s ease, box-shadow 0.3s ease'
        }}
      >
        <Container maxWidth={false} sx={{ maxWidth: tokens.containerMax }}>
          <Toolbar disableGutters sx={{ height: 72, gap: 2, justifyContent: 'space-between' }}>
            <BrandMark light={false} onClick={() => navigate('/')} />

            <Box component="ul" sx={{ display: { xs: 'none', lg: 'flex' }, gap: 3.5, listStyle: 'none', m: 0, p: 0 }}>
              {NAV_LINKS.map(([id, label]) => (
                <li key={id}>
                  <Link component="button" type="button" onClick={() => goToSection(id)} underline="none" sx={{ fontFamily: site.fontSans, fontSize: 14, fontWeight: 500, color: site.inkSoft, '&:hover': { color: site.goldText } }}>
                    {label}
                  </Link>
                </li>
              ))}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              {/* Signed in: account button. Signed out: Log in and Sign up. */}
              {user ? (
                <Button
                  onClick={() => navigate('/portal')}
                  sx={{ gap: 1, pl: 0.5, pr: 2, py: 0.5, fontSize: 13, borderRadius: 999, color: site.ink, border: `1px solid ${site.borderHover}`, '&:hover': { backgroundColor: site.goldTint } }}
                >
                  {/* Same size and padding as the portal header, so the circle sits centred in the pill's rounded end */}
                  <Avatar sx={{ width: 32, height: 32, fontSize: 13, fontWeight: 700, bgcolor: site.gold, color: site.ink }}>{initials(user.name)}</Avatar>
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    {firstName(user.name)}'s account
                  </Box>
                  <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                    Account
                  </Box>
                </Button>
              ) : (
                <>
                  <Button onClick={() => navigate('/login')} sx={{ display: { xs: 'none', sm: 'inline-flex' }, px: 2, py: 0.875, fontSize: 13, borderRadius: 999, color: site.ink, border: `1px solid ${site.border}`, '&:hover': { color: site.goldText, borderColor: site.gold, backgroundColor: 'transparent' } }}>
                    Log in
                  </Button>
                  <Button variant="contained" onClick={() => navigate('/signup')} sx={{ display: { xs: 'none', sm: 'inline-flex' }, px: 2.25, py: 0.875, fontSize: 13, borderRadius: 999 }}>
                    Sign up
                  </Button>
                </>
              )}
              <IconButton onClick={() => setMenuOpen(true)} aria-label="Open menu" sx={{ display: { xs: 'inline-flex', lg: 'none' }, color: site.ink }}>
                <MenuRoundedIcon />
              </IconButton>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Slide-out menu for smaller screens */}
      <Drawer anchor="right" open={menuOpen} onClose={() => setMenuOpen(false)} PaperProps={{ sx: { width: 290, backgroundColor: site.ivory, backgroundImage: 'none', borderLeft: `1px solid ${site.border}` } }}>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <BrandMark size={36} light={false} />
          <IconButton onClick={() => setMenuOpen(false)} aria-label="Close menu" sx={{ color: site.ink }}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        <Box component="nav" sx={{ px: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {NAV_LINKS.map(([id, label]) => (
            <Button key={id} fullWidth onClick={() => goToSection(id)} sx={{ justifyContent: 'flex-start', px: 2, py: 1.25, fontSize: 14.5, fontWeight: 500, color: site.ink, '&:hover': { color: site.goldText, backgroundColor: site.goldTint } }}>
              {label}
            </Button>
          ))}
        </Box>
        <Box sx={{ mt: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {user ? (
            <Button variant="contained" onClick={() => navigate('/portal')} sx={{ py: 1.2, borderRadius: 999 }}>
              Go to my account
            </Button>
          ) : (
            <>
              <Button variant="contained" onClick={() => navigate('/signup')} sx={{ py: 1.2, borderRadius: 999 }}>
                Sign up
              </Button>
              <Button onClick={() => navigate('/login')} sx={{ py: 1.2, borderRadius: 999, color: site.ink, border: `1px solid ${site.border}` }}>
                Log in
              </Button>
            </>
          )}
        </Box>
      </Drawer>
    </>
  );
}

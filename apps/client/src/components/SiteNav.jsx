import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LocalPhoneOutlinedIcon from '@mui/icons-material/LocalPhoneOutlined';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { BUSINESS, BrandMark, firstName, initials } from '@tm/shared';
import { useAuth } from '../auth.js';
import { site, siteContainerSx } from '../theme/siteTheme.js';

export const NAV_LINKS = [
  ['packages', 'Packages'],
  ['availability', 'Plan your event'],
  ['gallery', 'Gallery'],
  ['services', 'Services'],
  ['faq', 'FAQ'],
  ['contact', 'Contact']
];

const utilityItemSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.875,
  fontSize: 12,
  letterSpacing: '0.03em',
  color: site.onEspressoSoft
};

export default function SiteNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const navRef = useRef(null);
  const desktopNavRef = useRef(null);
  const pendingSectionRef = useRef('');
  const scrollSettledTimerRef = useRef(null);
  const [indicator, setIndicator] = useState(null);

  useLayoutEffect(() => {
    const nav = desktopNavRef.current;
    if (!nav || !activeSection) return undefined;

    const updateIndicator = () => {
      const button = nav.querySelector('[aria-current="location"]');
      if (!button || !button.getClientRects().length) return;
      const bounds = nav.getBoundingClientRect();
      const target = button.getBoundingClientRect();
      const navStyle = window.getComputedStyle(nav);
      const next = {
        x: target.left - bounds.left - parseFloat(navStyle.borderLeftWidth),
        y: target.top - bounds.top - parseFloat(navStyle.borderTopWidth),
        width: target.width,
        height: target.height
      };
      setIndicator((previous) =>
        previous && Object.keys(next).every((key) => previous[key] === next[key]) ? previous : next
      );
    };

    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(nav);
    nav.querySelectorAll('button').forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [activeSection]);

  useEffect(() => {
    const locationSection = location.pathname.startsWith('/packages/')
      ? 'packages'
      : location.pathname === '/'
        ? location.hash.slice(1)
        : '';

    setActiveSection(locationSection);
    if (location.pathname === '/' && locationSection) pendingSectionRef.current = locationSection;
    else pendingSectionRef.current = '';
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    let frame = null;
    const sections =
      location.pathname === '/' ? NAV_LINKS.map(([id]) => document.getElementById(id)).filter(Boolean) : [];

    const updateScroll = () => {
      frame = null;
      setScrolled(window.scrollY > 20);
      if (!sections.length) return;

      const headerBottom = navRef.current?.getBoundingClientRect().bottom ?? 0;
      let current = '';
      for (const section of sections) {
        const scrollMargin = parseFloat(window.getComputedStyle(section).scrollMarginTop) || 0;
        if (section.getBoundingClientRect().top <= Math.max(headerBottom, scrollMargin) + 1) {
          current = section.id;
        }
      }

      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        current = sections[sections.length - 1].id;
      }

      const pendingSection = pendingSectionRef.current;
      if (pendingSection) {
        const target = document.getElementById(pendingSection);
        if (target) {
          const scrollMargin = parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0;
          const maximumScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          const targetScrollY = Math.min(
            Math.max(0, window.scrollY + target.getBoundingClientRect().top - scrollMargin),
            maximumScrollY
          );

          if (Math.abs(window.scrollY - targetScrollY) > 2) {
            setActiveSection(pendingSection);
            return;
          }
        }

        pendingSectionRef.current = '';
        window.clearTimeout(scrollSettledTimerRef.current);
      }
      setActiveSection(current);
    };

    const requestUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(updateScroll);
    };

    const onScroll = () => {
      if (pendingSectionRef.current) {
        window.clearTimeout(scrollSettledTimerRef.current);
        scrollSettledTimerRef.current = window.setTimeout(() => {
          pendingSectionRef.current = '';
          requestUpdate();
        }, 160);
      }
      requestUpdate();
    };

    updateScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', requestUpdate);

    const observer = new ResizeObserver(requestUpdate);
    if (navRef.current) observer.observe(navRef.current);
    sections.forEach((section) => observer.observe(section));

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', requestUpdate);
      observer.disconnect();
      window.clearTimeout(scrollSettledTimerRef.current);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [location.pathname, location.hash]);

  const goToSection = (id) => {
    pendingSectionRef.current = id;
    setActiveSection(id);
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
      <Box
        sx={{
          height: 32,
          display: { xs: 'none', md: 'flex' },
          alignItems: 'center',
          backgroundColor: site.espresso,
          borderBottom: `1px solid ${site.espressoBorder}`
        }}
      >
        <Container
          maxWidth={false}
          sx={{ ...siteContainerSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
        >
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
        ref={navRef}
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
        <Container maxWidth={false} sx={siteContainerSx}>
          <Toolbar
            disableGutters
            sx={{
              minHeight: { xs: 72, lg: 84 },
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', lg: 'minmax(0, 1fr) auto minmax(0, 1fr)' },
              columnGap: { xs: 1, sm: 2, lg: 3 },
              alignItems: 'center'
            }}
          >
            <Box
              sx={{
                display: 'flex',
                minWidth: 0,
                '& > button:focus-visible': { outline: `2px solid ${site.goldText}`, outlineOffset: 5, borderRadius: 1 }
              }}
            >
              <BrandMark size={46} light={false} onClick={() => navigate('/')} />
            </Box>

            <Box
              ref={desktopNavRef}
              component="nav"
              aria-label="Main navigation"
              sx={{
                position: 'relative',
                display: { xs: 'none', lg: 'block' },
                borderRadius: 999,
                backgroundColor: site.sand,
                border: `1px solid ${site.border}`,
                p: 0.75
              }}
            >
              <Box
                aria-hidden="true"
                style={{
                  transform: `translate3d(${indicator?.x ?? 0}px, ${indicator?.y ?? 0}px, 0)`,
                  width: indicator?.width ?? 0,
                  height: indicator?.height ?? 40,
                  opacity: activeSection && indicator ? 1 : 0
                }}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  pointerEvents: 'none',
                  borderRadius: 999,
                  backgroundColor: site.card,
                  boxShadow: '0 2px 6px rgba(60, 42, 20, 0.08)',
                  transition:
                    'transform 280ms cubic-bezier(0.4, 0, 0.2, 1), width 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms ease',
                  '@media (prefers-reduced-motion: reduce)': { transition: 'none' }
                }}
              />
              <Box
                component="ul"
                sx={{ display: 'flex', alignItems: 'center', gap: 1.25, listStyle: 'none', m: 0, p: 0 }}
              >
                {NAV_LINKS.map(([id, label]) => (
                  <li key={id}>
                    <Button
                      onClick={() => goToSection(id)}
                      aria-current={activeSection === id ? 'location' : undefined}
                      sx={{
                        minHeight: 40,
                        minWidth: 0,
                        px: 2.25,
                        fontSize: 14,
                        fontWeight: activeSection === id ? 700 : 500,
                        borderRadius: 999,
                        whiteSpace: 'nowrap',
                        color: activeSection === id ? site.ink : site.inkSoft,
                        backgroundColor: 'transparent',
                        transition: 'color 260ms ease, background-color 260ms ease',
                        '&:hover': {
                          color: site.goldText,
                          backgroundColor: activeSection === id ? 'transparent' : site.goldTint
                        },
                        '&:focus-visible': { outline: `2px solid ${site.goldText}`, outlineOffset: 2 },
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' }
                      }}
                    >
                      <Box
                        component="span"
                        data-label={label}
                        sx={{
                          display: 'inline-grid',
                          '&::after': {
                            content: 'attr(data-label)',
                            gridArea: '1 / 1',
                            fontWeight: 700,
                            visibility: 'hidden',
                            pointerEvents: 'none'
                          }
                        }}
                      >
                        <Box component="span" sx={{ gridArea: '1 / 1' }}>
                          {label}
                        </Box>
                      </Box>
                    </Button>
                  </li>
                ))}
              </Box>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifySelf: 'end',
                minWidth: 0,
                gap: { xs: 1.5, sm: 1.75 }
              }}
            >
              {user ? (
                <Button
                  onClick={() => navigate('/portal')}
                  aria-label="Go to my account"
                  sx={{
                    gap: 1,
                    minWidth: 0,
                    minHeight: 44,
                    maxWidth: '100%',
                    pl: 0.5,
                    pr: { xs: 0.5, sm: 2 },
                    py: 0.5,
                    fontSize: 13,
                    borderRadius: 999,
                    color: site.ink,
                    border: `1px solid ${site.borderHover}`,
                    '&:hover': { backgroundColor: site.goldTint }
                  }}
                >
                  <Avatar
                    sx={{ width: 32, height: 32, fontSize: 13, fontWeight: 700, bgcolor: site.gold, color: site.ink }}
                  >
                    {initials(user.name)}
                  </Avatar>
                  <Box
                    component="span"
                    sx={{
                      display: { xs: 'none', sm: 'inline' },
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 160
                    }}
                  >
                    {firstName(user.name)}'s account
                  </Box>
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => navigate('/login')}
                    sx={{
                      display: { xs: 'none', sm: 'inline-flex' },
                      minHeight: 44,
                      px: 2.5,
                      fontSize: 13,
                      borderRadius: 999,
                      color: site.ink,
                      border: `1px solid ${site.border}`,
                      '&:hover': { color: site.goldText, borderColor: site.gold, backgroundColor: site.goldTint }
                    }}
                  >
                    Log in
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => navigate('/signup')}
                    sx={{
                      display: { xs: 'none', sm: 'inline-flex' },
                      minHeight: 44,
                      px: 2.75,
                      fontSize: 13,
                      borderRadius: 999,
                      boxShadow: 'none'
                    }}
                  >
                    Sign up
                  </Button>
                </>
              )}
              <IconButton
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? 'site-mobile-navigation' : undefined}
                sx={{
                  display: { xs: 'inline-flex', lg: 'none' },
                  width: 44,
                  height: 44,
                  border: `1px solid ${site.border}`,
                  borderRadius: 1.5,
                  color: site.ink,
                  backgroundColor: site.card
                }}
              >
                <MenuRoundedIcon />
              </IconButton>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      <Drawer
        anchor="right"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        PaperProps={{
          sx: {
            width: 340,
            maxWidth: 'calc(100vw - 24px)',
            backgroundColor: site.ivory,
            backgroundImage: 'none',
            borderLeft: `1px solid ${site.border}`
          }
        }}
      >
        <Box
          sx={{
            px: 2.5,
            py: 3,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1,
            borderBottom: `1px solid ${site.border}`
          }}
        >
          <BrandMark size={36} light={false} />
          <IconButton
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            sx={{ width: 44, height: 44, border: `1px solid ${site.border}`, borderRadius: 1.5, color: site.ink }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        <Box
          component="nav"
          id="site-mobile-navigation"
          aria-label="Mobile navigation"
          sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}
        >
          {NAV_LINKS.map(([id, label]) => (
            <Button
              key={id}
              fullWidth
              onClick={() => goToSection(id)}
              aria-current={activeSection === id ? 'location' : undefined}
              sx={{
                justifyContent: 'flex-start',
                minHeight: 52,
                px: 2,
                fontSize: 15,
                fontWeight: activeSection === id ? 700 : 500,
                borderRadius: 1.5,
                color: activeSection === id ? site.goldText : site.ink,
                backgroundColor: activeSection === id ? site.goldTint : 'transparent',
                '&:hover': { color: site.goldText, backgroundColor: site.goldTint }
              }}
            >
              {label}
            </Button>
          ))}
        </Box>
        <Box
          sx={{
            mt: 'auto',
            p: 2.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
            borderTop: `1px solid ${site.border}`
          }}
        >
          {user ? (
            <Button variant="contained" onClick={() => navigate('/portal')} sx={{ py: 1.2, borderRadius: 999 }}>
              Go to my account
            </Button>
          ) : (
            <>
              <Button variant="contained" onClick={() => navigate('/signup')} sx={{ py: 1.2, borderRadius: 999 }}>
                Sign up
              </Button>
              <Button
                onClick={() => navigate('/login')}
                sx={{ py: 1.2, borderRadius: 999, color: site.ink, border: `1px solid ${site.border}` }}
              >
                Log in
              </Button>
            </>
          )}
        </Box>
      </Drawer>
    </>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import { peso, tokens } from '@tm/shared';
import { site } from '../theme/siteTheme.js';
import { reducedMotionSx, useInView } from './Reveal.jsx';

// Maps the icon name stored on a package to the icon component that draws it
export const PACKAGE_ICONS = {
  restaurant: RestaurantOutlinedIcon,
  celebration: CelebrationOutlinedIcon,
  favorite: FavoriteBorderRoundedIcon,
  work: WorkOutlineRoundedIcon
};

// Package illustrations shown instead of the plain icon on the public website, keyed by package slug.
// Each file in src/assets/packages is named after its package's slug (e.g. package-2-with-waiters.svg) and
// pictures what that package includes; Vite bundles them and gives back their URLs.
// A package without a matching file (e.g. a new or renamed one) keeps the icon panel.
export const PACKAGE_BACKDROPS = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/packages/*.svg', { eager: true, import: 'default' })).map(([file, url]) => [file.split('/').pop().replace('.svg', ''), url])
);

/**
 * Eyebrow, serif title, description and gold rule on the light website background (design system: SectionHead).
 * Every time it scrolls into view, the lines fade up one after another and the gold rule draws
 * itself outward from the centre. It then stays still until it leaves the screen.
 */
export function SectionHead({ eyebrow, title, description, align = 'center' }) {
  const [ref, shown] = useInView();
  // Fade-and-rise for one line, `delay` ms after the heading comes into view
  const line = (delay) => ({
    opacity: shown ? 1 : 0,
    transform: shown ? 'none' : 'translateY(14px)',
    transition: `opacity 0.7s ease ${delay}ms, transform 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
    ...reducedMotionSx
  });
  return (
    <Box ref={ref} sx={{ textAlign: align, maxWidth: 720, mx: align === 'center' ? 'auto' : 0, mb: { xs: 4, md: 6 } }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: site.goldText, ...line(0) }}>{eyebrow}</Typography>
      <Typography component="h2" sx={{ mt: 1.5, fontFamily: site.fontSerif, fontSize: { xs: 30, md: 40 }, fontWeight: 600, lineHeight: 1.2, color: site.ink, ...line(120) }}>
        {title}
      </Typography>
      {description && <Typography sx={{ mt: 2, fontSize: 15, lineHeight: 1.75, color: site.inkSoft, ...line(240) }}>{description}</Typography>}
      {/* Gold rule grows from 0 to its full width */}
      <Box
        sx={{
          width: 64,
          height: 2,
          mx: align === 'center' ? 'auto' : 0,
          mt: 3,
          borderRadius: 999,
          background: tokens.gradientGoldRule,
          transform: shown ? 'scaleX(1)' : 'scaleX(0)',
          transformOrigin: align === 'center' ? 'center' : 'left',
          transition: 'transform 0.9s cubic-bezier(0.22, 1, 0.36, 1) 380ms',
          ...reducedMotionSx
        }}
      />
    </Box>
  );
}

/**
 * Mood wash + outlined icon panel used by package cards and the package hero.
 * `light` uses the light website washes (public pages); without it the navy washes are kept (customer portal).
 * On the light website, packages with an illustration in PACKAGE_BACKDROPS show it instead of the icon;
 * the illustration sits in a "tm-mood-art" layer (panel class "tm-has-art") so a parent can zoom it on hover.
 * The icon has the class "tm-mood-icon" so a parent (e.g. PackageCard) can animate it without changing other pages.
 */
export function MoodPanel({ pkg, height = 150, iconSize = 52, light = false, children, sx }) {
  // Use the package's icon, or a plate icon if none is set
  const Icon = PACKAGE_ICONS[pkg.icon] || RestaurantOutlinedIcon;
  // Illustrated backdrop for this package (public website only)
  const backdrop = light ? PACKAGE_BACKDROPS[pkg.slug] : null;
  // pkg.mood % 4 picks one of the 4 background colours from the light or the navy set
  const mood = (light ? site.moods : tokens.moods)[pkg.mood % 4];
  const texture = light ? site.textureLinen : tokens.textureLinen;
  return (
    <Box className={backdrop ? 'tm-mood-panel tm-has-art' : 'tm-mood-panel'} sx={{ position: 'relative', overflow: 'hidden', height, display: 'grid', placeItems: 'center', color: light ? 'rgba(138, 106, 47, 0.75)' : 'rgba(197, 160, 89, 0.6)', background: mood, backgroundImage: `${texture}, ${mood}`, ...sx }}>
      {backdrop ? (
        <Box className="tm-mood-art" aria-hidden sx={{ position: 'absolute', inset: 0, backgroundImage: `url(${backdrop})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      ) : (
        <Icon className="tm-mood-icon" sx={{ fontSize: iconSize }} />
      )}
      {children}
    </Box>
  );
}

// Package card animations (see PackageCard)
// The icon slowly bobs up and down while the card is on screen
const iconFloat = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
`;
// A soft gold ring that breathes around the icon
const iconHalo = keyframes`
  0%, 100% { opacity: 0.25; transform: translate(-50%, -50%) scale(0.85); }
  50% { opacity: 0.55; transform: translate(-50%, -50%) scale(1.05); }
`;
// A diagonal band of light that sweeps across the top panel
const shineSweep = keyframes`
  from { left: -60%; }
  to { left: 130%; }
`;

/**
 * One package in the public catalog (1a): a white card with a light mood panel, serif name and price.
 * Animations: the card rises and fades in every time it is scrolled into view (cards in the same row follow
 * one another, using `index`); on hover it lifts with a gold glow, a light sweeps across the top
 * panel, the icon grows and tilts (or the package illustration zooms in slowly), the price turns gold,
 * the button fills gold-brown and its arrow slides right.
 * The icon floats gently at all times. Everything is switched off for visitors whose device asks for reduced motion.
 */
export function PackageCard({ pkg, index = 0, compact = false }) {
  const navigate = useNavigate();
  // Replays every time the card comes back on screen (see useInView in Reveal.jsx)
  const [ref, shown] = useInView();
  // true once the entrance animation has finished; hover then reacts immediately and a little faster
  const [settled, setSettled] = useState(false);
  // When the card leaves the screen, reset so the next entrance uses the row stagger again
  useEffect(() => {
    if (!shown) setSettled(false);
  }, [shown]);
  // Open this package's detail page
  const open = () => navigate(`/packages/${pkg.slug}`);
  // Entrance delay by the card's position in a 3-column row: 0 ms, 110 ms, 220 ms (none after it has settled)
  const delay = settled ? 0 : (index % 3) * 110;
  const duration = settled ? 0.45 : 0.7;

  return (
    <Paper
      ref={ref}
      // The card's own rise-in finished (ignore transitions bubbling up from the button or icon)
      onTransitionEnd={(e) => {
        if (shown && e.target === e.currentTarget && e.propertyName === 'transform') setSettled(true);
      }}
      component="article"
      elevation={0}
      sx={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 3,
        backgroundColor: site.card,
        border: `1px solid ${pkg.featured ? site.borderHover : site.border}`,
        boxShadow: site.shadowCard,
        // Scroll reveal: hidden and lowered until `shown`, then eased into place
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0) scale(1)' : 'translateY(36px) scale(0.96)',
        transition: `opacity ${duration}s ease ${delay}ms, transform ${duration}s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, border-color 0.3s ease, box-shadow 0.35s ease`,

        // Top panel: a light band waits off to the left, ready to sweep on hover
        '& .tm-mood-panel': { overflow: 'hidden' },
        '& .tm-mood-panel::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: '-60%',
          width: '45%',
          height: '100%',
          background: 'linear-gradient(105deg, transparent 0%, rgba(255, 255, 255, 0.65) 50%, transparent 100%)',
          transform: 'skewX(-18deg)',
          pointerEvents: 'none'
        },
        // Soft white halo behind the icon
        '& .tm-mood-panel::before': {
          content: '""',
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: compact ? 84 : 104,
          height: compact ? 84 : 104,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, transparent 70%)',
          animation: `${iconHalo} 4s ease-in-out infinite`,
          pointerEvents: 'none'
        },
        // Illustrated backdrops have no icon, so no halo; the illustration eases in and out of its hover zoom
        '& .tm-has-art::before': { display: 'none' },
        '& .tm-mood-art': { transition: 'transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)' },
        // The icon bobs gently; its hover grow/tilt sits on the wrapper transform below
        '& .tm-mood-icon': {
          position: 'relative',
          animation: `${iconFloat} 4s ease-in-out ${(index % 3) * 110}ms infinite`,
          transition: 'color 0.35s ease, filter 0.35s ease, scale 0.35s ease, rotate 0.35s ease'
        },
        '& .tm-card-price': { transition: 'color 0.3s ease' },
        '& .tm-card-arrow': { transition: 'transform 0.3s ease' },

        // Hover (after the card has revealed): lift, gold border and glow, sweep, darker icon, gold price, arrow nudges right
        ...(shown && {
          '&:hover': {
            transform: 'translateY(-10px) scale(1.015)',
            borderColor: site.gold,
            boxShadow: `${site.shadowCardHover}, 0 22px 50px -24px rgba(197, 160, 89, 0.45)`
          },
          '&:hover .tm-mood-panel::after': { animation: `${shineSweep} 0.9s ease` },
          '&:hover .tm-mood-icon': { color: site.goldText, filter: 'drop-shadow(0 6px 10px rgba(138, 106, 47, 0.25))', scale: '1.15', rotate: '-6deg' },
          '&:hover .tm-mood-art': { transform: 'scale(1.06)' },
          '&:hover .tm-card-price': { color: site.gold },
          '&:hover .tm-card-arrow': { transform: 'translateX(5px)' }
        }),

        // Visitors who asked their device for less motion get the plain, static card
        '@media (prefers-reduced-motion: reduce)': {
          opacity: 1,
          transform: 'none',
          transition: 'border-color 0.25s ease',
          '& .tm-mood-icon, & .tm-mood-panel::before': { animation: 'none' },
          '&:hover': { transform: 'none' },
          '&:hover .tm-mood-panel::after': { animation: 'none' },
          '&:hover .tm-mood-icon': { scale: '1', rotate: '0deg' },
          '&:hover .tm-mood-art': { transform: 'none' }
        }
      }}
    >
      <MoodPanel pkg={pkg} light height={compact ? 110 : 160} iconSize={compact ? 40 : 52}>
        {pkg.featured && (
          <Typography component="span" sx={{ position: 'absolute', top: 12, right: 12, px: 1.25, py: 0.5, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', borderRadius: 999, color: site.onEspresso, backgroundColor: site.espresso }}>
            Most booked
          </Typography>
        )}
      </MoodPanel>

      <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        <Typography component="h3" sx={{ fontFamily: site.fontSerif, fontSize: 23, fontWeight: 600, color: site.ink }}>
          {pkg.name}
        </Typography>
        <Typography sx={{ fontSize: 13.5, lineHeight: 1.65, color: site.inkSoft }}>{pkg.description}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12.5, color: site.inkMuted }}>
          <GroupsOutlinedIcon sx={{ fontSize: 16, color: site.gold }} />
          Covers {pkg.guests} guests
        </Box>
        {/* Flat package price; food is cooked to the customer's request and quoted separately */}
        <Box sx={{ mt: 'auto', pt: 1.5 }}>
          <Typography className="tm-card-price" sx={{ fontFamily: site.fontSerif, fontSize: 28, fontWeight: 700, color: site.goldText }}>{peso(pkg.price)}</Typography>
        </Box>
        <Typography sx={{ fontSize: 12, color: site.inkMuted }}>Food quoted separately</Typography>
        <Button
          onClick={open}
          fullWidth
          endIcon={<ArrowForwardRoundedIcon className="tm-card-arrow" />}
          sx={{
            mt: 1.5,
            py: 1.1,
            fontSize: 13.5,
            borderRadius: 999,
            // Featured package: solid charcoal button; others: outlined. Both fill gold-brown on hover.
            color: pkg.featured ? site.ivory : site.ink,
            backgroundColor: pkg.featured ? site.ink : 'transparent',
            border: `1px solid ${pkg.featured ? site.ink : site.border}`,
            '&:hover': { color: site.ivory, backgroundColor: site.goldText, borderColor: site.goldText }
          }}
        >
          View package
        </Button>
      </Box>
    </Paper>
  );
}

/** Input styling for fields on the light website cards (e.g. the availability bar). */
export const siteFieldSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: site.card,
    borderRadius: 1.25,
    fontSize: 14,
    color: site.ink,
    '& fieldset': { borderColor: site.border },
    '&:hover fieldset': { borderColor: site.borderHover },
    '&.Mui-focused fieldset': { borderColor: site.gold }
  },
  '& .MuiSelect-icon': { color: site.inkMuted },
  '& .MuiFormHelperText-root': { mx: 0 }
};

/** Small uppercase label styling for fields on the light website cards. */
export const siteLabelSx = { display: 'block', mb: 0.75, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: site.inkMuted };

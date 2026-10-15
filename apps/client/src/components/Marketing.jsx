import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import ChairOutlinedIcon from '@mui/icons-material/ChairOutlined';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import { isRentalPackage, peso, tokens } from '@tm/shared';
import { site } from '../theme/siteTheme.js';
import { reducedMotionSx, revealEnter, useInView } from './Reveal.jsx';
import PackageTilt from './PackageTilt.jsx';

export const PACKAGE_ICONS = {
  restaurant: RestaurantOutlinedIcon,
  celebration: CelebrationOutlinedIcon,
  favorite: FavoriteBorderRoundedIcon,
  work: WorkOutlineRoundedIcon,
  chair: ChairOutlinedIcon
};

export const PACKAGE_BACKDROPS = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/packages/*.svg', { eager: true, import: 'default' })).map(
    ([file, url]) => [file.split('/').pop().replace('.svg', ''), url]
  )
);

const ruleEnter = keyframes`
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
`;

export function SectionHead({ eyebrow, title, description, align = 'center' }) {
  const [ref, shown] = useInView();
  const line = (delay) => ({
    animation: shown ? `${revealEnter} 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms backwards` : 'none',
    ...reducedMotionSx
  });
  return (
    <Box
      ref={ref}
      data-reveal-state={shown ? 'entered' : 'outside'}
      sx={{ textAlign: align, maxWidth: 720, mx: align === 'center' ? 'auto' : 0, mb: { xs: 4, md: 6 } }}
    >
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: site.goldText, ...line(0) }}>{eyebrow}</Typography>
      <Typography
        component="h2"
        sx={{
          mt: 1.5,
          fontFamily: site.fontSerif,
          fontSize: { xs: 30, md: 40 },
          fontWeight: 600,
          lineHeight: 1.2,
          color: site.ink,
          ...line(120)
        }}
      >
        {title}
      </Typography>
      {description && (
        <Typography sx={{ mt: 2, fontSize: 15, lineHeight: 1.75, color: site.inkSoft, ...line(240) }}>
          {description}
        </Typography>
      )}
      <Box
        sx={{
          width: 64,
          height: 2,
          mx: align === 'center' ? 'auto' : 0,
          mt: 3,
          borderRadius: 999,
          background: tokens.gradientGoldRule,
          transformOrigin: align === 'center' ? 'center' : 'left',
          animation: shown ? `${ruleEnter} 0.9s cubic-bezier(0.22, 1, 0.36, 1) 380ms backwards` : 'none',
          ...reducedMotionSx
        }}
      />
    </Box>
  );
}

export function MoodPanel({ pkg, height = 150, iconSize = 52, light = false, children, sx }) {
  const Icon = PACKAGE_ICONS[pkg.icon] || RestaurantOutlinedIcon;
  const backdrop = light ? PACKAGE_BACKDROPS[pkg.slug] : null;
  const mood = (light ? site.moods : tokens.moods)[pkg.mood % 4];
  const texture = light ? site.textureLinen : tokens.textureLinen;
  return (
    <Box
      className={backdrop ? 'tm-mood-panel tm-has-art' : 'tm-mood-panel'}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        height,
        display: 'grid',
        placeItems: 'center',
        color: light ? 'rgba(138, 106, 47, 0.75)' : 'rgba(197, 160, 89, 0.6)',
        background: mood,
        backgroundImage: `${texture}, ${mood}`,
        ...sx
      }}
    >
      {backdrop ? (
        <Box
          className="tm-mood-art"
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${backdrop})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      ) : (
        <Icon className="tm-mood-icon" sx={{ fontSize: iconSize }} />
      )}
      {children}
    </Box>
  );
}

const iconFloat = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
`;
const iconHalo = keyframes`
  0%, 100% { opacity: 0.25; transform: translate(-50%, -50%) scale(0.85); }
  50% { opacity: 0.55; transform: translate(-50%, -50%) scale(1.05); }
`;
const shineSweep = keyframes`
  from { left: -60%; }
  to { left: 130%; }
`;

export function PackageCard({ pkg, index = 0, compact = false }) {
  const navigate = useNavigate();
  const [ref, shown] = useInView();
  const open = () => navigate(`/packages/${pkg.slug}`);
  const rental = isRentalPackage(pkg);
  const delay = (index % 3) * 110;

  return (
    <PackageTilt enabled={shown} observeRef={ref}>
      <Paper
        data-reveal-state={shown ? 'entered' : 'outside'}
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
          '--tm-reveal-y': '36px',
          '--tm-reveal-scale': 0.96,
          animation: shown ? `${revealEnter} 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms backwards` : 'none',
          transition: 'border-color 0.3s ease, box-shadow 0.35s ease',

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
          '& .tm-has-art::before': { display: 'none' },
          '& .tm-mood-art': { transition: 'transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)' },
          '& .tm-mood-icon': {
            position: 'relative',
            animation: `${iconFloat} 4s ease-in-out ${(index % 3) * 110}ms infinite`,
            transition: 'color 0.35s ease, filter 0.35s ease, scale 0.35s ease, rotate 0.35s ease'
          },
          '& .tm-card-price': { transition: 'color 0.3s ease' },
          '& .tm-card-arrow': { transition: 'transform 0.3s ease' },

          ...(shown && {
            '@media (hover: hover) and (pointer: fine)': {
              '&:hover': {
                borderColor: site.gold,
                boxShadow: `${site.shadowCardHover}, 0 22px 50px -24px rgba(197, 160, 89, 0.45)`
              },
              '&:hover .tm-mood-panel::after': { animation: `${shineSweep} 0.9s ease` },
              '&:hover .tm-mood-icon': {
                color: site.goldText,
                filter: 'drop-shadow(0 6px 10px rgba(138, 106, 47, 0.25))',
                scale: '1.15',
                rotate: '-6deg'
              },
              '&:hover .tm-mood-art': { transform: 'scale(1.06)' },
              '&:hover .tm-card-price': { color: site.gold },
              '&:hover .tm-card-arrow': { transform: 'translateX(5px)' }
            }
          }),

          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none',
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
            <Typography
              component="span"
              sx={{
                position: 'absolute',
                top: 12,
                right: 12,
                px: 1.25,
                py: 0.5,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                borderRadius: 999,
                color: site.onEspresso,
                backgroundColor: site.espresso
              }}
            >
              Most booked
            </Typography>
          )}
        </MoodPanel>

        <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
          <Typography
            component="h3"
            sx={{ fontFamily: site.fontSerif, fontSize: 23, fontWeight: 600, color: site.ink }}
          >
            {pkg.name}
          </Typography>
          <Typography sx={{ fontSize: 13.5, lineHeight: 1.65, color: site.inkSoft }}>{pkg.description}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12.5, color: site.inkMuted }}>
            <GroupsOutlinedIcon sx={{ fontSize: 16, color: site.gold }} />
            {rental ? 'Rent only what you need' : `Default: ${pkg.guests} guests`}
          </Box>
          <Box sx={{ mt: 'auto', pt: 1.5 }}>
            <Typography
              className="tm-card-price"
              sx={{ fontFamily: site.fontSerif, fontSize: 28, fontWeight: 700, color: site.goldText }}
            >
              {rental ? 'Per piece' : peso(pkg.price)}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 12, color: site.inkMuted }}>
            {rental ? 'Pick up or delivery' : 'Food quoted separately'}
          </Typography>
          <Button
            onClick={open}
            fullWidth
            endIcon={<ArrowForwardRoundedIcon className="tm-card-arrow" />}
            sx={{
              mt: 1.5,
              py: 1.1,
              fontSize: 13.5,
              borderRadius: 999,
              color: pkg.featured ? site.ivory : site.ink,
              backgroundColor: pkg.featured ? site.ink : 'transparent',
              border: `1px solid ${pkg.featured ? site.ink : site.border}`,
              '&:hover': { color: site.ivory, backgroundColor: site.goldText, borderColor: site.goldText }
            }}
          >
            {rental ? 'See the price list' : 'View package'}
          </Button>
        </Box>
      </Paper>
    </PackageTilt>
  );
}

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

export const siteLabelSx = { display: 'block', mb: 0.75, fontSize: 12, fontWeight: 600, color: site.inkMuted };

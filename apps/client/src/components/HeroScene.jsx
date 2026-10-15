import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import { HeroPhoto } from '@tm/shared';
import { attachHeroDepth, HERO_DEPTH_MEDIA } from '../lib/heroDepth.js';
import { site } from '../theme/siteTheme.js';

export default function HeroScene({ settings }) {
  const hostRef = useRef(null);
  const surfaceRef = useRef(null);
  const canAnimate = useMediaQuery(HERO_DEPTH_MEDIA);
  useEffect(() => {
    if (!canAnimate || !hostRef.current || !surfaceRef.current) return undefined;
    return attachHeroDepth({ host: hostRef.current, surface: surfaceRef.current, win: window, doc: document });
  }, [canAnimate]);
  return (
    <Box
      ref={hostRef}
      component="figure"
      className="tm-hero-scene"
      sx={{ m: 0, minWidth: 0, width: '100%', maxWidth: { xs: 680, md: 'none' }, mx: 'auto', position: 'relative' }}
    >
      <Box
        ref={surfaceRef}
        className="tm-hero-depth"
        sx={{
          position: 'relative',
          borderRadius: { xs: '24px 24px 24px 6px', md: '36px 36px 36px 8px' },
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 4,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            background: 'linear-gradient(140deg, rgba(197,160,89,0.28), rgba(197,160,89,0.05))',
            border: `1px solid ${site.borderHover}`,
            transform: 'translate(10px, 10px) rotate(1.5deg)'
          },
          [`@media ${HERO_DEPTH_MEDIA}`]: {
            transform: 'perspective(1400px) rotateX(var(--hero-rx, 0deg)) rotateY(var(--hero-ry, 0deg))',
            transition: 'transform 400ms ease-out',
            '&::before': {
              transform: 'translate3d(var(--hero-decor-x, 0px), var(--hero-decor-y, 10px), 0) rotate(1.5deg)',
              transition: 'transform 700ms ease-out'
            },
            '& .tm-hero-photo-layer': {
              transform: 'translate3d(var(--hero-photo-x, 0px), var(--hero-photo-y, 0px), 0) scale(1.06)',
              transition: 'transform 350ms ease-out'
            }
          }
        }}
      >
        <Box
          sx={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 'inherit',
            border: `1px solid ${site.border}`,
            boxShadow: site.shadowPanel,
            backgroundColor: site.sand
          }}
        >
          <Box className="tm-hero-photo-layer">
            <HeroPhoto settings={settings} fetchPriority="high" />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

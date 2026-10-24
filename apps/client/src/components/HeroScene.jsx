import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { attachHeroTableScroll, HERO_TABLE_SCROLL_MEDIA } from '../lib/heroTableMotion.js';
import tablePoster from '../assets/hero-table.webp';
import tableStartPoster from '../assets/hero-table-start.webp';
import { site } from '../theme/siteTheme.js';

const phases = ['Set the scene', 'Bring in the details', 'Let the celebration begin'];
const palette = {
  ivory: site.ivory,
  champagne: site.sand,
  white: site.card,
  gold: site.gold,
  goldLight: site.goldLight,
  goldDark: site.goldText
};

export default function HeroScene({ scrollRef, onMotionAvailable }) {
  const trackRef = useRef(null);
  const viewportRef = useRef(null);
  const mountRef = useRef(null);
  const progressRef = useRef(null);
  const phaseRef = useRef(0);
  const [phase, setPhase] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)', { noSsr: true });
  const shortViewport = useMediaQuery('(max-height: 499px), (min-width: 900px) and (max-height: 679px)', {
    noSsr: true
  });
  const staticScene = reducedMotion || shortViewport || failed;

  useEffect(() => {
    if (reducedMotion || shortViewport) {
      setReady(false);
      onMotionAvailable(false);
      return undefined;
    }
    let stopped = false;
    let scene;
    let detach;
    let observer;
    let lastProgress = 0;
    const mount = mountRef.current;
    const track = trackRef.current;
    const viewport = viewportRef.current;
    const dispose = () => {
      detach?.();
      observer?.disconnect();
      scene?.dispose();
      scene = undefined;
    };
    const fallback = () => {
      if (stopped) return;
      dispose();
      setReady(false);
      setFailed(true);
      onMotionAvailable(false);
    };
    setFailed(false);
    onMotionAvailable(true);
    import('../lib/heroTableScene.js')
      .then(({ createHeroTableScene }) => {
        if (stopped) return;
        scene = createHeroTableScene({
          mount,
          palette,
          pixelRatio: Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1.25 : 1.5),
          onContextLost: fallback
        });
        const draw = (progress) => {
          if (!scene || stopped) return;
          lastProgress = progress;
          try {
            scene.render(progress);
          } catch {
            fallback();
            return;
          }
          track.dataset.progress = progress.toFixed(3);
          const nextPhase = progress < 0.28 ? 0 : progress < 0.68 ? 1 : 2;
          if (phaseRef.current !== nextPhase) {
            phaseRef.current = nextPhase;
            setPhase(nextPhase);
          }
          progressRef.current?.style.setProperty('transform', `scaleX(${progress})`);
        };
        const resize = () => {
          if (!scene || stopped) return;
          scene.resize(mount.clientWidth, mount.clientHeight);
          draw(lastProgress);
        };
        resize();
        if (!scene || stopped) return;
        observer = new ResizeObserver(resize);
        observer.observe(mount);
        detach = attachHeroTableScroll({
          track,
          viewport,
          desktopTrack: scrollRef.current,
          draw,
          win: window,
          doc: document
        });
        setReady(true);
      })
      .catch(fallback);
    return () => {
      stopped = true;
      dispose();
    };
  }, [reducedMotion, shortViewport, scrollRef, onMotionAvailable]);

  return (
    <Box
      ref={trackRef}
      component="figure"
      className="tm-hero-scene"
      data-hero-table-track
      data-table-state={staticScene ? 'static' : ready ? 'ready' : 'loading'}
      sx={{
        '--table-height': {
          xs: '350px',
          sm: 'clamp(440px, 52svh, 528px)',
          md: 'clamp(380px, min(76.8svh, calc(100svh - var(--hero-header-height) - min(10svh, 96px) - 48px)), 816px)'
        },
        m: 0,
        minWidth: 0,
        width: { xs: 'calc(100% + 32px)', sm: '100%' },
        maxWidth: { xs: 'none', sm: 816, md: 'none' },
        ml: { xs: '-16px', sm: 'auto', md: 0 },
        mr: { xs: '-16px', sm: 'auto', md: 0 },
        position: 'relative',
        '@media (min-width: 1280px)': { width: '120%', ml: '-20%' },
        '@media (max-width: 899px) and (prefers-reduced-motion: no-preference)': {
          '&:not([data-table-state="static"])': {
            height: 'calc(var(--table-height) + 48px + clamp(300px, 58svh, 520px))'
          }
        }
      }}
    >
      <Box
        ref={viewportRef}
        data-hero-table-viewport
        sx={{
          position: 'relative',
          height: 'calc(var(--table-height) + 48px)',
          '@media (max-width: 899px) and (prefers-reduced-motion: no-preference)': {
            '[data-table-state]:not([data-table-state="static"]) > &': { position: 'sticky', top: '84px' }
          },
          [HERO_TABLE_SCROLL_MEDIA]: { position: 'relative' }
        }}
      >
        <Box sx={{ position: 'relative', height: 'var(--table-height)' }}>
          <Box
            component="img"
            src={staticScene ? tablePoster : tableStartPoster}
            alt={
              staticScene
                ? 'An ivory and gold event table with six chairs, tableware, flowers and candles.'
                : 'An ivory and gold event table. Tableware, flowers and candles are arranged as you scroll.'
            }
            width={960}
            height={800}
            fetchPriority="high"
            sx={{
              display: 'block',
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: ready && !staticScene ? 0 : 1
            }}
          />
          <Box
            ref={mountRef}
            aria-hidden="true"
            sx={{
              position: 'absolute',
              inset: 0,
              opacity: ready && !staticScene ? 1 : 0,
              pointerEvents: 'none',
              '& canvas': { display: 'block', width: '100%', height: '100%' }
            }}
          />
        </Box>
        <Box
          component="figcaption"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.75,
            height: 48,
            color: site.goldText
          }}
        >
          <Typography sx={{ fontSize: 12, lineHeight: 1.5 }}>
            {staticScene ? 'Thoughtfully arranged for your celebration.' : phases[phase]}
          </Typography>
          {!staticScene && (
            <Box aria-hidden="true" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 46, height: 2, bgcolor: site.border, overflow: 'hidden' }}>
                <Box
                  ref={progressRef}
                  sx={{ height: '100%', bgcolor: site.gold, transform: 'scaleX(0)', transformOrigin: 'left' }}
                />
              </Box>
              <KeyboardArrowDownRoundedIcon sx={{ fontSize: 17 }} />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

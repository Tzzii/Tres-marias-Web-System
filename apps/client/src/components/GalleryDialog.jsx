import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { keyframes } from '@mui/material/styles';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { photoCount } from '../lib/gallery.js';
import { site } from '../theme/siteTheme.js';
import { reducedMotionSx } from './Reveal.jsx';

const viewerIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const OPEN_GRACE_MS = 400;

const SWIPE_PX = 50;

const stagePhotoSx = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  userSelect: 'none',
  WebkitUserDrag: 'none'
};

const arrowSx = (side) => ({
  position: 'absolute',
  top: '50%',
  [side]: { xs: 8, sm: 16 },
  transform: 'translateY(-50%)',
  width: { xs: 40, sm: 48 },
  height: { xs: 40, sm: 48 },
  color: site.onEspresso,
  backgroundColor: 'rgba(23, 19, 17, 0.55)',
  border: '1px solid rgba(245, 239, 230, 0.2)',
  '&:hover': { backgroundColor: 'rgba(23, 19, 17, 0.85)', borderColor: site.gold }
});

const onDarkButtonSx = { color: site.onEspresso, '&:hover': { backgroundColor: 'rgba(245, 239, 230, 0.08)' } };

export default function GalleryDialog({ event, photo, onShowPhoto, onStep, onBack, onClose }) {
  const fullScreen = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const open = Boolean(event);

  const last = useRef({ event: null, photo: null });
  if (event) last.current = { event, photo };
  const shown = last.current;
  const photos = shown.event ? shown.event.photos : [];
  const count = photos.length;
  const several = count > 1;
  const index = Number.isInteger(shown.photo) && shown.photo >= 0 && shown.photo < count ? shown.photo : null;
  const current = index === null ? null : photos[index];

  const [loadedSrc, setLoadedSrc] = useState(null);
  const openedAt = useRef(0);
  const touchStart = useRef(null);
  const tileRefs = useRef([]);
  const lastShown = useRef(null);

  useEffect(() => {
    if (open) openedAt.current = Date.now();
  }, [open]);

  useEffect(() => {
    if (index !== null) lastShown.current = index;
  }, [index]);

  const viewing = index !== null;
  useEffect(() => {
    if (!open) {
      lastShown.current = null;
      return;
    }
    if (!viewing && lastShown.current !== null) {
      const tile = tileRefs.current[lastShown.current];
      lastShown.current = null;
      if (tile) tile.focus();
    }
  }, [open, viewing]);

  const focusOnMount = useCallback((el) => {
    if (el) el.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (index === null || !several) return;
    [index + 1, index - 1].forEach((i) => {
      const img = new Image();
      img.src = photos[(i + count) % count].src;
    });
  }, [index, photos, count, several]);

  const step = (by) => onStep((index + by + count) % count);

  const handleKeyDown = (e) => {
    if (index === null || !several) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    }
  };

  const handleClose = (e, reason) => {
    if (reason === 'backdropClick' && Date.now() - openedAt.current < OPEN_GRACE_MS) return;
    if (reason === 'escapeKeyDown' && index !== null && several) onBack();
    else onClose();
  };

  const handleTouchStart = (e) => {
    touchStart.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  };
  const handleTouchEnd = (e) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !several || e.touches.length > 0) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  };

  if (!shown.event) return null;

  const safeArea = fullScreen
    ? {
        pt: 'env(safe-area-inset-top)',
        pb: 'env(safe-area-inset-bottom)',
        pl: 'env(safe-area-inset-left)',
        pr: 'env(safe-area-inset-right)'
      }
    : {};

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      onKeyDown={handleKeyDown}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="lg"
      transitionDuration={reduceMotion ? 0 : undefined}
      aria-labelledby="tm-gallery-title"
      PaperProps={{
        sx: {
          position: 'relative',
          overflow: 'hidden',
          height: fullScreen ? '100%' : 'min(880px, calc(100% - 64px))',
          backgroundColor: site.ivory,
          backgroundImage: 'none'
        }
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          visibility: viewing ? 'hidden' : 'visible',
          ...safeArea
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            px: { xs: 2, sm: 3 },
            py: { xs: 1.5, sm: 2 },
            backgroundColor: site.card,
            borderBottom: `1px solid ${site.border}`
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              id="tm-gallery-title"
              component="h2"
              sx={{
                fontFamily: site.fontSerif,
                fontSize: { xs: 22, sm: 26 },
                fontWeight: 600,
                lineHeight: 1.25,
                color: site.ink
              }}
            >
              {shown.event.label}
            </Typography>
            <Typography sx={{ mt: 0.25, fontSize: 13, color: site.inkMuted }}>{photoCount(count)}</Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Close gallery" sx={{ color: site.ink }}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 1.5, sm: 2.5 } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
              gap: { xs: 1, sm: 1.5 }
            }}
          >
            {photos.map((item, i) => (
              <ButtonBase
                key={item.src}
                ref={(el) => {
                  tileRefs.current[i] = el;
                }}
                onClick={() => onShowPhoto(i)}
                aria-label={`Photo ${i + 1} of ${count}, view larger`}
                sx={{
                  position: 'relative',
                  display: 'block',
                  width: '100%',
                  aspectRatio: '4 / 3',
                  overflow: 'hidden',
                  borderRadius: 1,
                  backgroundColor: site.sand,
                  '&:hover .tm-grid-photo': { transform: 'scale(1.05)' },
                  '&.Mui-focusVisible': { outline: `2px solid ${site.gold}`, outlineOffset: 2 }
                }}
              >
                <GridPhoto src={item.thumb} />
              </ButtonBase>
            ))}
          </Box>
        </Box>
      </Box>

      {current && (
        <Box
          ref={focusOnMount}
          tabIndex={-1}
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: site.espressoDeep,
            outline: 'none',
            animation: `${viewerIn} 0.2s ease`,
            ...reducedMotionSx,
            ...safeArea
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 56, px: { xs: 1, sm: 2 } }}>
            {several ? (
              <Button
                onClick={onBack}
                startIcon={<ArrowBackRoundedIcon />}
                sx={{ ...onDarkButtonSx, px: 1.5, borderRadius: 999, flexShrink: 0 }}
              >
                All photos
              </Button>
            ) : (
              <Typography
                sx={{ px: 1, fontFamily: site.fontSerif, fontSize: 18, fontWeight: 600, color: site.onEspresso }}
              >
                {shown.event.label}
              </Typography>
            )}
            <Typography
              aria-live="polite"
              sx={{
                flex: 1,
                minWidth: 0,
                textAlign: 'right',
                fontSize: 13.5,
                color: site.onEspressoSoft,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {several ? `${shown.event.label} · ${index + 1} / ${count}` : ''}
            </Typography>
            <IconButton onClick={onClose} aria-label="Close gallery" sx={onDarkButtonSx}>
              <CloseRoundedIcon />
            </IconButton>
          </Box>

          <Box
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            sx={{
              position: 'relative',
              flex: 1,
              minHeight: 0,
              px: { xs: 0, sm: 9 },
              pb: { xs: 2, sm: 3 },
              touchAction: 'pan-y pinch-zoom'
            }}
          >
            <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
              <Box component="img" key={`${current.thumb}#small`} src={current.thumb} alt="" sx={stagePhotoSx} />
              <Box
                component="img"
                key={current.src}
                src={current.src}
                alt={`${shown.event.label}, photo ${index + 1} of ${count}`}
                onLoad={() => setLoadedSrc(current.src)}
                sx={{
                  ...stagePhotoSx,
                  opacity: loadedSrc === current.src ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                  ...reducedMotionSx
                }}
              />
            </Box>
            {several && (
              <>
                <IconButton onClick={() => step(-1)} aria-label="Previous photo" sx={arrowSx('left')}>
                  <ChevronLeftRoundedIcon />
                </IconButton>
                <IconButton onClick={() => step(1)} aria-label="Next photo" sx={arrowSx('right')}>
                  <ChevronRightRoundedIcon />
                </IconButton>
              </>
            )}
          </Box>
        </Box>
      )}
    </Dialog>
  );
}

function GridPhoto({ src }) {
  const [ready, setReady] = useState(false);
  return (
    <Box
      component="img"
      className="tm-grid-photo"
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onLoad={() => setReady(true)}
      sx={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.4s ease, transform 0.5s ease',
        ...reducedMotionSx
      }}
    />
  );
}

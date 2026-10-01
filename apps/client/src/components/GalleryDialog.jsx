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

// The large-photo view fades in over the grid
const viewerIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

// For this long after the pop-up opens (ms), a click outside it is ignored: the second click of a
// double-click on a gallery box lands outside the pop-up and would otherwise close it straight away
const OPEN_GRACE_MS = 400;

// A sideways swipe on the large photo must move at least this far (px) to change the photo
const SWIPE_PX = 50;

// The large photo and its small copy fill the stage and keep their shape (letterboxed, never cropped)
const stagePhotoSx = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none', WebkitUserDrag: 'none' };

// Round previous / next buttons over the sides of the large photo (side: 'left' or 'right')
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

// Light buttons on the dark large-photo view
const onDarkButtonSx = { color: site.onEspresso, '&:hover': { backgroundColor: 'rgba(245, 239, 230, 0.08)' } };

/**
 * Pop-up with one event's photos, opened from a box in the Gallery section of the home page.
 *
 * `event` is a GALLERY entry from lib/gallery.js ({ key, label, photos }), or null when the pop-up is
 * closed. `photo` is the index of the photo shown large, or null for the grid of all the event's photos.
 * The home page keeps both in the browser history and is told what the visitor does:
 * onShowPhoto(index) when a grid photo is picked, onStep(index) for the previous or next photo,
 * onBack() to go from a large photo back to the grid ("All photos", Esc) and onClose() to close the
 * pop-up (X, a click outside it).
 *
 * Grid: the small copies, 2 columns on phones, 3 on tablets and 4 on wider screens; each fades in once
 * it has loaded. It stays in place (hidden) while a photo is shown large, so coming back keeps the scroll
 * position and puts the focus on the photo that was last shown.
 * Large photo: the full-size file on a dark background, with arrows, the ← → keys and a sideways swipe
 * on phones (the last photo wraps round to the first). The small copy shows until the full one has
 * loaded, and the photos before and after it load ahead.
 * An event with a single photo opens straight on it, with no grid, arrows or "All photos".
 * Phones get the pop-up full screen, clear of the notch and the home bar. When the visitor asks for
 * reduced motion, nothing fades.
 */
export default function GalleryDialog({ event, photo, onShowPhoto, onStep, onBack, onClose }) {
  const fullScreen = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const open = Boolean(event);

  // While the pop-up fades out, the home page has already cleared `event`; keep showing the last one until it is gone
  const last = useRef({ event: null, photo: null });
  if (event) last.current = { event, photo };
  const shown = last.current;
  const photos = shown.event ? shown.event.photos : [];
  const count = photos.length;
  const several = count > 1;
  // Index of the photo shown large, or null for the grid (an index that no longer exists shows the grid)
  const index = Number.isInteger(shown.photo) && shown.photo >= 0 && shown.photo < count ? shown.photo : null;
  const current = index === null ? null : photos[index];

  // The large photo whose full-size file has finished loading (its small copy shows until then)
  const [loadedSrc, setLoadedSrc] = useState(null);
  // When the pop-up opened (see OPEN_GRACE_MS), where a swipe started, the grid photos' buttons and
  // the photo last shown large (to put the focus back on it in the grid)
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

  // Back on the grid after a large photo: focus that photo's button, which also scrolls the grid to it
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

  // The large view takes the focus as soon as it appears, so ← →, Esc and screen readers start there
  const focusOnMount = useCallback((el) => {
    if (el) el.focus({ preventScroll: true });
  }, []);

  // Load the photos before and after the large one, so stepping to them is instant
  useEffect(() => {
    if (index === null || !several) return;
    [index + 1, index - 1].forEach((i) => {
      const img = new Image();
      img.src = photos[(i + count) % count].src;
    });
  }, [index, photos, count, several]);

  // Previous (-1) or next (+1) photo, wrapping round at either end
  const step = (by) => onStep((index + by + count) % count);

  // ← → step through the photos while one is shown large
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

  // Esc goes from a large photo back to the grid (a single-photo pop-up just closes); a click outside
  // the pop-up closes it, except right after it opened (see OPEN_GRACE_MS)
  const handleClose = (e, reason) => {
    if (reason === 'backdropClick' && Date.now() - openedAt.current < OPEN_GRACE_MS) return;
    if (reason === 'escapeKeyDown' && index !== null && several) onBack();
    else onClose();
  };

  // A mostly sideways one-finger swipe on the large photo: to the left shows the next photo, to the right
  // the previous one. A second finger (pinch to zoom) cancels it.
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

  // Nothing to show until the first box is opened
  if (!shown.event) return null;

  // Full screen on phones: keep the bars clear of the notch and the home bar (viewport-fit=cover in index.html)
  const safeArea = fullScreen
    ? { pt: 'env(safe-area-inset-top)', pb: 'env(safe-area-inset-bottom)', pl: 'env(safe-area-inset-left)', pr: 'env(safe-area-inset-right)' }
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
      PaperProps={{ sx: { position: 'relative', overflow: 'hidden', height: fullScreen ? '100%' : 'min(880px, calc(100% - 64px))', backgroundColor: site.ivory, backgroundImage: 'none' } }}
    >
      {/* ===== Grid of all the event's photos (hidden, not removed, while a photo is shown large) ===== */}
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', visibility: viewing ? 'hidden' : 'visible', ...safeArea }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: { xs: 2, sm: 3 }, py: { xs: 1.5, sm: 2 }, backgroundColor: site.card, borderBottom: `1px solid ${site.border}` }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography id="tm-gallery-title" component="h2" sx={{ fontFamily: site.fontSerif, fontSize: { xs: 22, sm: 26 }, fontWeight: 600, lineHeight: 1.25, color: site.ink }}>
              {shown.event.label}
            </Typography>
            <Typography sx={{ mt: 0.25, fontSize: 13, color: site.inkMuted }}>{photoCount(count)}</Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Close gallery" sx={{ color: site.ink }}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 1.5, sm: 2.5 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: { xs: 1, sm: 1.5 } }}>
            {/* Each photo is a button that shows it large; on hover the photo zooms in slightly */}
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

      {/* ===== One photo, large, over the grid ===== */}
      {current && (
        <Box
          ref={focusOnMount}
          tabIndex={-1}
          sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: site.espressoDeep, outline: 'none', animation: `${viewerIn} 0.2s ease`, ...reducedMotionSx, ...safeArea }}
        >
          {/* Top bar: back to the grid (or the event's name when it has one photo), the position, and close */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 56, px: { xs: 1, sm: 2 } }}>
            {several ? (
              <Button onClick={onBack} startIcon={<ArrowBackRoundedIcon />} sx={{ ...onDarkButtonSx, px: 1.5, borderRadius: 999, flexShrink: 0 }}>
                All photos
              </Button>
            ) : (
              <Typography sx={{ px: 1, fontFamily: site.fontSerif, fontSize: 18, fontWeight: 600, color: site.onEspresso }}>{shown.event.label}</Typography>
            )}
            <Typography aria-live="polite" sx={{ flex: 1, minWidth: 0, textAlign: 'right', fontSize: 13.5, color: site.onEspressoSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {several ? `${shown.event.label} · ${index + 1} / ${count}` : ''}
            </Typography>
            <IconButton onClick={onClose} aria-label="Close gallery" sx={onDarkButtonSx}>
              <CloseRoundedIcon />
            </IconButton>
          </Box>

          {/* The photo. Sideways swipes are read here, so the page itself only pans up and down or pinch-zooms. */}
          <Box onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} sx={{ position: 'relative', flex: 1, minHeight: 0, px: { xs: 0, sm: 9 }, pb: { xs: 2, sm: 3 }, touchAction: 'pan-y pinch-zoom' }}>
            <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
              {/* The small copy shows at once (the grid has usually loaded it); the full photo fades in over it */}
              <Box component="img" key={`${current.thumb}#small`} src={current.thumb} alt="" sx={stagePhotoSx} />
              <Box
                component="img"
                key={current.src}
                src={current.src}
                alt={`${shown.event.label}, photo ${index + 1} of ${count}`}
                onLoad={() => setLoadedSrc(current.src)}
                sx={{ ...stagePhotoSx, opacity: loadedSrc === current.src ? 1 : 0, transition: 'opacity 0.3s ease', ...reducedMotionSx }}
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

/** One grid photo: the sand background shows until its small copy has loaded, then the photo fades in. */
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
      sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: ready ? 1 : 0, transition: 'opacity 0.4s ease, transform 0.5s ease', ...reducedMotionSx }}
    />
  );
}

import { useCallback, useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';

const TILT_MEDIA =
  '(min-width: 600px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

export default function PackageTilt({ children, enabled = true, borderRadius = 3, observeRef }) {
  const canTilt = useMediaQuery(TILT_MEDIA);
  const surfaceRef = useRef(null);
  const frameRef = useRef(null);
  const pointerRef = useRef(null);

  const reset = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pointerRef.current = null;
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.removeAttribute('data-tilting');
    surface.style.setProperty('--tm-tilt-x', '0deg');
    surface.style.setProperty('--tm-tilt-y', '0deg');
    surface.style.setProperty('--tm-tilt-lift', '0px');
  }, []);

  useEffect(() => {
    reset();
    if (!enabled || !canTilt) return undefined;
    const onVisibility = () => {
      if (document.hidden) reset();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Tab' || event.key === 'Escape') reset();
    };
    window.addEventListener('scroll', reset, { passive: true });
    window.addEventListener('resize', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('scroll', reset);
      window.removeEventListener('resize', reset);
      window.removeEventListener('blur', reset);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibility);
      reset();
    };
  }, [enabled, canTilt, reset]);

  const onPointerMove = (event) => {
    if (!enabled || !canTilt || event.pointerType !== 'mouse' || event.buttons) return;
    if (event.target.closest('button, a, input, select, textarea')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    pointerRef.current = {
      x: Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1))
    };
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const surface = surfaceRef.current;
      const pointer = pointerRef.current;
      if (!surface || !pointer) return;
      surface.setAttribute('data-tilting', 'true');
      surface.style.setProperty('--tm-tilt-x', `${-pointer.y * 4}deg`);
      surface.style.setProperty('--tm-tilt-y', `${pointer.x * 4}deg`);
      surface.style.setProperty('--tm-tilt-lift', '-4px');
      surface.style.setProperty('--tm-tilt-light-x', `${50 + pointer.x * 35}%`);
      surface.style.setProperty('--tm-tilt-light-y', `${50 + pointer.y * 35}%`);
    });
  };

  return (
    <Box
      ref={observeRef}
      className="tm-package-tilt"
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onFocusCapture={(event) => {
        if (event.target.matches(':focus-visible')) reset();
      }}
      sx={{ minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <Box
        ref={surfaceRef}
        className="tm-package-tilt-surface"
        sx={{
          position: 'relative',
          minWidth: 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius,
          '& > *': { flex: 1, minWidth: 0 },
          [`@media ${TILT_MEDIA}`]: {
            transform: enabled
              ? 'perspective(1000px) rotateX(var(--tm-tilt-x, 0deg)) rotateY(var(--tm-tilt-y, 0deg)) translate3d(0, var(--tm-tilt-lift, 0px), 0)'
              : 'none',
            transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            '&[data-tilting="true"]': {
              transition: 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)',
              '&::after': { opacity: 1 }
            },
            '&::after': {
              content: '""',
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              pointerEvents: 'none',
              opacity: 0,
              background:
                'radial-gradient(circle at var(--tm-tilt-light-x, 50%) var(--tm-tilt-light-y, 50%), rgba(255, 255, 255, 0.18), transparent 65%)',
              transition: 'opacity 300ms ease'
            }
          }
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

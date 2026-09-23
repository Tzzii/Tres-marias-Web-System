import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';

/**
 * Scroll animations for the public browsing pages.
 *
 * The look is kept calm on purpose: things fade and rise a short distance into place as they
 * come on screen, and then stay still while visible. Nothing loops. When an element scrolls
 * completely off screen it quietly resets, so the entrance plays again the next time it comes
 * into view (scrolling down or up). Visitors whose device asks for reduced motion see everything
 * in place with no animation.
 */

/**
 * Tells whether an element is on screen.
 * `once: false` (default): turns false again when the element is completely off screen, so the
 * animation replays each time it comes back. It never hides while any part of it can be seen.
 * `once: true`: becomes true the first time and stays true, so the element animates in only once.
 * Browsers without IntersectionObserver get `true` straight away.
 */
export function useInView({ once = false, threshold = 0.15 } = {}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return undefined;
    }
    // Called when the element is fully in or out (0) and when `threshold` of it is visible
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= threshold) {
          setShown(true);
          if (once) observer.disconnect();
        } else if (!once && !entry.isIntersecting) {
          setShown(false);
        }
      },
      { threshold: [0, threshold] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [once, threshold]);
  return [ref, shown];
}

/** Styles that switch every animation off for visitors who asked for reduced motion. */
export const reducedMotionSx = {
  '@media (prefers-reduced-motion: reduce)': { opacity: 1, transform: 'none', transition: 'none', animation: 'none' }
};

/**
 * Wraps content that fades in and rises into place every time it scrolls into view.
 * `delay` (ms) makes items in a list appear one after another, `y` is how far below it starts (px) and
 * `scale` lets larger blocks grow in very slightly (e.g. 0.98).
 * Extra props go to the wrapping Box (e.g. sx={{ height: '100%' }} inside a grid).
 */
export function Reveal({ children, delay = 0, y = 22, scale = 1, sx, ...rest }) {
  const [ref, shown] = useInView();
  return (
    <Box
      ref={ref}
      sx={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateY(${y}px) scale(${scale})`,
        transition: `opacity 0.8s ease ${delay}ms, transform 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
        ...reducedMotionSx,
        ...sx
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}

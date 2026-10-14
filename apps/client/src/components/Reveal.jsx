import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';


export function useInView({ once = false, threshold = 0.15 } = {}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return undefined;
    }
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

export const reducedMotionSx = {
  '@media (prefers-reduced-motion: reduce)': { opacity: 1, transform: 'none', transition: 'none', animation: 'none' }
};

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

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';
import { observeReveal } from '../lib/revealObserver.js';

export function useInView({ once = false, threshold = 0 } = {}) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => observeReveal(ref.current, setShown, { once, threshold }), [once, threshold]);
  return [ref, shown];
}

export const reducedMotionSx = {
  '@media (prefers-reduced-motion: reduce)': { opacity: 1, transform: 'none', transition: 'none', animation: 'none' }
};

// Visibility is controlled only during a finite entrance animation. The normal state is
// visible, so missing observers and interrupted animations cannot leave content hidden.
export const revealEnter = keyframes`
  from { opacity: 0; transform: translateY(var(--tm-reveal-y, 14px)) scale(var(--tm-reveal-scale, 1)); }
  to { opacity: 1; transform: none; }
`;

export function Reveal({ children, delay = 0, y = 22, scale = 1, sx, ...rest }) {
  const [ref, shown] = useInView();
  return (
    <Box ref={ref} sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', ...sx }} {...rest}>
      <Box
        data-reveal-state={shown ? 'entered' : 'outside'}
        sx={{
          minWidth: 0,
          flex: 1,
          '--tm-reveal-y': `${y}px`,
          '--tm-reveal-scale': scale,
          animation: shown ? `${revealEnter} 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms backwards` : 'none',
          ...reducedMotionSx
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

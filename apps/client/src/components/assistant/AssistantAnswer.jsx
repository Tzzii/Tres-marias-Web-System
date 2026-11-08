import { useEffect, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';

export default function AssistantAnswer({ answer, animate, fullPage }) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const words = useMemo(() => answer.match(/\S+\s*/g) || [], [answer]);
  const [visible, setVisible] = useState(1);
  const revealing = animate && !reducedMotion && visible < words.length;
  useEffect(() => {
    setVisible(1);
    if (!animate || reducedMotion) return;
    let count = 1;
    const timer = setInterval(() => {
      count += 1;
      setVisible(count);
      if (count >= words.length) clearInterval(timer);
    }, 55);
    return () => clearInterval(timer);
  }, [answer, animate, reducedMotion, words.length]);
  const text = revealing ? words.slice(0, visible).join('') : answer;
  return (
    <Box
      className={fullPage ? 'tm-assistant-answer' : undefined}
      data-word-reveal={revealing ? 'active' : 'complete'}
      aria-busy={revealing}
    >
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((paragraph, index) => (
          <Typography
            component="p"
            variant="body2"
            key={index}
            sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.8 }}
          >
            {paragraph}
          </Typography>
        ))}
    </Box>
  );
}

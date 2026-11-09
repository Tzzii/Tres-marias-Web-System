import { useEffect, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { assistantAnswerBlocks } from '../../lib/assistantSummary.js';

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
      {assistantAnswerBlocks(text).map((block, index) =>
        block.type === 'list' ? (
          <Box
            component={block.ordered ? 'ol' : 'ul'}
            start={block.ordered ? block.start : undefined}
            key={index}
            sx={{ mt: 0, mb: 2, pl: 3, '& > li': { mb: 0.8, pl: 0.25, overflowWrap: 'anywhere' } }}
          >
            {block.items.map((item, itemIndex) => (
              <Box component="li" key={itemIndex}>
                <Typography
                  component="span"
                  variant="body2"
                  sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.8 }}
                >
                  {item}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : (
          <Typography
            component="p"
            variant="body2"
            key={index}
            sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.8, mt: 0, mb: 1.5 }}
          >
            {block.text}
          </Typography>
        )
      )}
    </Box>
  );
}

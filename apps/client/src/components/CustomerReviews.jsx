import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { site } from '../theme/siteTheme.js';
import { observeReveal } from '../lib/revealObserver.js';

const reviewRoll = keyframes`
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
`;

export default function CustomerReviews({ reviews }) {
  const [paused, setPaused] = useState(false);
  const touchStart = useRef(null);
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!reviews.length) return undefined;
    return observeReveal(ref.current, setInView);
  }, [reviews.length]);
  if (!reviews.length) return null;
  // Each half must fill the widest viewport so the loop never exposes an empty stretch.
  const run = Array.from({ length: Math.ceil(6 / reviews.length) }, () => reviews).flat();
  return (
    <Box ref={ref} sx={{ mt: 6 }}>
      <Typography component="h3" sx={{ textAlign: 'center', fontFamily: site.fontSerif, fontSize: 28, mb: 3 }}>
        Kind words after the celebration
      </Typography>
      <Box
        role="region"
        aria-label="Customer reviews"
        aria-description="Hover to pause, or tap to pause or resume."
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.pointerType === 'touch' || event.pointerType === 'pen') {
            touchStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          }
        }}
        onPointerUp={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 10) {
            setPaused((value) => !value);
          }
        }}
        onPointerCancel={() => {
          touchStart.current = null;
        }}
        sx={{
          maxWidth: 1440,
          mx: 'auto',
          overflow: 'hidden',
          '--tm-review-play-state': paused || !inView ? 'paused' : 'running',
          maskImage: 'linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent)',
          '&:focus-visible .tm-review-track': { animationPlayState: 'paused' },
          '&:focus-visible': { outline: `2px solid ${site.goldText}`, outlineOffset: 4 },
          '@media (hover: hover) and (pointer: fine)': {
            '&:hover .tm-review-track': { animationPlayState: 'paused' }
          },
          '@media (prefers-reduced-motion: reduce)': {
            overflowX: 'auto',
            maskImage: 'none',
            WebkitMaskImage: 'none'
          }
        }}
      >
        <Box
          className="tm-review-track"
          sx={{
            display: 'flex',
            width: 'max-content',
            animation: `${reviewRoll} ${run.length * 7}s linear infinite`,
            animationPlayState: 'var(--tm-review-play-state)',
            willChange: inView ? 'transform' : 'auto',
            '@media (prefers-reduced-motion: reduce)': {
              animation: 'none',
              transform: 'none',
              willChange: 'auto',
              '& .tm-review-duplicate': { display: 'none' }
            }
          }}
        >
          {[...run, ...run].map((review, index) => (
            <Box
              key={`${review.id || 'review'}-${index}`}
              className={index >= reviews.length ? 'tm-review-duplicate' : undefined}
              aria-hidden={index >= reviews.length ? true : undefined}
              sx={{ flex: '0 0 auto', display: 'flex', width: { xs: 268, sm: 320, md: 364 }, pr: 3 }}
            >
              <Paper
                component="figure"
                elevation={0}
                sx={{
                  width: '100%',
                  m: 0,
                  p: 3.5,
                  borderRadius: '20px',
                  border: `1px solid ${site.border}`,
                  bgcolor: site.card
                }}
              >
                <Box
                  role="img"
                  aria-label={`${review.rating} out of 5 stars`}
                  sx={{ display: 'flex', color: site.goldText, mb: 2 }}
                >
                  {Array.from({ length: Math.min(5, Math.max(0, Math.round(review.rating))) }, (_, i) => (
                    <StarRoundedIcon key={i} aria-hidden="true" sx={{ fontSize: 18 }} />
                  ))}
                </Box>
                <Typography
                  component="blockquote"
                  sx={{ m: 0, fontFamily: site.fontSerif, fontSize: 19, lineHeight: 1.7, color: site.ink }}
                >
                  “{review.body}”
                </Typography>
                <Typography component="figcaption" sx={{ mt: 2.5, fontSize: 13, fontWeight: 600, color: site.ink }}>
                  {review.customerName}
                  <Box
                    component="span"
                    sx={{ display: 'block', mt: 0.5, fontWeight: 400, color: site.inkSoft, fontSize: 12 }}
                  >
                    {review.eventName}
                  </Box>
                </Typography>
              </Paper>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

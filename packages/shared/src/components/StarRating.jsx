import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { tokens } from '../theme/tokens.js';

/**
 * Read-only star rating. Always draws five stars so ratings line up in a list;
 * the ones above the rating are faded. `showValue` adds the number, e.g. "(4.0)".
 */
export function StarRating({ value = 0, size = 18, showValue = false, sx }) {
  const stars = Math.round(Number(value) || 0);
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, ...sx }}>
      <Box sx={{ display: 'flex', color: tokens.gold }} aria-label={`${stars} out of 5 stars`}>
        {Array.from({ length: 5 }, (_, i) => (
          <StarRoundedIcon key={i} sx={{ fontSize: size, opacity: i < stars ? 1 : 0.25 }} />
        ))}
      </Box>
      {showValue && (
        <Typography component="span" sx={{ fontSize: size - 4.5, fontWeight: 700, color: tokens.textSecondary }}>
          ({Number(value).toFixed(1)})
        </Typography>
      )}
    </Box>
  );
}

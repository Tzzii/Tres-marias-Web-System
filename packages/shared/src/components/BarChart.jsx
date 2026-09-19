import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { tokens } from '../theme/tokens.js';

/**
 * Lightweight vertical bar chart for light cards (bookings per month, revenue by
 * month). `format` renders values in tooltips and the axis cap.
 * Data items: { label, value, title? } — `title` (e.g. "Sep 14, 2026") replaces the short label in the tooltip.
 * Gold bar: `highlightIndex` when given, else the last bar if `highlightLast`, else the highest value.
 * `minTop` sets the lowest the axis top can be (e.g. 10 keeps a 0–10 scale until a value goes past 10).
 */
export function BarChart({ data, height = 220, format = (v) => String(v), highlightLast = false, highlightIndex, minTop = 0, ariaLabel }) {
  const max = Math.max(1, ...data.map((d) => d.value)); // largest value (at least 1 to avoid dividing by 0)
  // Round the top of the axis up to a tidy number, e.g. 37 -> 40, 1,230 -> 2,000; never below `minTop`
  const niceMax = (() => {
    const magnitude = 10 ** Math.floor(Math.log10(max));
    let rounded = Math.ceil(max / magnitude) * magnitude;
    // Keep the midline tick a whole number
    if ((rounded / magnitude) % 2) rounded += magnitude;
    return Math.max(rounded, minTop);
  })();
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Box role="img" aria-label={ariaLabel || `Bar chart, total ${format(total)}`}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1 }}>
        <Box sx={{ height, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pb: 0.25 }}>
          {/* Y-axis labels: top, middle, zero */}
          {[niceMax, niceMax / 2, 0].map((tick) => (
            <Typography key={tick} sx={{ fontSize: 10.5, color: tokens.textMuted, textAlign: 'right', lineHeight: 1 }}>
              {format(tick)}
            </Typography>
          ))}
        </Box>
        <Box sx={{ position: 'relative', height, display: 'flex', alignItems: 'flex-end', gap: { xs: 0.5, sm: 1 }, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>
          {[0, 0.5, 1].map((line) => (
            <Box key={line} aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: `${line * 100}%`, borderTop: `1px dashed ${tokens.cardLightBorder}` }} />
          ))}
          {data.map((d, i) => {
            const pct = (d.value / niceMax) * 100; // bar height as % of the chart
            // Gold bar: the chosen bar (highlightIndex), the last bar (highlightLast) or the highest value; others are dark
            const strong = highlightIndex !== undefined ? i === highlightIndex : highlightLast ? i === data.length - 1 : d.value === max && max > 0;
            return (
              <Tooltip key={`${d.label}-${i}`} title={`${d.title || d.label}: ${format(d.value)}`} placement="top" arrow>
                <Box sx={{ position: 'relative', flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default' }}>
                  <Box
                    sx={{
                      width: '100%',
                      // Tiny non-zero values still get a visible sliver
                      height: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`,
                      minHeight: d.value > 0 ? 3 : 0,
                      borderRadius: '6px 6px 0 0',
                      background: strong ? `linear-gradient(180deg, ${tokens.gold} 0%, ${tokens.goldDark} 100%)` : 'linear-gradient(180deg, #334155 0%, #1e293b 100%)',
                      transition: 'height 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}
                  />
                </Box>
              </Tooltip>
            );
          })}
        </Box>
        <Box />
        <Box sx={{ display: 'flex', gap: { xs: 0.5, sm: 1 } }}>
          {data.map((d, i) => (
            <Typography key={`${d.label}-l-${i}`} sx={{ flex: 1, textAlign: 'center', fontSize: { xs: 9.5, sm: 11 }, color: tokens.textMuted, overflow: 'hidden' }}>
              {d.label}
            </Typography>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

/** Horizontal ranked bars (most booked packages). */
export function RankBars({ items, format = (v) => String(v) }) {
  // Each bar's width is relative to the largest value
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {items.map((item) => (
        <Box key={item.label}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: tokens.textPrimary }}>{item.label}</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>{format(item.value)}</Typography>
          </Box>
          <Box sx={{ height: 8, borderRadius: 999, backgroundColor: tokens.surfaceMuted, overflow: 'hidden' }}>
            <Box sx={{ width: `${(item.value / max) * 100}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${tokens.goldDark}, ${tokens.gold})` }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { tokens } from '../theme/tokens.js';

// Round up to a tidy number, e.g. 37 -> 40, 1,230 -> 2,000: an even count of its leading unit, so half of it is whole too
function tidy(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  let rounded = Math.ceil(value / magnitude) * magnitude;
  if ((rounded / magnitude) % 2) rounded += magnitude;
  return rounded;
}

/**
 * The y-axis labels, top to bottom and evenly spaced. Values of 0 and up: [top, top / 2, 0], the top
 * a tidy number never below `minTop`. When a value is below 0 the axis runs below 0 too, in steps of
 * half the tidy size of the largest value on either side, e.g. 1,800 and −300 -> [2,000, 1,000, 0, −1,000].
 */
function axisTicks(max, min, minTop) {
  if (min === 0) {
    const top = Math.max(tidy(max), minTop);
    return [top, top / 2, 0];
  }
  const step = tidy(Math.max(max, minTop, -min)) / 2;
  const above = Math.ceil(Math.max(max, minTop) / step);
  const below = Math.ceil(-min / step);
  return Array.from({ length: above + below + 1 }, (_, i) => (above - i) * step);
}

/**
 * Lightweight vertical bar chart for light cards (bookings per month, revenue by
 * month). `format` renders values in tooltips and the axis labels.
 * Data items: { label, value, title? } — `title` (e.g. "Sep 14, 2026") replaces the short label in the tooltip.
 * Gold bar: `highlightIndex` when given, else the last bar if `highlightLast`, else the highest value.
 * `minTop` sets the lowest the axis top can be (e.g. 10 keeps a 0–10 scale until a value goes past 10).
 * A value below 0 (net earnings in a month with more refunds than payments) is a red bar hanging
 * below a solid 0 line, so it never reads as an empty month.
 */
export function BarChart({ data, height = 220, format = (v) => String(v), highlightLast = false, highlightIndex, minTop = 0, ariaLabel }) {
  const max = Math.max(1, ...data.map((d) => d.value)); // largest value (at least 1 to avoid dividing by 0)
  const min = Math.min(0, ...data.map((d) => d.value)); // lowest value, 0 unless one is below 0
  const ticks = axisTicks(max, min, minTop);
  const bottom = ticks[ticks.length - 1]; // 0, or the lowest tick below 0
  const span = ticks[0] - bottom; // the range of values the chart's height covers
  const zero = (-bottom / span) * 100; // where 0 sits, as % of the height from the bottom
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Box role="img" aria-label={ariaLabel || `Bar chart, total ${format(total)}`}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1 }}>
        <Box sx={{ height, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pb: 0.25 }}>
          {/* Y-axis labels, top to bottom (evenly spaced, like the grid lines) */}
          {ticks.map((tick) => (
            <Typography key={tick} sx={{ fontSize: 10.5, color: tokens.textMuted, textAlign: 'right', lineHeight: 1 }}>
              {format(tick)}
            </Typography>
          ))}
        </Box>
        <Box sx={{ position: 'relative', height, display: 'flex', alignItems: 'flex-end', gap: { xs: 0.5, sm: 1 }, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>
          {/* One grid line per label; the 0 line is solid when bars hang below it */}
          {ticks.map((tick, i) => (
            <Box
              key={tick}
              aria-hidden
              sx={{ position: 'absolute', left: 0, right: 0, bottom: `${(1 - i / (ticks.length - 1)) * 100}%`, borderTop: `1px ${tick === 0 && bottom < 0 ? 'solid' : 'dashed'} ${tokens.cardLightBorder}` }}
            />
          ))}
          {data.map((d, i) => {
            const pct = (Math.abs(d.value) / span) * 100; // bar length as % of the chart
            const below = d.value < 0;
            // Gold bar: the chosen bar (highlightIndex), the last bar (highlightLast) or the highest value; the rest use
            // tokens.gradientBar, and a bar below 0 is red
            const strong = highlightIndex !== undefined ? i === highlightIndex : highlightLast ? i === data.length - 1 : d.value === max && max > 0;
            const background = below
              ? `linear-gradient(180deg, ${tokens.red} 0%, ${tokens.redPress} 100%)`
              : strong
                ? `linear-gradient(180deg, ${tokens.gold} 0%, ${tokens.goldDark} 100%)`
                : tokens.gradientBar;
            return (
              <Tooltip key={`${d.label}-${i}`} title={`${d.title || d.label}: ${format(d.value)}`} placement="top" arrow>
                <Box sx={{ position: 'relative', flex: 1, height: '100%', cursor: 'default' }}>
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      // Grows up from the 0 line, or down from it for a value below 0
                      ...(below ? { top: `${100 - zero}%` } : { bottom: `${zero}%` }),
                      // Tiny non-zero values still get a visible sliver
                      height: `${Math.max(pct, d.value !== 0 ? 2 : 0)}%`,
                      minHeight: d.value !== 0 ? 3 : 0,
                      borderRadius: below ? '0 0 6px 6px' : '6px 6px 0 0',
                      background,
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

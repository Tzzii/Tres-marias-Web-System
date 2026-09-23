import { useRef } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { tokens } from '../theme/tokens.js';
import { MONTH_NAMES, toISODate, todayISO } from '../utils/format.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Month change: the days slide in from the right (next month) or the left (previous month)
const slideFromRight = keyframes`
  from { opacity: 0; transform: translateX(14px); }
  to { opacity: 1; transform: translateX(0); }
`;
const slideFromLeft = keyframes`
  from { opacity: 0; transform: translateX(-14px); }
  to { opacity: 1; transform: translateX(0); }
`;
// Picked day: a quick grow-and-settle so the tap feels registered
const dayPop = keyframes`
  0% { transform: scale(1); }
  45% { transform: scale(1.08); }
  100% { transform: scale(1); }
`;
// Turns the animations off for people who set "reduce motion" on their device
const noMotion = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } };

/** Monday-first grid of dates for a month, filled in with days from the months before and after. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  // Days from Monday to the 1st (getDay() is 0 for Sunday, so shift it to make Monday 0)
  const offset = (first.getDay() + 6) % 7;
  // Grid starts on the Monday on or before the 1st
  const start = new Date(year, month, 1 - offset);
  // Number of week rows needed to fit the whole month
  const weeks = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { iso: toISODate(date), day: date.getDate(), inMonth: date.getMonth() === month };
  });
}

/**
 * Month calendar used by the customer calendar, the admin calendar and the
 * date picker. Each day is described by `getDay(iso)`:
 *   { tone: 'event' | 'blocked' | 'full' | 'open' | 'disabled', label, badge, dots }
 * `dots` > 0 shows one small dot in the small (date picker) calendar. The large calendar shows up to 3 dots on
 * phones, and on every screen size when the day has no `badge` (on tablets/desktop a badge takes the dots' place).
 * Changing month slides the days in from the side you moved towards; the selected day pops briefly.
 * On phones the month arrows move to the two edges (easier to reach with a thumb), and `headerAction`
 * (e.g. the customer's Month / List switch) gets its own full-width row above them.
 */
export function MonthCalendar({ year, month, onMonthChange, getDay, onSelect, selected, size = 'lg', legend, headerAction }) {
  const today = todayISO();
  const cells = monthGrid(year, month);
  const small = size === 'sm';

  // Which way the month last moved: 1 = forward, -1 = back, 0 = not moved yet (no slide on first show)
  const monthIndex = year * 12 + month;
  const lastMonth = useRef(monthIndex);
  const direction = useRef(0);
  // Day that should pop: set only when `selected` changes, so the pop doesn't replay on first show or after a month change
  const lastSelected = useRef(selected);
  const popDay = useRef('');
  if (lastSelected.current !== selected) {
    popDay.current = selected || '';
    lastSelected.current = selected;
  }
  if (lastMonth.current !== monthIndex) {
    direction.current = monthIndex > lastMonth.current ? 1 : -1;
    lastMonth.current = monthIndex;
    popDay.current = '';
  }

  // Go to the previous (-1) or next (+1) month; Date handles year changes automatically
  const shift = (delta) => {
    const d = new Date(year, month + delta, 1);
    onMonthChange(d.getFullYear(), d.getMonth());
  };

  // Background, border and text colours for each day type
  const toneSx = {
    event: { bg: 'rgba(197, 160, 89, 0.14)', border: 'rgba(197, 160, 89, 0.55)', fg: tokens.textPrimary },
    blocked: { bg: 'repeating-linear-gradient(135deg, #f1f5f9 0 6px, #e2e8f0 6px 12px)', border: tokens.cardLightBorder, fg: tokens.textMuted },
    full: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.35)', fg: '#b91c1c' },
    open: { bg: '#fff', border: tokens.cardLightBorder, fg: tokens.textPrimary },
    disabled: { bg: tokens.surfaceSubtle, border: 'transparent', fg: tokens.placeholder }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: { xs: 'wrap', sm: 'nowrap' }, alignItems: 'center', justifyContent: 'space-between', gap: 1, rowGap: 1.5, mb: small ? 1 : 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: { xs: '1 1 100%', sm: '0 0 auto' }, justifyContent: { xs: 'space-between', sm: 'flex-start' } }}>
          <IconButton size="small" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeftRoundedIcon />
          </IconButton>
          <Typography aria-live="polite" sx={{ minWidth: small ? 128 : 150, textAlign: 'center', fontSize: small ? 14 : 16, fontWeight: 700, color: tokens.textPrimary }}>
            {MONTH_NAMES[month]} {year}
          </Typography>
          <IconButton size="small" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRightRoundedIcon />
          </IconButton>
        </Box>
        {/* Phones: first row, full width. Wider screens: right end of the month row. */}
        {headerAction && <Box sx={{ width: { xs: '100%', sm: 'auto' }, order: { xs: -1, sm: 0 } }}>{headerAction}</Box>}
      </Box>

      <Box role="grid" aria-label={`${MONTH_NAMES[month]} ${year}`}>
        <Box role="row" sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: small ? 0.5 : { xs: 0.5, sm: 0.75 } }}>
          {WEEKDAYS.map((d) => (
            <Typography key={d} role="columnheader" sx={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.textMuted, pb: 0.5 }}>
              {small ? d.slice(0, 2) : d}
            </Typography>
          ))}
        </Box>

        {/* Days of the month; the key remounts them on month change so the slide plays again */}
        <Box
          key={monthIndex}
          role="rowgroup"
          sx={{
            mt: small ? 0.5 : { xs: 0.5, sm: 0.75 },
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: small ? 0.5 : { xs: 0.5, sm: 0.75 },
            animation: direction.current ? `${direction.current > 0 ? slideFromRight : slideFromLeft} 220ms ease-out` : 'none',
            ...noMotion
          }}
        >
        {cells.map((cell) => {
          // Ask the parent page how this day should look
          const info = (getDay && getDay(cell.iso, cell)) || { tone: 'open' };
          const tone = toneSx[info.tone] || toneSx.open;
          const isToday = cell.iso === today; // gold border
          const isSelected = selected === cell.iso; // dark border
          // Disabled or unselectable days can't be clicked
          const clickable = onSelect && info.tone !== 'disabled' && !info.unselectable;

          return (
            <ButtonBase
              key={cell.iso}
              role="gridcell"
              aria-selected={isSelected}
              aria-label={`${cell.iso}${info.label ? `, ${info.label}` : ''}`}
              title={info.label || undefined}
              disabled={!clickable}
              onClick={() => clickable && onSelect(cell.iso, info)}
              sx={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: small ? 'center' : 'flex-start',
                justifyContent: small ? 'center' : 'flex-start',
                gap: 0.25,
                minHeight: small ? 38 : { xs: 52, sm: 76, md: 88 },
                p: small ? 0 : { xs: 0.5, sm: 0.9 },
                borderRadius: 1.25,
                fontFamily: 'inherit',
                textAlign: 'left',
                opacity: cell.inMonth ? 1 : 0.4,
                background: tone.bg,
                color: tone.fg,
                border: `1.5px solid ${isSelected ? tokens.ink : isToday ? tokens.gold : tone.border}`,
                boxShadow: isSelected ? '0 0 0 3px rgba(15, 23, 42, 0.14)' : 'none',
                cursor: clickable ? 'pointer' : 'default',
                transition: 'border-color 0.15s ease, box-shadow 0.2s ease, transform 0.15s ease',
                animation: isSelected && popDay.current === cell.iso ? `${dayPop} 240ms ease-out` : 'none',
                '&:hover': clickable ? { borderColor: tokens.ink } : undefined,
                '&.Mui-disabled': { color: tone.fg },
                ...noMotion
              }}
            >
              <Typography component="span" sx={{ fontSize: small ? 13 : 13.5, fontWeight: isToday || isSelected ? 800 : 600, lineHeight: 1.2, textDecoration: info.tone === 'disabled' && small ? 'line-through' : 'none' }}>
                {cell.day}
              </Typography>
              {/* Small calendar: one gold dot under the number when the day already has an event */}
              {small && info.dots > 0 && (
                <Box component="span" aria-hidden sx={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 5, height: 5, borderRadius: '50%', backgroundColor: tokens.goldDark }} />
              )}
              {/* Large calendar: the badge (e.g. event name) on tablets/desktop, up to 3 dots on phones.
                  A day with dots but no badge keeps its dots on every screen, so it never looks empty. */}
              {!small && info.badge && (
                <Typography component="span" sx={{ display: { xs: 'none', sm: 'block' }, width: '100%', fontSize: 10.5, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {info.badge}
                </Typography>
              )}
              {!small && info.dots > 0 && (
                <Box sx={{ display: { xs: 'flex', sm: info.badge ? 'none' : 'flex' }, gap: 0.25, mt: 'auto' }}>
                  {Array.from({ length: Math.min(info.dots, 3) }, (_, i) => (
                    <Box key={i} sx={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: tokens.goldDark }} />
                  ))}
                </Box>
              )}
            </ButtonBase>
          );
        })}
        </Box>
      </Box>

      {legend && (
        <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {legend.map((item) => {
            const tone = toneSx[item.tone];
            return (
              <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, color: tokens.textSecondary }}>
                <Box sx={{ width: 14, height: 14, borderRadius: 0.5, background: tone.bg, border: `1.5px solid ${tone.border}` }} />
                {item.label}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

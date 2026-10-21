import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import { Link as RouterLink } from 'react-router-dom';
import { DashCard, CardTitle } from './DashCard.jsx';
import { tokens } from '../theme/tokens.js';
import { formatDateLong, peso } from '../utils/format.js';
import { reservationChecklist } from '../domain/experience.js';
import { includesFood, isRental } from '../services/config.js';
import { menuProblem } from '../domain/menu.js';

export function EventWorkspace({ event: r, admin = false, action }) {
  if (!r || ['cancelled', 'declined'].includes(r.status)) return null;
  const checklist = reservationChecklist(r);
  if (admin) {
    checklist.push({
      label: isRental(r.serviceType) && r.fulfilment === 'pickup' ? 'Pick-up selected' : 'Venue details recorded',
      done:
        (isRental(r.serviceType) && r.fulfilment === 'pickup') ||
        Boolean(r.venue?.name && r.venue?.address && r.venue?.city),
      note: 'Review the address and access instructions before dispatch.'
    });
    if (includesFood(r.serviceType))
      checklist.push({
        label: 'Menu selections complete',
        done: !menuProblem(r.menu),
        note: 'Confirm the four dishes and any dietary requests with the customer.'
      });
    checklist.push({
      label: 'Equipment requirements recorded',
      done: isRental(r.serviceType)
        ? Boolean(r.rentalItems?.length)
        : Boolean(r.package?.items?.length || r.items?.length),
      note: 'Review physical stock and dispatch in Inventory.'
    });
    checklist.push({
      label: 'Preparation started',
      done: Boolean(r.preparingAt) || r.status === 'completed',
      note: 'Use Start preparing when work on this event begins.'
    });
  }
  const completed = checklist.filter((item) => item.done).length;
  const venue = [r.venue?.name, r.venue?.city].filter(Boolean).join(' · ');
  return (
    <DashCard className="tm-feature-card" sx={{ borderTop: `3px solid ${tokens.gold}` }}>
      <CardTitle
        subtitle={
          admin
            ? 'Live booking milestones, based on the reservation record'
            : 'Your celebration, with every next step in one place'
        }
        action={action}
      >
        {admin ? 'Event readiness' : 'Your event at a glance'}
      </CardTitle>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr' }, gap: 3 }}>
        <Box>
          <Typography sx={{ fontSize: { xs: 20, md: 25 }, fontWeight: 700, letterSpacing: '-0.03em' }}>
            {r.eventName}
          </Typography>
          <Typography sx={{ mt: 1, color: tokens.textSecondary, fontSize: 13.5 }}>
            {formatDateLong(r.date)}
            {venue ? ` · ${venue}` : ''}
          </Typography>
          <Typography sx={{ mt: 0.75, color: tokens.textSecondary, fontSize: 13.5 }}>
            {r.packageName || 'Your selected service'}
            {r.guests ? ` · ${r.guests} guests` : ''}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mt: 2.5 }}>
            <Box>
              <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>Reservation</Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{r.ref}</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                {r.status === 'pending' ? 'Estimate' : 'Booking total'}
              </Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
                {peso(r.total ?? r.quotation?.net ?? r.estimate?.net ?? 0)}
              </Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>Remaining balance</Typography>
              <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
                {r.status === 'pending' ? 'After quotation acceptance' : peso(r.balance || 0)}
              </Typography>
            </Box>
          </Box>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted, mb: 1 }}>
            {completed} of {checklist.length} booking milestones complete
          </Typography>
          <LinearProgress
            aria-label="Booking milestones completed"
            variant="determinate"
            value={(completed / checklist.length) * 100}
            sx={{ height: 5, borderRadius: 9, mb: 2 }}
          />
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 1.25 }}>
            {checklist.map((item) => (
              <Box component="li" key={item.label} sx={{ display: 'flex', gap: 1 }}>
                {item.done ? (
                  <CheckCircleOutlineRoundedIcon sx={{ fontSize: 19, color: tokens.green }} />
                ) : (
                  <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 19, color: tokens.textMuted }} />
                )}
                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{item.label}</Typography>
                  {!item.done && (
                    <Typography sx={{ fontSize: 11.5, color: tokens.textSecondary }}>{item.note}</Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
          {!admin && (
            <Button component={RouterLink} to={`/portal/reservations/${r.ref}`} size="small" sx={{ mt: 1.5 }}>
              Open event details
            </Button>
          )}
        </Box>
      </Box>
    </DashCard>
  );
}

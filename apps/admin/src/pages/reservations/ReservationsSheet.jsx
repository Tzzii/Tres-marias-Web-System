import { createPortal } from 'react-dom';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import {
  BUSINESS,
  LOGO_SRC,
  PaperSurface,
  paperSurfaceSx,
  formatDate,
  formatDateTime,
  formatEventTime,
  isRental,
  peso,
  statusLabel,
  titleCase,
  tokens
} from '@tm/shared';

const STATUS_ORDER = ['pending', 'approved', 'downpayment_paid', 'confirmed', 'completed', 'declined', 'cancelled'];
const REPEAT = { 'data-pdf-repeat': true };

export default function ReservationsSheet({ rows, filters, newestFirst, generatedAt, sheetRef }) {
  const counts = STATUS_ORDER.map((s) => [titleCase(statusLabel(s)), rows.filter((r) => r.status === s).length]).filter(
    ([, n]) => n
  );
  const figures = [['Reservations', rows.length], ...counts];

  return createPortal(
    <PaperSurface>
      <Box
        ref={sheetRef}
        className="tm-print-root tm-print-sheet tm-print-landscape"
        aria-hidden="true"
        sx={{ ...paperSurfaceSx, color: tokens.textPrimary }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box
              component="img"
              src={LOGO_SRC}
              alt=""
              sx={{ width: 60, height: 60, borderRadius: '50%', border: `2px solid ${tokens.gold}` }}
            />
            <Box>
              <Typography sx={{ fontSize: 18, fontWeight: 800 }}>{BUSINESS.name}</Typography>
              <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>{BUSINESS.address}</Typography>
              <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>
                {BUSINESS.phone} · {BUSINESS.email}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontSize: 20, fontWeight: 800, color: tokens.goldDark }}>Reservations List</Typography>
            {filters.map(([label, value]) => (
              <Typography key={label} sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                {label}: {value}
              </Typography>
            ))}
            <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
              Generated: {formatDateTime(generatedAt)}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2.5, borderColor: tokens.gold, borderBottomWidth: 2 }} />

        <Box
          data-pdf-keep
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))`,
            border: `1px solid ${tokens.cardLightBorder}`,
            borderRadius: 1.5,
            overflow: 'hidden',
            breakInside: 'avoid'
          }}
        >
          {figures.map(([label, value], i) => (
            <Box
              key={label}
              sx={{
                px: 1.5,
                py: 1.25,
                backgroundColor: tokens.surfaceSubtle,
                borderLeft: i ? `1px solid ${tokens.cardLightBorder}` : 'none'
              }}
            >
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: tokens.textMuted }}>{label}</Typography>
              <Typography sx={{ mt: 0.25, fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{value}</Typography>
            </Box>
          ))}
        </Box>

        <Typography sx={{ mt: 3, fontSize: 13, fontWeight: 800, color: tokens.goldDark }}>Reservations</Typography>
        <Typography sx={{ mt: 0.25, mb: 1.5, fontSize: 11.5, color: tokens.textMuted }}>
          By event date, {newestFirst ? 'newest' : 'soonest'} first. Total is the sent quotation, or the estimate before
          one is sent; Paid is verified payments less refunds; a declined or cancelled reservation has no balance.
        </Typography>

        <Box
          component="table"
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 11,
            lineHeight: 1.4,
            color: tokens.textPrimary,
            '& th, & td': {
              py: 0.625,
              px: 0.75,
              textAlign: 'left',
              verticalAlign: 'top',
              borderBottom: `1px solid ${tokens.cardLightBorder}`
            },
            '& th': {
              fontSize: 10.5,
              fontWeight: 700,
              color: tokens.textSecondary,
              backgroundColor: tokens.surfaceMuted,
              whiteSpace: 'nowrap'
            },
            '& tbody tr:nth-of-type(even) td': { backgroundColor: tokens.surfaceSubtle },
            '& tr': { breakInside: 'avoid' },
            '& .ref': { fontWeight: 700, whiteSpace: 'nowrap' },
            '& .sub': { display: 'block', fontSize: 10, color: tokens.textMuted },
            '& .nowrap': { whiteSpace: 'nowrap' },
            '& .wrap': { overflowWrap: 'anywhere' },
            '& .money': { textAlign: 'right', whiteSpace: 'nowrap' }
          }}
        >
          <thead {...REPEAT}>
            <tr>
              <th>Reference</th>
              <th>Customer</th>
              <th>Event</th>
              <th>Date and Time</th>
              <th>Venue</th>
              <th>Package</th>
              <th>Status</th>
              <th className="money">Total</th>
              <th className="money">Paid</th>
              <th className="money">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ref}>
                <td className="ref">{r.ref}</td>
                <td className="wrap">
                  {r.customerName}
                  <span className="sub">{r.customerEmail}</span>
                </td>
                <td className="wrap">
                  {r.eventName}
                  <span className="sub">{r.occasion}</span>
                </td>
                <td>
                  <span className="nowrap">{formatDate(r.date)}</span>
                  <span className="sub">{formatEventTime(r)}</span>
                </td>
                <td className="wrap">
                  {r.venue.name}
                  <span className="sub">{r.venue.city}</span>
                </td>
                <td className="wrap">
                  {r.packageName}
                  <span className="sub">{isRental(r.serviceType) ? 'Equipment rental' : `${r.guests} guests`}</span>
                </td>
                <td>{titleCase(statusLabel(r.status))}</td>
                <td className="money">{peso(r.total)}</td>
                <td className="money">{peso(r.paid)}</td>
                <td className="money">{peso(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>
    </PaperSurface>,
    document.body
  );
}

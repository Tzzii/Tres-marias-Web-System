import { createPortal } from 'react-dom';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { BUSINESS, LOGO_SRC, LightSurface, formatDate, formatDateTime, formatEventTime, isRental, peso, statusLabel, titleCase, tokens } from '@tm/shared';

// Statuses in the order a booking moves through them, for the counts under the letterhead
const STATUS_ORDER = ['pending', 'approved', 'downpayment_paid', 'confirmed', 'completed', 'declined', 'cancelled'];
// The table head: drawn again at the top of every page the table runs onto, by Save PDF (utils/savePdf.js)
// and by Print (browsers repeat a <thead> on their own)
const REPEAT = { 'data-pdf-repeat': true };

/**
 * The All reservations list laid out for paper, on landscape A4 pages: the letterhead with which reservations
 * it holds (`filters`, the status tab, date range and search the list was filtered by, as [label, value]
 * pairs) and the time it was made, how many there are per status, then a table with one row per reservation:
 * reference, customer and email, event and occasion, date and time, venue and city, package and guests (or
 * "Equipment rental"), status, total, paid and balance. `rows` are the filtered reservations in their
 * on-screen order; `newestFirst` is true when they run newest first (past events).
 * Like the Reports sheet it waits off screen (tm-print-sheet, tm-print-landscape) in a portal on <body>, so
 * it never shows on the page: Print prints only this sheet (it is a tm-print-root, see global.css), and Save
 * PDF draws it into the PDF through `sheetRef`.
 */
export default function ReservationsSheet({ rows, filters, newestFirst, generatedAt, sheetRef }) {
  // How many of the listed reservations are in each status, leaving out the statuses with none
  const counts = STATUS_ORDER.map((s) => [titleCase(statusLabel(s)), rows.filter((r) => r.status === s).length]).filter(([, n]) => n);
  const figures = [['Reservations', rows.length], ...counts];

  return createPortal(
    <LightSurface>
      <Box ref={sheetRef} className="tm-print-root tm-print-sheet tm-print-landscape" aria-hidden="true" sx={{ backgroundColor: '#fff', color: tokens.textPrimary }}>
        {/* Letterhead, as on the Reports sheet, the quotations and the receipts */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box component="img" src={LOGO_SRC} alt="" sx={{ width: 60, height: 60, borderRadius: '50%', border: `2px solid ${tokens.gold}` }} />
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
            <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>Generated: {formatDateTime(generatedAt)}</Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2.5, borderColor: tokens.gold, borderBottomWidth: 2 }} />

        {/* How many reservations, in all and per status, in one bordered row */}
        <Box data-pdf-keep sx={{ display: 'grid', gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))`, border: `1px solid ${tokens.cardLightBorder}`, borderRadius: 1.5, overflow: 'hidden', breakInside: 'avoid' }}>
          {figures.map(([label, value], i) => (
            <Box key={label} sx={{ px: 1.5, py: 1.25, backgroundColor: tokens.surfaceSubtle, borderLeft: i ? `1px solid ${tokens.cardLightBorder}` : 'none' }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: tokens.textMuted }}>{label}</Typography>
              <Typography sx={{ mt: 0.25, fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{value}</Typography>
            </Box>
          ))}
        </Box>

        <Typography sx={{ mt: 3, fontSize: 13, fontWeight: 800, color: tokens.goldDark }}>Reservations</Typography>
        <Typography sx={{ mt: 0.25, mb: 1.5, fontSize: 11.5, color: tokens.textMuted }}>
          By event date, {newestFirst ? 'newest' : 'soonest'} first. Total is the sent quotation, or the estimate before one is sent; Paid is verified payments less refunds; a declined or cancelled reservation has no balance.
        </Typography>

        {/* One row per reservation; amounts on the right. A row never splits across two pages. Cells use
            plain classes rather than sx, so a long list stays quick to draw: ref (bold), sub (the second,
            smaller line: a customer's email, an event's occasion, a venue's city), nowrap, wrap (long
            names and emails break anywhere rather than widen the table) and money */}
        <Box
          component="table"
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 11,
            lineHeight: 1.4,
            color: tokens.textPrimary,
            '& th, & td': { py: 0.625, px: 0.75, textAlign: 'left', verticalAlign: 'top', borderBottom: `1px solid ${tokens.cardLightBorder}` },
            '& th': { fontSize: 10.5, fontWeight: 700, color: tokens.textSecondary, backgroundColor: tokens.surfaceMuted, whiteSpace: 'nowrap' },
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
                  {/* An equipment rental has no guest count */}
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
    </LightSurface>,
    document.body
  );
}

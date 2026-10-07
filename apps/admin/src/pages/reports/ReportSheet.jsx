import { createPortal } from 'react-dom';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { BUSINESS, BarChart, LOGO_SRC, LightSurface, formatDateTime, peso, tokens } from '@tm/shared';

// Small upper-case heading over each part of the report
const HEADING_SX = { fontSize: 13, fontWeight: 800, color: tokens.goldDark };
// The one-line explanation under a heading
const NOTE_SX = { mt: 0.25, mb: 1.5, fontSize: 11.5, color: tokens.textMuted };
// A part of the report kept on one page (when it fits), so a heading never ends a page without what it heads:
// data-pdf-keep for Save PDF (utils/savePdf.js), break-inside for Print
const KEEP = { 'data-pdf-keep': true };
const KEEP_SX = { breakInside: 'avoid' };

/**
 * A table of names and figures with a bold Total row at the bottom. The Total is a normal last row,
 * not a <tfoot>, because a printed table repeats its <tfoot> on every page it runs onto.
 * `head` names the columns; `rows` and `total` hold one cell per column; columns after the first are right-aligned.
 */
function FigureTable({ head, rows, total }) {
  return (
    <Box
      component="table"
      sx={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 12.5,
        lineHeight: 1.45,
        color: tokens.textPrimary,
        '& th, & td': { py: 0.5, px: 0.75, textAlign: 'left', borderBottom: `1px solid ${tokens.cardLightBorder}` },
        '& th': { fontSize: 11.5, fontWeight: 700, color: tokens.textMuted, backgroundColor: tokens.surfaceSubtle },
        '& th:not(:first-of-type), & td:not(:first-of-type)': { textAlign: 'right', whiteSpace: 'nowrap' },
        '& tr': { breakInside: 'avoid' },
        '& .total td': { fontWeight: 800, borderTop: `2px solid ${tokens.textPrimary}`, borderBottom: 'none' }
      }}
    >
      <thead>
        <tr>
          {head.map((cell) => <th key={cell}>{cell}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row[0]}-${i}`}>
            {row.map((cell, j) => <td key={j}>{cell}</td>)}
          </tr>
        ))}
        <tr className="total">
          {total.map((cell, j) => <td key={j}>{cell}</td>)}
        </tr>
      </tbody>
    </Box>
  );
}

/**
 * The Reports Overview laid out as a printed A4 report: the letterhead with the range and the time it was
 * made, the five figures, revenue per month (or year) as a chart beside a table with its total, bookings
 * per package with each one's share, and how the figures are counted.
 * It waits off screen (the tm-print-sheet class) in a portal on <body>, so it never shows on the page:
 * Print prints only this sheet (it is a tm-print-root, see global.css), and Save PDF draws it into the PDF
 * through `sheetRef`. `data` is reportApi.getReport()'s answer; `format` writes the chart's axis amounts.
 */
export default function ReportSheet({ data, rangeLabel, generatedAt, format, sheetRef }) {
  const byYear = data.revenueBy === 'year';
  const revenueTotal = data.revenueChart.reduce((total, m) => total + m.value, 0);
  const bookings = data.packageCounts.reduce((total, p) => total + p.count, 0);
  // A package's share of all bookings in whole percent ("—" when there are none)
  const share = (count) => (bookings ? `${Math.round((count / bookings) * 100)}%` : '—');

  const figures = [
    ['Events Served', String(data.eventsServed), 'Completed events'],
    ['Revenue', peso(data.revenue), 'Payments less refunds'],
    ['Refunds', peso(data.refunds), 'Returned to customers'],
    ['Average per Event', peso(data.averagePerEvent), 'Per completed event'],
    ['Decline Rate', `${data.declineRate}%`, 'Of requests decided']
  ];

  return createPortal(
    <LightSurface>
      <Box ref={sheetRef} className="tm-print-root tm-print-sheet" aria-hidden="true" sx={{ backgroundColor: '#fff', color: tokens.textPrimary }}>
        {/* Letterhead, as on the quotations and receipts */}
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
            <Typography sx={{ fontSize: 20, fontWeight: 800, color: tokens.goldDark }}>Business Report</Typography>
            <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>Range: {rangeLabel}</Typography>
            <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>Generated: {formatDateTime(generatedAt)}</Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2.5, borderColor: tokens.gold, borderBottomWidth: 2 }} />

        {/* The five figures in one bordered row */}
        <Box {...KEEP} sx={KEEP_SX}>
          <Typography sx={HEADING_SX}>Summary</Typography>
          <Typography sx={NOTE_SX}>Figures for {rangeLabel.toLowerCase()}.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', border: `1px solid ${tokens.cardLightBorder}`, borderRadius: 1.5, overflow: 'hidden' }}>
            {figures.map(([label, value, meta], i) => (
              <Box key={label} sx={{ p: 1.5, backgroundColor: tokens.surfaceSubtle, borderLeft: i ? `1px solid ${tokens.cardLightBorder}` : 'none' }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: tokens.textMuted }}>{label}</Typography>
                <Typography sx={{ mt: 0.5, fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{value}</Typography>
                <Typography sx={{ mt: 0.25, fontSize: 10.5, color: tokens.textMuted }}>{meta}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Revenue: the chart beside its table, months (or years) in order with their total */}
        <Box {...KEEP} sx={{ ...KEEP_SX, mt: 3.5 }}>
          <Typography sx={HEADING_SX}>{byYear ? 'Revenue by Year' : 'Revenue by Month'}</Typography>
          <Typography sx={NOTE_SX}>Verified payments less refunds sent. A period with more refunds than payments is below zero.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 3, alignItems: 'start' }}>
            <Box sx={{ pt: 1 }}>
              {data.revenue === 0 && !data.refunds ? (
                <Typography sx={{ py: 6, fontSize: 12.5, textAlign: 'center', color: tokens.textMuted, border: `1px dashed ${tokens.cardLightBorder}`, borderRadius: 1.5 }}>No revenue in this range.</Typography>
              ) : (
                <BarChart data={data.revenueChart} height={300} format={format} ariaLabel={byYear ? 'Revenue by Year' : 'Revenue by Month'} />
              )}
            </Box>
            <FigureTable head={[byYear ? 'Year' : 'Month', 'Revenue']} rows={data.revenueChart.map((m) => [m.title || m.label, peso(m.value)])} total={['Total', peso(revenueTotal)]} />
          </Box>
        </Box>

        {/* Bookings per package, most booked first */}
        <Box {...KEEP} sx={{ ...KEEP_SX, mt: 3.5 }}>
          <Typography sx={HEADING_SX}>Bookings by Package</Typography>
          <Typography sx={NOTE_SX}>Reservations dated in the range, leaving out declined and cancelled ones.</Typography>
          {data.packageCounts.length ? (
            <FigureTable head={['Package', 'Bookings', 'Share']} rows={data.packageCounts.map((p) => [p.name, String(p.count), share(p.count)])} total={['Total', String(bookings), bookings ? '100%' : '—']} />
          ) : (
            <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>No packages yet.</Typography>
          )}
        </Box>

        {/* How each figure is counted, the same rules the Overview tab uses */}
        <Box {...KEEP} sx={{ ...KEEP_SX, mt: 3.5, pt: 1.5, borderTop: `1px solid ${tokens.cardLightBorder}` }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: tokens.textSecondary }}>How the Figures Are Counted</Typography>
          <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.25, fontSize: 11, lineHeight: 1.6, color: tokens.textMuted }}>
            <li>Events Served: events dated in the range and marked completed.</li>
            <li>Revenue: payments verified in the range, less refunds sent in the range.</li>
            <li>Average per Event: the completed events' totals divided by their number.</li>
            <li>Decline Rate: declined requests out of all requests approved or declined.</li>
          </Box>
        </Box>
      </Box>
    </LightSurface>,
    document.body
  );
}

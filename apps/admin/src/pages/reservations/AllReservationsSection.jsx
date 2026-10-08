import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import {
  BUSINESS,
  BalanceChip,
  DashCard,
  DataTable,
  EmptyState,
  ErrorState,
  FilterTabs,
  Pager,
  SearchField,
  StatusChip,
  daysFromToday,
  formatDate,
  isRental,
  peso,
  reservationApi,
  saveElementAsPdf,
  statusLabel,
  titleCase,
  todayISO,
  tokens,
  useNotify,
  useResource
} from '@tm/shared';
import { SectionBar } from '../../components/SectionTabs.jsx';
import ReservationsSheet from './ReservationsSheet.jsx';

// Rows shown per table page
const PAGE_SIZE = 10;
// Status filter tabs, in the order a booking moves through them
const STATUS_TABS = ['all', 'pending', 'approved', 'downpayment_paid', 'confirmed', 'completed', 'declined', 'cancelled'];
// The event date filter's options, as the menu and the printed list name them
const WHEN_LABEL = { all: 'All dates', upcoming: 'Upcoming events', past: 'Past events' };

/**
 * All reservations tab of "Reservation & Calendar": every booking with filters and search, and Print and
 * Save PDF for the filtered list. Both use the same formatted landscape A4 list (ReservationsSheet), not the
 * table on screen: Print prints it, Save PDF downloads it as tres-marias-reservations-<date>.pdf.
 * The page title and tabs come from ReservationsCalendarPage.
 */
export default function AllReservationsSection() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [params] = useSearchParams();
  // Load every reservation once when the page opens
  const { data, loading, error, reload } = useResource(() => reservationApi.listReservations(), []);

  const [status, setStatus] = useState('all'); // selected status tab
  const [when, setWhen] = useState('all'); // all / upcoming / past
  const [query, setQuery] = useState(params.get('q') || ''); // search text (can come from the top search bar via ?q=)
  const [page, setPage] = useState(1); // current table page
  const sheetRef = useRef(null); // the formatted list that Print prints and Save PDF draws
  const [savingPdf, setSavingPdf] = useState(false); // true while the PDF is being made
  const [stampedAt, setStampedAt] = useState(() => Date.now()); // the "Generated" time on the list

  // Stamp the list with the moment it is printed, from the Print button or Ctrl+P. flushSync puts the new
  // time on the sheet before the browser lays out the printout.
  useEffect(() => {
    const stamp = () => flushSync(() => setStampedAt(Date.now()));
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, []);

  // If the top search bar changes ?q= while this page is open, update the search box
  const qParam = params.get('q');
  useEffect(() => {
    if (qParam !== null) setQuery(qParam);
  }, [qParam]);
  // Go back to page 1 whenever a filter changes
  useEffect(() => setPage(1), [status, when, query]);

  const rows = data || [];
  // Number of reservations per status, shown on each tab
  const counts = useMemo(() => Object.fromEntries(STATUS_TABS.map((s) => [s, s === 'all' ? rows.length : rows.filter((r) => r.status === s).length])), [rows]);

  // Apply the status tab, date range and search text, then sort by event date
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => status === 'all' || r.status === status)
      // upcoming = today or later, past = before today
      .filter((r) => (when === 'upcoming' ? daysFromToday(r.date) >= 0 : when === 'past' ? daysFromToday(r.date) < 0 : true))
      // match the search text against REF, customer, event, package, city or date
      .filter((r) => !q || [r.ref, r.customerName, r.customerEmail, r.customerMobile, r.eventName, r.packageName, r.venue.city, formatDate(r.date)].some((v) => String(v).toLowerCase().includes(q)))
      // past events: newest first; otherwise: soonest first
      .sort((a, b) => (when === 'past' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  }, [rows, status, when, query]);

  // Keep the page in range when rows leave the list (e.g. a reservation moved to another status)
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));

  // The filters the printed list names under its title: the status tab, the date range, and the search when there is one
  const sheetFilters = [
    ['Status', status === 'all' ? 'All' : titleCase(statusLabel(status))],
    ['Event Dates', WHEN_LABEL[when]],
    ...(query.trim() ? [['Search', `“${query.trim()}”`]] : [])
  ];

  // Save the filtered list as a landscape PDF, stamped with the time it is saved (the "Save as" window first,
  // where the browser has one; Cancel saves nothing). If the browser can't make one, Print still can ("Save as
  // PDF" in the print window).
  const savePdf = async () => {
    flushSync(() => setStampedAt(Date.now()));
    setSavingPdf(true);
    try {
      const saved = await saveElementAsPdf(sheetRef.current, `tres-marias-reservations-${todayISO()}.pdf`, {
        title: `${BUSINESS.name} reservations list`,
        footer: `${BUSINESS.name} · Reservations List · ${formatDate(todayISO())}`,
        orientation: 'landscape'
      });
      if (saved) notify(`Saved ${filtered.length} reservation${filtered.length === 1 ? '' : 's'} as PDF.`);
    } catch (e) {
      notify("Couldn't create the PDF. Use Print and choose Save as PDF instead.", 'error');
    } finally {
      setSavingPdf(false);
    }
  };

  // Table columns: `render` decides what each cell shows for a reservation
  const columns = [
    { key: 'ref', label: 'REF', render: (r) => <Typography sx={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.ref}</Typography> },
    // card: 'title' — on phone cards the customer and event are the heading (REF becomes a field)
    { key: 'customer', label: 'Customer', card: 'title', render: (r) => (<Box><Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{r.customerName}</Typography><Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{r.eventName}</Typography></Box>) },
    { key: 'date', label: 'Event Date', render: (r) => <Box sx={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</Box> },
    { key: 'package', label: 'Package', render: (r) => r.packageName },
    // An equipment rental has no guest count
    { key: 'pax', label: 'Pax', align: 'right', render: (r) => (isRental(r.serviceType) ? 'Rental' : r.guests) },
    { key: 'total', label: 'Total', align: 'right', render: (r) => peso(r.total) },
    { key: 'balance', label: 'Payment', render: (r) => (['pending', 'declined', 'cancelled'].includes(r.status) ? <Typography component="span" sx={{ fontSize: 12.5, color: tokens.textMuted }}>—</Typography> : <BalanceChip state={r.balanceState} size="sm" />) },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} size="sm" /> }
  ];

  return (
    <>
      <SectionBar
        text={loading ? 'Loading…' : `${rows.length} reservations on record`}
        // Print and Save PDF take the list as filtered, so they wait for at least one row
        actions={
          <>
            <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()} disabled={loading || !filtered.length} sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}>
              Print
            </Button>
            <Button variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} onClick={savePdf} disabled={loading || !filtered.length || savingPdf} sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}>
              {savingPdf ? 'Saving…' : 'Save PDF'}
            </Button>
          </>
        }
      />
      {/* The formatted list for Print and Save PDF; it stays off screen */}
      {!loading && !error && filtered.length > 0 && <ReservationsSheet rows={filtered} filters={sheetFilters} newestFirst={when === 'past'} generatedAt={stampedAt} sheetRef={sheetRef} />}
      <DashCard>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <FilterTabs value={status} onChange={setStatus} options={STATUS_TABS.map((s) => ({ value: s, label: s === 'all' ? 'All' : titleCase(statusLabel(s)), count: loading ? undefined : counts[s] }))} />
            <Box sx={{ mt: 1.5, mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <SearchField id="all-search" value={query} onChange={setQuery} placeholder="Search REF, customer, event or city" sx={{ flex: 1 }} />
              <TextField select size="small" value={when} onChange={(e) => setWhen(e.target.value)} sx={{ minWidth: 170 }} inputProps={{ 'aria-label': 'Event date range' }}>
                {Object.entries(WHEN_LABEL).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
              </TextField>
            </Box>
            {/* Show only the rows for the current page; clicking a row opens the reservation */}
            <DataTable loading={loading} columns={columns} rows={filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)} rowKey={(r) => r.ref} onRowClick={(r) => navigate(`/reservations/${r.ref}`)} minWidth={900} empty={<EmptyState compact title="No reservations match" description="Try another status, date range or search term." />} />
            {!loading && filtered.length > 0 && <Pager page={current} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />}
          </>
        )}
      </DashCard>
    </>
  );
}

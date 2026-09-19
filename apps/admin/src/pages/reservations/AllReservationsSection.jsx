import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import {
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
  peso,
  reservationApi,
  statusLabel,
  todayISO,
  tokens,
  useNotify,
  useResource
} from '@tm/shared';
import { SectionBar } from '../../components/SectionTabs.jsx';
import { downloadTxt, textTable } from '../../lib/txt.js';

// Rows shown per table page
const PAGE_SIZE = 10;
// Status filter tabs, in the order a booking moves through them
const STATUS_TABS = ['all', 'pending', 'approved', 'downpayment_paid', 'confirmed', 'completed', 'declined', 'cancelled'];

/**
 * All reservations tab of "Reservation & Calendar": every booking with filters, search and export.
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

  // Download the currently filtered reservations as a plain-text table
  const exportTxt = () => {
    const rowsOut = filtered.map((r) => ({ Reference: r.ref, Customer: r.customerName, Email: r.customerEmail, Event: r.eventName, Occasion: r.occasion, Date: r.date, Start: r.startTime, Guests: r.guests, Package: r.packageName, Venue: `${r.venue.name}, ${r.venue.city}`, Status: statusLabel(r.status), Total: r.total, Paid: r.paid, Balance: r.balance }));
    const text = [
      'TRES MARIAS - RESERVATIONS',
      `Generated: ${formatDate(todayISO())}`,
      `Rows: ${rowsOut.length}`,
      '',
      textTable(rowsOut, ['Total', 'Paid', 'Balance'])
    ].join('\n');
    if (downloadTxt(`tres-marias-reservations-${todayISO()}.txt`, text)) notify(`Exported ${filtered.length} reservations.`);
  };

  // Table columns: `render` decides what each cell shows for a reservation
  const columns = [
    { key: 'ref', label: 'REF', render: (r) => <Typography sx={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.ref}</Typography> },
    { key: 'customer', label: 'Customer', render: (r) => (<Box><Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{r.customerName}</Typography><Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{r.eventName}</Typography></Box>) },
    { key: 'date', label: 'Event date', render: (r) => <Box sx={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</Box> },
    { key: 'package', label: 'Package', render: (r) => r.packageName },
    { key: 'pax', label: 'Pax', align: 'right', render: (r) => r.guests },
    { key: 'total', label: 'Total', align: 'right', render: (r) => peso(r.total) },
    { key: 'balance', label: 'Payment', render: (r) => (['pending', 'declined', 'cancelled'].includes(r.status) ? <Typography component="span" sx={{ fontSize: 12.5, color: tokens.textMuted }}>—</Typography> : <BalanceChip state={r.balanceState} size="sm" />) },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} size="sm" /> }
  ];

  return (
    <>
      <SectionBar
        text={loading ? 'Loading…' : `${rows.length} reservations on record`}
        actions={
          <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportTxt} disabled={!filtered.length} sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}>
            Export TXT
          </Button>
        }
      />
      <DashCard>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <FilterTabs value={status} onChange={setStatus} options={STATUS_TABS.map((s) => ({ value: s, label: s === 'all' ? 'All' : statusLabel(s), count: loading ? undefined : counts[s] }))} />
            <Box sx={{ mt: 1.5, mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <SearchField id="all-search" value={query} onChange={setQuery} placeholder="Search REF, customer, event or city" sx={{ flex: 1 }} />
              <TextField select size="small" value={when} onChange={(e) => setWhen(e.target.value)} sx={{ minWidth: 170 }} inputProps={{ 'aria-label': 'Event date range' }}>
                <MenuItem value="all">All dates</MenuItem>
                <MenuItem value="upcoming">Upcoming events</MenuItem>
                <MenuItem value="past">Past events</MenuItem>
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

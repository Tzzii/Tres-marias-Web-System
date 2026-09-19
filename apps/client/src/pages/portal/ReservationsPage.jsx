import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import {
  DashCard,
  DataTable,
  EmptyState,
  ErrorState,
  FilterTabs,
  ListSkeleton,
  PageHeader,
  Pager,
  SearchField,
  StatusChip,
  formatDate,
  peso,
  reservationApi,
  tokens,
  useDocumentTitle,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';

const PAGE_SIZE = 8;
// Filter tabs as [key, label, test function]. "Approved" also includes downpayment paid.
const FILTERS = [
  ['all', 'All', () => true],
  ['pending', 'Pending', (r) => r.status === 'pending'],
  ['approved', 'Approved', (r) => ['approved', 'downpayment_paid'].includes(r.status)],
  ['confirmed', 'Confirmed', (r) => r.status === 'confirmed'],
  ['completed', 'Completed', (r) => r.status === 'completed'],
  ['closed', 'Declined / cancelled', (r) => ['declined', 'cancelled'].includes(r.status)]
];

/** 1h · My reservations list. */
export default function ReservationsPage() {
  useDocumentTitle('My reservations');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isPhone = useMediaQuery('(max-width:599px)');
  // Load only this customer's reservations
  const { data, loading, error, reload } = useResource(() => reservationApi.listReservations({ customerId: user.id }), [user.id]);

  // The filter can start from ?status= in the URL; an unknown value falls back to "All"
  const [filter, setFilter] = useState(() => (FILTERS.some(([key]) => key === params.get('status')) ? params.get('status') : 'all'));
  const [query, setQuery] = useState(params.get('q') || '');
  const [page, setPage] = useState(1);

  // A search submitted from the top bar arrives as ?q=
  const qParam = params.get('q');
  useEffect(() => {
    if (qParam !== null) setQuery(qParam);
  }, [qParam]);
  // Back to page 1 when the filter or search changes
  useEffect(() => setPage(1), [filter, query]);

  const rows = data || [];
  // Number of reservations per tab
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([key, , test]) => [key, rows.filter(test).length])), [rows]);

  // Apply the tab and search, newest event date first
  const filtered = useMemo(() => {
    const test = FILTERS.find(([key]) => key === filter)[2];
    const q = query.trim().toLowerCase();
    return rows
      .filter(test)
      .filter((r) => !q || [r.eventName, r.ref, r.packageName, formatDate(r.date), r.date, r.occasion].some((v) => String(v).toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [rows, filter, query]);

  // Rows for the current page only; the page stays in range when rows leave the list (e.g. a cancellation)
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const columns = [
    { key: 'event', label: 'Event', render: (r) => (<Box><Typography sx={{ fontSize: 14, fontWeight: 700 }}>{r.eventName}</Typography><Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{r.ref} · {r.occasion}</Typography></Box>) },
    { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
    { key: 'package', label: 'Package', render: (r) => r.packageName },
    { key: 'guests', label: 'Guests', align: 'right', render: (r) => r.guests },
    { key: 'total', label: 'Total', align: 'right', render: (r) => peso(r.total) },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} /> },
    { key: 'action', label: '', align: 'right', render: (r) => <Button size="small" onClick={() => navigate(`/portal/reservations/${r.ref}`)}>View details</Button> }
  ];

  return (
    <>
      <PageHeader
        title="My reservations"
        subtitle="Every request, booking and past event in one place."
        actions={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/portal/book')}>
            New reservation
          </Button>
        }
      />
      <DashCard>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5, justifyContent: 'space-between', alignItems: { md: 'center' }, mb: 2 }}>
              <FilterTabs
                ariaLabel="Filter reservations by status"
                value={filter}
                // Change the tab and keep ?status= in the URL in sync (so refresh/back keeps the filter)
                onChange={(value) => {
                  setFilter(value);
                  setParams((p) => {
                    const nextParams = new URLSearchParams(p);
                    if (value === 'all') nextParams.delete('status');
                    else nextParams.set('status', value);
                    return nextParams;
                  }, { replace: true });
                }}
                // The "Declined / cancelled" tab only appears if there are any
                options={FILTERS.filter(([key]) => key !== 'closed' || counts.closed).map(([value, label]) => ({ value, label, count: loading ? undefined : counts[value] }))}
              />
              <SearchField id="reservation-search" value={query} onChange={setQuery} placeholder="Search by event or date" />
            </Box>

            {loading ? (
              <ListSkeleton rows={4} height={56} />
            ) : filtered.length === 0 ? (
              <EmptyState
                compact
                title={rows.length ? 'No reservations match' : 'No reservations yet'}
                description={rows.length ? 'Try another status or search term.' : 'When you submit a reservation it will appear here with its status.'}
                action={!rows.length && <Button variant="contained" onClick={() => navigate('/portal/book')}>New reservation</Button>}
              />
            ) : isPhone ? (
              // Phones: tappable cards instead of a wide table
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {pageRows.map((r) => (
                  <ButtonBase key={r.ref} onClick={() => navigate(`/portal/reservations/${r.ref}`)} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, textAlign: 'left', borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, fontFamily: 'inherit' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>{r.eventName}</Typography>
                      <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                        {formatDate(r.date)} · {r.packageName} · {r.guests} guests
                      </Typography>
                      <Box sx={{ mt: 0.75 }}>
                        <StatusChip status={r.status} size="sm" />
                      </Box>
                    </Box>
                    <ChevronRightRoundedIcon sx={{ color: tokens.textMuted }} />
                  </ButtonBase>
                ))}
              </Box>
            ) : (
              <DataTable columns={columns} rows={pageRows} rowKey={(r) => r.ref} onRowClick={(r) => navigate(`/portal/reservations/${r.ref}`)} />
            )}

            {!loading && filtered.length > 0 && <Pager page={current} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />}
          </>
        )}
      </DashCard>
    </>
  );
}

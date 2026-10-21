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
  compareValues,
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

const PAGE_SIZE = 10;
const STATUS_TABS = [
  'all',
  'pending',
  'approved',
  'downpayment_paid',
  'confirmed',
  'completed',
  'declined',
  'cancelled'
];
const WHEN_LABEL = { all: 'All dates', upcoming: 'Upcoming events', past: 'Past events' };

export default function AllReservationsSection() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useResource(() => reservationApi.listReservations(), []);

  const status = STATUS_TABS.includes(params.get('status')) ? params.get('status') : 'all';
  const when = Object.hasOwn(WHEN_LABEL, params.get('when')) ? params.get('when') : 'all';
  const query = params.get('q') || '';
  const updateParam = (key, value) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (!value || value === 'all') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true }
    );
  const setStatus = (value) => updateParam('status', value);
  const setWhen = (value) => updateParam('when', value);
  const setQuery = (value) => updateParam('q', value);
  const sort = { key: params.get('sort') || 'date', direction: params.get('direction') === 'desc' ? 'desc' : 'asc' };
  const sortValue = (r, key) => ({ customer: r.customerName, package: r.packageName, pax: r.guests })[key] ?? r[key];
  const setSort = (nextSort) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('sort', nextSort.key);
        next.set('direction', nextSort.direction);
        return next;
      },
      { replace: true }
    );
  const [page, setPage] = useState(1);
  const sheetRef = useRef(null);
  const [savingPdf, setSavingPdf] = useState(false);
  const [stampedAt, setStampedAt] = useState(() => Date.now());

  useEffect(() => {
    const stamp = () => flushSync(() => setStampedAt(Date.now()));
    window.addEventListener('beforeprint', stamp);
    return () => window.removeEventListener('beforeprint', stamp);
  }, []);

  useEffect(() => setPage(1), [status, when, query, sort.key, sort.direction]);

  const rows = data || [];
  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUS_TABS.map((s) => [s, s === 'all' ? rows.length : rows.filter((r) => r.status === s).length])
      ),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => status === 'all' || r.status === status)
      .filter((r) =>
        when === 'upcoming' ? daysFromToday(r.date) >= 0 : when === 'past' ? daysFromToday(r.date) < 0 : true
      )
      .filter(
        (r) =>
          !q ||
          [
            r.ref,
            r.customerName,
            r.customerEmail,
            r.customerMobile,
            r.eventName,
            r.packageName,
            r.venue.city,
            formatDate(r.date)
          ].some((v) => String(v).toLowerCase().includes(q))
      )
      .sort((a, b) => compareValues(sortValue(a, sort.key), sortValue(b, sort.key), sort.direction));
  }, [rows, status, when, query, sort.key, sort.direction]);

  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));

  const sheetFilters = [
    ['Status', status === 'all' ? 'All' : titleCase(statusLabel(status))],
    ['Event Dates', WHEN_LABEL[when]],
    ...(query.trim() ? [['Search', `“${query.trim()}”`]] : [])
  ];

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

  const columns = [
    {
      key: 'ref',
      label: 'REF',
      render: (r) => <Typography sx={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.ref}</Typography>
    },
    {
      key: 'customer',
      label: 'Customer',
      card: 'title',
      render: (r) => (
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{r.customerName}</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{r.eventName}</Typography>
        </Box>
      )
    },
    { key: 'date', label: 'Event Date', render: (r) => <Box sx={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</Box> },
    { key: 'package', label: 'Package', render: (r) => r.packageName },
    { key: 'pax', label: 'Pax', align: 'right', render: (r) => (isRental(r.serviceType) ? 'Rental' : r.guests) },
    { key: 'total', label: 'Total', align: 'right', render: (r) => peso(r.total) },
    {
      key: 'balance',
      label: 'Payment',
      render: (r) =>
        ['pending', 'declined', 'cancelled'].includes(r.status) ? (
          <Typography component="span" sx={{ fontSize: 12.5, color: tokens.textMuted }}>
            —
          </Typography>
        ) : (
          <BalanceChip state={r.balanceState} size="sm" />
        )
    },
    { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} size="sm" /> }
  ];

  return (
    <>
      <SectionBar
        text={loading ? 'Loading…' : `${rows.length} reservations on record`}
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<PrintOutlinedIcon />}
              onClick={() => window.print()}
              disabled={loading || !filtered.length}
              sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}
            >
              Print
            </Button>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfOutlinedIcon />}
              onClick={savePdf}
              disabled={loading || !filtered.length || savingPdf}
              sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}
            >
              {savingPdf ? 'Saving…' : 'Save PDF'}
            </Button>
          </>
        }
      />
      {!loading && !error && filtered.length > 0 && (
        <ReservationsSheet
          rows={filtered}
          filters={sheetFilters}
          newestFirst={when === 'past'}
          generatedAt={stampedAt}
          sheetRef={sheetRef}
        />
      )}
      <DashCard>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <FilterTabs
              value={status}
              onChange={setStatus}
              options={STATUS_TABS.map((s) => ({
                value: s,
                label: s === 'all' ? 'All' : titleCase(statusLabel(s)),
                count: loading ? undefined : counts[s]
              }))}
            />
            <Box sx={{ mt: 1.5, mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <SearchField
                id="all-search"
                value={query}
                onChange={setQuery}
                placeholder="Search REF, customer, event or city"
                sx={{ flex: 1 }}
              />
              <TextField
                select
                size="small"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                sx={{ minWidth: 170 }}
                inputProps={{ 'aria-label': 'Event date range' }}
              >
                {Object.entries(WHEN_LABEL).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <DataTable
              loading={loading}
              columns={columns.map((col) => ({ ...col, getSortValue: (row) => sortValue(row, col.key) }))}
              sort={sort}
              onSort={setSort}
              rows={filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)}
              rowKey={(r) => r.ref}
              onRowClick={(r) => navigate(`/reservations/${r.ref}`)}
              minWidth={900}
              empty={
                <EmptyState
                  compact
                  title="No reservations match"
                  description="Try another status, date range or search term."
                />
              }
            />
            {!loading && filtered.length > 0 && (
              <Pager page={current} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
            )}
          </>
        )}
      </DashCard>
    </>
  );
}

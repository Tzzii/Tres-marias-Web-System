import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import {
  CardTitle,
  ConfirmDialog,
  DashCard,
  DataTable,
  EmptyState,
  ErrorState,
  FilterTabs,
  Pill,
  SearchField,
  StatusChip,
  formatDate,
  formatRelative,
  isRental,
  pendingStep,
  peso,
  reservationApi,
  statusLabel,
  titleCase,
  tokens,
  useNotify,
  useResource
} from '@tm/shared';
import { SectionBar } from '../../components/SectionTabs.jsx';

const TABS = ['pending', 'approved', 'downpayment_paid', 'confirmed', 'completed', 'declined'];

export default function RequestsSection() {
  const navigate = useNavigate();
  const notify = useNotify();
  const { data, loading, error, reload } = useResource(() => reservationApi.listReservations(), []);
  const [tab, setTab] = useState('pending');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(null);

  const rows = data || [];
  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t, rows.filter((r) => r.status === t).length])),
    [rows]
  );
  const pending = rows.filter((r) => r.status === 'pending');
  const toQuote = pending.filter((r) => pendingStep(r) !== 'accept');
  const toAccept = pending.length - toQuote.length;
  const oldestDays = toQuote.length
    ? Math.max(...toQuote.map((r) => Math.floor((Date.now() - r.createdAt) / 86400000)))
    : 0;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => r.status === tab)
      .filter(
        (r) =>
          !q || [r.customerName, r.eventName, r.ref, r.packageName, r.occasion].some((v) => v.toLowerCase().includes(q))
      )
      .sort((a, b) => (tab === 'pending' ? a.createdAt - b.createdAt : a.date.localeCompare(b.date)));
  }, [rows, tab, query]);

  const selectedRows = visible.filter((r) => selected.includes(r.ref));
  const toggle = (ref) => setSelected((s) => (s.includes(ref) ? s.filter((x) => x !== ref) : [...s, ref]));

  const runBulk = async (refs, action, verb) => {
    const failures = [];
    for (const ref of refs) {
      try {
        await action(ref);
      } catch (e) {
        failures.push(`${ref}: ${e.message}`);
      }
    }
    setSelected([]);
    const done = refs.length - failures.length;
    if (done) notify(`${verb} ${done} ${done === 1 ? 'reservation' : 'reservations'}.`);
    if (failures.length) notify(`Could not update ${failures.length}: ${failures[0]}`, 'error');
  };

  const columns = [
    ...(tab === 'pending'
      ? [
          {
            key: 'select',
            label: (
              <Checkbox
                size="small"
                checked={visible.length > 0 && selectedRows.length === visible.length}
                indeterminate={selectedRows.length > 0 && selectedRows.length < visible.length}
                onChange={(e) => setSelected(e.target.checked ? visible.map((r) => r.ref) : [])}
                inputProps={{ 'aria-label': 'Select all' }}
              />
            ),
            width: 48,
            render: (r) => (
              <Checkbox
                size="small"
                checked={selected.includes(r.ref)}
                onChange={() => toggle(r.ref)}
                inputProps={{ 'aria-label': `Select ${r.ref}` }}
              />
            )
          }
        ]
      : []),
    {
      key: 'customer',
      label: 'Customer',
      render: (r) => (
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{r.customerName}</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
            {r.ref} · {formatRelative(r.createdAt)}
          </Typography>
        </Box>
      )
    },
    {
      key: 'event',
      label: 'Event and Date',
      render: (r) => (
        <Box>
          <Typography sx={{ fontSize: 13.5 }}>
            {r.occasion} · {formatDate(r.date)}
          </Typography>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{r.eventName}</Typography>
        </Box>
      )
    },
    { key: 'package', label: 'Package', render: (r) => r.packageName },
    { key: 'pax', label: 'Pax', align: 'right', render: (r) => (isRental(r.serviceType) ? 'Rental' : r.guests) },
    {
      key: 'quoted',
      label: 'Quoted',
      align: 'right',
      render: (r) =>
        r.quotation ? (
          peso(r.quotation.net)
        ) : (
          <Typography component="span" sx={{ color: tokens.textMuted }} title={`Estimate ${peso(r.estimate.net)}`}>
            —
          </Typography>
        )
    },
    tab === 'pending'
      ? {
          key: 'action',
          label: 'Action',
          align: 'right',
          render: (r) => (
            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center' }}>
              {pendingStep(r) === 'accept' ? (
                <Pill size="sm" label="Waiting for customer" bg="rgba(59, 130, 246, 0.12)" fg="#1d4ed8" dot={false} />
              ) : (
                <Button size="small" variant="contained" onClick={() => navigate(`/reservations/${r.ref}`)}>
                  {pendingStep(r) === 'revise' ? 'Re-send quotation' : 'Send quotation'}
                </Button>
              )}
              <Button size="small" color="error" onClick={() => setConfirm({ type: 'decline', refs: [r.ref] })}>
                Decline
              </Button>
            </Box>
          )
        }
      : { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} size="sm" /> }
  ];

  return (
    <>
      <SectionBar
        text={
          loading
            ? 'Loading…'
            : pending.length
              ? [
                  toQuote.length
                    ? `${toQuote.length} to quote · oldest ${oldestDays === 0 ? 'today' : `${oldestDays} ${oldestDays === 1 ? 'day' : 'days'}`}`
                    : 'Nothing to quote',
                  toAccept ? `${toAccept} waiting for the customer` : ''
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'No requests waiting'
        }
      />

      <DashCard>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', lg: 'row' },
                gap: 1.5,
                justifyContent: 'space-between',
                mb: 2
              }}
            >
              <FilterTabs
                value={tab}
                onChange={(v) => {
                  setTab(v);
                  setSelected([]);
                }}
                options={TABS.map((t) => ({
                  value: t,
                  label: titleCase(statusLabel(t)),
                  count: loading ? undefined : counts[t]
                }))}
              />
              <SearchField id="requests-search" value={query} onChange={setQuery} />
            </Box>

            {selectedRows.length > 0 && (
              <Box
                sx={{
                  mb: 2,
                  px: 2,
                  py: 1.25,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'wrap',
                  borderRadius: 1.5,
                  backgroundColor: tokens.ink,
                  color: tokens.onInk
                }}
              >
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, mr: 'auto' }}>
                  {selectedRows.length} selected
                </Typography>
                <Button
                  size="small"
                  sx={{ color: tokens.dangerOnInk }}
                  onClick={() => setConfirm({ type: 'decline', refs: selectedRows.map((r) => r.ref) })}
                >
                  Decline selected
                </Button>
              </Box>
            )}

            <DataTable
              loading={loading}
              columns={columns}
              rows={visible}
              rowKey={(r) => r.ref}
              onRowClick={(r) => navigate(`/reservations/${r.ref}`)}
              minWidth={860}
              empty={
                <EmptyState
                  compact
                  title={query ? 'No matches' : `No ${statusLabel(tab).toLowerCase()} reservations`}
                  description={
                    tab === 'pending' && !query
                      ? 'New requests from customers will appear here.'
                      : 'Try another tab or search.'
                  }
                />
              }
            />
          </>
        )}
      </DashCard>

      <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
        <DashCard>
          <CardTitle>Quotation — What Happens</CardTitle>
          <Typography sx={{ fontSize: 13.5, lineHeight: 1.65, color: tokens.textSecondary }}>
            Open the reservation to price the additional charges and send the quotation. The customer accepts it in
            their portal, which moves the status to Approved and gives them a payment instruction: at least the minimum
            downpayment (or more, up to the full amount) by a due date. The date is held only once they accept.
          </Typography>
        </DashCard>
        <DashCard>
          <CardTitle>Decline — What Happens</CardTitle>
          <Typography sx={{ fontSize: 13.5, lineHeight: 1.65, color: tokens.textSecondary }}>
            A reason is required and shown to the customer. The date stays open for other bookings.
          </Typography>
        </DashCard>
      </Box>

      <ConfirmDialog
        open={confirm?.type === 'decline'}
        onClose={() => setConfirm(null)}
        title={
          confirm && confirm.refs.length > 1
            ? `Decline ${confirm.refs.length} Reservations?`
            : 'Decline This Reservation?'
        }
        description="The reason is shown to the customer. The date stays open for other bookings."
        confirmLabel="Decline"
        tone="danger"
        reasonLabel="Reason shown to the customer"
        reasonPlaceholder="e.g. We are fully booked on this date. We would be glad to cater another date."
        onConfirm={async (reason) => {
          const refs = confirm.refs;
          setConfirm(null);
          await runBulk(refs, (ref) => reservationApi.declineReservation(ref, reason), 'Declined');
        }}
      />
    </>
  );
}

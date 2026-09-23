import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import {
  AlertBanner,
  CardTitle,
  ConfirmDialog,
  DashCard,
  DataTable,
  EmptyState,
  ErrorState,
  FilterTabs,
  SearchField,
  StatusChip,
  formatDate,
  formatRelative,
  isRental,
  peso,
  reservationApi,
  statusLabel,
  tokens,
  useNotify,
  useResource
} from '@tm/shared';
import { SectionBar } from '../../components/SectionTabs.jsx';

// Status tabs shown in this section (their names come from statusLabel)
const TABS = ['pending', 'approved', 'downpayment_paid', 'confirmed', 'completed', 'declined'];

/**
 * 1s · Requests tab of "Reservation & Calendar": approve or decline, one by one or in bulk.
 * Quotations are priced and sent from each reservation's page (the food has no fixed price).
 * The page title and tabs come from ReservationsCalendarPage.
 */
export default function RequestsSection() {
  const navigate = useNavigate();
  const notify = useNotify();
  // Load all reservations
  const { data, loading, error, reload } = useResource(() => reservationApi.listReservations(), []);
  const [tab, setTab] = useState('pending'); // selected status tab
  const [query, setQuery] = useState(''); // search text
  const [selected, setSelected] = useState([]); // REFs ticked for bulk actions
  const [confirm, setConfirm] = useState(null); // open confirm dialog: { type: 'approve'|'decline', refs }

  const rows = data || [];
  // Number of reservations per tab
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t, rows.filter((r) => r.status === t).length])), [rows]);
  const pending = rows.filter((r) => r.status === 'pending');
  // Age in days of the oldest pending request (86400000 ms = 1 day)
  const oldestDays = pending.length ? Math.max(...pending.map((r) => Math.floor((Date.now() - r.createdAt) / 86400000))) : 0;

  // Rows for the current tab matching the search.
  // Pending: oldest request first (first come, first served). Others: by event date.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => r.status === tab)
      .filter((r) => !q || [r.customerName, r.eventName, r.ref, r.packageName, r.occasion].some((v) => v.toLowerCase().includes(q)))
      .sort((a, b) => (tab === 'pending' ? a.createdAt - b.createdAt : a.date.localeCompare(b.date)));
  }, [rows, tab, query]);

  // Ticked rows that are still visible in the current tab/search
  const selectedRows = visible.filter((r) => selected.includes(r.ref));
  // Tick or untick one row
  const toggle = (ref) => setSelected((s) => (s.includes(ref) ? s.filter((x) => x !== ref) : [...s, ref]));

  /** Run an action on several reservations and report partial failures plainly. */
  const runBulk = async (refs, action, verb) => {
    const failures = [];
    // Process one at a time; a failure on one does not stop the others
    for (const ref of refs) {
      try {
        await action(ref);
      } catch (e) {
        failures.push(`${ref}: ${e.message}`);
      }
    }
    setSelected([]);
    // Show how many succeeded, and the first error if any failed
    const done = refs.length - failures.length;
    if (done) notify(`${verb} ${done} ${done === 1 ? 'reservation' : 'reservations'}.`);
    if (failures.length) notify(`Could not update ${failures.length}: ${failures[0]}`, 'error');
  };

  // Table columns. The checkbox column and Approve/Decline buttons only appear on the Pending tab.
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
            render: (r) => <Checkbox size="small" checked={selected.includes(r.ref)} onChange={() => toggle(r.ref)} inputProps={{ 'aria-label': `Select ${r.ref}` }} />
          }
        ]
      : []),
    { key: 'customer', label: 'Customer', render: (r) => (<Box><Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{r.customerName}</Typography><Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{r.ref} · {formatRelative(r.createdAt)}</Typography></Box>) },
    { key: 'event', label: 'Event and date', render: (r) => (<Box><Typography sx={{ fontSize: 13.5 }}>{r.occasion} · {formatDate(r.date)}</Typography><Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{r.eventName}</Typography></Box>) },
    { key: 'package', label: 'Package', render: (r) => r.packageName },
    // An equipment rental has no guest count
    { key: 'pax', label: 'Pax', align: 'right', render: (r) => (isRental(r.serviceType) ? 'Rental' : r.guests) },
    { key: 'quoted', label: 'Quoted', align: 'right', render: (r) => (r.quotation ? peso(r.quotation.net) : <Typography component="span" sx={{ color: tokens.textMuted }} title={`Estimate ${peso(r.estimate.net)}`}>—</Typography>) },
    tab === 'pending'
      ? {
          key: 'action',
          label: 'Action',
          align: 'right',
          render: (r) => (
            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
              <Button size="small" variant="contained" onClick={() => setConfirm({ type: 'approve', refs: [r.ref] })}>Approve</Button>
              <Button size="small" color="error" onClick={() => setConfirm({ type: 'decline', refs: [r.ref] })}>Decline</Button>
              <Button size="small" onClick={() => navigate(`/reservations/${r.ref}`)}>Open</Button>
            </Box>
          )
        }
      : { key: 'status', label: 'Status', render: (r) => <StatusChip status={r.status} size="sm" /> }
  ];

  return (
    <>
      <SectionBar text={loading ? 'Loading…' : pending.length ? `${pending.length} waiting · oldest ${oldestDays === 0 ? 'today' : `${oldestDays} ${oldestDays === 1 ? 'day' : 'days'}`}` : 'No requests waiting'} />

      <DashCard>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 1.5, justifyContent: 'space-between', mb: 2 }}>
              <FilterTabs
                value={tab}
                // Switching tabs clears the ticked rows
                onChange={(v) => {
                  setTab(v);
                  setSelected([]);
                }}
                options={TABS.map((t) => ({ value: t, label: statusLabel(t), count: loading ? undefined : counts[t] }))}
              />
              <SearchField id="requests-search" value={query} onChange={setQuery} />
            </Box>

            {/* Bulk action bar, shown when at least one row is ticked */}
            {selectedRows.length > 0 && (
              <Box sx={{ mb: 2, px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', borderRadius: 1.5, backgroundColor: tokens.ink, color: tokens.onInk }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, mr: 'auto' }}>{selectedRows.length} selected</Typography>
                <Button size="small" variant="contained" sx={{ bgcolor: tokens.gold, color: tokens.onGold, '&:hover': { bgcolor: tokens.goldLight } }} onClick={() => setConfirm({ type: 'approve', refs: selectedRows.map((r) => r.ref) })}>
                  Approve selected
                </Button>
                <Button size="small" sx={{ color: tokens.dangerOnInk }} onClick={() => setConfirm({ type: 'decline', refs: selectedRows.map((r) => r.ref) })}>
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
              empty={<EmptyState compact title={query ? 'No matches' : `No ${statusLabel(tab).toLowerCase()} reservations`} description={tab === 'pending' && !query ? 'New requests from customers will appear here.' : 'Try another tab or search.'} />}
            />
          </>
        )}
      </DashCard>

      <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
        <DashCard>
          <CardTitle>Approve — what happens</CardTitle>
          <Typography sx={{ fontSize: 13.5, lineHeight: 1.65, color: tokens.textSecondary }}>
            Open the reservation first to price the food and additional charges and send the quotation. Once it is sent, approving moves the status to Approved and the customer gets a payment instruction with a 50% downpayment due date.
          </Typography>
        </DashCard>
        <DashCard>
          <CardTitle>Decline — what happens</CardTitle>
          <Typography sx={{ fontSize: 13.5, lineHeight: 1.65, color: tokens.textSecondary }}>A reason is required and shown to the customer. The date stays open for other bookings.</Typography>
        </DashCard>
      </Box>

      {/* Confirm dialogs. Each closes itself, then runs the action on every chosen REF. */}
      <ConfirmDialog
        open={confirm?.type === 'approve'}
        onClose={() => setConfirm(null)}
        title={confirm && confirm.refs.length > 1 ? `Approve ${confirm.refs.length} reservations?` : 'Approve this reservation?'}
        description="The customer receives the quotation already sent and a 50% downpayment due date. Reservations without a sent quotation stay pending."
        confirmLabel="Approve"
        onConfirm={async () => {
          const refs = confirm.refs;
          setConfirm(null);
          await runBulk(refs, (ref) => reservationApi.approveReservation(ref), 'Approved');
        }}
      >
        {confirm?.type === 'approve' && <AlertBanner tone="info" sx={{ mb: 1 }}>{confirm.refs.join(', ')}</AlertBanner>}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm?.type === 'decline'}
        onClose={() => setConfirm(null)}
        title={confirm && confirm.refs.length > 1 ? `Decline ${confirm.refs.length} reservations?` : 'Decline this reservation?'}
        description="The reason is shown to the customer. The date stays open for other bookings."
        confirmLabel="Decline"
        tone="danger"
        reasonLabel="Reason shown to the customer"
        reasonPlaceholder="e.g. We are fully booked on this date. We would be glad to cater another date."
        // `reason` is the text the admin typed; it is shown to the customer
        onConfirm={async (reason) => {
          const refs = confirm.refs;
          setConfirm(null);
          await runBulk(refs, (ref) => reservationApi.declineReservation(ref, reason), 'Declined');
        }}
      />
    </>
  );
}

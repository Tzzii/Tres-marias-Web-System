import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  AlertBanner,
  BalanceChip,
  BusyButton,
  CardTitle,
  ConfirmDialog,
  DashCard,
  DataTable,
  DocumentDialog,
  EmptyState,
  ErrorState,
  Field,
  FilterTabs,
  SearchField,
  StatCard,
  formatDate,
  formatDateTime,
  paymentApi,
  paymentKindLabel,
  peso,
  reservationApi,
  tokens,
  useNotify,
  useResource
} from '@tm/shared';
import { SectionBar } from '../../components/SectionTabs.jsx';

// Filter tabs as [key, label]
const FILTERS = [
  ['all', 'All'],
  ['awaiting', 'Awaiting verification'],
  ['partial', 'Partially paid'],
  ['full', 'Fully paid'],
  ['overdue', 'Overdue'],
  ['unpaid', 'Unpaid']
];

/** Does a reservation belong in a filter tab? "awaiting" = has a proof to verify; the rest match the balance status. */
const inFilter = (key, r) => (key === 'all' ? true : key === 'awaiting' ? r.awaitingCount > 0 : r.balanceState === key);

/**
 * 1w · Payments tab of Reports: verify proofs, record receipts, chase balances.
 * Opens straight to a proof with ?verify=ID, or to a filter with ?filter=KEY. The page title and tabs come from ReportsPage.
 */
export default function PaymentsSection() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [params, setParams] = useSearchParams();
  // Load every reservation with its total, amount paid, balance and payments
  const { data, loading, error, reload } = useResource(() => paymentApi.listBalances(), []);

  // Can start from ?filter= (dashboard link); an unknown value falls back to "All"
  const [filter, setFilter] = useState(() => (FILTERS.some(([key]) => key === params.get('filter')) ? params.get('filter') : 'all'));
  const [query, setQuery] = useState('');
  const [verifyId, setVerifyId] = useState(params.get('verify')); // payment open in the verify panel
  const [rejecting, setRejecting] = useState(false); // reject dialog open
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null); // receipt shown in the document dialog

  // Open the verify panel when a notification link adds ?verify=ID to the URL
  useEffect(() => {
    const fromUrl = params.get('verify');
    if (fromUrl) setVerifyId(fromUrl);
  }, [params]);

  // Bring the verification panel into view when it opens (it sits below the table on smaller screens)
  useEffect(() => {
    if (!verifyId || !data) return undefined;
    const timer = setTimeout(() => document.getElementById('verify-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    return () => clearTimeout(timer);
  }, [verifyId, Boolean(data)]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data || [];
  // Every payment from every reservation in one flat list
  const allPayments = rows.flatMap((r) => r.payments);
  // The payment being verified and the reservation it belongs to
  const verifying = allPayments.find((p) => p.id === verifyId) || null;
  const verifyingRow = verifying ? rows.find((r) => r.ref === verifying.ref) : null;

  // Summary card figures
  const now = new Date();
  // Sum of payments verified during the current calendar month
  const collectedThisMonth = allPayments
    .filter((p) => p.status === 'verified' && new Date(p.verifiedAt).getMonth() === now.getMonth() && new Date(p.verifiedAt).getFullYear() === now.getFullYear())
    .reduce((s, p) => s + p.amount, 0);
  const outstanding = rows.reduce((s, r) => s + r.balance, 0);
  const awaitingCount = allPayments.filter((p) => p.status === 'awaiting').length;
  const overdueCount = rows.filter((r) => r.balanceState === 'overdue').length;

  // Number of reservations in each filter tab
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([key]) => [key, rows.filter((r) => inFilter(key, r)).length])), [rows]);

  // Rows to show. Sort order: proofs to verify first, then overdue, then by event date.
  const visible = rows
    .filter((r) => inFilter(filter, r))
    .filter((r) => {
      const q = query.trim().toLowerCase();
      return !q || [r.ref, r.customerName, r.eventName].some((v) => v.toLowerCase().includes(q));
    })
    .sort((a, b) => b.awaitingCount - a.awaitingCount || (a.balanceState === 'overdue' ? -1 : 0) - (b.balanceState === 'overdue' ? -1 : 0) || a.date.localeCompare(b.date));

  // Close the verify panel and remove ?verify= from the URL
  const closeVerify = () => {
    setVerifyId(null);
    if (params.get('verify')) {
      const next = new URLSearchParams(params);
      next.delete('verify');
      setParams(next, { replace: true });
    }
  };

  // Approve the payment proof: issues a receipt and updates the reservation status
  const markReceived = async () => {
    setBusy(true);
    try {
      const result = await paymentApi.verifyPayment(verifying.id);
      notify(`Payment verified. Receipt ${result.receiptNo} issued.`);
      closeVerify();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Send the customer a reminder about their unpaid balance
  const remind = async (ref) => {
    try {
      await paymentApi.sendPaymentReminder(ref);
      notify('Reminder sent to the customer.');
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  // Load the reservation and open the receipt for a verified payment
  const openReceipt = async (payment) => {
    try {
      const detail = await reservationApi.getReservation(payment.ref);
      setReceipt({ detail, doc: { kind: 'receipt', name: `Receipt-${payment.receiptNo}.pdf`, paymentId: payment.id } });
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const columns = [
    { key: 'ref', label: 'REF', render: (r) => <Typography sx={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.ref}</Typography> },
    // card: 'title' — on phone cards the customer and event are the heading (REF becomes a field)
    { key: 'customer', label: 'Customer', card: 'title', render: (r) => (<Box><Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{r.customerName}</Typography><Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{r.eventName}</Typography></Box>) },
    { key: 'date', label: 'Event date', render: (r) => <Box sx={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</Box> },
    { key: 'total', label: 'Total', align: 'right', render: (r) => peso(r.total) },
    { key: 'paid', label: 'Paid', align: 'right', render: (r) => peso(r.paid) },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => <b>{peso(r.balance)}</b> },
    { key: 'state', label: 'Standing', render: (r) => (r.awaitingCount ? <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>Proof to verify</Box> : <BalanceChip state={r.balanceState} size="sm" />) },
    {
      key: 'action',
      label: 'Action',
      align: 'right',
      // Buttons depend on the row: View proof if one is waiting, Send reminder if money is owed,
      // Receipt (the most recently verified one) if one exists
      render: (r) => {
        const awaiting = r.payments.find((p) => p.status === 'awaiting');
        const lastReceipt = r.payments.filter((p) => p.status === 'verified').sort((a, b) => b.verifiedAt - a.verifiedAt)[0];
        return (
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
            {awaiting && <Button size="small" variant="contained" onClick={() => setVerifyId(awaiting.id)}>View proof</Button>}
            {!awaiting && r.balance > 0 && <Button size="small" onClick={() => remind(r.ref)}>Send reminder</Button>}
            {lastReceipt && <Button size="small" onClick={() => openReceipt(lastReceipt)}>Receipt</Button>}
          </Box>
        );
      }
    }
  ];

  if (error) return <DashCard><ErrorState error={error} onRetry={reload} /></DashCard>;

  return (
    <>
      <SectionBar text="Verify uploaded proofs, record cash payments and follow up on balances." />

      {/* Summary cards, two per row on phones and tablets */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, 1fr)' }, gap: { xs: 1.5, sm: 2.5 }, mb: 2.5 }}>
        <StatCard icon={PendingActionsOutlinedIcon} tone="amber" label="Awaiting verification" value={awaitingCount} loading={loading} onClick={() => setFilter('awaiting')} />
        <StatCard icon={PaymentsOutlinedIcon} tone="green" label="Collected this month" value={peso(collectedThisMonth)} loading={loading} />
        <StatCard icon={AccountBalanceWalletOutlinedIcon} tone="blue" label="Outstanding balance" value={peso(outstanding)} loading={loading} onClick={() => setFilter('partial')} />
        <StatCard icon={WarningAmberRoundedIcon} tone="red" label="Overdue" value={overdueCount} loading={loading} onClick={() => setFilter('overdue')} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: verifying ? '1.7fr 1fr' : '1fr' }, gap: 2.5, alignItems: 'start' }}>
        <DashCard>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 1.5, justifyContent: 'space-between', mb: 2 }}>
            <FilterTabs value={filter} onChange={setFilter} options={FILTERS.map(([value, label]) => ({ value, label, count: loading ? undefined : counts[value] }))} />
            <SearchField id="payments-search" value={query} onChange={setQuery} placeholder="Search by customer or REF" />
          </Box>
          <DataTable loading={loading} columns={columns} rows={visible} rowKey={(r) => r.ref} onRowClick={(r) => navigate(`/reservations/${r.ref}`)} minWidth={960} empty={<EmptyState compact title="Nothing here" description="No reservations match this filter." />} />
        </DashCard>

        {/* Verify panel: proof image, payment details, and Mark received / Reject buttons */}
        {verifying && verifyingRow && (
          <DashCard id="verify-panel" sx={{ position: { xl: 'sticky' }, top: { xl: tokens.headerHeight + 24 }, scrollMarginTop: `${tokens.headerHeight + 16}px` }}>
            <CardTitle subtitle={`${verifyingRow.customerName} · ${verifyingRow.eventName}`} action={<Button size="small" onClick={closeVerify}>Close</Button>}>
              Verifying · {verifying.ref}
            </CardTitle>
            {verifying.proofName ? (
              <Box sx={{ height: 180, borderRadius: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: tokens.surfaceMuted, border: `1px dashed ${tokens.borderInput}` }}>
                <ImageOutlinedIcon sx={{ fontSize: 40, color: tokens.textMuted }} />
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: tokens.textSecondary, px: 2, textAlign: 'center', overflowWrap: 'anywhere' }}>{verifying.proofName}</Typography>
              </Box>
            ) : (
              <AlertBanner tone="info">Cash payment recorded by the admin.</AlertBanner>
            )}
            <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <Field label="Method">{verifying.methodLabel}</Field>
              <Field label="Amount">{peso(verifying.amount)}</Field>
              <Field label="Reference">{verifying.referenceNo}</Field>
              <Field label="Uploaded">{formatDateTime(verifying.submittedAt)}</Field>
              <Field label="Payment for">{paymentKindLabel(verifying.kind)}</Field>
              <Field label="Balance after">{peso(Math.max(0, verifyingRow.balance - verifying.amount))}</Field>
            </Box>
            {verifying.status === 'awaiting' ? (
              <>
                <Box sx={{ mt: 2.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <BusyButton busy={busy} onClick={markReceived}>Mark received</BusyButton>
                  <Button color="error" variant="outlined" disabled={busy} onClick={() => setRejecting(true)}>Reject with reason</Button>
                </Box>
                <Box sx={{ mt: 2.5, p: 1.75, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, mb: 0.5 }}>What marking received does</Typography>
                  <Typography sx={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.textSecondary }}>
                    Generates the receipt, moves a 50% payment to Downpayment paid, a full payment straight to Confirmed, and posts the update to the customer's Payments page and chat thread.
                  </Typography>
                </Box>
              </>
            ) : (
              <AlertBanner tone={verifying.status === 'verified' ? 'success' : 'error'} sx={{ mt: 2 }}>
                {verifying.status === 'verified' ? `Verified ${formatDateTime(verifying.verifiedAt)} · ${verifying.receiptNo}` : `Rejected: ${verifying.rejectReason}`}
              </AlertBanner>
            )}
          </DashCard>
        )}
      </Box>

      <Typography sx={{ mt: 2, fontSize: 12.5, color: tokens.textOnDarkMuted }}>
        Cash-on-site payments are recorded from the reservation page with “Mark payment received”; customers never upload proof for those.
      </Typography>

      <ConfirmDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject this payment?"
        description="The customer is told why and asked to submit the payment again."
        confirmLabel="Reject payment"
        tone="danger"
        reasonLabel="Reason shown to the customer"
        reasonPlaceholder="e.g. The reference number does not match any transaction on our account."
        // Reject the payment with the typed reason; the customer is asked to pay again
        onConfirm={async (reason) => {
          await paymentApi.rejectPayment(verifying.id, reason);
          setRejecting(false);
          notify('Payment rejected and the customer was notified.', 'info');
          closeVerify();
        }}
      />
      {receipt && <DocumentDialog open onClose={() => setReceipt(null)} detail={receipt.detail} doc={receipt.doc} />}
    </>
  );
}

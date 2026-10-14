import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
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
  FormField,
  ListSkeleton,
  MIN_DOWNPAYMENT_RANGE,
  QrStatusChip,
  SearchField,
  StatCard,
  StatusChip,
  catalogApi,
  formatClock,
  formatDate,
  formatDateTime,
  paymentApi,
  paymentKindLabel,
  peso,
  qrState,
  reservationApi,
  tokens,
  useNotify,
  useQrWatch,
  useResource
} from '@tm/shared';
import RefundDialog, { refundRecordedText } from '../../components/RefundDialog.jsx';
import { SectionBar } from '../../components/SectionTabs.jsx';

const FILTERS = [
  ['all', 'All'],
  ['awaiting', 'Awaiting Verification'],
  ['partial', 'Partially Paid'],
  ['full', 'Fully Paid'],
  ['overdue', 'Overdue'],
  ['unpaid', 'Unpaid'],
  ['refunds', 'Refunds to Send'],
  ['qr', 'QR Ph Codes']
];

function ProofPreview({ payment }) {
  const [proof, setProof] = useState({ url: null, kind: 'loading' });
  useEffect(() => {
    let alive = true;
    let made = null;
    setProof({ url: null, kind: 'loading' });
    paymentApi
      .proofUrl(payment.id)
      .then((url) => {
        made = url;
        if (alive) setProof({ url, kind: url ? 'image' : 'none' });
      })
      .catch(() => alive && setProof({ url: null, kind: 'none' }));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [payment.id]);

  const open = () => window.open(proof.url, '_blank', 'noopener');
  if (proof.kind === 'image') {
    return (
      <Box
        component="img"
        src={proof.url}
        alt={`Receipt: ${payment.proofName}`}
        onClick={open}
        onError={() => setProof((p) => ({ ...p, kind: 'file' }))}
        sx={{
          display: 'block',
          width: '100%',
          maxHeight: 360,
          objectFit: 'contain',
          borderRadius: 1.5,
          backgroundColor: tokens.surfaceMuted,
          cursor: 'zoom-in'
        }}
      />
    );
  }
  return (
    <Box
      sx={{
        height: 180,
        borderRadius: 1.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        backgroundColor: tokens.surfaceMuted,
        border: `1px dashed ${tokens.borderInput}`
      }}
    >
      <ImageOutlinedIcon sx={{ fontSize: 40, color: tokens.textMuted }} />
      <Typography
        sx={{
          fontSize: 12.5,
          fontWeight: 600,
          color: tokens.textSecondary,
          px: 2,
          textAlign: 'center',
          overflowWrap: 'anywhere'
        }}
      >
        {proof.kind === 'loading' ? 'Loading the receipt…' : payment.proofName}
      </Typography>
      {proof.kind === 'file' && (
        <Button size="small" variant="outlined" onClick={open}>
          Open file
        </Button>
      )}
    </Box>
  );
}

const inFilter = (key, r) => (key === 'all' ? true : key === 'awaiting' ? r.awaitingCount > 0 : r.balanceState === key);

const REFUND_WHY = {
  customer: 'Cancelled by the customer',
  admin: 'Cancelled by the admin',
  declined: 'Declined',
  overpaid: 'Overpaid'
};

function qrDetail(q) {
  const state = qrState(q);
  if (state === 'paid') return `Paid${q.paidAt ? ` ${formatDateTime(q.paidAt)}` : ''} · ${q.receiptNo}`;
  if (state === 'waiting') return `Open until ${formatClock(q.expiresAt)}`;
  if (state === 'checking') return 'Time is up · checking with PayMongo';
  if (state === 'failed') return q.failureReason || 'The payment did not go through';
  return `Expired ${formatDateTime(q.expiresAt)}`;
}

export default function PaymentsSection() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useResource(async () => {
    const [balances, refundsDue, qrs] = await Promise.all([
      paymentApi.listBalances(),
      paymentApi.listRefundsDue(),
      paymentApi.listQrPayments()
    ]);
    return { balances, refundsDue, qrs };
  }, []);
  useQrWatch(data ? data.qrs : [], reload);
  const setting = useResource(() => catalogApi.getCatalog(), []);

  const [filter, setFilter] = useState(() =>
    FILTERS.some(([key]) => key === params.get('filter')) ? params.get('filter') : 'all'
  );
  const [query, setQuery] = useState('');
  const [verifyId, setVerifyId] = useState(params.get('verify'));
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [refunding, setRefunding] = useState(null);

  useEffect(() => {
    const fromUrl = params.get('verify');
    if (fromUrl) setVerifyId(fromUrl);
  }, [params]);

  useEffect(() => {
    if (!verifyId || !data) return undefined;
    const timer = setTimeout(
      () => document.getElementById('verify-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      150
    );
    return () => clearTimeout(timer);
  }, [verifyId, Boolean(data)]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data ? data.balances : [];
  const refundsDue = data ? data.refundsDue : [];
  const qrs = data ? data.qrs : [];
  const allPayments = rows.flatMap((r) => r.payments);
  const verifying = allPayments.find((p) => p.id === verifyId) || null;
  const verifyingRow = verifying ? rows.find((r) => r.ref === verifying.ref) : null;

  const now = new Date();
  const collectedThisMonth = allPayments
    .filter(
      (p) =>
        p.status === 'verified' &&
        new Date(p.verifiedAt).getMonth() === now.getMonth() &&
        new Date(p.verifiedAt).getFullYear() === now.getFullYear()
    )
    .reduce((s, p) => s + p.amount, 0);
  const outstanding = rows.reduce((s, r) => s + r.balance, 0);
  const awaitingCount = allPayments.filter((p) => p.status === 'awaiting').length;
  const overdueCount = rows.filter((r) => r.balanceState === 'overdue').length;

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map(([key]) => [
          key,
          key === 'refunds'
            ? refundsDue.length
            : key === 'qr'
              ? qrs.length
              : rows.filter((r) => inFilter(key, r)).length
        ])
      ),
    [rows, refundsDue, qrs]
  );

  const matches = (r) => {
    const q = query.trim().toLowerCase();
    return !q || [r.ref, r.customerName, r.eventName].some((v) => v.toLowerCase().includes(q));
  };
  const visible = rows
    .filter((r) => inFilter(filter, r))
    .filter(matches)
    .sort(
      (a, b) =>
        b.awaitingCount - a.awaitingCount ||
        (a.balanceState === 'overdue' ? -1 : 0) - (b.balanceState === 'overdue' ? -1 : 0) ||
        a.date.localeCompare(b.date)
    );
  const visibleRefunds = refundsDue.filter(matches);
  const visibleQrs = qrs.filter(matches);

  const closeVerify = () => {
    setVerifyId(null);
    if (params.get('verify')) {
      const next = new URLSearchParams(params);
      next.delete('verify');
      setParams(next, { replace: true });
    }
  };

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

  const remind = async (ref) => {
    try {
      const result = await paymentApi.sendPaymentReminder(ref);
      notify(
        result && result.emailed
          ? 'Reminder sent in chat and by email.'
          : 'Reminder sent in chat. An email reminder already went out in the last 12 hours, so no email this time.'
      );
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const openReceipt = async (payment) => {
    try {
      const detail = await reservationApi.getReservation(payment.ref);
      setReceipt({ detail, doc: { kind: 'receipt', name: `Receipt-${payment.receiptNo}.pdf`, paymentId: payment.id } });
    } catch (e) {
      notify(e.message, 'error');
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
    { key: 'total', label: 'Total', align: 'right', render: (r) => peso(r.total) },
    { key: 'paid', label: 'Paid', align: 'right', render: (r) => peso(r.paid) },
    { key: 'balance', label: 'Balance', align: 'right', render: (r) => <b>{peso(r.balance)}</b> },
    {
      key: 'state',
      label: 'Standing',
      render: (r) =>
        r.awaitingCount ? (
          <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>
            Proof to verify
          </Box>
        ) : r.openQr ? (
          <Box component="span" sx={{ fontSize: 12, fontWeight: 700, color: '#0369a1' }}>
            Waiting for QR payment
          </Box>
        ) : (
          <BalanceChip state={r.balanceState} size="sm" />
        )
    },
    {
      key: 'action',
      label: 'Action',
      align: 'right',
      render: (r) => {
        const awaiting = r.payments.find((p) => p.status === 'awaiting');
        const lastReceipt = r.payments
          .filter((p) => p.status === 'verified')
          .sort((a, b) => b.verifiedAt - a.verifiedAt)[0];
        return (
          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
            {awaiting && (
              <Button size="small" variant="contained" onClick={() => setVerifyId(awaiting.id)}>
                View proof
              </Button>
            )}
            {!awaiting && r.balance > 0 && (
              <Button size="small" onClick={() => remind(r.ref)}>
                Send reminder
              </Button>
            )}
            {lastReceipt && (
              <Button size="small" onClick={() => openReceipt(lastReceipt)}>
                Receipt
              </Button>
            )}
          </Box>
        );
      }
    }
  ];

  const refundColumns = [
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
    { key: 'status', label: 'Status', card: 'aside', render: (r) => <StatusChip status={r.status} size="sm" /> },
    { key: 'date', label: 'Event Date', render: (r) => <Box sx={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</Box> },
    { key: 'why', label: 'Why', render: (r) => REFUND_WHY[r.why] || r.why },
    { key: 'refundDue', label: 'To Return', align: 'right', render: (r) => <b>{peso(r.refundDue)}</b> },
    { key: 'paid', label: 'Paid', align: 'right', render: (r) => peso(r.paid) },
    { key: 'total', label: 'Total', align: 'right', render: (r) => peso(r.total) },
    {
      key: 'action',
      label: 'Action',
      align: 'right',
      card: 'footer',
      render: (r) => (
        <Button size="small" variant="contained" onClick={() => setRefunding(r)}>
          Record refund
        </Button>
      )
    }
  ];

  const qrColumns = [
    {
      key: 'opened',
      label: 'Opened',
      render: (q) => <Box sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(q.createdAt)}</Box>
    },
    {
      key: 'ref',
      label: 'REF',
      render: (q) => <Typography sx={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{q.ref}</Typography>
    },
    {
      key: 'customer',
      label: 'Customer',
      card: 'title',
      render: (q) => (
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{q.customerName}</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{q.eventName}</Typography>
        </Box>
      )
    },
    { key: 'status', label: 'Status', card: 'aside', render: (q) => <QrStatusChip qr={q} size="sm" /> },
    { key: 'amount', label: 'Amount', align: 'right', render: (q) => <b>{peso(q.amount)}</b> },
    {
      key: 'detail',
      label: 'Details',
      render: (q) => <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{qrDetail(q)}</Typography>
    }
  ];

  if (error)
    return (
      <DashCard>
        <ErrorState error={error} onRetry={reload} />
      </DashCard>
    );

  return (
    <>
      <SectionBar text="Set the minimum downpayment, verify uploaded proofs, record cash payments, follow up on balances and send refunds." />

      <MinDownpaymentCard
        setting={setting}
        onSaved={() => {
          notify('Minimum downpayment saved.');
          setting.reload();
        }}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, 1fr)' },
          gap: { xs: 1.5, sm: 2.5 },
          mb: 2.5
        }}
      >
        <StatCard
          icon={PendingActionsOutlinedIcon}
          tone="amber"
          label="Awaiting Verification"
          value={awaitingCount}
          loading={loading}
          onClick={() => setFilter('awaiting')}
        />
        <StatCard
          icon={PaymentsOutlinedIcon}
          tone="green"
          label="Collected This Month"
          value={peso(collectedThisMonth)}
          loading={loading}
        />
        <StatCard
          icon={AccountBalanceWalletOutlinedIcon}
          tone="blue"
          label="Outstanding Balance"
          value={peso(outstanding)}
          loading={loading}
          onClick={() => setFilter('partial')}
        />
        <StatCard
          icon={WarningAmberRoundedIcon}
          tone="red"
          label="Overdue"
          value={overdueCount}
          loading={loading}
          onClick={() => setFilter('overdue')}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', xl: verifying ? '1.7fr 1fr' : '1fr' },
          gap: 2.5,
          alignItems: 'start'
        }}
      >
        <DashCard>
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
              value={filter}
              onChange={setFilter}
              options={FILTERS.map(([value, label]) => ({ value, label, count: loading ? undefined : counts[value] }))}
            />
            <SearchField
              id="payments-search"
              value={query}
              onChange={setQuery}
              placeholder="Search by customer or REF"
            />
          </Box>
          {filter === 'refunds' ? (
            <DataTable
              loading={loading}
              columns={refundColumns}
              rows={visibleRefunds}
              rowKey={(r) => r.ref}
              onRowClick={(r) => navigate(`/reservations/${r.ref}`)}
              minWidth={960}
              empty={
                <EmptyState
                  compact
                  title="No refunds to send"
                  description="Cancelled and overpaid bookings with money to return show here."
                />
              }
            />
          ) : filter === 'qr' ? (
            <DataTable
              loading={loading}
              columns={qrColumns}
              rows={visibleQrs}
              rowKey={(q) => q.id}
              onRowClick={(q) => navigate(`/reservations/${q.ref}`)}
              minWidth={960}
              empty={
                <EmptyState
                  compact
                  title="No QR Ph codes yet"
                  description="Every QR Ph code a customer opens shows here: waiting, paid, expired or failed."
                />
              }
            />
          ) : (
            <DataTable
              loading={loading}
              columns={columns}
              rows={visible}
              rowKey={(r) => r.ref}
              onRowClick={(r) => navigate(`/reservations/${r.ref}`)}
              minWidth={960}
              empty={<EmptyState compact title="Nothing here" description="No reservations match this filter." />}
            />
          )}
        </DashCard>

        {verifying && verifyingRow && (
          <DashCard
            id="verify-panel"
            sx={{
              position: { xl: 'sticky' },
              top: { xl: tokens.headerHeight + 24 },
              scrollMarginTop: `${tokens.headerHeight + 16}px`
            }}
          >
            <CardTitle
              subtitle={`${verifyingRow.customerName} · ${verifyingRow.eventName}`}
              action={
                <Button size="small" onClick={closeVerify}>
                  Close
                </Button>
              }
            >
              Verifying · {verifying.ref}
            </CardTitle>
            {verifying.proofName ? (
              <ProofPreview payment={verifying} />
            ) : verifying.method === 'qrph' ? (
              <AlertBanner tone="info">QR Ph payment (GCash, Maya or a bank app), confirmed by PayMongo.</AlertBanner>
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
                  <BusyButton busy={busy} onClick={markReceived}>
                    Mark received
                  </BusyButton>
                  <Button color="error" variant="outlined" disabled={busy} onClick={() => setRejecting(true)}>
                    Reject with reason
                  </Button>
                </Box>
                <Box sx={{ mt: 2.5, p: 1.75, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, mb: 0.5 }}>What Marking Received Does</Typography>
                  <Typography sx={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.textSecondary }}>
                    Generates the receipt, moves the booking to Downpayment paid once the minimum downpayment is reached
                    (straight to Confirmed when it is paid in full), and posts the update to the customer's Payments
                    page and chat thread.
                  </Typography>
                </Box>
              </>
            ) : (
              <AlertBanner tone={verifying.status === 'verified' ? 'success' : 'error'} sx={{ mt: 2 }}>
                {verifying.status === 'verified'
                  ? `Verified ${formatDateTime(verifying.verifiedAt)} · ${verifying.receiptNo}`
                  : `Rejected: ${verifying.rejectReason}`}
              </AlertBanner>
            )}
          </DashCard>
        )}
      </Box>

      <Typography sx={{ mt: 2, fontSize: 12.5, color: tokens.textOnDarkMuted }}>
        Cash-on-site payments are recorded from the reservation page with “Mark payment received”. QR Ph payments are
        confirmed by PayMongo; only bank transfers need verifying here. Every QR Ph code a customer opens, paid or not,
        is kept under “QR Ph Codes”.
      </Typography>

      <ConfirmDialog
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject This Payment?"
        description="The customer is told why and asked to submit the payment again."
        confirmLabel="Reject payment"
        tone="danger"
        reasonLabel="Reason shown to the customer"
        reasonPlaceholder="e.g. The reference number does not match any transaction on our account."
        onConfirm={async (reason) => {
          await paymentApi.rejectPayment(verifying.id, reason);
          setRejecting(false);
          notify('Payment rejected and the customer was notified.', 'info');
          closeVerify();
        }}
      />
      {receipt && <DocumentDialog open onClose={() => setReceipt(null)} detail={receipt.detail} doc={receipt.doc} />}
      <RefundDialog
        open={Boolean(refunding)}
        onClose={() => setRefunding(null)}
        booking={refunding}
        onRecorded={(refund) => {
          setRefunding(null);
          notify(refundRecordedText(refund));
        }}
      />
    </>
  );
}

function MinDownpaymentCard({ setting, onSaved }) {
  const current = setting.data ? setting.data.minDownpayment : null;
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (current !== null) setValue(String(current));
  }, [current]);

  const save = async () => {
    setBusy(true);
    try {
      await catalogApi.setMinDownpayment(Number(value));
      setError('');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashCard sx={{ mb: 2.5 }}>
      <CardTitle subtitle="The least a customer pays first to secure a date. They can pay more, up to the full amount.">
        Minimum Downpayment
      </CardTitle>
      {setting.error ? (
        <ErrorState error={setting.error} onRetry={setting.reload} />
      ) : current === null ? (
        <ListSkeleton rows={1} height={40} />
      ) : (
        <>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <FormField
              id="min-downpayment"
              type="number"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError('');
              }}
              error={error}
              InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
              inputProps={{
                min: MIN_DOWNPAYMENT_RANGE.min,
                max: MIN_DOWNPAYMENT_RANGE.max,
                step: 500,
                'aria-label': 'Minimum downpayment'
              }}
              sx={{ width: 170 }}
            />
            <BusyButton busy={busy} disabled={String(current) === value} onClick={save} sx={{ height: 40 }}>
              Save
            </BusyButton>
          </Box>
          <Typography sx={{ mt: 1.5, fontSize: 12.5, lineHeight: 1.6, color: tokens.textSecondary }}>
            A booking whose total is below it is paid in full. Bookings keep the amount in force when they were made, so
            changing this never changes what an existing customer has to pay first.
          </Typography>
        </>
      )}
    </DashCard>
  );
}

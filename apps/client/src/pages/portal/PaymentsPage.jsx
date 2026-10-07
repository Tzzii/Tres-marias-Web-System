import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import {
  AlertBanner,
  BUSINESS,
  BusyButton,
  CardTitle,
  DashCard,
  DetailRow,
  DocumentDialog,
  EmptyState,
  ErrorState,
  FormField,
  ListSkeleton,
  PageHeader,
  PaymentStatusChip,
  Pill,
  RULES,
  SelectField,
  formatDate,
  formatDateTime,
  paymentApi,
  peso,
  referenceProblem,
  reservationApi,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';

// Largest receipt photo allowed, in MB (the server's MAX_UPLOAD_MB defaults to the same rule)
const MAX_FILE_MB = RULES.proofMaxMb;
// Receipt photos the upload box takes: photos only, so a document can't be sent by mistake (owner, 2026-10-03)
const PROOF_ACCEPT = 'image/jpeg,image/png,image/webp';
// Payment method buttons. The QR option ('gcash' inside the system) is a PayMongo QR Ph code (Phase 8B),
// which GCash, Maya and bank apps can all scan; a bank transfer is sent with a photo of its receipt; cash is
// paid on site. There is no GCash number to send to. `note` is the small line under the name.
const METHODS = [
  { value: 'gcash', label: 'QR Ph', note: 'GCash, Maya or bank app', icon: PhoneIphoneOutlinedIcon },
  { value: 'bank', label: 'Bank transfer', note: 'Upload receipt', icon: AccountBalanceOutlinedIcon },
  { value: 'cash', label: 'Cash on site', note: 'On the event day', icon: StorefrontOutlinedIcon }
];

/**
 * The older way to copy text, for pages where navigator.clipboard does not exist: put the text in a
 * hidden text box, select it and run the browser's copy command. Throws if the browser refuses.
 */
function copyWithTextArea(value) {
  const box = document.createElement('textarea');
  box.value = value;
  box.setAttribute('readonly', '');
  // Off screen, and 16px so an iPhone does not zoom in when it is selected
  Object.assign(box.style, { position: 'fixed', top: '0', left: '-9999px', fontSize: '16px' });
  document.body.appendChild(box);
  box.select();
  box.setSelectionRange(0, value.length); // iPhones ignore select() alone
  const copied = document.execCommand('copy');
  document.body.removeChild(box);
  if (!copied) throw new Error('Copy was refused');
}

// How often an open GCash QR asks the server whether it was paid (only while the page is visible)
const QR_POLL_MS = 4000;

/**
 * The open QR Ph code of a reservation (Phase 8B; GCash, Maya and bank apps can scan it): the code for its exact amount, a countdown to
 * when it stops working, how to pay it (on a phone: save the image and upload it from the gallery in the
 * app; no links that open other apps) and a "Save QR image" download. While it waits it asks the server
 * every 4 seconds, only while the page is visible; the server also checks with PayMongo, so the payment
 * shows even when PayMongo's own notice is late. `onUpdate(qr)` gets the QR once it is paid, expired or
 * failed; `onNew` goes back to the form after an expired or failed one.
 */
function QrPanel({ qr, customerId, onUpdate, onNew }) {
  const [clock, setClock] = useState(Date.now());
  // The countdown ticks once a second while the QR waits
  useEffect(() => {
    if (qr.status !== 'pending') return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [qr.status]);
  // Ask how the QR stands every few seconds while it waits and the page is on screen
  useEffect(() => {
    if (qr.status !== 'pending') return undefined;
    let alive = true;
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const fresh = await paymentApi.getQrPayment(customerId, qr.id);
        if (alive && fresh.status !== 'pending') onUpdate(fresh);
      } catch (e) {
        /* no answer this time: asked again in a few seconds */
      }
    }, QR_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [qr.id, qr.status, customerId, onUpdate]);

  if (qr.status === 'expired' || qr.status === 'failed') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <AlertBanner tone="warning" title={qr.status === 'expired' ? 'The QR expired' : 'The payment did not go through'}>
          {qr.status === 'expired' ? `The QR for ${peso(qr.amount)} expired before it was paid.` : `Your payment of ${peso(qr.amount)} did not go through. Nothing was charged.`} You can make a new QR.
        </AlertBanner>
        <Button variant="outlined" onClick={onNew} sx={{ alignSelf: 'flex-start' }}>Generate new QR</Button>
      </Box>
    );
  }

  // Time left, "29:41"; after the QR's time the server still checks for a payment made in its last seconds
  const left = Math.max(0, qr.expiresAt - clock);
  const countdown = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  return (
    <Box sx={{ p: 2, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2.5, alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        {qr.qrImage ? (
          <Box component="img" src={qr.qrImage} alt={`QR Ph code for ${peso(qr.amount)}`} sx={{ width: 220, height: 220, borderRadius: 1, border: `1px solid ${tokens.cardLightBorder}`, backgroundColor: '#fff' }} />
        ) : (
          <Box sx={{ width: 220, height: 220, borderRadius: 1, backgroundColor: tokens.surfaceMuted }} />
        )}
        {qr.qrImage && (
          <Button component="a" href={qr.qrImage} download={`TresMarias-${qr.ref}-QR.png`} size="small" startIcon={<DownloadRoundedIcon />}>
            Save QR image
          </Button>
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Scan to Pay {peso(qr.amount)}</Typography>
        <Box>
          <DetailRow label="Reservation">{qr.ref}</DetailRow>
          <DetailRow label="Amount (exact)">{peso(qr.amount)}</DetailRow>
          <DetailRow label="QR works for">{left > 0 ? countdown : 'Checking for your payment…'}</DetailRow>
        </Box>
        <Box component="ol" sx={{ m: 0, pl: 2.25, fontSize: 13, color: tokens.textSecondary, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <li>Open GCash, Maya or your bank app and choose Pay QR or Scan QR.</li>
          <li>Scan this code. On this phone, save the QR image, then upload it from your gallery in the app.</li>
          <li>Keep this page open or come back to it: it updates by itself once you have paid.</li>
        </Box>
        <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>If your app refuses the amount, pay in parts or use bank transfer. To pay a different amount, wait until this QR expires.</Typography>
      </Box>
    </Box>
  );
}

/**
 * 1k · Payments: downpayment, balance, bank-transfer receipt upload, history and receipts.
 * Three ways to pay: a QR Ph code that GCash, Maya or a bank app scans (PayMongo, Phase 8B; the card can't be
 * picked while paymentOptions() says the QR isn't available, and there is no GCash number to send to), a bank transfer
 * with its reference number and a photo of the receipt (the admin verifies it), or cash on site.
 * One payment at a time per reservation: while a bank transfer waits for verification or a GCash QR is
 * open (QrPanel), the form is replaced by it. An open QR comes back with the page (the summary's openQr).
 * The customer types how much they are paying (whole pesos). Until the reservation's minimum downpayment
 * is reached, it is at least the rest of that minimum (all of it when the total is below the minimum)
 * and at most the balance; after that, any amount up to the balance, so the balance can be paid in parts.
 * The history also lists money returned to them (refunds).
 */
export default function PaymentsPage() {
  useDocumentTitle('Payments');
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // Load the customer's reservations, payment history and refunds, and whether the GCash QR can be used
  const { data, loading, error, reload } = useResource(async () => {
    const [reservations, payments, refunds, options] = await Promise.all([
      reservationApi.listReservations({ customerId: user.id }),
      paymentApi.listPayments({ customerId: user.id }),
      paymentApi.listRefunds({ customerId: user.id }),
      paymentApi.paymentOptions()
    ]);
    return { reservations, payments, refunds, options };
  }, [user.id]);
  // The GCash / e-wallet QR can be used (PayMongo is set up on the server)
  const qr = Boolean(data && data.options && data.options.qr);

  // Reservations that can be paid right now (approved or later, with money owed), soonest event first
  const payable = useMemo(
    () => (data ? data.reservations.filter((r) => ['approved', 'downpayment_paid', 'confirmed'].includes(r.status) && r.balance > 0).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [data]
  );

  const [ref, setRef] = useState(params.get('ref') || ''); // reservation being paid (can come from ?ref=)
  const [amountText, setAmountText] = useState(''); // whole pesos typed in the amount box (digits only)
  const [picked, setPicked] = useState(''); // the method card the customer chose ('' = the default below)
  const [referenceNo, setReferenceNo] = useState('');
  const [file, setFile] = useState(null); // uploaded proof of payment
  const [preview, setPreview] = useState(''); // temporary image URL for the thumbnail
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null); // receipt open in the document dialog
  const [qrPay, setQrPay] = useState(null); // the GCash QR on screen: { id, ref, amount, expiresAt, status, qrImage }
  const fileInput = useRef(null); // hidden <input type="file">, clicked by the upload box
  const touch = useMediaQuery('(pointer: coarse)'); // phones and tablets: tap to upload, no drag and drop

  // If no valid reservation is selected, pick the first payable one
  useEffect(() => {
    if (!payable.length) return;
    if (!payable.some((r) => r.ref === ref)) setRef(payable[0].ref);
  }, [payable, ref]);

  // Free the old preview image from memory when it changes or the page closes
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  // The method in use: the chosen card, or GCash when its QR can be used and a bank transfer otherwise
  const method = picked === 'gcash' && !qr ? 'bank' : picked || (qr ? 'gcash' : 'bank');
  const selected = payable.find((r) => r.ref === ref);
  // The minimum downpayment isn't reached yet: this payment has to reach it
  const firstPayment = Boolean(selected) && !selected.downpaymentPaid;
  // The least this payment can be: the rest of the minimum downpayment (never more than the balance), else ₱1
  const least = !selected ? 0 : firstPayment ? Math.min(selected.downpayment - selected.paid, selected.balance) : 1;
  // What the box starts with: the least while the downpayment is owed, the remaining balance after that
  const suggested = !selected ? 0 : firstPayment ? least : selected.balance;
  const selectedRef = selected ? selected.ref : '';
  // A GCash QR already open on this reservation (the server's summary names it) comes back with its image
  const openQrId = selected && selected.openQr ? selected.openQr.id : '';
  useEffect(() => {
    if (!openQrId) return undefined;
    let alive = true;
    paymentApi
      .getQrPayment(user.id, openQrId, { image: true })
      .then((found) => alive && setQrPay((current) => (current && current.id === found.id ? current : found)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [openQrId, user.id]);
  // The QR panel shows for the selected reservation only
  const shownQr = qrPay && selected && qrPay.ref === selected.ref ? qrPay : null;

  // The QR was paid, expired or failed: say so; a paid one clears and the figures reload with the new receipt
  const qrUpdated = useCallback(
    (fresh) => {
      if (fresh.status === 'paid') {
        notify(`Payment received. Receipt ${fresh.receiptNo} is in Receipts and invoices.`);
        setQrPay(null);
        reload();
      } else setQrPay((current) => (current && current.id === fresh.id ? { ...current, ...fresh } : current));
    },
    [notify, reload]
  );

  // Fill the box again whenever another reservation is chosen or its figures change (e.g. after a verified payment)
  useEffect(() => {
    setAmountText(suggested ? String(suggested) : '');
    setErrors((e) => ({ ...e, amount: '' }));
  }, [selectedRef, suggested]);
  // Amount to pay now, and what is wrong with it (shown under the box as it is typed)
  const amount = Number(amountText) || 0;
  const amountProblem = !selected
    ? ''
    : !amountText
      ? 'Enter how much you will pay.'
      : amount > selected.balance
        ? `The most you can pay is ${peso(selected.balance)}.`
        : amount < least
          ? firstPayment
            ? selected.paid > 0
              ? `Pay at least ${peso(least)} to complete your downpayment.`
              : `Pay at least ${peso(least)} as your downpayment.`
            : 'Enter at least ₱1.'
          : '';
  // Quick amounts under the box as [label, amount]: the minimum and the full amount (one button when they are the same), or the rest of the balance
  const quickAmounts = !selected
    ? []
    : firstPayment
      ? least < selected.balance
        ? [[`Minimum ${peso(least)}`, least], [`Full amount ${peso(selected.balance)}`, selected.balance]]
        : [[`Full amount ${peso(selected.balance)}`, selected.balance]]
      : [[`Remaining balance ${peso(selected.balance)}`, selected.balance]];
  // Put a quick amount (or what was typed, digits only) in the box
  const setAmount = (value) => {
    setAmountText(String(value).replace(/\D/g, '').slice(0, 9));
    setErrors((e) => ({ ...e, amount: '' }));
  };

  // Check the picked (or dropped) file is a photo and not too big, then keep it and show a preview of it
  const chooseFile = (event) => {
    const picked = event.target.files && event.target.files[0];
    event.target.value = ''; // reset so picking the same file again still triggers onChange
    if (!picked) return;
    if (!PROOF_ACCEPT.split(',').includes(picked.type)) {
      setErrors((e) => ({ ...e, proof: 'Please upload a photo or screenshot of your receipt (JPG, PNG or WebP).' }));
      return;
    }
    if (picked.size > MAX_FILE_MB * 1024 * 1024) {
      setErrors((e) => ({ ...e, proof: `The file is larger than ${MAX_FILE_MB} MB.` }));
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(picked);
    setPreview(picked.type.startsWith('image/') ? URL.createObjectURL(picked) : '');
    setErrors((e) => ({ ...e, proof: '' }));
  };

  // Remove the uploaded file
  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview('');
  };

  // Validate the amount, reference number and receipt photo, then send the bank transfer for the admin to verify
  const submit = async () => {
    const found = {};
    if (amountProblem) found.amount = amountProblem;
    if (!referenceNo.trim()) found.referenceNo = 'Enter the reference number from your receipt.';
    else if (referenceProblem(referenceNo.trim())) found.referenceNo = referenceProblem(referenceNo.trim());
    if (!file) found.proof = 'Upload a photo or screenshot of your bank receipt.';
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      // Whether it counts as downpayment, full or balance is worked out by the payment service from the amount.
      // `file` (the receipt photo) is uploaded with the payment; the server checks its real type.
      await paymentApi.submitPayment(user.id, {
        ref: selected.ref,
        method,
        amount,
        referenceNo,
        proofName: file.name,
        file
      });
      notify('Payment submitted. We will verify it within a day.');
      setReferenceNo('');
      clearFile();
    } catch (e) {
      if (e.meta && e.meta.field) setErrors((er) => ({ ...er, [e.meta.field]: e.message }));
      else setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Check the amount, then ask the server for a GCash QR of exactly that amount
  const generateQr = async () => {
    if (amountProblem) {
      setErrors((e) => ({ ...e, amount: amountProblem }));
      return;
    }
    setFormError('');
    setBusy(true);
    try {
      setQrPay(await paymentApi.startQrPayment(user.id, { ref: selected.ref, amount }));
    } catch (e) {
      if (e.meta && e.meta.field) setErrors((er) => ({ ...er, [e.meta.field]: e.message }));
      else setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Load the reservation and open the receipt for a verified payment
  const openReceipt = async (payment) => {
    try {
      const detail = await reservationApi.getReservation(payment.ref, { customerId: user.id });
      setReceipt({ detail, doc: { kind: 'receipt', name: `Receipt-${payment.receiptNo}.pdf`, paymentId: payment.id } });
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  // Copy an account number to the clipboard (spaces removed). navigator.clipboard only exists on
  // https:// pages and localhost; opened any other way (e.g. a phone testing the portal over the
  // Wi-Fi at http://192.168.x.x) the older copy command is used instead.
  const copy = async (text) => {
    const value = text.replace(/\s/g, '');
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else copyWithTextArea(value);
      notify('Copied to clipboard.', 'info');
    } catch (e) {
      notify('Could not copy. Please select the text instead.', 'warning');
    }
  };

  if (error) return <DashCard><ErrorState error={error} onRetry={reload} /></DashCard>;

  const payments = data ? data.payments : [];
  // Only verified payments have receipts
  const verified = payments.filter((p) => p.status === 'verified');
  // Payments and refunds in one history, newest first (a refund is placed by when it was recorded)
  const history = [
    ...payments.map((p) => ({ key: p.id, at: p.submittedAt, payment: p })),
    ...(data ? data.refunds : []).map((r) => ({ key: r.id, at: r.recordedAt, refund: r }))
  ].sort((a, b) => b.at - a.at);

  return (
    <>
      <PageHeader title="Payments" subtitle="Pay your downpayment or balance and keep every receipt." />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.5fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
        <DashCard>
          {loading ? (
            <ListSkeleton rows={6} height={52} />
          ) : !payable.length ? (
            <EmptyState
              icon={PaymentsOutlinedIcon}
              title="No payments due"
              description="Payments open once a reservation is approved. We will notify you when your downpayment is ready to pay."
              action={<Button variant="outlined" onClick={() => navigate('/portal/reservations')}>View my reservations</Button>}
            />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <SelectField
                id="pay-reservation"
                label="Reservation"
                value={ref}
                // Switching reservation refills the amount (see suggested) and updates ?ref= in the URL
                onChange={(e) => {
                  setRef(e.target.value);
                  setFormError('');
                  setParams({ ref: e.target.value }, { replace: true });
                }}
                options={payable.map((r) => ({ value: r.ref, label: `${r.eventName} · ${formatDate(r.date)}` }))}
              />

              {selected && (
                <>
                  <Box sx={{ p: 2, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle, border: `1px solid ${tokens.cardLightBorder}` }}>
                    <DetailRow label="Total">{peso(selected.total)}</DetailRow>
                    <DetailRow label={`Minimum downpayment${selected.downpaymentDue ? ` · due ${formatDate(selected.downpaymentDue)}` : ''}`}>{peso(selected.downpayment)}</DetailRow>
                    <DetailRow label="Paid so far">{peso(selected.paid)}</DetailRow>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label={`Balance · due on event day`}>{peso(selected.balance)}</DetailRow>
                  </Box>

                  {selected.balanceState === 'overdue' && <AlertBanner tone="error" title="Downpayment overdue">Please pay as soon as possible so we can keep your date reserved.</AlertBanner>}

                  {/* A payment is already waiting for verification, or a GCash QR is open: hide the form until it's done */}
                  {selected.awaitingCount > 0 ? (
                    <AlertBanner tone="locked" title="Payment being verified">
                      We received {peso(selected.awaitingAmount)} and the admin is verifying it, usually within a day. You can pay again once it is verified.
                    </AlertBanner>
                  ) : shownQr ? (
                    <QrPanel qr={shownQr} customerId={user.id} onUpdate={qrUpdated} onNew={() => setQrPay(null)} />
                  ) : (
                    <>
                      {/* How much to pay: one whole-peso box, with quick amounts underneath. Errors show under the box as the amount is typed. */}
                      <Box>
                        <FormField
                          id="pay-amount"
                          label="How much are you paying?"
                          value={amountText}
                          onChange={(e) => setAmount(e.target.value)}
                          error={errors.amount || amountProblem}
                          hint={
                            firstPayment
                              ? least < selected.balance
                                ? `At least ${peso(least)} secures your date. You can pay more, up to ${peso(selected.balance)}.`
                                : `Pay the full ${peso(selected.balance)} to secure your date.`
                              : `Any amount up to ${peso(selected.balance)}. You can pay the balance in parts.`
                          }
                          InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                          inputProps={{ inputMode: 'numeric', 'aria-label': 'Amount to pay in pesos' }}
                        />
                        <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {quickAmounts.map(([label, value]) => (
                            <Button key={label} size="small" variant={amount === value ? 'contained' : 'outlined'} aria-pressed={amount === value} onClick={() => setAmount(value)}>
                              {label}
                            </Button>
                          ))}
                        </Box>
                      </Box>

                      <Box>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>Payment Method</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                          {METHODS.map((m) => {
                            const on = method === m.value;
                            // GCash can't be picked until its QR can be used
                            const off = m.value === 'gcash' && !qr;
                            return (
                              <ButtonBase key={m.value} disabled={off} onClick={() => setPicked(m.value)} aria-pressed={on} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, p: 1.5, fontFamily: 'inherit', borderRadius: 1.5, border: `2px solid ${on ? tokens.ink : tokens.cardLightBorder}`, backgroundColor: on ? tokens.surfaceSubtle : tokens.cardLight, opacity: off ? 0.55 : 1 }}>
                                <m.icon sx={{ color: on ? tokens.ink : tokens.textMuted }} />
                                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: tokens.textPrimary, textAlign: 'center' }}>{m.label}</Typography>
                                <Typography sx={{ fontSize: 11, color: tokens.textMuted, textAlign: 'center' }}>{m.note}</Typography>
                              </ButtonBase>
                            );
                          })}
                        </Box>
                        {!qr && <Typography sx={{ mt: 1, fontSize: 12, color: tokens.textSecondary }}>QR Ph payment is not available right now. Please use bank transfer.</Typography>}
                      </Box>

                      {/* Cash: just an explanation. QR Ph: the QR (Phase 8B). Bank: account details, reference number and receipt photo. */}
                      {method === 'cash' ? (
                        <AlertBanner tone="info" title="Paying in cash">
                          Cash is paid to our event coordinator on the day, who records it and issues your official receipt on site. {firstPayment ? `To reserve your date, the downpayment still needs to be paid by ${qr ? 'QR Ph or bank transfer' : 'bank transfer'}.` : ''}
                        </AlertBanner>
                      ) : method === 'gcash' ? (
                        <>
                          <AlertBanner tone="info" title="Pay with GCash, Maya or your bank app">
                            We'll make a QR code for exactly {peso(amount)}. Scan it in your app and the payment is confirmed right away; no screenshot needed.
                          </AlertBanner>
                          {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
                          <BusyButton size="large" busy={busy} onClick={generateQr}>
                            Generate QR · {peso(amount)}
                          </BusyButton>
                        </>
                      ) : (
                        <>
                          <Box sx={{ p: 2, borderRadius: 1.5, border: `1px dashed ${tokens.borderInput}` }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>Send {peso(amount)} to</Typography>
                            {[['Bank', BUSINESS.bankName], ['Account name', BUSINESS.bankAccountName], ['Account number', BUSINESS.bankAccountNumber]].map(([label, value]) => (
                              <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, py: 0.25 }}>
                                <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{label}</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{value}</Typography>
                                  {/* Copy button only next to rows whose label contains "number" (40px on touch screens, for the thumb) */}
                                  {/number/i.test(label) && (
                                    <IconButton size="small" onClick={() => copy(value)} aria-label={`Copy ${label}`} sx={{ '@media (pointer: coarse)': { width: 40, height: 40 } }}>
                                      <ContentCopyRoundedIcon sx={{ fontSize: 15 }} />
                                    </IconButton>
                                  )}
                                </Box>
                              </Box>
                            ))}
                            <Typography sx={{ mt: 1, fontSize: 12, color: tokens.textMuted }}>Include {selected.ref} in the message or remarks.</Typography>
                            <Typography sx={{ mt: 0.5, fontSize: 12, color: tokens.textMuted }}>Paying from GCash or Maya without the QR? Use their Bank Transfer (InstaPay) to our account and upload that receipt.</Typography>
                          </Box>

                          <FormField id="pay-reference" label="Reference number" required value={referenceNo} onChange={(e) => { setReferenceNo(e.target.value); setErrors((er) => ({ ...er, referenceNo: '' })); }} error={errors.referenceNo} placeholder="e.g. BPI-20260914-0042" />

                          <Box>
                            <Typography component="label" htmlFor="pay-proof" sx={{ display: 'block', mb: 0.25, fontSize: 13, fontWeight: 600 }}>
                              Upload a photo or screenshot of your bank receipt <Box component="span" sx={{ color: tokens.red }}>*</Box>
                            </Typography>
                            <Typography sx={{ mb: 0.75, fontSize: 12, color: tokens.textMuted }}>The reference number must be readable.</Typography>
                            <input ref={fileInput} id="pay-proof" type="file" accept={PROOF_ACCEPT} hidden onChange={chooseFile} />
                            {file ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
                                {preview ? <Box component="img" src={preview} alt="Bank receipt preview" sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1 }} /> : <InsertDriveFileOutlinedIcon sx={{ fontSize: 40, color: tokens.textMuted }} />}
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>{file.name}</Typography>
                                  <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{(file.size / 1024).toFixed(0)} KB</Typography>
                                </Box>
                                <IconButton onClick={clearFile} aria-label="Remove file">
                                  <CloseRoundedIcon />
                                </IconButton>
                              </Box>
                            ) : (
                              // Upload box: click (tap on phones) to open the file picker, or drag and drop a file onto it
                              <ButtonBase
                                onClick={() => fileInput.current && fileInput.current.click()}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  chooseFile({ target: { files: e.dataTransfer.files, value: '' } });
                                }}
                                sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 0.75, py: 3, px: 2, fontFamily: 'inherit', borderRadius: 1.5, border: `2px dashed ${errors.proof ? tokens.red : tokens.borderInput}`, backgroundColor: tokens.surfaceSubtle, '&:hover': { borderColor: tokens.ink } }}
                              >
                                <CloudUploadOutlinedIcon sx={{ fontSize: 30, color: tokens.textMuted }} />
                                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary }}>{touch ? 'Tap to choose a photo or screenshot of the receipt' : 'Drop a photo or screenshot of the receipt here, or browse'}</Typography>
                                <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>JPG, PNG or WebP photo · up to {MAX_FILE_MB} MB</Typography>
                              </ButtonBase>
                            )}
                            {errors.proof && <Typography sx={{ mt: 0.75, fontSize: 12, color: tokens.redPress }}>{errors.proof}</Typography>}
                          </Box>

                          {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
                          <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>Our team marks the payment received once verified, usually within a day.</Typography>
                          <BusyButton size="large" busy={busy} onClick={submit}>
                            Submit proof of payment
                          </BusyButton>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </Box>
          )}
        </DashCard>

        {/* minWidth 0 lets this column shrink to the phone's width; without it the long one-line
            receipt names below stretch the whole page wider than the screen */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
          <DashCard>
            <CardTitle>Payment History</CardTitle>
            {loading ? (
              <ListSkeleton rows={3} />
            ) : history.length === 0 ? (
              <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>No payments yet.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {/* A refund reads "Refund −₱X" with how and when it was sent, and what was kept (and why) when it was less than
                    owed; a refund of ₱0 reads "No refund", with the reason everything paid was kept */}
                {history.map(({ key, payment: p, refund: r }) => (
                  <Box key={key} sx={{ py: 1.25, borderBottom: `1px solid ${tokens.cardLightBorder}`, '&:last-child': { borderBottom: 0 } }}>
                    {r ? (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
                          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                            {r.amount > 0 ? `Refund −${peso(r.amount)} · ${r.methodLabel}` : 'No refund'}
                          </Typography>
                          <Pill label={r.amount > 0 ? 'Refunded' : 'Kept'} bg="rgba(59, 130, 246, 0.12)" fg="#1d4ed8" size="sm" />
                        </Box>
                        <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                          {r.eventName} · {r.amount > 0 ? 'sent' : 'recorded'} {formatDate(r.sentOn)}
                          {r.referenceNo ? ` · Ref ${r.referenceNo}` : ''}
                        </Typography>
                        {r.reason && <Typography sx={{ mt: 0.5, fontSize: 12.5, color: tokens.textSecondary }}>We kept {peso(r.due - r.amount)}: {r.reason}</Typography>}
                      </>
                    ) : (
                      <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
                          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                            {peso(p.amount)} · {p.methodLabel}
                          </Typography>
                          <PaymentStatusChip status={p.status} size="sm" />
                        </Box>
                        <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                          {p.eventName} · {formatDateTime(p.submittedAt)}
                        </Typography>
                        {p.status === 'rejected' && <Typography sx={{ mt: 0.5, fontSize: 12.5, color: tokens.redPress }}>{p.rejectReason}</Typography>}
                      </>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </DashCard>

          <DashCard>
            <CardTitle subtitle="A receipt is generated automatically for every verified payment.">Receipts and Invoices</CardTitle>
            {verified.length === 0 ? (
              <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>Receipts appear here once a payment is verified.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {verified.map((p) => (
                  <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
                    <ReceiptLongOutlinedIcon sx={{ color: tokens.goldDark }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>Receipt-{p.receiptNo}.pdf</Typography>
                      <Typography noWrap sx={{ fontSize: 11.5, color: tokens.textMuted }}>
                        {peso(p.amount)} · {p.eventName}
                      </Typography>
                    </Box>
                    <Button size="small" onClick={() => openReceipt(p)}>
                      Open
                    </Button>
                  </Box>
                ))}
              </Box>
            )}
          </DashCard>
        </Box>
      </Box>

      {receipt && <DocumentDialog open onClose={() => setReceipt(null)} detail={receipt.detail} doc={receipt.doc} />}
    </>
  );
}

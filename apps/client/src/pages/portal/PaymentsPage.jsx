import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
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
  SelectField,
  formatDate,
  formatDateTime,
  paymentApi,
  peso,
  reservationApi,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';

// Largest proof-of-payment file allowed
const MAX_FILE_MB = 5;
// Payment method buttons
const METHODS = [
  { value: 'gcash', label: 'GCash / e-wallet', icon: PhoneIphoneOutlinedIcon },
  { value: 'bank', label: 'Bank transfer', icon: AccountBalanceOutlinedIcon },
  { value: 'cash', label: 'Cash on site', icon: StorefrontOutlinedIcon }
];

/** 1k · Payments: downpayment, balance, proof upload, history and receipts. */
export default function PaymentsPage() {
  useDocumentTitle('Payments');
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  // Load the customer's reservations and payment history
  const { data, loading, error, reload } = useResource(async () => {
    const [reservations, payments] = await Promise.all([reservationApi.listReservations({ customerId: user.id }), paymentApi.listPayments({ customerId: user.id })]);
    return { reservations, payments };
  }, [user.id]);

  // Reservations that can be paid right now (approved or later, with money owed), soonest event first
  const payable = useMemo(
    () => (data ? data.reservations.filter((r) => ['approved', 'downpayment_paid', 'confirmed'].includes(r.status) && r.balance > 0).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [data]
  );

  const [ref, setRef] = useState(params.get('ref') || ''); // reservation being paid (can come from ?ref=)
  const [plan, setPlan] = useState('half'); // 'half' = 50% downpayment, 'full' = everything
  const [method, setMethod] = useState('gcash');
  const [referenceNo, setReferenceNo] = useState('');
  const [file, setFile] = useState(null); // uploaded proof of payment
  const [preview, setPreview] = useState(''); // temporary image URL for the thumbnail
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null); // receipt open in the document dialog
  const fileInput = useRef(null); // hidden <input type="file">, clicked by the upload box

  // If no valid reservation is selected, pick the first payable one
  useEffect(() => {
    if (!payable.length) return;
    if (!payable.some((r) => r.ref === ref)) setRef(payable[0].ref);
  }, [payable, ref]);

  // Free the old preview image from memory when it changes or the page closes
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const selected = payable.find((r) => r.ref === ref);
  // No downpayment yet: customer can choose 50% or full
  const firstPayment = selected && !selected.downpaymentPaid;
  // Amount to pay now: the rest of the downpayment, or the whole balance
  const amount = !selected ? 0 : firstPayment && plan === 'half' ? selected.downpayment - selected.paid : selected.balance;

  // Check the picked file's type and size, then keep it and make a preview if it's an image
  const chooseFile = (event) => {
    const picked = event.target.files && event.target.files[0];
    event.target.value = ''; // reset so picking the same file again still triggers onChange
    if (!picked) return;
    if (!/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(picked.type)) {
      setErrors((e) => ({ ...e, proof: 'Upload a JPG, PNG, WebP or PDF file.' }));
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

  // Validate the reference number and proof, then submit the payment for the admin to verify
  const submit = async () => {
    const found = {};
    if (!referenceNo.trim()) found.referenceNo = 'Enter the reference number from your receipt.';
    else if (!/^[A-Za-z0-9 -]{6,30}$/.test(referenceNo.trim())) found.referenceNo = 'Use 6–30 letters, numbers or spaces.';
    if (!file) found.proof = 'Upload a screenshot or receipt of your payment.';
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await paymentApi.submitPayment(user.id, {
        ref: selected.ref,
        // downpayment / full / balance, depending on the situation and the plan chosen
        kind: firstPayment ? (plan === 'half' ? 'downpayment' : 'full') : 'balance',
        method,
        amount,
        referenceNo,
        proofName: file.name
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

  // Load the reservation and open the receipt for a verified payment
  const openReceipt = async (payment) => {
    try {
      const detail = await reservationApi.getReservation(payment.ref, { customerId: user.id });
      setReceipt({ detail, doc: { kind: 'receipt', name: `Receipt-${payment.receiptNo}.pdf`, paymentId: payment.id } });
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  // Copy an account number to the clipboard (spaces removed)
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text.replace(/\s/g, ''));
      notify('Copied to clipboard.', 'info');
    } catch (e) {
      notify('Could not copy. Please select the text instead.', 'warning');
    }
  };

  if (error) return <DashCard><ErrorState error={error} onRetry={reload} /></DashCard>;

  const payments = data ? data.payments : [];
  // Only verified payments have receipts
  const verified = payments.filter((p) => p.status === 'verified');

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
                // Switching reservation resets the plan and updates ?ref= in the URL
                onChange={(e) => {
                  setRef(e.target.value);
                  setPlan('half');
                  setFormError('');
                  setParams({ ref: e.target.value }, { replace: true });
                }}
                options={payable.map((r) => ({ value: r.ref, label: `${r.eventName} · ${formatDate(r.date)}` }))}
              />

              {selected && (
                <>
                  <Box sx={{ p: 2, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle, border: `1px solid ${tokens.cardLightBorder}` }}>
                    <DetailRow label="Total">{peso(selected.total)}</DetailRow>
                    <DetailRow label={`Downpayment · 50%${selected.downpaymentDue ? ` · due ${formatDate(selected.downpaymentDue)}` : ''}`}>{peso(selected.downpayment)}</DetailRow>
                    <DetailRow label="Paid so far">{peso(selected.paid)}</DetailRow>
                    <Divider sx={{ my: 0.5 }} />
                    <DetailRow label={`Balance · due on event day`}>{peso(selected.balance)}</DetailRow>
                  </Box>

                  {selected.balanceState === 'overdue' && <AlertBanner tone="error" title="Downpayment overdue">Please pay as soon as possible so we can keep your date reserved.</AlertBanner>}

                  {/* A payment is already waiting for verification: hide the form until it's checked */}
                  {selected.awaitingCount > 0 ? (
                    <AlertBanner tone="locked" title="Payment being verified">
                      We received {peso(selected.awaitingAmount)} and the admin is verifying it, usually within a day. You can pay again once it is verified.
                    </AlertBanner>
                  ) : (
                    <>
                      <Box>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>Choose how to pay</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: firstPayment ? '1fr 1fr' : '1fr', gap: 1.25 }}>
                          {/* First payment: 50% or full. Later: only "Pay remaining balance". */}
                          {(firstPayment
                            ? [
                                ['half', 'Pay 50% now', `${peso(selected.downpayment - selected.paid)} · balance on event day`],
                                ['full', 'Pay in full', `${peso(selected.balance)} · one transaction`]
                              ]
                            : [['full', 'Pay remaining balance', `${peso(selected.balance)}`]]
                          ).map(([value, title, sub]) => {
                            const on = firstPayment ? plan === value : true;
                            return (
                              <ButtonBase key={value} onClick={() => setPlan(value)} aria-pressed={on} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, p: 1.75, textAlign: 'left', fontFamily: 'inherit', borderRadius: 1.5, border: `2px solid ${on ? tokens.headerBg : tokens.cardLightBorder}` }}>
                                {on ? <CheckCircleRoundedIcon sx={{ color: tokens.headerBg }} /> : <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput }} />}
                                <Box>
                                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>{title}</Typography>
                                  <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{sub}</Typography>
                                </Box>
                              </ButtonBase>
                            );
                          })}
                        </Box>
                      </Box>

                      <Box>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>Payment method</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                          {METHODS.map((m) => {
                            const on = method === m.value;
                            return (
                              <ButtonBase key={m.value} onClick={() => setMethod(m.value)} aria-pressed={on} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 1.5, fontFamily: 'inherit', borderRadius: 1.5, border: `2px solid ${on ? tokens.headerBg : tokens.cardLightBorder}`, backgroundColor: on ? tokens.surfaceSubtle : '#fff' }}>
                                <m.icon sx={{ color: on ? tokens.headerBg : tokens.textMuted }} />
                                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: tokens.textPrimary, textAlign: 'center' }}>{m.label}</Typography>
                              </ButtonBase>
                            );
                          })}
                        </Box>
                      </Box>

                      {/* Cash: just an explanation. GCash/bank: account details, reference number and proof upload. */}
                      {method === 'cash' ? (
                        <AlertBanner tone="info" title="Paying in cash">
                          Cash is paid to our event coordinator on the day, who records it and issues your official receipt on site. {firstPayment ? 'To reserve your date, the downpayment still needs to be paid by GCash or bank transfer.' : ''}
                        </AlertBanner>
                      ) : (
                        <>
                          <Box sx={{ p: 2, borderRadius: 1.5, border: `1px dashed ${tokens.borderInput}` }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>Send {peso(amount)} to</Typography>
                            {(method === 'gcash'
                              ? [['GCash name', BUSINESS.gcashName], ['GCash number', BUSINESS.gcashNumber]]
                              : [['Bank', BUSINESS.bankName], ['Account name', BUSINESS.bankAccountName], ['Account number', BUSINESS.bankAccountNumber]]
                            ).map(([label, value]) => (
                              <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, py: 0.25 }}>
                                <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{label}</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{value}</Typography>
                                  {/* Copy button only next to rows whose label contains "number" */}
                                  {/number/i.test(label) && (
                                    <IconButton size="small" onClick={() => copy(value)} aria-label={`Copy ${label}`}>
                                      <ContentCopyRoundedIcon sx={{ fontSize: 15 }} />
                                    </IconButton>
                                  )}
                                </Box>
                              </Box>
                            ))}
                            <Typography sx={{ mt: 1, fontSize: 12, color: tokens.textMuted }}>Include {selected.ref} in the message or remarks.</Typography>
                          </Box>

                          <FormField id="pay-reference" label="Reference number" required value={referenceNo} onChange={(e) => { setReferenceNo(e.target.value); setErrors((er) => ({ ...er, referenceNo: '' })); }} error={errors.referenceNo} placeholder={method === 'gcash' ? 'e.g. 5021 884 3317' : 'e.g. BPI-20260914-0042'} />

                          <Box>
                            <Typography component="label" htmlFor="pay-proof" sx={{ display: 'block', mb: 0.75, fontSize: 13, fontWeight: 600 }}>
                              Upload proof of payment <Box component="span" sx={{ color: tokens.red }}>*</Box>
                            </Typography>
                            <input ref={fileInput} id="pay-proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={chooseFile} />
                            {file ? (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
                                {preview ? <Box component="img" src={preview} alt="Proof of payment preview" sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1 }} /> : <InsertDriveFileOutlinedIcon sx={{ fontSize: 40, color: tokens.textMuted }} />}
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>{file.name}</Typography>
                                  <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{(file.size / 1024).toFixed(0)} KB</Typography>
                                </Box>
                                <IconButton onClick={clearFile} aria-label="Remove file">
                                  <CloseRoundedIcon />
                                </IconButton>
                              </Box>
                            ) : (
                              // Upload box: click to open the file picker, or drag and drop a file onto it
                              <ButtonBase
                                onClick={() => fileInput.current && fileInput.current.click()}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  chooseFile({ target: { files: e.dataTransfer.files, value: '' } });
                                }}
                                sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 0.75, py: 3, px: 2, fontFamily: 'inherit', borderRadius: 1.5, border: `2px dashed ${errors.proof ? tokens.red : tokens.borderInput}`, backgroundColor: tokens.surfaceSubtle, '&:hover': { borderColor: tokens.headerBg } }}
                              >
                                <CloudUploadOutlinedIcon sx={{ fontSize: 30, color: tokens.textMuted }} />
                                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary }}>Drop a screenshot or receipt here, or browse</Typography>
                                <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>JPG, PNG, WebP or PDF · up to {MAX_FILE_MB} MB</Typography>
                              </ButtonBase>
                            )}
                            {errors.proof && <Typography sx={{ mt: 0.75, fontSize: 12, color: tokens.redPress }}>{errors.proof}</Typography>}
                          </Box>

                          {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
                          <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>Our team marks the payment received once verified, usually within a day.</Typography>
                          <BusyButton size="large" busy={busy} onClick={submit}>
                            Submit payment · {peso(amount)}
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

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <DashCard>
            <CardTitle>Payment history</CardTitle>
            {loading ? (
              <ListSkeleton rows={3} />
            ) : payments.length === 0 ? (
              <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>No payments yet.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {payments.map((p) => (
                  <Box key={p.id} sx={{ py: 1.25, borderBottom: `1px solid ${tokens.cardLightBorder}`, '&:last-child': { borderBottom: 0 } }}>
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
                  </Box>
                ))}
              </Box>
            )}
          </DashCard>

          <DashCard>
            <CardTitle subtitle="A receipt is generated automatically for every verified payment.">Receipts and invoices</CardTitle>
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

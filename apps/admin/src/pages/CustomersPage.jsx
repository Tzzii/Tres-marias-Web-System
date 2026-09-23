import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {
  BusyButton,
  DashCard,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FilterTabs,
  FormField,
  LightSurface,
  ListSkeleton,
  PageHeader,
  Pager,
  SearchField,
  StatusChip,
  customerApi,
  formatDate,
  formatDateLong,
  formatMobile,
  initials,
  messageApi,
  peso,
  toISODate,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource,
  validateEmail,
  validateMobile
} from '@tm/shared';
import { useMessenger } from '../components/MessagesWidget.jsx';

const PAGE_SIZE = 10;
// Filter tabs as [key, label, test function that decides if a customer belongs in the tab]
const FILTERS = [
  ['all', 'All', () => true],
  ['upcoming', 'With upcoming events', (c) => c.upcomingCount > 0],
  ['balance', 'With balance', (c) => c.balance > 0],
  ['repeat', 'Repeat customers', (c) => c.completedCount >= 2]
];

/** 1x · Customer list and drawer. A read-mostly directory. */
export default function CustomersPage() {
  useDocumentTitle('Customers', 'Tres Marias Admin');
  const navigate = useNavigate();
  const notify = useNotify();
  const { openMessages } = useMessenger();
  const [params, setParams] = useSearchParams();
  // Load all customers with their booking totals
  const { data, loading, error, reload } = useResource(() => customerApi.listCustomers(), []);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  // Customer shown in the side drawer (?open=ID in the URL)
  const openId = params.get('open');

  // Back to page 1 when the filter or search changes
  useEffect(() => setPage(1), [filter, query]);

  const rows = data || [];
  // Number of customers in each filter tab
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k, , t]) => [k, rows.filter(t).length])), [rows]);
  // Apply the filter tab and search. Spaces are removed so "0917 123" matches "0917123".
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s/g, '');
    const test = FILTERS.find(([k]) => k === filter)[2];
    return rows.filter(test).filter((c) => !q || [c.name, c.email, c.mobile, c.company].some((v) => String(v).toLowerCase().replace(/\s/g, '').includes(q)));
  }, [rows, filter, query]);

  // Keep the page in range when customers leave the list (e.g. a balance was paid off under "With balance")
  const current = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));

  // Open the chat window with the customer (their one conversation, created if they have none)
  const message = async (customerId) => {
    try {
      const { id } = await messageApi.openThread({ customerId });
      openMessages(id);
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  const columns = [
    { key: 'name', label: 'Customer', render: (c) => (<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}><Avatar sx={{ width: 34, height: 34, fontSize: 12.5, fontWeight: 700, bgcolor: 'rgba(197,160,89,0.18)', color: tokens.goldDark }}>{initials(c.name)}</Avatar><Box><Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{c.name}</Typography>{c.company && <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{c.company}</Typography>}</Box></Box>) },
    // card: 'wide' — on phone cards the email gets a whole line instead of breaking mid-word
    { key: 'contact', label: 'Contact', card: 'wide', render: (c) => (<Box><Typography sx={{ fontSize: 13 }}>{c.email}</Typography><Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{formatMobile(c.mobile)}</Typography></Box>) },
    { key: 'res', label: 'Reservations', align: 'right', render: (c) => c.reservationCount },
    { key: 'up', label: 'Upcoming', align: 'right', render: (c) => c.upcomingCount },
    { key: 'bal', label: 'Balance', align: 'right', render: (c) => (c.balance ? <b>{peso(c.balance)}</b> : peso(0)) },
    { key: 'act', label: 'Action', align: 'right', render: (c) => (<Box sx={{ whiteSpace: 'nowrap' }}><Button size="small" onClick={() => setParams({ open: c.id })}>Open</Button><Button size="small" onClick={() => message(c.id)}>Message</Button></Box>) }
  ];

  return (
    <>
      <PageHeader title="Customers" subtitle={loading ? 'Loading…' : `${rows.length} registered`} />
      <DashCard>
        {error ? (
          <ErrorState error={error} onRetry={reload} />
        ) : (
          <>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 1.5, justifyContent: 'space-between', mb: 2 }}>
              <FilterTabs value={filter} onChange={setFilter} options={FILTERS.map(([value, label]) => ({ value, label, count: loading ? undefined : counts[value] }))} />
              <SearchField id="customer-search" value={query} onChange={setQuery} placeholder="Search name, email or mobile" />
            </Box>
            <DataTable loading={loading} columns={columns} rows={filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)} rowKey={(c) => c.id} onRowClick={(c) => setParams({ open: c.id })} minWidth={820} empty={<EmptyState compact title="No customers match" description="Try another filter or search." />} />
            {!loading && filtered.length > 0 && <Pager page={current} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />}
          </>
        )}
      </DashCard>

      <CustomerDrawer customerId={openId} onClose={() => setParams({})} onMessage={message} onOpenReservation={(ref) => navigate(`/reservations/${ref}`)} />
    </>
  );
}

/**
 * Side panel (bottom sheet on phones) with one customer's details, contact info
 * that the admin can correct, and their reservation history.
 */
function CustomerDrawer({ customerId, onClose, onMessage, onOpenReservation }) {
  const notify = useNotify();
  const isPhone = useMediaQuery('(max-width:599px)');
  // Load the selected customer's full profile; reloads when a different customer is opened
  const { data, loading, error } = useResource(() => (customerId ? customerApi.getCustomer(customerId) : Promise.resolve(null)), [customerId]);
  const [editing, setEditing] = useState(false); // true while the contact form is open
  const [values, setValues] = useState({ email: '', mobile: '' }); // contact form values
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // Opening a different customer closes any edit in progress
  useEffect(() => {
    setEditing(false);
    setErrors({});
  }, [customerId]);

  // Fill the contact form with the loaded customer's details
  useEffect(() => {
    if (data) setValues({ email: data.email, mobile: formatMobile(data.mobile) });
  }, [data]);

  // Validate and save corrected email/mobile
  const save = async () => {
    const found = {};
    const e1 = validateEmail(values.email);
    const e2 = validateMobile(values.mobile);
    if (e1) found.email = e1;
    if (e2) found.mobile = e2;
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await customerApi.updateCustomerContact(customerId, values);
      notify('Contact details corrected.');
      setEditing(false);
    } catch (err) {
      // Show the server error under the field it refers to (defaults to email)
      setErrors({ [(err.meta && err.meta.field) || 'email']: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <LightSurface>
      <Drawer anchor={isPhone ? 'bottom' : 'right'} open={Boolean(customerId)} onClose={onClose} PaperProps={{ sx: { width: isPhone ? '100%' : 440, maxHeight: isPhone ? '90vh' : '100%', borderTopLeftRadius: isPhone ? 16 : 0, borderTopRightRadius: isPhone ? 16 : 0 } }}>
        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${tokens.cardLightBorder}` }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Customer</Typography>
          <IconButton onClick={onClose} aria-label="Close"><CloseRoundedIcon /></IconButton>
        </Box>
        <Box sx={{ p: 2.5, overflowY: 'auto' }} className="tm-scroll">
          {error ? (
            <EmptyState compact title="Customer not found" description={error.message} />
          ) : loading || !data ? (
            <ListSkeleton rows={5} height={48} />
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
                <Avatar sx={{ width: 56, height: 56, fontSize: 19, fontWeight: 700, bgcolor: tokens.gold, color: tokens.onGold }}>{initials(data.name)}</Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{data.name}</Typography>
                  {data.company && <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{data.company}</Typography>}
                  <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>Customer since {formatDateLong(toISODate(new Date(data.createdAt)))}</Typography>
                </Box>
              </Box>

              <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
                <Field label="Total spend">{peso(data.totalSpend)}</Field>
                <Field label="Balance">{peso(data.balance)}</Field>
                <Field label="Events">{data.completedCount} done</Field>
              </Box>

              <Box sx={{ mt: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Contact details</Typography>
                  {!editing && <Button size="small" onClick={() => setEditing(true)}>Correct</Button>}
                </Box>
                {editing ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <FormField id="c-email" label="Email" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} error={errors.email} />
                    <FormField id="c-mobile" label="Mobile" value={values.mobile} onChange={(e) => setValues((v) => ({ ...v, mobile: e.target.value }))} error={errors.mobile} />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <BusyButton size="small" busy={busy} onClick={save}>Save</BusyButton>
                      <Button size="small" onClick={() => { setEditing(false); setValues({ email: data.email, mobile: formatMobile(data.mobile) }); setErrors({}); }}>Cancel</Button>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <Field label="Email">{data.email}</Field>
                    <Field label="Mobile">{formatMobile(data.mobile)}</Field>
                  </Box>
                )}
              </Box>

              <Button fullWidth variant="contained" startIcon={<ChatBubbleOutlineRoundedIcon />} onClick={() => onMessage(data.id)} sx={{ mt: 2.5 }}>
                Open chat thread
              </Button>

              <Divider sx={{ my: 2.5 }} />
              <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>Reservations · {data.reservations.length}</Typography>
              {data.reservations.length === 0 ? (
                <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>No reservations yet.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {data.reservations.map((r) => (
                    <ButtonBase key={r.ref} onClick={() => onOpenReservation(r.ref)} sx={{ display: 'block', p: 1.25, textAlign: 'left', fontFamily: 'inherit', borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, '&:hover': { borderColor: '#94a3b8' } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
                        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700 }}>{r.eventName}</Typography>
                        <StatusChip status={r.status} size="sm" />
                      </Box>
                      <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>
                        {r.ref} · {formatDate(r.date)} · {r.packageName} · {peso(r.total)}
                      </Typography>
                    </ButtonBase>
                  ))}
                </Box>
              )}
            </>
          )}
        </Box>
      </Drawer>
    </LightSurface>
  );
}

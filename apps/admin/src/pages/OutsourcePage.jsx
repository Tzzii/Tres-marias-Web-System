import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  ConfirmDialog,
  DashCard,
  DataTable,
  DateField,
  EmptyState,
  ErrorState,
  Field,
  FormField,
  OUTSOURCE_SERVICES,
  PageHeader,
  Pager,
  Pill,
  SearchField,
  SelectField,
  StatCard,
  formatDate,
  formatDateTime,
  formatMobile,
  inventoryApi,
  outsourceApi,
  peso,
  todayISO,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useColumnChoice } from '../lib/columns.js';
import { SectionTabs } from '../components/SectionTabs.jsx';
import { downloadTxt, textTable } from '../lib/txt.js';

const PAGE_SIZE = 10;
const NO_EVENT = outsourceApi.NO_EVENT;

// Name and chip colours for each contract status
const STATUS = {
  draft: { label: 'Draft', bg: 'rgba(100, 116, 139, 0.14)', fg: '#334155' },
  sent: { label: 'Awaiting reply', bg: 'rgba(245, 158, 11, 0.14)', fg: '#b45309' },
  accepted: { label: 'Accepted', bg: 'rgba(16, 185, 129, 0.12)', fg: '#047857' },
  completed: { label: 'Completed', bg: 'rgba(59, 130, 246, 0.12)', fg: '#1d4ed8' },
  declined: { label: 'Declined', bg: 'rgba(239, 68, 68, 0.1)', fg: '#b91c1c' },
  cancelled: { label: 'Cancelled', bg: 'rgba(239, 68, 68, 0.1)', fg: '#b91c1c' }
};

// Status filter options as [key, label, test]
const STATUS_FILTERS = [
  ['all', 'All', () => true],
  ['draft', 'Draft', (c) => c.status === 'draft'],
  ['sent', 'Awaiting reply', (c) => c.status === 'sent'],
  ['accepted', 'Accepted', (c) => c.status === 'accepted'],
  ['completed', 'Completed', (c) => c.status === 'completed'],
  ['declined', 'Declined', (c) => c.status === 'declined'],
  ['cancelled', 'Cancelled', (c) => c.status === 'cancelled']
];

// Event-date filter options as [key, label, test]; contracts with no event only show under "All"
const DATE_FILTERS = [
  ['all', 'Event date: All', () => true],
  ['upcoming', 'Upcoming events', (c) => c.eventDate && c.eventDate >= todayISO()],
  ['today', 'Events today', (c) => c.eventDate === todayISO()],
  ['past', 'Past events', (c) => c.eventDate && c.eventDate < todayISO()],
  ['none', 'No event linked', (c) => !c.eventDate]
];

// Columns the admin can show or hide with "Filter columns", as [key, label]
const OPTIONAL_COLUMNS = [
  ['event', 'Assigned event'],
  ['eventDate', 'Event date'],
  ['needBy', 'Date needed'],
  ['amount', 'Amount'],
  ['sentTo', 'Sent to']
];
const COLUMNS_KEY = 'tm.admin.outsource.columns'; // this browser remembers the admin's column choice

// Tabs of this page as [key, label]
const TABS = [
  ['contracts', 'Contracts'],
  ['partners', 'Partners']
];

/** "email and SMS", "SMS only", or a warning when a partner can't be reached at all. */
const channelText = (channels) => {
  if (channels.length === 2) return 'Email and SMS';
  if (channels[0] === 'email') return 'Email only';
  if (channels[0] === 'sms') return 'SMS only';
  return 'No contact details';
};

/** Small email / SMS chips showing how a partner is reached. */
function ChannelChips({ channels, size = 'sm' }) {
  if (!channels.length) return <Pill size={size} label="No contact" bg="rgba(239, 68, 68, 0.1)" fg="#b91c1c" />;
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {channels.includes('email') && <Pill size={size} label="Email" bg="rgba(59, 130, 246, 0.12)" fg="#1d4ed8" dot={false} />}
      {channels.includes('sms') && <Pill size={size} label="SMS" bg="rgba(16, 185, 129, 0.12)" fg="#047857" dot={false} />}
    </Box>
  );
}

/**
 * Outsourcing: the partners Tres Marias rents from when its own stock runs short, and the contracts sent to them.
 * Top: four summary cards (click one to filter). Contracts tab: search, Service, Event date and Status filters,
 * "Filter columns", then a paged table with checkboxes (bulk download) and a ⋮ menu per contract
 * (open, send, record the reply, cancel). Partners tab: the same table shape for the partner list.
 *
 * A contract is written once and sent to every channel its partner has — an email when they have an email
 * address, an SMS when they have a mobile number, both when they have both — with the same text in each.
 * Contracts for a reservation also appear in that reservation's audit trail.
 */
export default function OutsourcePage() {
  useDocumentTitle('Outsourcing', 'Tres Marias Admin');
  const notify = useNotify();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.some(([key]) => key === requested) ? requested : 'contracts';

  // Load the contracts, the partners (archived included, for the Archived filter), the reservations a
  // contract can be assigned to, and the inventory (so item rows can show what is available)
  const { data, loading, error, reload } = useResource(async () => {
    const [contracts, partners, events, inventory] = await Promise.all([
      outsourceApi.listContracts(),
      outsourceApi.listPartners({ includeArchived: true }),
      outsourceApi.listOutsourceEvents(),
      inventoryApi.listInventory()
    ]);
    return { contracts, partners, events, inventory };
  }, []);

  const [query, setQuery] = useState('');
  const [service, setService] = useState('all');
  const [when, setWhen] = useState('all');
  const [status, setStatus] = useState('all');
  const [showArchived, setShowArchived] = useState(false); // Partners tab: the archived list instead of the active one
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]); // contract IDs ticked for the bulk download
  const [columns, setColumns] = useColumnChoice(COLUMNS_KEY, OPTIONAL_COLUMNS); // { event: true, amount: true, ... }
  const [columnsAnchor, setColumnsAnchor] = useState(null); // "Filter columns" menu
  const [rowMenu, setRowMenu] = useState(null); // { anchor, contract } for the ⋮ menu
  const [partnerMenu, setPartnerMenu] = useState(null); // { anchor, partner } for the ⋮ menu on the Partners tab
  const [editing, setEditing] = useState(null); // { id } or { prefill } for the contract dialog
  const [partnerForm, setPartnerForm] = useState(null); // { id } or {} for the partner dialog
  const [sendingId, setSendingId] = useState(null); // contract in the send dialog
  const [detailsId, setDetailsId] = useState(null); // contract in the details dialog
  const [answer, setAnswer] = useState(null); // { id, status } waiting for confirmation
  const [archive, setArchive] = useState(null); // { ids, archived } waiting for confirmation

  const contracts = data ? data.contracts : [];
  const partners = data ? data.partners : [];
  const activePartners = partners.filter((p) => !p.archived);
  // Look up by ID from the latest data, so open dialogs show fresh details after a change
  const contractById = (id) => contracts.find((c) => c.id === id) || null;

  // Back to page 1 and nothing ticked whenever the filters or the tab change
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [query, service, when, status, showArchived, tab]);

  // Opened from the inventory's "Request from a partner" (/outsource?item=Monobloc+chair&qty=40):
  // start a contract with that item already filled in, then clear it from the URL
  useEffect(() => {
    const item = params.get('item');
    if (!item || !data) return;
    const qty = Number(params.get('qty'));
    setEditing({ prefill: { items: [{ name: item, qty: qty > 0 ? String(qty) : '' }] } });
    setParams({ tab: 'contracts' }, { replace: true });
  }, [params, setParams, data]);

  // Summary figures across every contract, with the partner count from the active partners
  const totals = useMemo(
    () => ({
      partners: activePartners.length,
      unreachable: activePartners.filter((p) => !p.channels.length).length,
      accepted: contracts.filter((c) => c.status === 'accepted').length,
      completed: contracts.filter((c) => c.status === 'completed').length,
      sent: contracts.filter((c) => c.status === 'sent').length,
      draft: contracts.filter((c) => c.status === 'draft').length,
      declined: contracts.filter((c) => c.status === 'declined').length,
      cancelled: contracts.filter((c) => c.status === 'cancelled').length
    }),
    [contracts, partners] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Apply the status, service, event-date and search filters to the contracts
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s/g, '');
    const byStatus = STATUS_FILTERS.find(([key]) => key === status)[2];
    const byDate = DATE_FILTERS.find(([key]) => key === when)[2];
    return contracts
      .filter(byStatus)
      .filter(byDate)
      .filter((c) => service === 'all' || c.service === service)
      .filter((c) => !q || [c.partnerName, c.ref, c.eventName, c.itemsSummary].some((v) => String(v).toLowerCase().replace(/\s/g, '').includes(q)));
  }, [contracts, query, service, when, status]);

  // The Partners tab shares the search box and the Service filter, and has its own Active / Archived switch
  const filteredPartners = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s/g, '');
    return partners
      .filter((p) => Boolean(p.archived) === showArchived)
      .filter((p) => service === 'all' || p.service === service)
      .filter((p) => !q || [p.name, p.contactPerson, p.email, p.mobile, p.service].some((v) => String(v).toLowerCase().replace(/\s/g, '').includes(q)));
  }, [partners, query, service, showArchived]);

  const rows = tab === 'contracts' ? filtered : filteredPartners;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // If a change empties the last page, step back to the previous one
  useEffect(() => {
    if (page > 1 && (page - 1) * PAGE_SIZE >= rows.length) setPage(Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  }, [rows.length, page]);

  const ticked = tab === 'contracts' ? pageRows.filter((c) => selected.includes(c.id)) : [];
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Open a dialog from the ⋮ menu or from the details dialog
  const openAction = (action, contract) => {
    setRowMenu(null);
    if (action === 'details') setDetailsId(contract.id);
    else if (action === 'edit') setEditing({ id: contract.id });
    else if (action === 'send') setSendingId(contract.id);
    else if (action === 'download') downloadContract(contract);
    else setAnswer({ id: contract.id, status: action });
  };

  // Save one contract as a .txt file: its details, then the exact text the partner was sent
  const downloadContract = (contract) => {
    const lines = [
      `Contract: ${contract.ref}`,
      `Partner: ${contract.partnerName}${contract.contactPerson ? ` (${contract.contactPerson})` : ''}`,
      `Supplies: ${contract.service}`,
      `Event: ${contract.eventName || 'No event linked'}${contract.eventDate ? ` · ${formatDate(contract.eventDate)}` : ''}`,
      `Needed on: ${formatDate(contract.needBy)}`,
      `Items: ${contract.itemsSummary}`,
      `Amount: ${peso(contract.amount)}`,
      `Status: ${STATUS[contract.status].label}`,
      contract.sentAt ? `Sent: ${formatDateTime(contract.sentAt)} by ${contract.deliveries.map((d) => (d.channel === 'email' ? `email (${d.to})` : `SMS (${d.to})`)).join(' and ')}` : 'Not sent yet',
      '',
      contract.body || '(the contract text is written when it is sent)'
    ];
    downloadTxt(`${contract.ref}.txt`, lines.join('\n'));
    notify(`${contract.ref} downloaded.`);
  };

  // Save the ticked contracts as one .txt table
  const downloadTicked = () => {
    const rowsOut = ticked.map((c) => ({
      Contract: c.ref,
      Partner: c.partnerName,
      Event: c.eventName || '—',
      'Event date': c.eventDate ? formatDate(c.eventDate) : '—',
      Items: c.itemsSummary,
      Amount: c.amount,
      Status: STATUS[c.status].label
    }));
    downloadTxt(`outsourcing-contracts-${todayISO()}.txt`, textTable(rowsOut, ['Amount']));
    notify(`${ticked.length} contracts downloaded.`);
  };

  // Table columns for the Contracts tab; optional ones follow the "Filter columns" choice
  const contractColumns = [
    {
      key: 'select',
      width: 48,
      label: (
        <Checkbox
          size="small"
          checked={pageRows.length > 0 && ticked.length === pageRows.length}
          indeterminate={ticked.length > 0 && ticked.length < pageRows.length}
          onChange={(e) => setSelected(e.target.checked ? pageRows.map((c) => c.id) : [])}
          inputProps={{ 'aria-label': 'Select all on this page' }}
        />
      ),
      render: (c) => <Checkbox size="small" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} inputProps={{ 'aria-label': `Select ${c.ref}` }} />
    },
    {
      key: 'partner',
      label: 'Vendor / Service',
      render: (c) => (
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{c.partnerName}</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{c.service} · {c.itemsSummary}</Typography>
        </Box>
      )
    },
    columns.event && { key: 'event', label: 'Assigned event', render: (c) => c.eventName || <Box component="span" sx={{ color: tokens.textMuted }}>No event linked</Box> },
    columns.eventDate && { key: 'eventDate', label: 'Event date', render: (c) => (c.eventDate ? formatDate(c.eventDate) : '—') },
    columns.needBy && { key: 'needBy', label: 'Date needed', render: (c) => formatDate(c.needBy) },
    columns.amount && { key: 'amount', label: 'Amount', align: 'right', render: (c) => (c.amount > 0 ? peso(c.amount) : '—') },
    { key: 'ref', label: 'Contract Ref #', render: (c) => <Typography sx={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{c.ref}</Typography> },
    { key: 'status', label: 'Contract status', render: (c) => <Pill size="sm" label={STATUS[c.status].label} bg={STATUS[c.status].bg} fg={STATUS[c.status].fg} /> },
    // Where it went: the channels it was actually sent to, or how it will be sent once it is
    columns.sentTo && {
      key: 'sentTo',
      label: 'Sent to',
      render: (c) =>
        c.sentAt ? <ChannelChips channels={[...new Set(c.deliveries.map((d) => d.channel))]} /> : <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>Not sent</Typography>
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      width: 72,
      card: 'aside', // on phone cards the ⋮ menu sits at the top right, next to the status
      render: (c) => (
        <IconButton size="small" aria-label={`Actions for ${c.ref}`} onClick={(e) => setRowMenu({ anchor: e.currentTarget, contract: c })}>
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
      )
    }
  ].filter(Boolean);

  // Table columns for the Partners tab
  const partnerColumns = [
    {
      key: 'name',
      label: 'Partner',
      render: (p) => (
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{p.name}</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{p.contactPerson || 'No contact person'}</Typography>
        </Box>
      )
    },
    { key: 'service', label: 'Supplies', render: (p) => p.service },
    {
      key: 'contact',
      label: 'Contract goes to',
      render: (p) => (
        <Box>
          <ChannelChips channels={p.channels} />
          <Typography sx={{ fontSize: 12, color: tokens.textMuted, mt: 0.25 }}>{[p.email, p.mobile && formatMobile(p.mobile)].filter(Boolean).join(' · ') || 'Add an email or mobile number'}</Typography>
        </Box>
      )
    },
    { key: 'contracts', label: 'Contracts', align: 'right', render: (p) => p.contractCount },
    { key: 'open', label: 'Awaiting reply', align: 'right', render: (p) => (p.openCount > 0 ? <Pill size="sm" label={String(p.openCount)} bg="rgba(245, 158, 11, 0.14)" fg="#b45309" /> : '—') },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      width: 72,
      card: 'aside', // on phone cards the ⋮ menu sits at the top right
      render: (p) => (
        <IconButton size="small" aria-label={`Actions for ${p.name}`} onClick={(e) => setPartnerMenu({ anchor: e.currentTarget, partner: p })}>
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
      )
    }
  ];

  if (error) return <DashCard><ErrorState error={error} onRetry={reload} /></DashCard>;

  const menuContract = rowMenu && rowMenu.contract;
  const menuPartner = partnerMenu && partnerMenu.partner;
  const answerContract = answer && contractById(answer.id);

  return (
    <>
      <PageHeader
        title="Outsourcing"
        subtitle="Rent what your own stock can't cover, and send the contract to the partner by email, SMS or both."
        actions={
          <>
            <Button variant="outlined" startIcon={<StorefrontOutlinedIcon />} onClick={() => setPartnerForm({})}>Add partner</Button>
            <Button variant="contained" startIcon={<AddRoundedIcon />} disabled={!activePartners.length} onClick={() => setEditing({ prefill: {} })}>New contract</Button>
          </>
        }
      />

      {/* Summary cards; clicking one opens the matching contract filter. Two per row on phones and tablets. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, 1fr)' }, gap: { xs: 1.5, sm: 2.5 }, mb: 2.5 }}>
        <StatCard
          icon={StorefrontOutlinedIcon}
          tone="gold"
          label="Total partners"
          value={totals.partners}
          meta={totals.unreachable ? `${totals.unreachable} with no contact details` : 'All can be reached'}
          loading={loading}
          onClick={() => setParams({ tab: 'partners' })}
        />
        <StatCard
          icon={HandshakeOutlinedIcon}
          tone="green"
          label="Accepted / active"
          value={totals.accepted}
          meta={`${totals.completed} completed`}
          loading={loading}
          onClick={() => { setParams({ tab: 'contracts' }); setStatus('accepted'); }}
        />
        <StatCard
          icon={HourglassEmptyRoundedIcon}
          tone="amber"
          label="Pending response"
          value={totals.sent}
          meta={`${totals.draft} draft${totals.draft === 1 ? '' : 's'} not sent`}
          loading={loading}
          onClick={() => { setParams({ tab: 'contracts' }); setStatus('sent'); }}
        />
        <StatCard
          icon={BlockRoundedIcon}
          tone="red"
          label="Declined"
          value={totals.declined}
          meta={`${totals.cancelled} cancelled`}
          loading={loading}
          onClick={() => { setParams({ tab: 'contracts' }); setStatus('declined'); }}
        />
      </Box>

      {/* Switching tabs keeps the search and Service filter, and starts the list again at page 1 */}
      <SectionTabs
        ariaLabel="Outsourcing sections"
        value={tab}
        onChange={(next) => setParams({ tab: next })}
        options={[
          { value: 'contracts', label: 'Contracts', badge: totals.sent },
          { value: 'partners', label: 'Partners' }
        ]}
      />

      <DashCard>
        {/* Toolbar: search, Service, Event date, Status and Filter columns (the last three are for contracts) */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center', mb: 2 }}>
          <SearchField
            id="outsource-search"
            value={query}
            onChange={setQuery}
            placeholder={tab === 'contracts' ? 'Search partner, Ref # or item' : 'Search partner, contact or number'}
            sx={{ flex: '1 1 240px' }}
          />
          <TextField select size="small" value={service} onChange={(e) => setService(e.target.value)} inputProps={{ 'aria-label': 'Service' }} sx={{ minWidth: 180 }}>
            <MenuItem value="all">Category: All</MenuItem>
            {OUTSOURCE_SERVICES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          {tab === 'partners' && (
            <TextField select size="small" value={showArchived ? 'archived' : 'active'} onChange={(e) => setShowArchived(e.target.value === 'archived')} inputProps={{ 'aria-label': 'Partner list' }} sx={{ minWidth: 170 }}>
              <MenuItem value="active">Status: Active</MenuItem>
              <MenuItem value="archived">Archived</MenuItem>
            </TextField>
          )}
          {tab === 'contracts' && (
            <>
              <TextField select size="small" value={when} onChange={(e) => setWhen(e.target.value)} inputProps={{ 'aria-label': 'Event date' }} sx={{ minWidth: 170 }}>
                {DATE_FILTERS.map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
              </TextField>
              <TextField select size="small" value={status} onChange={(e) => setStatus(e.target.value)} inputProps={{ 'aria-label': 'Status' }} sx={{ minWidth: 170 }}>
                {STATUS_FILTERS.map(([key, label]) => <MenuItem key={key} value={key}>{key === 'all' ? 'Status: All' : label}</MenuItem>)}
              </TextField>
              <Button variant="outlined" startIcon={<ViewColumnOutlinedIcon />} onClick={(e) => setColumnsAnchor(e.currentTarget)} aria-haspopup="menu">
                Filter columns
              </Button>
              {/* Show or hide the optional columns */}
              <Menu anchorEl={columnsAnchor} open={Boolean(columnsAnchor)} onClose={() => setColumnsAnchor(null)}>
                {OPTIONAL_COLUMNS.map(([key, label]) => (
                  <MenuItem key={key} dense onClick={() => setColumns((c) => ({ ...c, [key]: !c[key] }))}>
                    {/* The menu row does the toggling; the checkbox only shows the state */}
                    <Checkbox size="small" checked={columns[key]} tabIndex={-1} disableRipple sx={{ p: 0.5, mr: 1, pointerEvents: 'none' }} inputProps={{ 'aria-label': label, readOnly: true }} />
                    <ListItemText primaryTypographyProps={{ fontSize: 13.5 }}>{label}</ListItemText>
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
        </Box>

        {/* Bulk bar, shown when contracts are ticked */}
        {ticked.length > 0 && (
          <Box sx={{ mb: 2, px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', borderRadius: 1.5, backgroundColor: tokens.ink, color: tokens.onInk }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, mr: 'auto' }}>{ticked.length} selected</Typography>
            <Button size="small" sx={{ color: tokens.onInk }} onClick={downloadTicked}>Download .txt</Button>
            <Button size="small" sx={{ color: tokens.onInk }} onClick={() => setSelected([])}>Clear</Button>
          </Box>
        )}

        {tab === 'contracts' ? (
          <DataTable
            loading={loading}
            columns={contractColumns}
            rows={pageRows}
            rowKey={(c) => c.id}
            onRowClick={(c) => setDetailsId(c.id)}
            minWidth={980}
            empty={<EmptyState compact title="No contracts match" description={contracts.length ? 'Try another search, category, date or status.' : 'Start one with "New contract" once you have a partner.'} />}
          />
        ) : (
          <DataTable
            loading={loading}
            columns={partnerColumns}
            rows={pageRows}
            rowKey={(p) => p.id}
            onRowClick={(p) => setPartnerForm({ id: p.id })}
            minWidth={880}
            empty={
              <EmptyState
                compact
                title={showArchived ? 'Nothing archived' : 'No partners match'}
                description={showArchived ? 'Archived partners appear here and can be restored.' : partners.length ? 'Try another search or category.' : 'Add the suppliers you rent from with "Add partner".'}
              />
            }
          />
        )}
        {!loading && rows.length > 0 && <Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />}

        {/* ⋮ menu for one contract; the options depend on its status */}
        <Menu anchorEl={rowMenu && rowMenu.anchor} open={Boolean(rowMenu)} onClose={() => setRowMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          {menuContract && [
            <MenuItem key="details" onClick={() => openAction('details', menuContract)}>Open contract</MenuItem>,
            ...(menuContract.status === 'draft'
              ? [
                  <MenuItem key="edit" onClick={() => openAction('edit', menuContract)}>Edit draft</MenuItem>,
                  <MenuItem key="send" onClick={() => openAction('send', menuContract)}>Review and send</MenuItem>
                ]
              : []),
            ...(menuContract.status === 'sent'
              ? [
                  <MenuItem key="accepted" onClick={() => openAction('accepted', menuContract)}>Partner accepted</MenuItem>,
                  <MenuItem key="declined" onClick={() => openAction('declined', menuContract)}>Partner declined</MenuItem>,
                  <MenuItem key="resend" onClick={() => openAction('send', menuContract)}>Send again</MenuItem>
                ]
              : []),
            ...(menuContract.status === 'accepted' ? [<MenuItem key="completed" onClick={() => openAction('completed', menuContract)}>Mark delivered</MenuItem>] : []),
            <Divider key="d1" />,
            <MenuItem key="download" onClick={() => openAction('download', menuContract)}>Download as .txt</MenuItem>,
            ...(['draft', 'sent', 'accepted'].includes(menuContract.status)
              ? [<MenuItem key="cancelled" onClick={() => openAction('cancelled', menuContract)} sx={{ color: tokens.redPress }}>Cancel contract</MenuItem>]
              : [])
          ]}
        </Menu>

        {/* ⋮ menu for one partner */}
        <Menu anchorEl={partnerMenu && partnerMenu.anchor} open={Boolean(partnerMenu)} onClose={() => setPartnerMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          {menuPartner && [
            <MenuItem key="edit" onClick={() => { setPartnerMenu(null); setPartnerForm({ id: menuPartner.id }); }}>Edit details</MenuItem>,
            ...(menuPartner.archived
              ? []
              : [<MenuItem key="new" onClick={() => { setPartnerMenu(null); setEditing({ prefill: { partnerId: menuPartner.id } }); }}>New contract for them</MenuItem>]),
            <Divider key="d1" />,
            menuPartner.archived ? (
              <MenuItem key="restore" onClick={() => { setPartnerMenu(null); setArchive({ ids: [menuPartner.id], archived: false }); }}>Restore partner</MenuItem>
            ) : (
              <MenuItem key="archive" onClick={() => { setPartnerMenu(null); setArchive({ ids: [menuPartner.id], archived: true }); }} sx={{ color: tokens.redPress }}>Archive partner</MenuItem>
            )
          ]}
        </Menu>
      </DashCard>

      <ContractDialog
        open={Boolean(editing)}
        contract={editing && editing.id ? contractById(editing.id) : null}
        prefill={(editing && editing.prefill) || {}}
        partners={partners}
        events={data ? data.events : []}
        inventory={data ? data.inventory : []}
        onClose={() => setEditing(null)}
        // A new draft goes straight on to the send dialog, so writing and sending is one flow
        onSaved={(contract, wasNew) => {
          setEditing(null);
          notify(wasNew ? `${contract.ref} saved as a draft.` : 'Draft saved.');
          if (wasNew) setSendingId(contract.id);
        }}
      />

      <PartnerDialog
        open={Boolean(partnerForm)}
        partner={partnerForm && partnerForm.id ? partners.find((p) => p.id === partnerForm.id) : null}
        onClose={() => setPartnerForm(null)}
        onSaved={(partner, wasNew) => {
          setPartnerForm(null);
          notify(wasNew ? `${partner.name} added.` : 'Partner saved.');
        }}
      />

      <SendDialog
        contract={contractById(sendingId)}
        onClose={() => setSendingId(null)}
        onSent={(contract) => {
          setSendingId(null);
          const where = [...new Set(contract.deliveries.map((d) => d.channel))].map((c) => (c === 'email' ? 'email' : 'SMS')).join(' and ');
          notify(`${contract.ref} sent to ${contract.partnerName} by ${where}.`);
        }}
      />

      <DetailsDialog contract={contractById(detailsId)} onClose={() => setDetailsId(null)} onAction={openAction} />

      {/* Record the partner's reply, mark a contract delivered, or cancel it */}
      <ConfirmDialog
        open={Boolean(answer)}
        onClose={() => setAnswer(null)}
        title={
          answerContract
            ? { accepted: `Record that ${answerContract.partnerName} accepted?`, declined: `Record that ${answerContract.partnerName} declined?`, completed: `Mark ${answerContract.ref} delivered?`, cancelled: `Cancel ${answerContract.ref}?` }[answer.status]
            : ''
        }
        description={
          answer && { accepted: 'The contract becomes active and counts under Accepted / active.', declined: 'The contract closes as declined. Draft a new one for another partner if you still need the items.', completed: 'The items arrived and the contract is closed.', cancelled: 'The contract closes. Let the partner know separately if it was already sent.' }[answer.status]
        }
        confirmLabel={answer ? { accepted: 'Record acceptance', declined: 'Record decline', completed: 'Mark delivered', cancelled: 'Cancel contract' }[answer.status] : ''}
        tone={answer && ['declined', 'cancelled'].includes(answer.status) ? 'danger' : 'primary'}
        reasonLabel={answer && ['declined', 'cancelled'].includes(answer.status) ? 'Reason' : undefined}
        reasonPlaceholder="e.g. Fully booked for that date"
        onConfirm={async (note) => {
          await outsourceApi.setContractStatus(answer.id, answer.status, { note });
          const done = { accepted: 'Acceptance recorded.', declined: 'Decline recorded.', completed: 'Contract completed.', cancelled: 'Contract cancelled.' }[answer.status];
          setAnswer(null);
          setSelected([]);
          notify(done);
        }}
      />

      <ConfirmDialog
        open={Boolean(archive)}
        onClose={() => setArchive(null)}
        title={archive ? `${archive.archived ? 'Archive' : 'Restore'} ${(partners.find((p) => p.id === archive.ids[0]) || {}).name}?` : ''}
        description={
          archive && archive.archived
            ? 'Archived partners leave the list and cannot be given new contracts. Their past contracts are kept.'
            : 'The partner returns to the list and can be given contracts again.'
        }
        confirmLabel={archive && archive.archived ? 'Archive' : 'Restore'}
        tone={archive && archive.archived ? 'danger' : 'primary'}
        onConfirm={async () => {
          await outsourceApi.setPartnerArchived(archive.ids, archive.archived);
          setArchive(null);
          notify(archive.archived ? 'Partner archived.' : 'Partner restored.');
        }}
      />
    </>
  );
}

// A blank item row in the contract dialog. `custom` is true once the admin chooses "Other item…",
// which swaps the dropdown for a box they can type an item name into.
const blankItem = () => ({ name: '', qty: '', custom: false });
// Value used in the item dropdown for something that is not in the inventory
const OTHER_ITEM = '__other__';

/**
 * Write a contract, or edit one that is still a draft: partner, the event it is for, the items and
 * how many, the date they are needed, the agreed amount and any extra line for the partner.
 * Saving a new one opens the send dialog next.
 */
function ContractDialog({ open, contract, prefill, partners, events, inventory, onClose, onSaved }) {
  const isPhone = useMediaQuery('(max-width:599px)');
  const [values, setValues] = useState({ partnerId: '', reservationRef: NO_EVENT, needBy: '', amount: '', notes: '' });
  const [items, setItems] = useState([blankItem()]);
  const [errors, setErrors] = useState({}); // { field: message, itemRow: index }
  const [busy, setBusy] = useState(false);
  const id = contract && contract.id;

  // Fill the form when the dialog opens: from the draft being edited, else from the prefill
  useEffect(() => {
    if (!open) return;
    // An item that is not in the inventory is shown in the "Other item" box instead of the dropdown
    const asRow = (item) => ({ name: item.name, qty: String(item.qty || ''), custom: Boolean(item.name) && !inventory.some((i) => i.name === item.name) });
    if (contract) {
      setValues({ partnerId: contract.partnerId, reservationRef: contract.reservationRef, needBy: contract.needBy, amount: String(contract.amount || ''), notes: contract.notes });
      setItems(contract.items.map(asRow));
    } else {
      setValues({ partnerId: prefill.partnerId || '', reservationRef: prefill.reservationRef || NO_EVENT, needBy: prefill.needBy || '', amount: '', notes: '' });
      setItems(prefill.items && prefill.items.length ? prefill.items.map(asRow) : [blankItem()]);
    }
    setErrors({});
  }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors({});
  };
  const setItem = (index, field) => (e) => {
    setItems((list) => list.map((item, i) => (i === index ? { ...item, [field]: e.target.value } : item)));
    setErrors({});
  };

  const partner = partners.find((p) => p.id === values.partnerId);
  // Partners to choose from: the active ones, plus a draft's own partner if they have since been archived
  // (shown as archived; saving then asks the admin to pick an active partner or restore them)
  const partnerChoices = partners.filter((p) => !p.archived || p.id === values.partnerId);
  // The event fills in the date needed and the venue, so the partner is told where to deliver
  const event = events.find((e) => e.ref === values.reservationRef);
  // Item dropdown: the inventory, plus a row for anything not in it
  const itemOptions = [...inventory.map((i) => ({ value: i.name, label: `${i.name} (${i.available} available)` })), { value: OTHER_ITEM, label: 'Other item…' }];

  const save = async () => {
    setBusy(true);
    try {
      const saved = await outsourceApi.saveContract(id || null, { ...values, items, amount: Number(values.amount || 0) });
      onSaved(saved, !id);
    } catch (e) {
      setErrors({ [(e.meta && e.meta.field) || 'partnerId']: e.message, itemRow: e.meta && e.meta.row });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="md"
      fullScreenOnMobile
      title={id ? 'Edit draft contract' : 'New contract'}
      description="Say what you need and when. The contract text is written for you on the next step, and you can edit it before it goes out."
      actions={<><Button onClick={onClose} disabled={busy}>Cancel</Button><BusyButton busy={busy} onClick={save}>{id ? 'Save draft' : 'Save and review'}</BusyButton></>}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}>
        <SelectField
          id="contract-partner"
          label="Partner"
          required
          placeholder="Choose a partner"
          value={values.partnerId}
          onChange={set('partnerId')}
          error={errors.partnerId}
          hint={partner ? `Reached by ${channelText(partner.channels).toLowerCase()}.` : 'Only partners with contact details can be sent a contract.'}
          options={partnerChoices.map((p) => ({ value: p.id, label: `${p.name} · ${p.service}${p.archived ? ' (archived)' : ''}` }))}
        />
        <SelectField
          id="contract-event"
          label="For which event"
          value={values.reservationRef}
          onChange={(e) => {
            // Picking an event suggests its date as the date needed, unless one is already set
            const next = e.target.value;
            const chosen = events.find((ev) => ev.ref === next);
            setValues((v) => ({ ...v, reservationRef: next, needBy: v.needBy || (chosen ? chosen.date : '') }));
            setErrors({});
          }}
          error={errors.reservationRef}
          options={[{ value: NO_EVENT, label: 'No event (e.g. topping up stock)' }, ...events.map((e) => ({ value: e.ref, label: `${formatDate(e.date)} · ${e.eventName} · ${e.rental ? 'equipment rental' : `${e.guests} pax`}` }))]}
        />
      </Box>

      <Typography sx={{ mt: 2.5, mb: 1, fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>What you need</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {items.map((item, index) => (
          <Box key={index} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: item.custom ? '1.4fr 1.4fr 1fr auto' : '2.4fr 1fr auto' }, gap: 1, alignItems: 'start' }}>
            <SelectField
              id={`contract-item-${index}`}
              label={isPhone || index === 0 ? 'Item' : undefined}
              required={isPhone || index === 0}
              placeholder="Choose an item"
              value={item.custom ? OTHER_ITEM : item.name}
              // "Other item…" clears the name and opens the box next to it; anything else is an inventory item
              onChange={(e) => {
                const chosen = e.target.value;
                setItems((list) => list.map((row, i) => (i === index ? { ...row, custom: chosen === OTHER_ITEM, name: chosen === OTHER_ITEM ? '' : chosen } : row)));
                setErrors({});
              }}
              error={errors.itemRow === index ? errors.items : undefined}
              options={itemOptions}
            />
            {item.custom && (
              <FormField
                id={`contract-item-name-${index}`}
                label={isPhone || index === 0 ? 'Item name' : undefined}
                value={item.name}
                onChange={setItem(index, 'name')}
                inputProps={{ 'aria-label': 'Item name', maxLength: 60 }}
                placeholder="e.g. Tent 10x20 ft"
              />
            )}
            <FormField
              id={`contract-qty-${index}`}
              label={isPhone || index === 0 ? 'How many' : undefined}
              required={isPhone || index === 0}
              type="number"
              value={item.qty}
              onChange={setItem(index, 'qty')}
              inputProps={{ min: 1, 'aria-label': 'How many' }}
            />
            <IconButton
              aria-label="Remove item"
              disabled={items.length === 1 || busy}
              onClick={() => { setItems((list) => list.filter((_, i) => i !== index)); setErrors({}); }}
              sx={{ mt: { sm: index === 0 ? 3.25 : 0 }, justifySelf: { xs: 'start', sm: 'center' } }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Button startIcon={<AddRoundedIcon />} disabled={items.length >= 15 || busy} onClick={() => setItems((list) => [...list, blankItem()])} sx={{ alignSelf: 'flex-start' }}>
          Add another item
        </Button>
      </Box>

      <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}>
        <DateField
          id="contract-needby"
          label="Date needed"
          required
          mode="any"
          value={values.needBy}
          onChange={(date) => { setValues((v) => ({ ...v, needBy: date })); setErrors({}); }}
          error={errors.needBy}
          hint={event ? `${event.eventName} is on ${formatDate(event.date)}.` : 'When the items have to be with you.'}
        />
        <FormField
          id="contract-amount"
          label="Agreed amount"
          optional
          type="number"
          value={values.amount}
          onChange={set('amount')}
          error={errors.amount}
          hint="Leave blank if the price is not settled yet."
          inputProps={{ min: 0, step: 100 }}
        />
      </Box>
      <FormField
        id="contract-notes"
        label="Extra line for the partner"
        optional
        multiline
        minRows={2}
        value={values.notes}
        onChange={set('notes')}
        error={errors.notes}
        inputProps={{ maxLength: 300 }}
        placeholder="e.g. Please deliver before 7 am; gate access is on the left side."
        sx={{ mt: 1.75 }}
      />
    </AppDialog>
  );
}

/**
 * Add a partner or edit one. Either an email address or a mobile number is enough: the contract is
 * sent to whichever of the two is on file, so a partner who only texts still receives it.
 */
function PartnerDialog({ open, partner, onClose, onSaved }) {
  const [values, setValues] = useState({ name: '', service: '', contactPerson: '', email: '', mobile: '', address: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const id = partner && partner.id;

  // Fill the form when the dialog opens on a partner, or clear it for a new one
  useEffect(() => {
    if (!open) return;
    setValues(
      partner
        ? { name: partner.name, service: partner.service, contactPerson: partner.contactPerson, email: partner.email, mobile: partner.mobile, address: partner.address, notes: partner.notes }
        : { name: '', service: '', contactPerson: '', email: '', mobile: '', address: '', notes: '' }
    );
    setErrors({});
  }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors({});
  };

  const save = async () => {
    setBusy(true);
    try {
      onSaved(await outsourceApi.savePartner(id || null, values), !id);
    } catch (e) {
      setErrors({ [(e.meta && e.meta.field) || 'name']: e.message });
    } finally {
      setBusy(false);
    }
  };

  // What the partner can be reached by as the admin types
  const channels = [...(values.email.trim() ? ['email'] : []), ...(values.mobile.trim() ? ['sms'] : [])];

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="sm"
      fullScreenOnMobile
      title={id ? 'Edit partner' : 'Add partner'}
      description="Contracts go to the email address and the mobile number on file. One of the two is enough."
      actions={<><Button onClick={onClose} disabled={busy}>Cancel</Button><BusyButton busy={busy} onClick={save}>{id ? 'Save partner' : 'Add partner'}</BusyButton></>}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}>
        <FormField id="partner-name" label="Partner name" required value={values.name} onChange={set('name')} error={errors.name} inputProps={{ maxLength: 80 }} />
        <SelectField id="partner-service" label="What they supply" required placeholder="Choose" value={values.service} onChange={set('service')} error={errors.service} options={OUTSOURCE_SERVICES} />
        <FormField id="partner-contact" label="Contact person" optional value={values.contactPerson} onChange={set('contactPerson')} error={errors.contactPerson} inputProps={{ maxLength: 60 }} />
        <FormField id="partner-address" label="Address" optional value={values.address} onChange={set('address')} error={errors.address} inputProps={{ maxLength: 120 }} />
        <FormField
          id="partner-email"
          label="Email address"
          type="email"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
          hint="Where the contract is emailed."
          placeholder="name@example.com"
        />
        <FormField
          id="partner-mobile"
          label="Mobile number"
          value={values.mobile}
          onChange={set('mobile')}
          error={errors.mobile}
          hint="Where the contract is texted."
          placeholder="0917 123 4567"
        />
      </Box>
      <FormField id="partner-notes" label="Notes" optional multiline minRows={2} value={values.notes} onChange={set('notes')} error={errors.notes} inputProps={{ maxLength: 300 }} placeholder="Delivery terms, rates, how far ahead they need to be booked…" sx={{ mt: 1.75 }} />
      {/* Tells the admin, before saving, which way a contract will reach this partner */}
      <Box sx={{ mt: 1.75 }}>
        {channels.length ? (
          <AlertBanner tone="info" title={`Contracts go out by ${channelText(channels).toLowerCase()}`}>
            {channels.length === 2 ? 'Both get the same text.' : 'The other channel is used once you add it.'}
          </AlertBanner>
        ) : (
          <AlertBanner tone="locked" title="No way to reach them yet">Add an email address or a mobile number, or contracts can't be sent.</AlertBanner>
        )}
      </Box>
    </AppDialog>
  );
}

/**
 * Review and send a contract. The text is written from the contract's own details and can be edited;
 * whatever is here is what goes out — the same words to the email address and to the mobile number,
 * so a partner who only has a number is told exactly what an emailed partner is told.
 */
function SendDialog({ contract, onClose, onSent }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = contract && contract.id;

  // Write the text when a different contract opens: keep what was already sent, else compose it
  useEffect(() => {
    if (!contract) return;
    setBody(
      contract.body ||
        outsourceApi.composeContractText({
          ref: contract.ref,
          partner: { name: contract.partnerName, contactPerson: contract.contactPerson },
          items: contract.items,
          needBy: contract.needBy,
          eventName: contract.eventName,
          eventDate: contract.eventDate,
          venue: contract.eventVenue,
          amount: contract.amount,
          notes: contract.notes
        })
    );
    setError('');
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!contract) return <AppDialog open={false} onClose={onClose} title="" />;

  const send = async () => {
    setBusy(true);
    try {
      onSent(await outsourceApi.sendContract(contract.id, { body }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // An SMS is counted in 160-character parts, so the admin can see how long a text this makes
  const parts = Math.max(1, Math.ceil(body.length / 160));
  const canSend = contract.channels.length > 0;

  return (
    <AppDialog
      open
      onClose={onClose}
      busy={busy}
      maxWidth="md"
      fullScreenOnMobile
      title={`Send ${contract.ref}`}
      description={`To ${contract.partnerName} · ${contract.itemsSummary}`}
      actions={<><Button onClick={onClose} disabled={busy}>Close</Button><BusyButton busy={busy} disabled={!canSend} startIcon={<SendRoundedIcon />} onClick={send}>{contract.sentAt ? 'Send again' : 'Send contract'}</BusyButton></>}
    >
      {/* Where it goes, and the promise that both channels carry the same words */}
      {canSend ? (
        <Box sx={{ mb: 2, p: 1.75, borderRadius: 1.5, backgroundColor: tokens.surfaceMuted, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {contract.channels.includes('email') && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MailOutlineRoundedIcon sx={{ fontSize: 18, color: tokens.blue }} />
              <Typography sx={{ fontSize: 13 }}>Email to <b>{contract.partnerEmail}</b></Typography>
            </Box>
          )}
          {contract.channels.includes('sms') && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SmsOutlinedIcon sx={{ fontSize: 18, color: tokens.green }} />
              <Typography sx={{ fontSize: 13 }}>SMS to <b>{formatMobile(contract.partnerMobile)}</b> · {parts} message{parts === 1 ? '' : 's'}</Typography>
            </Box>
          )}
          <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>
            {contract.channels.length === 2 ? 'Both carry the text below, word for word.' : 'This is the only channel on file for them.'}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ mb: 2 }}>
          <AlertBanner tone="locked" title="No way to reach this partner">
            {contract.partnerName} has no email address and no mobile number. Add one on the Partners tab first.
          </AlertBanner>
        </Box>
      )}

      <FormField
        id="send-body"
        label="Contract text"
        required
        multiline
        minRows={12}
        value={body}
        onChange={(e) => { setBody(e.target.value); setError(''); }}
        error={error}
        hint={`${body.length} characters`}
        inputProps={{ maxLength: 2000, style: { fontSize: 13.5, lineHeight: 1.7 } }}
      />
      {contract.sentAt && (
        <Typography sx={{ mt: 1.25, fontSize: 12.5, color: tokens.textMuted }}>
          Already sent {formatDateTime(contract.sentAt)}. Sending again delivers this text once more.
        </Typography>
      )}
    </AppDialog>
  );
}

/** One contract in full: its details, the text that was sent, where it went, and its history. */
function DetailsDialog({ contract, onClose, onAction }) {
  if (!contract) return <AppDialog open={false} onClose={onClose} title="" />;
  const chip = STATUS[contract.status];

  return (
    <AppDialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullScreenOnMobile
      title={contract.ref}
      description={`${contract.partnerName} · ${contract.service}`}
      actions={
        <>
          <Button onClick={() => onAction('download', contract)}>Download .txt</Button>
          {contract.status === 'draft' && <Button variant="outlined" onClick={() => { onClose(); onAction('edit', contract); }}>Edit draft</Button>}
          {['draft', 'sent'].includes(contract.status) && (
            <Button variant="contained" startIcon={<SendRoundedIcon />} onClick={() => { onClose(); onAction('send', contract); }}>
              {contract.status === 'draft' ? 'Review and send' : 'Send again'}
            </Button>
          )}
          {contract.status === 'sent' && <Button variant="contained" onClick={() => { onClose(); onAction('accepted', contract); }}>Partner accepted</Button>}
          {contract.status === 'accepted' && <Button variant="contained" onClick={() => { onClose(); onAction('completed', contract); }}>Mark delivered</Button>}
        </>
      }
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.75, mb: 2 }}>
        <Field label="Status"><Pill size="sm" label={chip.label} bg={chip.bg} fg={chip.fg} /></Field>
        <Field label="Items">{contract.itemsSummary}</Field>
        <Field label="Amount">{contract.amount > 0 ? peso(contract.amount) : 'Not settled'}</Field>
        <Field label="Event">{contract.eventName || 'No event linked'}</Field>
        <Field label="Event date">{contract.eventDate ? formatDate(contract.eventDate) : '—'}</Field>
        <Field label="Date needed">{formatDate(contract.needBy)}</Field>
        <Field label="Contact person">{contract.contactPerson}</Field>
        <Field label="Email">{contract.partnerEmail}</Field>
        <Field label="Mobile">{contract.partnerMobile ? formatMobile(contract.partnerMobile) : ''}</Field>
      </Box>

      {contract.answerNote && (
        <Box sx={{ mb: 2 }}>
          <AlertBanner tone={contract.status === 'declined' || contract.status === 'cancelled' ? 'locked' : 'info'} title={contract.status === 'cancelled' ? 'Why it was cancelled' : 'What the partner said'}>
            {contract.answerNote}
          </AlertBanner>
        </Box>
      )}

      {/* The text that went out, and every channel it went to */}
      <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.75 }}>{contract.sentAt ? 'What was sent' : 'Not sent yet'}</Typography>
      {contract.sentAt ? (
        <>
          <Box sx={{ p: 1.75, borderRadius: 1.5, backgroundColor: tokens.surfaceMuted, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, color: tokens.textPrimary }}>{contract.body}</Box>
          <Box sx={{ mt: 1.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {contract.deliveries.map((d, i) => (
              <Typography key={i} sx={{ fontSize: 12.5, color: tokens.textMuted }}>
                {d.channel === 'email' ? 'Email' : 'SMS'} to {d.channel === 'email' ? d.to : formatMobile(d.to)} · {formatDateTime(d.at)}
              </Typography>
            ))}
          </Box>
        </>
      ) : (
        <Typography sx={{ fontSize: 13, color: tokens.textMuted }}>The contract text is written when you send it, and both the email and the SMS carry it word for word.</Typography>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.75 }}>History</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[...contract.history].reverse().map((entry, i) => (
          <Box key={i}>
            <Typography sx={{ fontSize: 13, color: tokens.textPrimary }}>{entry.text}</Typography>
            <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>{entry.actor} · {formatDateTime(entry.at)}</Typography>
          </Box>
        ))}
      </Box>
    </AppDialog>
  );
}

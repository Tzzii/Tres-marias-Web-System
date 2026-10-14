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
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
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
  MobileField,
  OUTSOURCE_SERVICES,
  OUTSOURCE_OTHER,
  OUTSOURCE_OTHER_RANGE,
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
import { usePdfDocument } from '../components/PdfDocument.jsx';

const PAGE_SIZE = 10;
const NO_EVENT = outsourceApi.NO_EVENT;

const STATUS = {
  draft: { label: 'Draft', bg: 'rgba(100, 116, 139, 0.14)', fg: '#334155' },
  sent: { label: 'Awaiting reply', bg: 'rgba(245, 158, 11, 0.14)', fg: '#b45309' },
  accepted: { label: 'Accepted', bg: 'rgba(16, 185, 129, 0.12)', fg: '#047857' },
  completed: { label: 'Completed', bg: 'rgba(59, 130, 246, 0.12)', fg: '#1d4ed8' },
  declined: { label: 'Declined', bg: 'rgba(239, 68, 68, 0.1)', fg: '#b91c1c' },
  cancelled: { label: 'Cancelled', bg: 'rgba(239, 68, 68, 0.1)', fg: '#b91c1c' }
};

const STATUS_FILTERS = [
  ['all', 'All', () => true],
  ['draft', 'Draft', (c) => c.status === 'draft'],
  ['sent', 'Awaiting reply', (c) => c.status === 'sent'],
  ['accepted', 'Accepted', (c) => c.status === 'accepted'],
  ['completed', 'Completed', (c) => c.status === 'completed'],
  ['declined', 'Declined', (c) => c.status === 'declined'],
  ['cancelled', 'Cancelled', (c) => c.status === 'cancelled']
];

const DATE_FILTERS = [
  ['all', 'Event date: All', () => true],
  ['upcoming', 'Upcoming events', (c) => c.eventDate && c.eventDate >= todayISO()],
  ['today', 'Events today', (c) => c.eventDate === todayISO()],
  ['past', 'Past events', (c) => c.eventDate && c.eventDate < todayISO()],
  ['none', 'No event linked', (c) => !c.eventDate]
];

const OPTIONAL_COLUMNS = [
  ['event', 'Assigned Event'],
  ['eventDate', 'Event Date'],
  ['needBy', 'Date Needed'],
  ['amount', 'Outsource Price'],
  ['sentTo', 'Sent To']
];
const COLUMNS_KEY = 'tm.admin.outsource.columns';

const TABS = [
  ['contracts', 'Requests'],
  ['partners', 'Partners']
];

const channelText = (channels) => (channels.includes('email') ? 'Email' : 'No email address');

function ChannelChips({ channels, size = 'sm' }) {
  if (!channels.length) return <Pill size={size} label="No email" bg="rgba(239, 68, 68, 0.1)" fg="#b91c1c" />;
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
      {channels.includes('email') && (
        <Pill size={size} label="Email" bg="rgba(59, 130, 246, 0.12)" fg="#1d4ed8" dot={false} />
      )}
      {channels.some((channel) => channel !== 'email') && (
        <Pill size={size} label="Previous delivery" bg={tokens.surfaceMuted} fg={tokens.textMuted} dot={false} />
      )}
    </Box>
  );
}

export default function OutsourcePage() {
  useDocumentTitle('Outsourcing', 'Tres Marias Admin');
  const notify = useNotify();
  const { savePdfDocument, savingPdfDocument, pdfDocument } = usePdfDocument();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TABS.some(([key]) => key === requested) ? requested : 'contracts';

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
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [columns, setColumns] = useColumnChoice(COLUMNS_KEY, OPTIONAL_COLUMNS);
  const [columnsAnchor, setColumnsAnchor] = useState(null);
  const [rowMenu, setRowMenu] = useState(null);
  const [partnerMenu, setPartnerMenu] = useState(null);
  const [editing, setEditing] = useState(null);
  const [partnerForm, setPartnerForm] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [archive, setArchive] = useState(null);
  const [deletingPartner, setDeletingPartner] = useState(null);

  const contracts = data ? data.contracts : [];
  const partners = data ? data.partners : [];
  const activePartners = partners.filter((p) => !p.archived);
  const contractById = (id) => contracts.find((c) => c.id === id) || null;

  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [query, service, when, status, showArchived, tab]);

  useEffect(() => {
    const item = params.get('item');
    if (!item || !data) return;
    const qty = Number(params.get('qty'));
    setEditing({ prefill: { items: [{ name: item, qty: qty > 0 ? String(qty) : '' }] } });
    setParams({ tab: 'contracts' }, { replace: true });
  }, [params, setParams, data]);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s/g, '');
    const byStatus = STATUS_FILTERS.find(([key]) => key === status)[2];
    const byDate = DATE_FILTERS.find(([key]) => key === when)[2];
    return contracts
      .filter(byStatus)
      .filter(byDate)
      .filter((c) => service === 'all' || outsourceApi.partnerServiceCategory(c.service) === service)
      .filter(
        (c) =>
          !q ||
          [c.partnerName, c.ref, c.eventName, c.itemsSummary, c.service].some((v) =>
            String(v).toLowerCase().replace(/\s/g, '').includes(q)
          )
      );
  }, [contracts, query, service, when, status]);

  const filteredPartners = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s/g, '');
    return partners
      .filter((p) => Boolean(p.archived) === showArchived)
      .filter((p) => service === 'all' || outsourceApi.partnerServiceCategory(p.service) === service)
      .filter(
        (p) =>
          !q ||
          [p.name, p.contactPerson, p.email, p.mobile, p.service].some((v) =>
            String(v).toLowerCase().replace(/\s/g, '').includes(q)
          )
      );
  }, [partners, query, service, showArchived]);

  const rows = tab === 'contracts' ? filtered : filteredPartners;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => {
    if (page > 1 && (page - 1) * PAGE_SIZE >= rows.length) setPage(Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  }, [rows.length, page]);

  const ticked = tab === 'contracts' ? pageRows.filter((c) => selected.includes(c.id)) : [];
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const openAction = (action, contract) => {
    setRowMenu(null);
    if (action === 'details') setDetailsId(contract.id);
    else if (action === 'edit') setEditing({ id: contract.id });
    else if (action === 'send') setSendingId(contract.id);
    else if (action === 'savePdf') saveContractPdf(contract);
    else setAnswer({ id: contract.id, status: action });
  };

  const saveContractPdf = (contract) =>
    savePdfDocument({
      title: `Outsourcing Request - ${contract.ref}`,
      fileName: `${contract.ref}.pdf`,
      details: [
        ['Request', contract.ref],
        ['Partner', `${contract.partnerName}${contract.contactPerson ? ` (${contract.contactPerson})` : ''}`],
        ['Supplies', contract.service],
        [
          'Event',
          `${contract.eventName || 'No event linked'}${contract.eventDate ? ` · ${formatDate(contract.eventDate)}` : ''}`
        ],
        ['Needed on', formatDate(contract.needBy)],
        ['Items', contract.itemsSummary],
        ['Outsource price', peso(contract.amount)],
        ['Status', STATUS[contract.status].label],
        [
          'Sent',
          contract.sentAt
            ? `${formatDateTime(contract.sentAt)} · ${contract.deliveries.map((d) => (d.channel === 'email' ? `email (${d.to})` : `previous delivery (${d.to})`)).join(' and ')}`
            : 'Not sent yet'
        ]
      ],
      message: contract.body || '(the request text is written when it is sent)'
    });

  const saveTickedPdf = () => {
    if (!ticked.length) return;
    const rowsOut = ticked.map((c) => ({
      Request: c.ref,
      Partner: c.partnerName,
      Event: c.eventName || '—',
      'Event Date': c.eventDate ? formatDate(c.eventDate) : '—',
      Items: c.itemsSummary,
      'Outsource Price': c.amount,
      Status: STATUS[c.status].label
    }));
    return savePdfDocument({
      title: 'Outsourcing Requests',
      subtitle: `${ticked.length} selected request${ticked.length === 1 ? '' : 's'}`,
      fileName: `outsourcing-requests-${todayISO()}.pdf`,
      rows: rowsOut,
      money: ['Outsource Price'],
      orientation: 'landscape'
    });
  };

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
      render: (c) => (
        <Checkbox
          size="small"
          checked={selected.includes(c.id)}
          onChange={() => toggle(c.id)}
          inputProps={{ 'aria-label': `Select ${c.ref}` }}
        />
      )
    },
    {
      key: 'partner',
      label: 'Vendor / Service',
      render: (c) => (
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{c.partnerName}</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
            {c.service} · {c.itemsSummary}
          </Typography>
        </Box>
      )
    },
    columns.event && {
      key: 'event',
      label: 'Assigned Event',
      render: (c) =>
        c.eventName || (
          <Box component="span" sx={{ color: tokens.textMuted }}>
            No event linked
          </Box>
        )
    },
    columns.eventDate && {
      key: 'eventDate',
      label: 'Event Date',
      render: (c) => (c.eventDate ? formatDate(c.eventDate) : '—')
    },
    columns.needBy && { key: 'needBy', label: 'Date Needed', render: (c) => formatDate(c.needBy) },
    columns.amount && {
      key: 'amount',
      label: 'Outsource Price',
      align: 'right',
      render: (c) => (c.amount > 0 ? peso(c.amount) : '—')
    },
    {
      key: 'ref',
      label: 'Request Ref #',
      render: (c) => <Typography sx={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{c.ref}</Typography>
    },
    {
      key: 'status',
      label: 'Request Status',
      render: (c) => <Pill size="sm" label={STATUS[c.status].label} bg={STATUS[c.status].bg} fg={STATUS[c.status].fg} />
    },
    columns.sentTo && {
      key: 'sentTo',
      label: 'Sent To',
      render: (c) =>
        c.sentAt ? (
          <ChannelChips channels={[...new Set(c.deliveries.map((d) => d.channel))]} />
        ) : (
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>Not sent</Typography>
        )
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      width: 72,
      card: 'aside',
      render: (c) => (
        <IconButton
          size="small"
          aria-label={`Actions for ${c.ref}`}
          onClick={(e) => setRowMenu({ anchor: e.currentTarget, contract: c })}
        >
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
      )
    }
  ].filter(Boolean);

  const partnerColumns = [
    {
      key: 'name',
      label: 'Partner',
      render: (p) => (
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{p.name}</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
            {p.contactPerson || 'No contact person'}
          </Typography>
        </Box>
      )
    },
    { key: 'service', label: 'Supplies', render: (p) => p.service },
    {
      key: 'contact',
      label: 'Request Goes To',
      render: (p) => (
        <Box>
          <ChannelChips channels={p.channels} />
          <Typography sx={{ fontSize: 12, color: tokens.textMuted, mt: 0.25 }}>
            {[p.email, p.mobile && formatMobile(p.mobile)].filter(Boolean).join(' · ') || 'Add an email address'}
          </Typography>
        </Box>
      )
    },
    { key: 'contracts', label: 'Requests', align: 'right', render: (p) => p.contractCount },
    {
      key: 'open',
      label: 'Awaiting Reply',
      align: 'right',
      render: (p) =>
        p.openCount > 0 ? (
          <Pill size="sm" label={String(p.openCount)} bg="rgba(245, 158, 11, 0.14)" fg="#b45309" />
        ) : (
          '—'
        )
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      width: 72,
      card: 'aside',
      render: (p) => (
        <IconButton
          size="small"
          aria-label={`Actions for ${p.name}`}
          onClick={(e) => setPartnerMenu({ anchor: e.currentTarget, partner: p })}
        >
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
      )
    }
  ];

  if (error)
    return (
      <DashCard>
        <ErrorState error={error} onRetry={reload} />
      </DashCard>
    );

  const menuContract = rowMenu && rowMenu.contract;
  const menuPartner = partnerMenu && partnerMenu.partner;
  const answerContract = answer && contractById(answer.id);

  return (
    <>
      <PageHeader
        title="Outsourcing"
        subtitle="Rent what your own stock can't cover. Ask a partner by email if they can supply it for an event."
        actions={
          <>
            <Button variant="outlined" startIcon={<StorefrontOutlinedIcon />} onClick={() => setPartnerForm({})}>
              Add partner
            </Button>
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              disabled={!activePartners.length}
              onClick={() => setEditing({ prefill: {} })}
            >
              New request
            </Button>
          </>
        }
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
          icon={StorefrontOutlinedIcon}
          tone="gold"
          label="Total Partners"
          value={totals.partners}
          meta={totals.unreachable ? `${totals.unreachable} need an email address` : 'All can be emailed'}
          loading={loading}
          onClick={() => setParams({ tab: 'partners' })}
        />
        <StatCard
          icon={HandshakeOutlinedIcon}
          tone="green"
          label="Accepted / Active"
          value={totals.accepted}
          meta={`${totals.completed} completed`}
          loading={loading}
          onClick={() => {
            setParams({ tab: 'contracts' });
            setStatus('accepted');
          }}
        />
        <StatCard
          icon={HourglassEmptyRoundedIcon}
          tone="amber"
          label="Pending Response"
          value={totals.sent}
          meta={`${totals.draft} draft${totals.draft === 1 ? '' : 's'} not sent`}
          loading={loading}
          onClick={() => {
            setParams({ tab: 'contracts' });
            setStatus('sent');
          }}
        />
        <StatCard
          icon={BlockRoundedIcon}
          tone="red"
          label="Declined"
          value={totals.declined}
          meta={`${totals.cancelled} cancelled`}
          loading={loading}
          onClick={() => {
            setParams({ tab: 'contracts' });
            setStatus('declined');
          }}
        />
      </Box>

      <SectionTabs
        ariaLabel="Outsourcing sections"
        value={tab}
        onChange={(next) => setParams({ tab: next })}
        options={[
          { value: 'contracts', label: 'Requests', badge: totals.sent },
          { value: 'partners', label: 'Partners' }
        ]}
      />

      <DashCard>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center', mb: 2 }}>
          <SearchField
            id="outsource-search"
            value={query}
            onChange={setQuery}
            placeholder={tab === 'contracts' ? 'Search partner, Ref # or item' : 'Search partner, contact or number'}
            sx={{ flex: '1 1 240px' }}
          />
          <TextField
            select
            size="small"
            value={service}
            onChange={(e) => setService(e.target.value)}
            inputProps={{ 'aria-label': 'Service' }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">Category: All</MenuItem>
            {OUTSOURCE_SERVICES.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
          {tab === 'partners' && (
            <TextField
              select
              size="small"
              value={showArchived ? 'archived' : 'active'}
              onChange={(e) => setShowArchived(e.target.value === 'archived')}
              inputProps={{ 'aria-label': 'Partner list' }}
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="active">Status: Active</MenuItem>
              <MenuItem value="archived">Archived</MenuItem>
            </TextField>
          )}
          {tab === 'contracts' && (
            <>
              <TextField
                select
                size="small"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                inputProps={{ 'aria-label': 'Event date' }}
                sx={{ minWidth: 170 }}
              >
                {DATE_FILTERS.map(([key, label]) => (
                  <MenuItem key={key} value={key}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                inputProps={{ 'aria-label': 'Status' }}
                sx={{ minWidth: 170 }}
              >
                {STATUS_FILTERS.map(([key, label]) => (
                  <MenuItem key={key} value={key}>
                    {key === 'all' ? 'Status: All' : label}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="outlined"
                startIcon={<ViewColumnOutlinedIcon />}
                onClick={(e) => setColumnsAnchor(e.currentTarget)}
                aria-haspopup="menu"
              >
                Filter columns
              </Button>
              <Menu anchorEl={columnsAnchor} open={Boolean(columnsAnchor)} onClose={() => setColumnsAnchor(null)}>
                {OPTIONAL_COLUMNS.map(([key, label]) => (
                  <MenuItem key={key} dense onClick={() => setColumns((c) => ({ ...c, [key]: !c[key] }))}>
                    <Checkbox
                      size="small"
                      checked={columns[key]}
                      tabIndex={-1}
                      disableRipple
                      sx={{ p: 0.5, mr: 1, pointerEvents: 'none' }}
                      inputProps={{ 'aria-label': label, readOnly: true }}
                    />
                    <ListItemText primaryTypographyProps={{ fontSize: 13.5 }}>{label}</ListItemText>
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
        </Box>

        {ticked.length > 0 && (
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
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, mr: 'auto' }}>{ticked.length} selected</Typography>
            <Button
              size="small"
              startIcon={<PictureAsPdfOutlinedIcon />}
              disabled={savingPdfDocument}
              sx={{ color: tokens.onInk }}
              onClick={saveTickedPdf}
            >
              {savingPdfDocument ? 'Saving…' : 'Save PDF'}
            </Button>
            <Button size="small" sx={{ color: tokens.onInk }} onClick={() => setSelected([])}>
              Clear
            </Button>
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
            empty={
              <EmptyState
                compact
                title="No requests match"
                description={
                  contracts.length
                    ? 'Try another search, category, date or status.'
                    : 'Start one with "New request" once you have a partner.'
                }
              />
            }
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
                description={
                  showArchived
                    ? 'Archived partners appear here and can be restored.'
                    : partners.length
                      ? 'Try another search or category.'
                      : 'Add the suppliers you rent from with "Add partner".'
                }
              />
            }
          />
        )}
        {!loading && rows.length > 0 && <Pager page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />}

        <Menu
          anchorEl={rowMenu && rowMenu.anchor}
          open={Boolean(rowMenu)}
          onClose={() => setRowMenu(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {menuContract && [
            <MenuItem key="details" onClick={() => openAction('details', menuContract)}>
              Open request
            </MenuItem>,
            ...(menuContract.status === 'draft'
              ? [
                  <MenuItem key="edit" onClick={() => openAction('edit', menuContract)}>
                    Edit draft
                  </MenuItem>,
                  <MenuItem key="send" onClick={() => openAction('send', menuContract)}>
                    Review and send
                  </MenuItem>
                ]
              : []),
            ...(menuContract.status === 'sent'
              ? [
                  <MenuItem key="accepted" onClick={() => openAction('accepted', menuContract)}>
                    Partner accepted
                  </MenuItem>,
                  <MenuItem key="declined" onClick={() => openAction('declined', menuContract)}>
                    Partner declined
                  </MenuItem>,
                  <MenuItem key="resend" onClick={() => openAction('send', menuContract)}>
                    Send again
                  </MenuItem>
                ]
              : []),
            ...(menuContract.status === 'accepted'
              ? [
                  <MenuItem key="completed" onClick={() => openAction('completed', menuContract)}>
                    Mark delivered
                  </MenuItem>
                ]
              : []),
            <Divider key="d1" />,
            <MenuItem key="savePdf" disabled={savingPdfDocument} onClick={() => openAction('savePdf', menuContract)}>
              Save PDF
            </MenuItem>,
            ...(['draft', 'sent', 'accepted'].includes(menuContract.status)
              ? [
                  <MenuItem
                    key="cancelled"
                    onClick={() => openAction('cancelled', menuContract)}
                    sx={{ color: tokens.redPress }}
                  >
                    Cancel request
                  </MenuItem>
                ]
              : [])
          ]}
        </Menu>

        <Menu
          anchorEl={partnerMenu && partnerMenu.anchor}
          open={Boolean(partnerMenu)}
          onClose={() => setPartnerMenu(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {menuPartner && [
            <MenuItem
              key="edit"
              onClick={() => {
                setPartnerMenu(null);
                setPartnerForm({ id: menuPartner.id });
              }}
            >
              Edit details
            </MenuItem>,
            ...(menuPartner.archived
              ? []
              : [
                  <MenuItem
                    key="new"
                    onClick={() => {
                      setPartnerMenu(null);
                      setEditing({ prefill: { partnerId: menuPartner.id } });
                    }}
                  >
                    New request for them
                  </MenuItem>
                ]),
            <Divider key="d1" />,
            menuPartner.archived ? (
              <MenuItem
                key="restore"
                onClick={() => {
                  setPartnerMenu(null);
                  setArchive({ ids: [menuPartner.id], archived: false });
                }}
              >
                Restore partner
              </MenuItem>
            ) : (
              <MenuItem
                key="archive"
                onClick={() => {
                  setPartnerMenu(null);
                  setArchive({ ids: [menuPartner.id], archived: true });
                }}
                sx={{ color: tokens.redPress }}
              >
                Archive partner
              </MenuItem>
            ),
            <MenuItem
              key="delete"
              onClick={() => {
                setPartnerMenu(null);
                setDeletingPartner({ id: menuPartner.id, name: menuPartner.name });
              }}
              sx={{ color: tokens.redPress }}
            >
              Delete partner
            </MenuItem>
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
          if (contract.deliveryNote) {
            setDetailsId(contract.id);
            notify(contract.deliveryNote, 'warning');
            return;
          }
          notify(`${contract.ref} sent to ${contract.partnerName} by email.`);
        }}
      />

      {pdfDocument}
      <DetailsDialog
        contract={contractById(detailsId)}
        onClose={() => setDetailsId(null)}
        onAction={openAction}
        savingPdf={savingPdfDocument}
      />

      <ConfirmDialog
        open={Boolean(answer)}
        onClose={() => setAnswer(null)}
        title={
          answerContract
            ? {
                accepted: `Record that ${answerContract.partnerName} accepted?`,
                declined: `Record that ${answerContract.partnerName} declined?`,
                completed: `Mark ${answerContract.ref} delivered?`,
                cancelled: `Cancel ${answerContract.ref}?`
              }[answer.status]
            : ''
        }
        description={
          answer &&
          {
            accepted: 'The partner can supply this. It counts under Accepted / Active.',
            declined:
              'The request closes as declined. Make a new request for another partner if you still need the items.',
            completed: 'The items arrived and the request is closed.',
            cancelled: 'The request closes. Let the partner know separately if it was already sent.'
          }[answer.status]
        }
        confirmLabel={
          answer
            ? {
                accepted: 'Record acceptance',
                declined: 'Record decline',
                completed: 'Mark delivered',
                cancelled: 'Cancel request'
              }[answer.status]
            : ''
        }
        tone={answer && ['declined', 'cancelled'].includes(answer.status) ? 'danger' : 'primary'}
        reasonLabel={answer && ['declined', 'cancelled'].includes(answer.status) ? 'Reason' : undefined}
        reasonPlaceholder="e.g. Fully booked for that date"
        onConfirm={async (note) => {
          await outsourceApi.setContractStatus(answer.id, answer.status, { note });
          const done = {
            accepted: 'Acceptance recorded.',
            declined: 'Decline recorded.',
            completed: 'Request completed.',
            cancelled: 'Request cancelled.'
          }[answer.status];
          setAnswer(null);
          setSelected([]);
          notify(done);
        }}
      />

      <ConfirmDialog
        open={Boolean(archive)}
        onClose={() => setArchive(null)}
        title={
          archive
            ? `${archive.archived ? 'Archive' : 'Restore'} ${(partners.find((p) => p.id === archive.ids[0]) || {}).name}?`
            : ''
        }
        description={
          archive && archive.archived
            ? 'Archived partners leave the list and cannot be given new requests. Their past requests are kept.'
            : 'The partner returns to the list and can be given requests again.'
        }
        confirmLabel={archive && archive.archived ? 'Archive' : 'Restore'}
        tone={archive && archive.archived ? 'danger' : 'primary'}
        onConfirm={async () => {
          await outsourceApi.setPartnerArchived(archive.ids, archive.archived);
          setArchive(null);
          notify(archive.archived ? 'Partner archived.' : 'Partner restored.');
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingPartner)}
        onClose={() => setDeletingPartner(null)}
        title={deletingPartner ? `Delete ${deletingPartner.name}?` : ''}
        description="This permanently deletes the partner and their profile history from the system. This cannot be undone. Past requests are kept and will show Removed partner. Complete or cancel any awaiting reply or accepted requests first."
        confirmLabel="Delete partner"
        tone="danger"
        onConfirm={async () => {
          await outsourceApi.deletePartner(deletingPartner.id);
          setDeletingPartner(null);
          notify('Partner permanently deleted.');
        }}
      />
    </>
  );
}

const blankItem = () => ({ name: '', qty: '', custom: false });
const OTHER_ITEM = '__other__';

function ContractDialog({ open, contract, prefill, partners, events, inventory, onClose, onSaved }) {
  const isPhone = useMediaQuery('(max-width:599px)');
  const [values, setValues] = useState({ partnerId: '', reservationRef: NO_EVENT, needBy: '', amount: '', notes: '' });
  const [items, setItems] = useState([blankItem()]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const id = contract && contract.id;

  useEffect(() => {
    if (!open) return;
    const asRow = (item) => ({
      name: item.name,
      qty: String(item.qty || ''),
      custom: Boolean(item.name) && !inventory.some((i) => i.name === item.name)
    });
    if (contract) {
      setValues({
        partnerId: contract.partnerId,
        reservationRef: contract.reservationRef,
        needBy: contract.needBy,
        amount: String(contract.amount || ''),
        notes: contract.notes
      });
      setItems(contract.items.map(asRow));
    } else {
      setValues({
        partnerId: prefill.partnerId || '',
        reservationRef: prefill.reservationRef || NO_EVENT,
        needBy: prefill.needBy || '',
        amount: '',
        notes: ''
      });
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
  const partnerChoices = partners.filter((p) => !p.archived || p.id === values.partnerId);
  const event = events.find((e) => e.ref === values.reservationRef);
  const itemOptions = [
    ...inventory.map((i) => ({ value: i.name, label: `${i.name} (${i.available} available)` })),
    { value: OTHER_ITEM, label: 'Other item…' }
  ];

  const save = async () => {
    setBusy(true);
    try {
      const saved = await outsourceApi.saveContract(id || null, {
        ...values,
        items,
        amount: Number(values.amount || 0)
      });
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
      title={id ? 'Edit Draft Request' : 'New Request'}
      description="Say what you need and when. The request text is written for you on the next step, and you can edit it before it goes out."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={save}>
            {id ? 'Save draft' : 'Save and review'}
          </BusyButton>
        </>
      }
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
          hint={
            partner
              ? `Reached by ${channelText(partner.channels).toLowerCase()}.`
              : 'Only partners with contact details can be sent a request.'
          }
          options={partnerChoices.map((p) => ({
            value: p.id,
            label: `${p.name} · ${p.service}${p.archived ? ' (archived)' : ''}`
          }))}
        />
        <SelectField
          id="contract-event"
          label="For which event"
          value={values.reservationRef}
          onChange={(e) => {
            const next = e.target.value;
            const chosen = events.find((ev) => ev.ref === next);
            setValues((v) => ({ ...v, reservationRef: next, needBy: v.needBy || (chosen ? chosen.date : '') }));
            setErrors({});
          }}
          error={errors.reservationRef}
          options={[
            { value: NO_EVENT, label: 'No event (e.g. topping up stock)' },
            ...events.map((e) => ({
              value: e.ref,
              label: `${formatDate(e.date)} · ${e.eventName} · ${e.rental ? 'equipment rental' : `${e.guests} pax`}`
            }))
          ]}
        />
      </Box>

      <Typography sx={{ mt: 2.5, mb: 1, fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>
        What You Need
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {items.map((item, index) => (
          <Box
            key={index}
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: item.custom ? '1.4fr 1.4fr 1fr auto' : '2.4fr 1fr auto' },
              gap: 1,
              alignItems: 'start'
            }}
          >
            <SelectField
              id={`contract-item-${index}`}
              label={isPhone || index === 0 ? 'Item' : undefined}
              required={isPhone || index === 0}
              placeholder="Choose an item"
              value={item.custom ? OTHER_ITEM : item.name}
              onChange={(e) => {
                const chosen = e.target.value;
                setItems((list) =>
                  list.map((row, i) =>
                    i === index
                      ? { ...row, custom: chosen === OTHER_ITEM, name: chosen === OTHER_ITEM ? '' : chosen }
                      : row
                  )
                );
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
              label={isPhone || index === 0 ? 'Quantity' : undefined}
              required={isPhone || index === 0}
              type="number"
              value={item.qty}
              onChange={setItem(index, 'qty')}
              inputProps={{ min: 1, 'aria-label': 'Quantity' }}
            />
            <IconButton
              aria-label="Remove item"
              disabled={items.length === 1 || busy}
              onClick={() => {
                setItems((list) => list.filter((_, i) => i !== index));
                setErrors({});
              }}
              sx={{ mt: { sm: index === 0 ? 3.25 : 0 }, justifySelf: { xs: 'start', sm: 'center' } }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Button
          startIcon={<AddRoundedIcon />}
          disabled={items.length >= 15 || busy}
          onClick={() => setItems((list) => [...list, blankItem()])}
          sx={{ alignSelf: 'flex-start' }}
        >
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
          onChange={(date) => {
            setValues((v) => ({ ...v, needBy: date }));
            setErrors({});
          }}
          error={errors.needBy}
          hint={event ? `${event.eventName} is on ${formatDate(event.date)}.` : 'When the items have to be with you.'}
        />
        <FormField
          id="contract-amount"
          label="Outsource price"
          optional
          type="number"
          value={values.amount}
          onChange={set('amount')}
          error={errors.amount}
          hint="The partner's own price for these items. Leave blank if you don't know it yet."
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

function PartnerDialog({ open, partner, onClose, onSaved }) {
  const [values, setValues] = useState({
    name: '',
    service: '',
    serviceOther: '',
    contactPerson: '',
    email: '',
    mobile: '',
    address: '',
    notes: ''
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const id = partner && partner.id;

  useEffect(() => {
    if (!open) return;
    setValues(
      partner
        ? {
            name: partner.name,
            ...outsourceApi.partnerServiceInput(partner.service),
            contactPerson: partner.contactPerson,
            email: partner.email,
            mobile: partner.mobile,
            address: partner.address,
            notes: partner.notes
          }
        : { name: '', service: '', serviceOther: '', contactPerson: '', email: '', mobile: '', address: '', notes: '' }
    );
    setErrors({});
  }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors({});
  };

  const save = async () => {
    const problem = outsourceApi.partnerProblem(values);
    if (problem) {
      setErrors({ [problem.meta.field]: problem.message });
      document.getElementById(`partner-${problem.meta.field}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      onSaved(await outsourceApi.savePartner(id || null, values), !id);
    } catch (e) {
      setErrors({ [(e.meta && e.meta.field) || 'name']: e.message });
    } finally {
      setBusy(false);
    }
  };

  const channels = values.email.trim() ? ['email'] : [];

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      busy={busy}
      maxWidth="sm"
      fullScreenOnMobile
      title={id ? 'Edit Partner' : 'Add Partner'}
      description="Requests go to the partner's email address."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={save}>
            {id ? 'Save partner' : 'Add partner'}
          </BusyButton>
        </>
      }
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.75 }}>
        <FormField
          id="partner-name"
          label="Partner name"
          required
          value={values.name}
          onChange={set('name')}
          error={errors.name}
          inputProps={{ maxLength: 80 }}
        />
        <SelectField
          id="partner-service"
          label="What they supply"
          required
          placeholder="Choose"
          value={values.service}
          onChange={set('service')}
          error={errors.service}
          options={OUTSOURCE_SERVICES}
        />
        {values.service === OUTSOURCE_OTHER && (
          <FormField
            id="partner-serviceOther"
            label="Specify what they supply"
            required
            autoComplete="off"
            value={values.serviceOther}
            onChange={set('serviceOther')}
            error={errors.serviceOther}
            inputProps={{ maxLength: OUTSOURCE_OTHER_RANGE.max }}
            placeholder="e.g. Photo booth, LED wall, or generators"
            hint={`Enter ${OUTSOURCE_OTHER_RANGE.min}–${OUTSOURCE_OTHER_RANGE.max} characters.`}
            sx={{ gridColumn: '1 / -1' }}
            disabled={busy}
          />
        )}
        <FormField
          id="partner-contactPerson"
          label="Contact person"
          required
          value={values.contactPerson}
          onChange={set('contactPerson')}
          error={errors.contactPerson}
          inputProps={{ maxLength: 60 }}
        />
        <FormField
          id="partner-address"
          label="Address"
          required
          value={values.address}
          onChange={set('address')}
          error={errors.address}
          inputProps={{ maxLength: 120 }}
        />
        <FormField
          id="partner-email"
          label="Email address"
          required
          type="email"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
          placeholder="name@example.com"
        />
        <MobileField
          id="partner-mobile"
          label="Mobile number"
          required
          value={values.mobile}
          onChange={set('mobile')}
          error={errors.mobile}
          hint={false}
          autoComplete="off"
        />
      </Box>
      <FormField
        id="partner-notes"
        label="Notes"
        optional
        multiline
        minRows={2}
        value={values.notes}
        onChange={set('notes')}
        error={errors.notes}
        inputProps={{ maxLength: 300 }}
        placeholder="Delivery terms, rates, how far ahead they need to be booked…"
        sx={{ mt: 1.75 }}
      />
      <Box sx={{ mt: 1.75 }}>
        {channels.length ? (
          <AlertBanner tone="info" title={`Requests go out by ${channelText(channels).toLowerCase()}`}>
            The request is sent to the email address on file.
          </AlertBanner>
        ) : (
          <AlertBanner tone="locked" title="Email address required">
            Add an email address so requests can be sent.
          </AlertBanner>
        )}
      </Box>
    </AppDialog>
  );
}

function SendDialog({ contract, onClose, onSent }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = contract && contract.id;

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

  const canSend = contract.channels.includes('email');

  return (
    <AppDialog
      open
      onClose={onClose}
      busy={busy}
      maxWidth="md"
      fullScreenOnMobile
      title={`Send ${contract.ref}`}
      description={`To ${contract.partnerName} · ${contract.itemsSummary}`}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Close
          </Button>
          <BusyButton busy={busy} disabled={!canSend} startIcon={<SendRoundedIcon />} onClick={send}>
            {contract.sentAt ? 'Send again' : 'Send request'}
          </BusyButton>
        </>
      }
    >
      {canSend ? (
        <Box
          sx={{
            mb: 2,
            p: 1.75,
            borderRadius: 1.5,
            backgroundColor: tokens.surfaceMuted,
            display: 'flex',
            flexDirection: 'column',
            gap: 1
          }}
        >
          {contract.channels.includes('email') && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MailOutlineRoundedIcon sx={{ fontSize: 18, color: tokens.blue }} />
              <Typography sx={{ fontSize: 13 }}>
                Email to <b>{contract.partnerEmail}</b>
              </Typography>
            </Box>
          )}
          <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>
            The email carries the text below, word for word.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ mb: 2 }}>
          <AlertBanner tone="locked" title="Email address required">
            {contract.partnerName} needs a valid email address. Add one on the Partners tab first.
          </AlertBanner>
        </Box>
      )}

      <FormField
        id="send-body"
        label="Request text"
        required
        multiline
        minRows={12}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setError('');
        }}
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

function DetailsDialog({ contract, onClose, onAction, savingPdf }) {
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
          <Button
            startIcon={<PictureAsPdfOutlinedIcon />}
            disabled={savingPdf}
            onClick={() => onAction('savePdf', contract)}
          >
            {savingPdf ? 'Saving…' : 'Save PDF'}
          </Button>
          {contract.status === 'draft' && (
            <Button
              variant="outlined"
              onClick={() => {
                onClose();
                onAction('edit', contract);
              }}
            >
              Edit draft
            </Button>
          )}
          {['draft', 'sent'].includes(contract.status) && (
            <Button
              variant="contained"
              startIcon={<SendRoundedIcon />}
              onClick={() => {
                onClose();
                onAction('send', contract);
              }}
            >
              {contract.status === 'draft' ? 'Review and send' : 'Send again'}
            </Button>
          )}
          {contract.status === 'sent' && (
            <Button
              variant="contained"
              onClick={() => {
                onClose();
                onAction('accepted', contract);
              }}
            >
              Partner accepted
            </Button>
          )}
          {contract.status === 'accepted' && (
            <Button
              variant="contained"
              onClick={() => {
                onClose();
                onAction('completed', contract);
              }}
            >
              Mark delivered
            </Button>
          )}
        </>
      }
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.75, mb: 2 }}>
        <Field label="Status">
          <Pill size="sm" label={chip.label} bg={chip.bg} fg={chip.fg} />
        </Field>
        <Field label="Items">{contract.itemsSummary}</Field>
        <Field label="Outsource price">{contract.amount > 0 ? peso(contract.amount) : 'Not settled'}</Field>
        <Field label="Event">{contract.eventName || 'No event linked'}</Field>
        <Field label="Event date">{contract.eventDate ? formatDate(contract.eventDate) : '—'}</Field>
        <Field label="Date needed">{formatDate(contract.needBy)}</Field>
        <Field label="Contact person">{contract.contactPerson}</Field>
        <Field label="Email">{contract.partnerEmail}</Field>
        <Field label="Mobile">{contract.partnerMobile ? formatMobile(contract.partnerMobile) : ''}</Field>
      </Box>

      {contract.answerNote && (
        <Box sx={{ mb: 2 }}>
          <AlertBanner
            tone={contract.status === 'declined' || contract.status === 'cancelled' ? 'locked' : 'info'}
            title={contract.status === 'cancelled' ? 'Why it was cancelled' : 'What the partner said'}
          >
            {contract.answerNote}
          </AlertBanner>
        </Box>
      )}

      <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.75 }}>
        {contract.sentAt ? 'What was sent' : 'Not sent yet'}
      </Typography>
      {contract.sentAt ? (
        <>
          <Box
            sx={{
              p: 1.75,
              borderRadius: 1.5,
              backgroundColor: tokens.surfaceMuted,
              whiteSpace: 'pre-wrap',
              fontSize: 13,
              lineHeight: 1.7,
              color: tokens.textPrimary
            }}
          >
            {contract.body}
          </Box>
          <Box sx={{ mt: 1.25, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {contract.deliveries.map((d, i) => (
              <Typography key={i} sx={{ fontSize: 12.5, color: tokens.textMuted }}>
                {d.channel === 'email' ? 'Email' : 'Previous delivery'} to {d.to} · {formatDateTime(d.at)}
              </Typography>
            ))}
          </Box>
        </>
      ) : (
        <Typography sx={{ fontSize: 13, color: tokens.textMuted }}>
          The request text is written when you send it, and the email carries it word for word.
        </Typography>
      )}

      <Divider sx={{ my: 2 }} />
      <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.75 }}>History</Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[...contract.history].reverse().map((entry, i) => (
          <Box key={i}>
            <Typography sx={{ fontSize: 13, color: tokens.textPrimary }}>{entry.text}</Typography>
            <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>
              {entry.actor} · {formatDateTime(entry.at)}
            </Typography>
          </Box>
        ))}
      </Box>
    </AppDialog>
  );
}

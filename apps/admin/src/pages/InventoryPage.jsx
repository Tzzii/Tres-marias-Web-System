import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  ConfirmDialog,
  DashCard,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FormField,
  INVENTORY_CATEGORIES,
  PageHeader,
  Pager,
  Pill,
  SearchField,
  SelectField,
  StatCard,
  formatDate,
  formatDateTime,
  inventoryApi,
  peso,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useColumnChoice } from '../lib/columns.js';

const PAGE_SIZE = 10;
const NO_EVENT = inventoryApi.NO_EVENT;

// Status filter options as [key, label, test]; archived items only appear under "Archived"
const STATUSES = [
  ['all', 'All', () => true],
  ['in_stock', 'In stock', (i) => i.stock === 'ok'],
  ['low', 'Low stock', (i) => i.stock === 'low'],
  ['out', 'Out of stock', (i) => i.stock === 'out'],
  ['in_use', 'In use', (i) => i.inUse > 0],
  ['damaged', 'With damaged', (i) => i.damaged > 0],
  ['rentable', 'For rent', (i) => i.rentable],
  ['archived', 'Archived', () => true]
];

// Columns the admin can show or hide with "Filter columns", as [key, label]
const OPTIONAL_COLUMNS = [
  ['category', 'Category'],
  ['total', 'Total'],
  ['available', 'Available'],
  ['inUse', 'In use'],
  ['rent', 'Rent price'],
  ['condition', 'Condition']
];
const COLUMNS_KEY = 'tm.admin.inventory.columns'; // this browser remembers the admin's column choice

// Title, description and button label of each stock action dialog
const ACTIONS = {
  checkout: { title: 'Check out', description: 'Take available pieces out for an event. They count as In use until returned.', button: 'Check out' },
  return: { title: 'Return', description: 'Record pieces coming back. Damaged pieces go to Damaged instead of Available.', button: 'Record return' },
  damage: { title: 'Report damage', description: 'Move available pieces to Damaged so they are not checked out.', button: 'Report damage' },
  repair: { title: 'Mark repaired', description: 'Move repaired pieces from Damaged back to Available.', button: 'Mark repaired' },
  dispose: { title: 'Dispose of damaged', description: 'Remove damaged pieces that cannot be repaired. The total goes down.', button: 'Dispose' }
};

/**
 * Equipment inventory (from the Logistics wireframe): what Tres Marias owns, what is out at events and what is damaged.
 * Items can also be offered for rent through the Equipment Rental package: the Rent price column shows each
 * one's price per piece and damage fee, and the "For rent" filter lists only those.
 * Top: four summary cards (click one to filter). Card: search by name or code, Category and Status filters,
 * "Filter columns" to show/hide columns, then a paged table with checkboxes (bulk archive/restore) and a ⋮ menu per item
 * (details, edit, check out, return, report damage, repair, dispose, request from an outsourcing partner, archive).
 * Clicking a row opens its details and history.
 * Check-outs and returns linked to a reservation also appear in that reservation's audit trail.
 */
export default function InventoryPage() {
  useDocumentTitle('Inventory', 'Tres Marias Admin');
  const navigate = useNavigate();
  const notify = useNotify();
  // Load every item (archived included, for the Archived filter) and the reservations equipment can go to
  const { data, loading, error, reload } = useResource(async () => {
    const [items, events] = await Promise.all([inventoryApi.listInventory({ includeArchived: true }), inventoryApi.listCheckoutEvents()]);
    return { items, events };
  }, []);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]); // IDs ticked for bulk archive/restore
  const [columns, setColumns] = useColumnChoice(COLUMNS_KEY, OPTIONAL_COLUMNS); // { category: true, total: true, ... }
  const [columnsAnchor, setColumnsAnchor] = useState(null); // "Filter columns" menu
  const [rowMenu, setRowMenu] = useState(null); // { anchor, item } for the ⋮ menu
  const [adding, setAdding] = useState(false); // Add item(s) dialog open
  const [editingId, setEditingId] = useState(null); // item in the edit dialog
  const [stock, setStock] = useState(null); // { action, id } for a stock action dialog
  const [detailsId, setDetailsId] = useState(null); // item in the details dialog
  const [archive, setArchive] = useState(null); // { ids, archived } waiting for confirmation

  // Back to page 1 and nothing ticked whenever the filters change
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [query, category, status]);

  const items = data ? data.items : [];
  const active = items.filter((i) => !i.archived);
  // Look up items by ID from the latest data, so open dialogs show fresh numbers after a change
  const byId = (id) => items.find((i) => i.id === id) || null;

  // Summary figures (active items only)
  const totals = useMemo(() => {
    const sum = (key) => active.reduce((s, i) => s + i[key], 0);
    return {
      total: sum('total'),
      available: sum('available'),
      inUse: sum('inUse'),
      damaged: sum('damaged'),
      low: active.filter((i) => i.stock === 'low').length,
      out: active.filter((i) => i.stock === 'out').length,
      withDamaged: active.filter((i) => i.damaged > 0).length
    };
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply the status, category and search (name or code, spaces ignored)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s/g, '');
    const test = STATUSES.find(([key]) => key === status)[2];
    return items
      .filter((i) => (status === 'archived' ? i.archived : !i.archived))
      .filter(test)
      .filter((i) => category === 'all' || i.category === category)
      .filter((i) => !q || [i.name, i.code].some((v) => v.toLowerCase().replace(/\s/g, '').includes(q)));
  }, [items, query, category, status]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // If a change empties the last page, step back to the previous one
  useEffect(() => {
    if (page > 1 && (page - 1) * PAGE_SIZE >= filtered.length) setPage(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  }, [filtered.length, page]);

  const ticked = pageRows.filter((i) => selected.includes(i.id));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // Open a dialog from the ⋮ menu or the details dialog
  const openAction = (action, item) => {
    setRowMenu(null);
    if (action === 'details') setDetailsId(item.id);
    else if (action === 'edit') setEditingId(item.id);
    else if (action === 'archive' || action === 'restore') setArchive({ ids: [item.id], archived: action === 'archive' });
    // Renting this item in: start a contract on the Outsourcing page with the item, and how many
    // are missing when stock is low or out, already filled in
    else if (action === 'outsource') {
      const short = item.stock === 'ok' ? 0 : Math.max(1, item.lowStockAt - item.available);
      navigate(`/outsource?item=${encodeURIComponent(item.name)}${short ? `&qty=${short}` : ''}`);
    } else setStock({ action, id: item.id });
  };

  // Table columns; optional ones follow the "Filter columns" choice
  const tableColumns = [
    {
      key: 'select',
      width: 48,
      label: (
        <Checkbox
          size="small"
          checked={pageRows.length > 0 && ticked.length === pageRows.length}
          indeterminate={ticked.length > 0 && ticked.length < pageRows.length}
          onChange={(e) => setSelected(e.target.checked ? pageRows.map((i) => i.id) : [])}
          inputProps={{ 'aria-label': 'Select all on this page' }}
        />
      ),
      render: (i) => <Checkbox size="small" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} inputProps={{ 'aria-label': `Select ${i.name}` }} />
    },
    { key: 'name', label: 'Item name or code', render: (i) => (<Box><Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{i.name}</Typography><Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{i.code}</Typography></Box>) },
    columns.category && { key: 'category', label: 'Category', render: (i) => i.category },
    columns.total && { key: 'total', label: 'Total', align: 'right', render: (i) => i.total },
    columns.available && {
      key: 'available',
      label: 'Available',
      align: 'right',
      // Red when none are left, amber at or below the alert level
      render: (i) => (
        <Box>
          <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700, color: i.archived ? tokens.textMuted : i.stock === 'out' ? tokens.redPress : i.stock === 'low' ? '#b45309' : tokens.textPrimary }}>{i.available}</Typography>
          {!i.archived && i.stock !== 'ok' && <Typography sx={{ fontSize: 11, fontWeight: 700, color: i.stock === 'out' ? tokens.redPress : '#b45309' }}>{i.stock === 'out' ? 'Out of stock' : 'Low stock'}</Typography>}
        </Box>
      )
    },
    columns.inUse && { key: 'inUse', label: 'In use', align: 'right', render: (i) => i.inUse },
    columns.rent && {
      key: 'rent',
      label: 'Rent price',
      align: 'right',
      // Price per piece with the damage fee underneath, or a dash for items only our team uses
      render: (i) =>
        i.rentable ? (
          <Box>
            <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700 }}>{peso(i.rentPrice)}</Typography>
            <Typography sx={{ fontSize: 11, color: tokens.textMuted }}>damage {peso(i.damageFee)}</Typography>
          </Box>
        ) : (
          <Typography component="span" sx={{ fontSize: 12.5, color: tokens.textMuted }}>Not for rent</Typography>
        )
    },
    columns.condition && {
      key: 'condition',
      label: 'Condition',
      render: (i) => (i.archived ? <Pill size="sm" label="Archived" bg={tokens.surfaceMuted} fg={tokens.textMuted} dot={false} /> : i.damaged > 0 ? <Pill size="sm" label={`${i.damaged} damaged`} bg="rgba(245,158,11,0.14)" fg="#b45309" /> : <Pill size="sm" label="Good" bg="rgba(16,185,129,0.12)" fg="#047857" />)
    },
    { key: 'actions', label: 'Actions', align: 'right', width: 72, render: (i) => <IconButton size="small" aria-label={`Actions for ${i.name}`} onClick={(e) => setRowMenu({ anchor: e.currentTarget, item: i })}><MoreVertRoundedIcon fontSize="small" /></IconButton> }
  ].filter(Boolean);

  if (error) return <DashCard><ErrorState error={error} onRetry={reload} /></DashCard>;

  const menuItem = rowMenu && rowMenu.item;

  return (
    <>
      <PageHeader
        title="Equipment inventory"
        subtitle="What you own, what is out at events and what needs repair."
        actions={<Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setAdding(true)}>Add item(s)</Button>}
      />

      {/* Summary cards; clicking one filters the table */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 2.5, mb: 2.5 }}>
        <StatCard icon={Inventory2OutlinedIcon} tone="gold" label="Total items" value={`${totals.total.toLocaleString('en-PH')} pcs`} meta={`${active.length} item types`} loading={loading} onClick={() => setStatus('all')} />
        <StatCard icon={CheckCircleOutlineRoundedIcon} tone="green" label="Available items" value={`${totals.available.toLocaleString('en-PH')} pcs`} meta={`${totals.low} low · ${totals.out} out of stock`} loading={loading} onClick={() => setStatus('in_stock')} />
        <StatCard icon={LocalShippingOutlinedIcon} tone="blue" label="In use items" value={`${totals.inUse.toLocaleString('en-PH')} pcs`} meta="Out at events" loading={loading} onClick={() => setStatus('in_use')} />
        <StatCard icon={BuildOutlinedIcon} tone="amber" label="Damaged items" value={`${totals.damaged.toLocaleString('en-PH')} pcs`} meta={`${totals.withDamaged} item types need repair`} loading={loading} onClick={() => setStatus('damaged')} />
      </Box>

      <DashCard>
        {/* Toolbar: search, Category, Status and Filter columns */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center', mb: 2 }}>
          <SearchField id="inventory-search" value={query} onChange={setQuery} placeholder="Search item name or code" sx={{ flex: '1 1 240px' }} />
          <TextField select size="small" value={category} onChange={(e) => setCategory(e.target.value)} inputProps={{ 'aria-label': 'Category' }} sx={{ minWidth: 170 }}>
            <MenuItem value="all">Category: All</MenuItem>
            {INVENTORY_CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField select size="small" value={status} onChange={(e) => setStatus(e.target.value)} inputProps={{ 'aria-label': 'Status' }} sx={{ minWidth: 160 }}>
            {STATUSES.map(([key, label]) => <MenuItem key={key} value={key}>{key === 'all' ? 'Status: All' : label}</MenuItem>)}
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
        </Box>

        {/* Bulk bar, shown when rows are ticked */}
        {ticked.length > 0 && (
          <Box sx={{ mb: 2, px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', borderRadius: 1.5, backgroundColor: tokens.ink, color: tokens.onInk }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, mr: 'auto' }}>{ticked.length} selected</Typography>
            {status === 'archived' ? (
              <Button size="small" variant="contained" sx={{ bgcolor: tokens.gold, color: tokens.onGold, '&:hover': { bgcolor: tokens.goldLight } }} onClick={() => setArchive({ ids: ticked.map((i) => i.id), archived: false })}>Restore selected</Button>
            ) : (
              <Button size="small" sx={{ color: tokens.dangerOnInk }} onClick={() => setArchive({ ids: ticked.map((i) => i.id), archived: true })}>Archive selected</Button>
            )}
            <Button size="small" sx={{ color: tokens.onInk }} onClick={() => setSelected([])}>Clear</Button>
          </Box>
        )}

        <DataTable
          loading={loading}
          columns={tableColumns}
          rows={pageRows}
          rowKey={(i) => i.id}
          onRowClick={(i) => setDetailsId(i.id)}
          minWidth={920}
          empty={<EmptyState compact title={status === 'archived' ? 'Nothing archived' : 'No items match'} description={status === 'archived' ? 'Archived items appear here and can be restored.' : 'Try another search, category or status.'} />}
        />
        {!loading && filtered.length > 0 && <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />}

        {/* ⋮ menu for one item; options depend on its counts */}
        <Menu anchorEl={rowMenu && rowMenu.anchor} open={Boolean(rowMenu)} onClose={() => setRowMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          {menuItem && [
            <MenuItem key="details" onClick={() => openAction('details', menuItem)}>View details and history</MenuItem>,
            ...(menuItem.archived
              ? [<MenuItem key="restore" onClick={() => openAction('restore', menuItem)}>Restore</MenuItem>]
              : [
                  <MenuItem key="edit" onClick={() => openAction('edit', menuItem)}>Edit</MenuItem>,
                  <Divider key="d1" />,
                  <MenuItem key="checkout" disabled={menuItem.available < 1} onClick={() => openAction('checkout', menuItem)}>Check out</MenuItem>,
                  <MenuItem key="return" disabled={menuItem.inUse < 1} onClick={() => openAction('return', menuItem)}>Return</MenuItem>,
                  <MenuItem key="damage" disabled={menuItem.available < 1} onClick={() => openAction('damage', menuItem)}>Report damage</MenuItem>,
                  <MenuItem key="repair" disabled={menuItem.damaged < 1} onClick={() => openAction('repair', menuItem)}>Mark repaired</MenuItem>,
                  <MenuItem key="dispose" disabled={menuItem.damaged < 1} onClick={() => openAction('dispose', menuItem)}>Dispose of damaged</MenuItem>,
                  <Divider key="d2" />,
                  <MenuItem key="outsource" onClick={() => openAction('outsource', menuItem)}>Request from a partner</MenuItem>,
                  <Divider key="d3" />,
                  <MenuItem key="archive" disabled={menuItem.inUse > 0} onClick={() => openAction('archive', menuItem)} sx={{ color: tokens.redPress }}>
                    {menuItem.inUse > 0 ? 'Archive (return pieces first)' : 'Archive'}
                  </MenuItem>
                ])
          ]}
        </Menu>
      </DashCard>

      <AddItemsDialog open={adding} onClose={() => setAdding(false)} onSaved={(created) => { setAdding(false); notify(created.length === 1 ? `${created[0].name} added.` : `${created.length} items added.`); }} />
      <EditItemDialog item={byId(editingId)} onClose={() => setEditingId(null)} onSaved={() => { setEditingId(null); notify('Item saved.'); }} />
      <StockDialog
        action={stock && stock.action}
        item={stock && byId(stock.id)}
        events={data ? data.events : []}
        onClose={() => setStock(null)}
        onDone={(message) => { setStock(null); notify(message); }}
      />
      <DetailsDialog item={byId(detailsId)} onClose={() => setDetailsId(null)} onAction={openAction} />

      <ConfirmDialog
        open={Boolean(archive)}
        onClose={() => setArchive(null)}
        title={archive ? `${archive.archived ? 'Archive' : 'Restore'} ${archive.ids.length === 1 ? (byId(archive.ids[0]) || {}).name : `${archive.ids.length} items`}?` : ''}
        description={archive && archive.archived ? 'Archived items leave the list and the totals, and cannot be checked out. Their history is kept and they can be restored.' : 'The items return to the list and the totals.'}
        confirmLabel={archive && archive.archived ? 'Archive' : 'Restore'}
        tone={archive && archive.archived ? 'danger' : 'primary'}
        // Archive or restore, then clear the ticked rows
        onConfirm={async () => {
          const { ids, archived } = archive;
          await inventoryApi.setInventoryArchived(ids, archived);
          setArchive(null);
          setSelected([]);
          notify(`${ids.length === 1 ? 'Item' : `${ids.length} items`} ${archived ? 'archived' : 'restored'}.`);
        }}
      />
    </>
  );
}

// A blank row in the Add item(s) dialog
const blankRow = () => ({ name: '', category: '', total: '', lowStockAt: '', rentPrice: '', damageFee: '' });

/**
 * Add one or more items at once. Each row: name, category, quantity, low-stock alert level, and the
 * rental price and damage fee for items customers can rent. A blank alert level defaults to 10% of
 * the quantity; a blank rent price means the item is not for rent. All rows are checked before anything is saved.
 */
function AddItemsDialog({ open, onClose, onSaved }) {
  const isPhone = useMediaQuery('(max-width:599px)');
  const [rows, setRows] = useState([blankRow()]);
  const [error, setError] = useState(null); // { row, field, message }
  const [busy, setBusy] = useState(false);

  // Start with one empty row each time the dialog opens
  useEffect(() => {
    if (open) {
      setRows([blankRow()]);
      setError(null);
    }
  }, [open]);

  const set = (index, field) => (e) => {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, [field]: e.target.value } : row)));
    setError(null);
  };
  // Error message for one field of one row
  const errorFor = (index, field) => (error && error.row === index && error.field === field ? error.message : undefined);

  const save = async () => {
    // Turn the text inputs into numbers; the alert level defaults to 10% of the quantity
    const items = rows.map((row) => {
      const total = Number(row.total);
      const rentable = row.rentPrice !== '';
      return {
        name: row.name,
        category: row.category,
        total,
        lowStockAt: row.lowStockAt === '' ? Math.floor(total * 0.1) : Number(row.lowStockAt),
        rentable,
        rentPrice: rentable ? Number(row.rentPrice) : 0,
        damageFee: rentable ? Number(row.damageFee) || 0 : 0
      };
    });
    setBusy(true);
    try {
      onSaved(await inventoryApi.addInventoryItems(items));
    } catch (e) {
      setError({ row: e.meta && e.meta.row !== undefined ? e.meta.row : 0, field: (e.meta && e.meta.field) || 'name', message: e.message });
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
      title="Add item(s)"
      description="New items start fully available with no damage. Leave the alert level blank to use 10% of the quantity, and the rent price blank for items customers can't rent."
      actions={<><Button onClick={onClose} disabled={busy}>Cancel</Button><BusyButton busy={busy} onClick={save}>{rows.length === 1 ? 'Add item' : `Add ${rows.length} items`}</BusyButton></>}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {rows.map((row, index) => (
          <Box key={index} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '2fr 1.4fr 0.9fr 0.9fr 0.9fr 0.9fr auto' }, gap: 1, alignItems: 'start', pb: { xs: 1.5, sm: 0 }, borderBottom: { xs: `1px solid ${tokens.cardLightBorder}`, sm: 0 } }}>
            {/* Labels on the first row only on wide screens; on every row on phones */}
            <FormField id={`add-name-${index}`} label={isPhone || index === 0 ? 'Item name' : undefined} required={isPhone || index === 0} value={row.name} onChange={set(index, 'name')} error={errorFor(index, 'name')} inputProps={{ 'aria-label': 'Item name', maxLength: 80 }} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
            <SelectField id={`add-cat-${index}`} label={isPhone || index === 0 ? 'Category' : undefined} required={isPhone || index === 0} placeholder="Choose" value={row.category} onChange={set(index, 'category')} options={INVENTORY_CATEGORIES} error={errorFor(index, 'category')} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
            <FormField id={`add-total-${index}`} label={isPhone || index === 0 ? 'Quantity' : undefined} required={isPhone || index === 0} type="number" value={row.total} onChange={set(index, 'total')} error={errorFor(index, 'total')} inputProps={{ min: 1, 'aria-label': 'Quantity' }} />
            <FormField id={`add-low-${index}`} label={isPhone || index === 0 ? 'Alert at' : undefined} type="number" value={row.lowStockAt} onChange={set(index, 'lowStockAt')} error={errorFor(index, 'lowStockAt')} inputProps={{ min: 0, 'aria-label': 'Low-stock alert level' }} />
            {/* For rent only when a rent price is typed */}
            <FormField id={`add-rent-${index}`} label={isPhone || index === 0 ? 'Rent ₱' : undefined} type="number" value={row.rentPrice} onChange={set(index, 'rentPrice')} error={errorFor(index, 'rentPrice')} inputProps={{ min: 1, 'aria-label': 'Rent price per piece' }} />
            <FormField id={`add-fee-${index}`} label={isPhone || index === 0 ? 'Damage ₱' : undefined} type="number" value={row.damageFee} onChange={set(index, 'damageFee')} error={errorFor(index, 'damageFee')} disabled={row.rentPrice === ''} inputProps={{ min: 0, 'aria-label': 'Damage fee per piece' }} />
            <IconButton aria-label="Remove row" disabled={rows.length === 1 || busy} onClick={() => { setRows((r) => r.filter((_, i) => i !== index)); setError(null); }} sx={{ mt: { sm: index === 0 ? 3.25 : 0 }, justifySelf: { xs: 'start', sm: 'center' } }}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        <Button startIcon={<AddRoundedIcon />} disabled={rows.length >= 20 || busy} onClick={() => setRows((r) => [...r, blankRow()])} sx={{ alignSelf: 'flex-start' }}>
          Add another row
        </Button>
      </Box>
    </AppDialog>
  );
}

/**
 * Edit one item's name, category, total, low-stock alert level, rental settings and notes.
 * A new rent price or damage fee only applies to rentals booked from now on; bookings already made keep theirs.
 */
function EditItemDialog({ item, onClose, onSaved }) {
  const [values, setValues] = useState({ name: '', category: '', total: '', lowStockAt: '', rentable: false, rentPrice: '', damageFee: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const id = item && item.id;

  // Fill the form when a different item opens
  useEffect(() => {
    if (item) {
      setValues({ name: item.name, category: item.category, total: String(item.total), lowStockAt: String(item.lowStockAt), rentable: Boolean(item.rentable), rentPrice: item.rentPrice ? String(item.rentPrice) : '', damageFee: item.damageFee ? String(item.damageFee) : '', notes: item.notes });
      setErrors({});
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Change handler for one field (the "For rent" switch sends checked instead of a value)
  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
    setErrors({});
  };

  const save = async () => {
    setBusy(true);
    try {
      await inventoryApi.updateInventoryItem(id, { ...values, total: Number(values.total), lowStockAt: Number(values.lowStockAt), rentPrice: Number(values.rentPrice), damageFee: Number(values.damageFee) || 0 });
      onSaved();
    } catch (e) {
      setErrors({ [(e.meta && e.meta.field) || 'name']: e.message });
    } finally {
      setBusy(false);
    }
  };

  const minimum = item ? item.inUse + item.damaged : 0;
  return (
    <AppDialog open={Boolean(item)} onClose={onClose} busy={busy} maxWidth="sm" title={item ? `Edit ${item.code}` : ''} actions={<><Button onClick={onClose} disabled={busy}>Cancel</Button><BusyButton busy={busy} onClick={save}>Save changes</BusyButton></>}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <FormField id="edit-name" label="Item name" required value={values.name} onChange={set('name')} error={errors.name} inputProps={{ maxLength: 80 }} sx={{ gridColumn: { sm: '1 / -1' } }} />
        <SelectField id="edit-category" label="Category" required value={values.category} onChange={set('category')} options={INVENTORY_CATEGORIES} error={errors.category} sx={{ gridColumn: { sm: '1 / -1' } }} />
        <FormField id="edit-total" label="Total owned" required type="number" value={values.total} onChange={set('total')} error={errors.total} hint={minimum ? `At least ${minimum} (in use + damaged)` : undefined} inputProps={{ min: Math.max(1, minimum) }} />
        <FormField id="edit-low" label="Low-stock alert at" required type="number" value={values.lowStockAt} onChange={set('lowStockAt')} error={errors.lowStockAt} hint="Flagged when available is at or below this" inputProps={{ min: 0 }} />
        {/* Offered through the Equipment Rental package */}
        <FormControlLabel sx={{ gridColumn: { sm: '1 / -1' } }} control={<Switch checked={values.rentable} onChange={set('rentable')} />} label={<Typography sx={{ fontSize: 13.5 }}>Customers can rent this item</Typography>} />
        {values.rentable && (
          <>
            <FormField id="edit-rent" label="Rent price per piece" required type="number" value={values.rentPrice} onChange={set('rentPrice')} error={errors.rentPrice} hint="Applies to rentals booked from now on" InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} inputProps={{ min: 1 }} />
            <FormField id="edit-fee" label="Damage fee per piece" type="number" value={values.damageFee} onChange={set('damageFee')} error={errors.damageFee} hint="Charged for each piece that comes back damaged or missing" InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }} inputProps={{ min: 0 }} />
          </>
        )}
        <FormField id="edit-notes" label="Notes" optional multiline minRows={2} value={values.notes} onChange={set('notes')} inputProps={{ maxLength: 300 }} placeholder="Supplier, storage place, care instructions…" sx={{ gridColumn: { sm: '1 / -1' } }} />
      </Box>
    </AppDialog>
  );
}

/**
 * One dialog for every stock action (check out, return, report damage, repair, dispose).
 * Fields change with the action; quantities are pre-filled with the most likely amount
 * and can't be set above what the action allows (see maxFor).
 */
function StockDialog({ action, item, events, onClose, onDone }) {
  const [values, setValues] = useState({ ref: NO_EVENT, qty: '', damagedQty: '0', note: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const open = Boolean(action && item);
  const id = item && item.id;

  // Pre-fill when the dialog opens: return defaults to the first place with pieces out and all of them back
  useEffect(() => {
    if (!open) return;
    const firstOut = item.out[0];
    setValues({
      ref: action === 'return' && firstOut ? firstOut.ref : NO_EVENT,
      qty: action === 'return' && firstOut ? String(firstOut.qty) : action === 'repair' ? String(item.damaged) : '',
      damagedQty: '0',
      note: ''
    });
    setErrors({});
  }, [open, action, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return <AppDialog open={false} onClose={onClose} title="" />;

  // How many pieces are out at a place (an event ref or "no event")
  const outAt = (ref) => (item.out.find((o) => o.ref === ref) || { qty: 0 }).qty;

  /**
   * Highest number a quantity field accepts:
   * check out / report damage → available pieces; repair / dispose → damaged pieces;
   * return → pieces out at that place, minus what is already typed in the other return field.
   */
  const maxFor = (field, v) => {
    if (action === 'return') return Math.max(0, outAt(v.ref) - (Number(field === 'qty' ? v.damagedQty : v.qty) || 0));
    return action === 'repair' || action === 'dispose' ? item.damaged : item.available;
  };

  const set = (field) => (e) => {
    const value = e.target.value;
    setValues((v) => {
      const next = { ...v, [field]: value };
      // Switching the return source fills in everything out at that place
      if (action === 'return' && field === 'ref') next.qty = String(outAt(value));
      // A quantity above the limit is lowered to the limit, e.g. typing 11 when only 3 are damaged becomes 3
      if ((field === 'qty' || field === 'damagedQty') && value !== '' && Number(value) > maxFor(field, next)) {
        next[field] = String(maxFor(field, next));
      }
      return next;
    });
    setErrors({});
  };

  const outAtRef = outAt(values.ref);
  const needsNote = action === 'damage' || action === 'dispose';

  const submit = async () => {
    setBusy(true);
    try {
      await inventoryApi.moveInventoryStock(item.id, action, { ref: values.ref, qty: Number(values.qty), damagedQty: Number(values.damagedQty) || 0, note: values.note });
      const qty = Number(values.qty) + (action === 'return' ? Number(values.damagedQty) || 0 : 0);
      onDone(`${ACTIONS[action].title}: ${qty} ${item.name}.`);
    } catch (e) {
      setErrors({ [(e.meta && e.meta.field) || 'qty']: e.message });
    } finally {
      setBusy(false);
    }
  };

  // Label for a place pieces are out: the event, or "No event linked"
  const placeLabel = (o) => (o.ref === NO_EVENT ? `No event linked · ${o.qty} out` : `${o.eventName || o.ref} · ${formatDate(o.eventDate)} · ${o.qty} out`);

  return (
    <AppDialog
      open
      onClose={onClose}
      busy={busy}
      maxWidth="xs"
      title={`${ACTIONS[action].title} · ${item.name}`}
      description={ACTIONS[action].description}
      actions={<><Button onClick={onClose} disabled={busy}>Cancel</Button><BusyButton busy={busy} color={action === 'dispose' ? 'error' : 'primary'} onClick={submit}>{ACTIONS[action].button}</BusyButton></>}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, p: 1.25, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
          <Field label="Available">{String(item.available)}</Field>
          <Field label="In use">{String(item.inUse)}</Field>
          <Field label="Damaged">{String(item.damaged)}</Field>
        </Box>

        {action === 'checkout' && (
          <SelectField
            id="stock-event"
            label="For event"
            value={values.ref}
            onChange={set('ref')}
            error={errors.ref}
            options={[{ value: NO_EVENT, label: 'No event (e.g. lending, off-site use)' }, ...events.map((e) => ({ value: e.ref, label: `${formatDate(e.date)} · ${e.eventName} · ${e.rental ? 'equipment rental' : `${e.guests} pax`}` }))]}
            hint="Approved, downpayment-paid and confirmed reservations"
          />
        )}
        {action === 'return' && (
          <SelectField id="stock-from" label="Returned from" value={values.ref} onChange={set('ref')} error={errors.ref} options={item.out.map((o) => ({ value: o.ref, label: placeLabel(o) }))} />
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: action === 'return' ? '1fr 1fr' : '1fr', gap: 1.5 }}>
          <FormField
            id="stock-qty"
            label={action === 'return' ? 'Good condition' : 'Quantity'}
            required
            type="number"
            value={values.qty}
            onChange={set('qty')}
            error={errors.qty}
            autoFocus
            inputProps={{ min: action === 'return' ? 0 : 1, max: maxFor('qty', values) }}
            hint={action === 'checkout' || action === 'damage' ? `${item.available} available` : action === 'return' ? `${outAtRef} out there` : `${item.damaged} damaged`}
          />
          {action === 'return' && <FormField id="stock-damaged" label="Came back damaged" type="number" value={values.damagedQty} onChange={set('damagedQty')} inputProps={{ min: 0, max: maxFor('damagedQty', values) }} />}
        </Box>

        <FormField id="stock-note" label={needsNote ? 'Reason' : 'Note'} required={needsNote} optional={!needsNote} multiline minRows={2} value={values.note} onChange={set('note')} error={errors.note} inputProps={{ maxLength: 200 }} placeholder={action === 'damage' ? 'e.g. 3 legs cracked during unloading' : action === 'dispose' ? 'e.g. Beyond repair' : ''} />
        {action === 'checkout' && values.ref !== NO_EVENT && <AlertBanner tone="info">This check-out is also added to the reservation's audit trail.</AlertBanner>}
      </Box>
    </AppDialog>
  );
}

/** Item details: counts, where the in-use pieces are (with links to reservations), notes and the full history. */
function DetailsDialog({ item, onClose, onAction }) {
  const navigate = useNavigate();
  if (!item) return <AppDialog open={false} onClose={onClose} title="" />;

  return (
    <AppDialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullScreenOnMobile
      title={item.name}
      description={`${item.code} · ${item.category}${item.archived ? ' · Archived' : ''}`}
      actions={
        <>
          <Button onClick={onClose}>Close</Button>
          {!item.archived && (
            <>
              <Button variant="outlined" onClick={() => { onClose(); onAction('edit', item); }}>Edit</Button>
              <Button variant="outlined" disabled={item.inUse < 1} onClick={() => { onClose(); onAction('return', item); }}>Return</Button>
              <Button variant="contained" disabled={item.available < 1} onClick={() => { onClose(); onAction('checkout', item); }}>Check out</Button>
            </>
          )}
        </>
      }
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(5, 1fr)' }, gap: 1.5, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
        <Field label="Total">{String(item.total)}</Field>
        <Field label="Available">{String(item.available)}</Field>
        <Field label="In use">{String(item.inUse)}</Field>
        <Field label="Damaged">{String(item.damaged)}</Field>
        <Field label="Alert at">{String(item.lowStockAt)}</Field>
      </Box>
      <Typography sx={{ mt: 1.25, fontSize: 13, color: tokens.textSecondary }}>
        {item.rentable ? `For rent at ${peso(item.rentPrice)} per piece · damage fee ${peso(item.damageFee)}` : 'Not for rent: only our team uses this item.'}
      </Typography>

      <Typography sx={{ mt: 2.5, mb: 1, fontSize: 14, fontWeight: 700 }}>Currently out</Typography>
      {item.out.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>Nothing is checked out.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {item.out.map((o) => (
            <ButtonBase
              key={o.ref}
              disabled={o.ref === NO_EVENT}
              onClick={() => { onClose(); navigate(`/reservations/${o.ref}`); }}
              sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, p: 1.25, textAlign: 'left', fontFamily: 'inherit', borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, '&:hover': { borderColor: '#94a3b8' } }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>{o.ref === NO_EVENT ? 'No event linked' : o.eventName || o.ref}</Typography>
                {o.ref !== NO_EVENT && <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{o.ref} · {formatDate(o.eventDate)}</Typography>}
              </Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary, whiteSpace: 'nowrap' }}>{o.qty} pcs</Typography>
            </ButtonBase>
          ))}
        </Box>
      )}

      {item.notes && (
        <>
          <Typography sx={{ mt: 2.5, mb: 0.5, fontSize: 14, fontWeight: 700 }}>Notes</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.textSecondary, whiteSpace: 'pre-line' }}>{item.notes}</Typography>
        </>
      )}

      {/* Damage actions; each button is off when it has nothing to act on */}
      {!item.archived && (item.damaged > 0 || item.available > 0) && (
        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" disabled={item.available < 1} onClick={() => { onClose(); onAction('damage', item); }}>Report damage</Button>
          <Button size="small" disabled={item.damaged < 1} onClick={() => { onClose(); onAction('repair', item); }}>Mark repaired</Button>
          <Button size="small" color="error" disabled={item.damaged < 1} onClick={() => { onClose(); onAction('dispose', item); }}>Dispose of damaged</Button>
        </Box>
      )}

      <Typography sx={{ mt: 2.5, mb: 1, fontSize: 14, fontWeight: 700 }}>History</Typography>
      <Box component="ol" className="tm-scroll" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.25, maxHeight: 260, overflowY: 'auto' }}>
        {/* Newest first; the newest dot is gold */}
        {item.history.slice().reverse().map((h, i) => (
          <Box component="li" key={`${h.at}-${i}`} sx={{ display: 'flex', gap: 1.25 }}>
            <Box sx={{ mt: 0.75, width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: i === 0 ? tokens.gold : tokens.cardLightBorder }} />
            <Box>
              <Typography sx={{ fontSize: 13 }}>{h.text}</Typography>
              <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>{h.actor} · {formatDateTime(h.at)}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </AppDialog>
  );
}

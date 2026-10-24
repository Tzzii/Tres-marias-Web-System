import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  ConfirmDialog,
  DashCard,
  DataTable,
  EmptyState,
  EquipmentPhoto,
  ErrorState,
  INVENTORY_CATEGORIES,
  Pager,
  Pill,
  SearchField,
  inventoryApi,
  peso,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useColumnChoice } from '../lib/columns.js';
import AddItemsDialog from './inventory/AddItemsDialog.jsx';
import EditItemDialog from './inventory/EditItemDialog.jsx';
import StockDialog from './inventory/StockDialog.jsx';
import DetailsDialog from './inventory/DetailsDialog.jsx';
import InventoryGrid from './inventory/InventoryGrid.jsx';
import {
  OperationsHeader,
  OperationsOverview,
  OperationsFilters,
  OperationsPanelHeading,
  StockMeter,
  ViewSwitcher,
  operationsPanelSx
} from '../components/OperationsWorkspace.jsx';

const PAGE_SIZE = 10;

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

const OPTIONAL_COLUMNS = [
  ['category', 'Category'],
  ['total', 'Total'],
  ['available', 'Available'],
  ['inUse', 'In Use'],
  ['rent', 'Rent Price'],
  ['condition', 'Condition']
];
const COLUMNS_KEY = 'tm.admin.inventory.columns';

export default function InventoryPage() {
  useDocumentTitle('Inventory', 'Tres Marias Admin');
  const navigate = useNavigate();
  const notify = useNotify();
  const { data, loading, error, reload, setData } = useResource(async () => {
    const [items, events] = await Promise.all([
      inventoryApi.listInventory({ includeArchived: true }),
      inventoryApi.listCheckoutEvents()
    ]);
    return { items, events };
  }, []);

  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  useEffect(() => setQuery(searchParams.get('q') || ''), [searchParams]);
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [view, setView] = useState('table');
  const [selected, setSelected] = useState([]);
  const [columns, setColumns] = useColumnChoice(COLUMNS_KEY, OPTIONAL_COLUMNS);
  const [columnsAnchor, setColumnsAnchor] = useState(null);
  const [rowMenu, setRowMenu] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [stock, setStock] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [archive, setArchive] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [query, category, status]);

  const items = data ? data.items : [];
  const active = items.filter((i) => !i.archived);
  const byId = (id) => items.find((i) => i.id === id) || null;

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
  useEffect(() => {
    if (page > 1 && (page - 1) * PAGE_SIZE >= filtered.length)
      setPage(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  }, [filtered.length, page]);

  const ticked = pageRows.filter((i) => selected.includes(i.id));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const openAction = (action, item) => {
    setRowMenu(null);
    if (action === 'details') setDetailsId(item.id);
    else if (action === 'edit') setEditingId(item.id);
    else if (action === 'delete') setDeleting(item);
    else if (action === 'archive' || action === 'restore')
      setArchive({ ids: [item.id], archived: action === 'archive' });
    else if (action === 'outsource') {
      const short = item.stock === 'ok' ? 0 : Math.max(1, item.lowStockAt - item.available);
      navigate(`/outsource?item=${encodeURIComponent(item.name)}${short ? `&qty=${short}` : ''}`);
    } else setStock({ action, id: item.id });
  };

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
      render: (i) => (
        <Checkbox
          size="small"
          checked={selected.includes(i.id)}
          onChange={() => toggle(i.id)}
          inputProps={{ 'aria-label': `Select ${i.name}` }}
        />
      )
    },
    {
      key: 'name',
      label: 'Equipment',
      render: (i) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box sx={{ width: 48, flexShrink: 0 }}>
            <EquipmentPhoto item={i} admin compact height={48} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{i.name}</Typography>
            <Typography sx={{ mt: 0.25, fontSize: 10.5, color: tokens.textMuted }}>{i.code}</Typography>
          </Box>
        </Box>
      )
    },
    columns.category && { key: 'category', label: 'Category', render: (i) => i.category },
    columns.total && { key: 'total', label: 'Total', align: 'right', render: (i) => i.total },
    columns.available && {
      key: 'available',
      label: 'Available',
      align: 'right',
      render: (i) => <StockMeter available={i.available} total={i.total} stock={i.archived ? 'ok' : i.stock} />
    },
    columns.inUse && { key: 'inUse', label: 'In Use', align: 'right', render: (i) => i.inUse },
    columns.rent && {
      key: 'rent',
      label: 'Rent Price',
      align: 'right',
      render: (i) =>
        i.rentable ? (
          <Box>
            <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700 }}>
              {peso(i.rentPrice)}
            </Typography>
            <Typography sx={{ fontSize: 11, color: tokens.textMuted }}>damage {peso(i.damageFee)}</Typography>
          </Box>
        ) : (
          <Typography component="span" sx={{ fontSize: 12.5, color: tokens.textMuted }}>
            Not for rent
          </Typography>
        )
    },
    columns.condition && {
      key: 'condition',
      label: 'Condition',
      render: (i) =>
        i.archived ? (
          <Pill size="sm" label="Archived" bg={tokens.surfaceMuted} fg={tokens.textMuted} dot={false} />
        ) : i.damaged > 0 ? (
          <Pill size="sm" label={`${i.damaged} damaged`} bg="rgba(245,158,11,0.14)" fg={tokens.warningText} />
        ) : (
          <Pill size="sm" label="Good" bg="rgba(16,185,129,0.12)" fg={tokens.successText} />
        )
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      width: 72,
      card: 'aside',
      render: (i) => (
        <IconButton
          size="small"
          aria-label={`Actions for ${i.name}`}
          onClick={(e) => setRowMenu({ anchor: e.currentTarget, item: i })}
        >
          <MoreVertRoundedIcon fontSize="small" />
        </IconButton>
      )
    }
  ].filter(Boolean);

  if (error)
    return (
      <DashCard>
        <ErrorState error={error} onRetry={reload} />
      </DashCard>
    );

  const menuItem = rowMenu && rowMenu.item;

  return (
    <>
      <OperationsHeader
        title="Equipment inventory"
        section="Inventory"
        icon={Inventory2OutlinedIcon}
        description="Every piece, in its place. Manage your equipment and keep the next event ready."
        actions={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setAdding(true)}>
            Add equipment
          </Button>
        }
      />

      <OperationsOverview
        loading={loading}
        metrics={[
          {
            icon: Inventory2OutlinedIcon,
            label: 'Total equipment',
            value: totals.total,
            unit: 'pcs',
            meta: `${active.length} equipment types · ${totals.total ? Math.round((totals.available / totals.total) * 100) : 0}% available`,
            active: status === 'all',
            onClick: () => setStatus('all'),
            progress: totals.total ? (totals.available / totals.total) * 100 : 0
          },
          {
            icon: CheckCircleOutlineRoundedIcon,
            tone: 'green',
            label: 'Ready to use',
            value: totals.available,
            unit: 'pcs',
            meta: 'Available for your next event',
            active: status === 'in_stock',
            onClick: () => setStatus('in_stock')
          },
          {
            icon: LocalShippingOutlinedIcon,
            tone: 'blue',
            label: 'Out at events',
            value: totals.inUse,
            unit: 'pcs',
            meta: 'Currently checked out',
            active: status === 'in_use',
            onClick: () => setStatus('in_use')
          },
          {
            icon: BuildOutlinedIcon,
            tone: 'amber',
            label: 'Needs repair',
            value: totals.damaged,
            unit: 'pcs',
            meta: `${totals.withDamaged} equipment types with damage`,
            active: status === 'damaged',
            onClick: () => setStatus('damaged')
          }
        ]}
      />

      {!loading && (totals.low > 0 || totals.out > 0) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1.25,
            px: 2,
            py: 1.25,
            mb: 2.5,
            border: `1px solid ${tokens.warningBorder}`,
            borderRadius: '12px',
            bgcolor: tokens.warningBg,
            color: tokens.warningText
          }}
        >
          <WarningAmberRoundedIcon sx={{ fontSize: 19 }} />
          <Typography sx={{ flex: '1 1 180px', fontSize: 12 }}>
            <Box component="span" sx={{ fontWeight: 700 }}>
              Keep an eye on stock.
            </Box>{' '}
            {totals.low} low stock · {totals.out} out of stock
          </Typography>
          <Button
            size="small"
            sx={{ color: tokens.warningText, fontSize: 11.5 }}
            onClick={() => {
              setCategory('all');
              setQuery('');
              setStatus(totals.out ? 'out' : 'low');
            }}
          >
            Review stock
          </Button>
          <Button
            size="small"
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{ color: tokens.warningText, fontSize: 11.5 }}
            onClick={() => navigate('/outsource')}
          >
            Find a partner
          </Button>
        </Box>
      )}

      <DashCard sx={operationsPanelSx}>
        <OperationsPanelHeading
          title="Equipment library"
          count={loading ? undefined : filtered.length}
          description="Track availability, manage stock, and view each item's history."
          actions={<ViewSwitcher label="Equipment layout" value={view} onChange={setView} />}
        />
        <OperationsFilters
          label="Inventory status"
          value={status}
          onChange={setStatus}
          options={STATUSES.map(([key, label, test]) => ({
            value: key,
            label: key === 'all' ? 'All equipment' : key === 'damaged' ? 'Damaged' : label,
            count: key === 'archived' ? items.filter((i) => i.archived).length : active.filter(test).length,
            warning: ['low', 'out', 'damaged'].includes(key)
          }))}
        />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, alignItems: 'center', py: 2 }}>
          <SearchField
            id="inventory-search"
            value={query}
            onChange={setQuery}
            placeholder="Search equipment by name or code…"
            sx={{ flex: '1 1 240px' }}
          />
          <TextField
            select
            size="small"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            inputProps={{ 'aria-label': 'Category' }}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="all">Category: All</MenuItem>
            {INVENTORY_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
          {(query || category !== 'all' || status !== 'all') && (
            <Button
              startIcon={<RestartAltRoundedIcon />}
              onClick={() => {
                setQuery('');
                setCategory('all');
                setStatus('all');
              }}
            >
              Reset
            </Button>
          )}
          {view === 'table' && (
            <Button
              variant="outlined"
              startIcon={<ViewColumnOutlinedIcon />}
              onClick={(e) => setColumnsAnchor(e.currentTarget)}
              aria-haspopup="menu"
            >
              Columns
            </Button>
          )}
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
            {status === 'archived' ? (
              <Button
                size="small"
                variant="contained"
                sx={{ bgcolor: tokens.gold, color: tokens.onGold, '&:hover': { bgcolor: tokens.goldLight } }}
                onClick={() => setArchive({ ids: ticked.map((i) => i.id), archived: false })}
              >
                Restore selected
              </Button>
            ) : (
              <Button
                size="small"
                sx={{ color: tokens.dangerOnInk }}
                onClick={() => setArchive({ ids: ticked.map((i) => i.id), archived: true })}
              >
                Archive selected
              </Button>
            )}
            <Button size="small" sx={{ color: tokens.onInk }} onClick={() => setSelected([])}>
              Clear
            </Button>
          </Box>
        )}

        {view === 'grid' && !loading && pageRows.length > 0 ? (
          <InventoryGrid
            items={pageRows}
            selected={selected}
            onToggle={toggle}
            onDetails={setDetailsId}
            onMenu={setRowMenu}
            selectAll={tableColumns[0].label}
          />
        ) : (
          <DataTable
            loading={loading}
            columns={tableColumns}
            rows={pageRows}
            rowKey={(i) => i.id}
            onRowClick={(i) => setDetailsId(i.id)}
            minWidth={920}
            empty={
              <EmptyState
                compact
                title={status === 'archived' ? 'Nothing archived' : 'No items match'}
                description={
                  status === 'archived'
                    ? 'Archived items appear here and can be restored.'
                    : 'Try another search, category or status.'
                }
              />
            }
          />
        )}
        {!loading && filtered.length > 0 && (
          <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
        )}

        <Menu
          anchorEl={rowMenu && rowMenu.anchor}
          open={Boolean(rowMenu)}
          onClose={() => setRowMenu(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {menuItem && [
            <MenuItem key="details" onClick={() => openAction('details', menuItem)}>
              View details and history
            </MenuItem>,
            ...(menuItem.archived
              ? [
                  <MenuItem key="restore" onClick={() => openAction('restore', menuItem)}>
                    Restore
                  </MenuItem>
                ]
              : [
                  <MenuItem key="edit" onClick={() => openAction('edit', menuItem)}>
                    Edit
                  </MenuItem>,
                  <Divider key="d1" />,
                  <MenuItem
                    key="checkout"
                    disabled={menuItem.available < 1}
                    onClick={() => openAction('checkout', menuItem)}
                  >
                    Check out
                  </MenuItem>,
                  <MenuItem key="return" disabled={menuItem.inUse < 1} onClick={() => openAction('return', menuItem)}>
                    Return
                  </MenuItem>,
                  <MenuItem
                    key="damage"
                    disabled={menuItem.available < 1}
                    onClick={() => openAction('damage', menuItem)}
                  >
                    Report damage
                  </MenuItem>,
                  <MenuItem key="repair" disabled={menuItem.damaged < 1} onClick={() => openAction('repair', menuItem)}>
                    Mark repaired
                  </MenuItem>,
                  <MenuItem
                    key="dispose"
                    disabled={menuItem.damaged < 1}
                    onClick={() => openAction('dispose', menuItem)}
                  >
                    Dispose of damaged
                  </MenuItem>,
                  <Divider key="d2" />,
                  <MenuItem key="outsource" onClick={() => openAction('outsource', menuItem)}>
                    Request from a partner
                  </MenuItem>,
                  <Divider key="d3" />,
                  <MenuItem
                    key="archive"
                    disabled={menuItem.inUse > 0}
                    onClick={() => openAction('archive', menuItem)}
                    sx={{ color: tokens.redPress }}
                  >
                    {menuItem.inUse > 0 ? 'Archive (return pieces first)' : 'Archive'}
                  </MenuItem>
                ]),
            <Divider key="delete-divider" />,
            <MenuItem
              key="delete"
              disabled={menuItem.inUse > 0}
              onClick={() => openAction('delete', menuItem)}
              sx={{ color: tokens.redPress, gap: 1 }}
            >
              <DeleteOutlineRoundedIcon fontSize="small" />
              {menuItem.inUse > 0 ? 'Delete (return pieces first)' : 'Delete'}
            </MenuItem>
          ]}
        </Menu>
      </DashCard>

      <AddItemsDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(created) => {
          setAdding(false);
          notify(created.length === 1 ? `${created[0].name} added.` : `${created.length} items added.`);
        }}
      />
      <EditItemDialog
        item={byId(editingId)}
        onClose={() => setEditingId(null)}
        onSaved={() => {
          setEditingId(null);
          notify('Item saved.');
        }}
      />
      <StockDialog
        action={stock && stock.action}
        item={stock && byId(stock.id)}
        events={data ? data.events : []}
        onClose={() => setStock(null)}
        onDone={(message) => {
          setStock(null);
          notify(message);
        }}
      />
      <DetailsDialog item={byId(detailsId)} onClose={() => setDetailsId(null)} onAction={openAction} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : ''}
        description={
          deleting
            ? `Permanently delete ${deleting.code}, all ${deleting.total} pieces, its inventory history and uploaded photo. This cannot be undone. Items linked to bookings or additional charges must be archived instead.`
            : ''
        }
        confirmLabel="Delete item"
        tone="danger"
        onConfirm={async () => {
          const { id, name } = deleting;
          await inventoryApi.deleteInventoryItem(id);
          setData((current) =>
            current ? { ...current, items: current.items.filter((item) => item.id !== id) } : current
          );
          setSelected((ids) => ids.filter((selectedId) => selectedId !== id));
          setDetailsId((current) => (current === id ? null : current));
          setDeleting(null);
          notify(`${name} deleted.`);
        }}
      />

      <ConfirmDialog
        open={Boolean(archive)}
        onClose={() => setArchive(null)}
        title={
          archive
            ? `${archive.archived ? 'Archive' : 'Restore'} ${archive.ids.length === 1 ? (byId(archive.ids[0]) || {}).name : `${archive.ids.length} items`}?`
            : ''
        }
        description={
          archive && archive.archived
            ? 'Archived items leave the list and the totals, and cannot be checked out. Their history is kept and they can be restored.'
            : 'The items return to the list and the totals.'
        }
        confirmLabel={archive && archive.archived ? 'Archive' : 'Restore'}
        tone={archive && archive.archived ? 'danger' : 'primary'}
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

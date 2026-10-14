import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {
  AlertBanner,
  AppDialog,
  BusyButton,
  CardTitle,
  ConfirmDialog,
  DashCard,
  DataTable,
  EmptyState,
  ErrorState,
  FilterTabs,
  FormField,
  ListSkeleton,
  PageHeader,
  DISH_CATEGORIES,
  MAX_ADDON_SIZES,
  PACKAGE_INCLUDES_MAX,
  PackagePhoto,
  PHOTO_ACCEPT,
  PRICE_PER_PLATE_RANGE,
  Pill,
  RULES,
  SelectField,
  catalogApi,
  formatPackageItem,
  inventoryApi,
  isRentalPackage,
  itemGrows,
  peso,
  photoProblem,
  readAddonPrice,
  readAddonSizes,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';

const blankPackage = () => ({
  name: '',
  price: '',
  guests: '',
  description: '',
  itemsText: '',
  grows: {},
  visible: false
});

const toForm = ({ items, ...p }) => ({
  ...p,
  price: String(p.price),
  guests: String(p.guests),
  itemsText: items.map(formatPackageItem).join('\n'),
  grows: Object.fromEntries(items.filter((item) => item.qty).map((item) => [item.name, itemGrows(item, p)]))
});

const growsInForm = (form, item) =>
  item.name in form.grows ? form.grows[item.name] : itemGrows(item, { guests: Number(form.guests) });

const parseItems = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+)$/);
      return match ? { qty: Number(match[1]), name: match[2].trim() } : { qty: null, name: line };
    });

export default function PackagesPage() {
  useDocumentTitle('Packages', 'Tres Marias Admin');
  const notify = useNotify();
  const { data, loading, error, reload, setData } = useResource(async () => {
    const [packages, addons, dishes, inventory] = await Promise.all([
      catalogApi.listPackages({ includeHidden: true, includeArchived: true }),
      catalogApi.listAddons({ includeArchived: true }),
      catalogApi.listDishes({ includeArchived: true }),
      inventoryApi.listInventory()
    ]);
    return { packages, addons, dishes, inventory, pricePerPlate: catalogApi.pricePerPlate() };
  }, []);

  const [tab, setTab] = useState('packages');
  const [editingId, setEditingId] = useState(null);
  const [addonDialog, setAddonDialog] = useState(null);
  const [dishDialog, setDishDialog] = useState(null);
  const [archive, setArchive] = useState(null);
  const [remove, setRemove] = useState(null);

  const packages = data ? data.packages.filter((p) => !p.archived) : [];
  const addons = data ? data.addons.filter((a) => !a.archived) : [];
  const dishes = data ? data.dishes.filter((d) => !d.archived) : [];
  const plainAddons = addons.filter((a) => !a.hasPackages);
  const packageAddons = addons.filter((a) => a.hasPackages);
  const addonColumns = [
    {
      key: 'name',
      label: 'Additional Charge',
      render: (a) => (
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{a.name}</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{a.description}</Typography>
        </Box>
      )
    },
    {
      key: 'price',
      label: 'Price',
      align: 'right',
      render: (a) =>
        a.sizes && a.sizes.length ? (
          <Box>
            {a.sizes.map((s) => (
              <AddonPrice key={s.id} label={s.size} price={s.price} each={!a.hasPackages} />
            ))}
          </Box>
        ) : (
          <AddonPrice price={a.price} each={a.hasQuantity} />
        )
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (a) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Button size="small" onClick={() => setAddonDialog(a)}>
            Edit
          </Button>
          <Button
            size="small"
            sx={{ color: tokens.textSecondary }}
            onClick={() => setArchive({ type: 'addon', item: a })}
          >
            Archive
          </Button>
          <Button size="small" color="error" onClick={() => setRemove({ type: 'addon', item: a })}>
            Delete
          </Button>
        </Box>
      )
    }
  ];
  const archivedCount = data
    ? data.packages.filter((p) => p.archived).length +
      data.addons.filter((a) => a.archived).length +
      data.dishes.filter((d) => d.archived).length
    : 0;

  useEffect(() => {
    if (packages.length && editingId === null) setEditingId(packages[0].id);
  }, [packages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const editing = editingId === 'new' ? null : packages.find((p) => p.id === editingId) || null;

  const editorRef = useRef(null);
  const stacked = useMediaQuery((theme) => theme.breakpoints.down('xl'));
  const scrollPending = useRef(false);
  const scrollToEditor = () => {
    if (stacked && editorRef.current) editorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const openEditor = (id) => {
    if (id === editingId) {
      scrollToEditor();
      return;
    }
    scrollPending.current = true;
    setEditingId(id);
  };
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    scrollToEditor();
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error)
    return (
      <DashCard>
        <ErrorState error={error} onRetry={reload} />
      </DashCard>
    );

  const run = async (fn, message) => {
    try {
      await fn();
      notify(message);
    } catch (e) {
      notify(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Packages"
        subtitle="This is what customers see when they browse and reserve. Hidden packages disappear from browse but stay on past reservations."
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<AddRoundedIcon />}
              onClick={() => {
                setTab('addons');
                setAddonDialog({});
              }}
              sx={{ color: tokens.textLight, borderColor: 'rgba(197,160,89,0.45)' }}
            >
              New additional charge
            </Button>
            <Button
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={() => {
                setTab('packages');
                openEditor('new');
              }}
            >
              New package
            </Button>
          </>
        }
      />

      <Box sx={{ mb: 2 }}>
        <DashCard sx={{ py: 1.5 }}>
          <FilterTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'packages', label: 'Packages', count: loading ? undefined : packages.length },
              { value: 'addons', label: 'Additional Charges', count: loading ? undefined : addons.length },
              { value: 'dishes', label: 'Buffet Menu', count: loading ? undefined : dishes.length },
              { value: 'archived', label: 'Archived', count: loading ? undefined : archivedCount }
            ]}
          />
        </DashCard>
      </Box>

      {loading ? (
        <DashCard>
          <ListSkeleton rows={5} height={60} />
        </DashCard>
      ) : tab === 'packages' ? (
        <Box
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1.2fr' }, gap: 2.5, alignItems: 'start' }}
        >
          <DashCard>
            <CardTitle>Packages · {packages.length}</CardTitle>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {packages.map((p) => (
                <Box
                  key={p.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 1.5,
                    border: `1.5px solid ${editingId === p.id ? tokens.ink : tokens.cardLightBorder}`,
                    flexWrap: 'wrap'
                  }}
                >
                  <ButtonBase
                    onClick={() => openEditor(p.id)}
                    sx={{ flex: 1, minWidth: 200, display: 'block', textAlign: 'left', fontFamily: 'inherit' }}
                  >
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Typography sx={{ fontSize: 15, fontWeight: 700, color: tokens.textPrimary }}>
                        {p.name}
                      </Typography>
                      <Pill
                        size="sm"
                        label={p.visible ? 'Visible on site' : 'Hidden'}
                        bg={p.visible ? 'rgba(16,185,129,0.12)' : tokens.surfaceMuted}
                        fg={p.visible ? '#047857' : tokens.textMuted}
                      />
                    </Box>
                    <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                      {isRentalPackage(p)
                        ? 'Priced per piece from the inventory'
                        : `${peso(p.price)} · Default: ${p.guests} guests · ${p.items.length} items`}
                    </Typography>
                  </ButtonBase>
                  <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
                    <Button size="small" onClick={() => openEditor(p.id)}>
                      Edit
                    </Button>
                    <Button
                      size="small"
                      onClick={() =>
                        run(
                          () => catalogApi.setPackageVisibility(p.id, !p.visible),
                          p.visible ? `${p.name} is hidden from customers.` : `${p.name} is now visible on the site.`
                        )
                      }
                    >
                      {p.visible ? 'Hide' : 'Show'}
                    </Button>
                  </Box>
                </Box>
              ))}
            </Box>
          </DashCard>

          <Box ref={editorRef} sx={{ minWidth: 0, scrollMarginTop: `${tokens.headerHeight + 12}px` }}>
            <PackageEditor
              key={`${editingId || 'none'}:${editing ? 'loaded' : 'waiting'}`}
              pkg={editing}
              isNew={editingId === 'new'}
              onCancelNew={() => setEditingId(packages[0] ? packages[0].id : null)}
              onSaved={(saved, isNew) => {
                setData((current) => ({
                  ...current,
                  packages: isNew
                    ? [...current.packages, saved]
                    : current.packages.map((item) => (item.id === saved.id ? saved : item))
                }));
                notify(isNew ? `${saved.name} created. It stays hidden until you show it.` : 'Package saved.');
                setEditingId(saved.id);
              }}
              onArchive={(p) => setArchive({ type: 'package', item: p })}
            />
          </Box>
        </Box>
      ) : tab === 'addons' ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <DashCard>
            <CardTitle
              subtitle="Customers tick these on the reservation form. Give one a price, or leave it without one and set it in each quotation."
              action={
                <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setAddonDialog({})}>
                  New additional charge
                </Button>
              }
            >
              Additional Charges · {plainAddons.length}
            </CardTitle>
            <DataTable
              columns={addonColumns}
              rows={plainAddons}
              rowKey={(a) => a.id}
              minWidth={560}
              empty={
                <EmptyState
                  compact
                  title="No additional charges"
                  description="Add extras customers can ask for on the reservation form, such as a tent or stage decoration."
                />
              }
            />
          </DashCard>
          <DashCard>
            <CardTitle
              subtitle="Customers tick one of these and pick one of its packages. Each package has its own price and a list of what it includes."
              action={
                <Button
                  size="small"
                  startIcon={<AddRoundedIcon />}
                  onClick={() => setAddonDialog({ hasPackages: true })}
                >
                  New charge with packages
                </Button>
              }
            >
              Additional Charges With Packages · {packageAddons.length}
            </CardTitle>
            <DataTable
              columns={addonColumns}
              rows={packageAddons}
              rowKey={(a) => a.id}
              minWidth={560}
              empty={
                <EmptyState
                  compact
                  title="No charges with packages"
                  description="Add a charge that comes in packages, such as sounds and lights with a basic and a full setup."
                />
              }
            />
          </DashCard>
        </Box>
      ) : tab === 'dishes' ? (
        <Box
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1.6fr' }, gap: 2.5, alignItems: 'start' }}
        >
          <PricePerPlateCard
            current={data.pricePerPlate}
            onSaved={() => {
              notify('Buffet price per person saved.');
              reload();
            }}
          />
          <DashCard>
            <CardTitle
              subtitle="Suggestions offered under each box on the booking form. Customers write their own menu, so this guides them without limiting them."
              action={
                <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setDishDialog({})}>
                  New dish
                </Button>
              }
            >
              Dishes · {dishes.length}
            </CardTitle>
            {DISH_CATEGORIES.map(({ key, label }) => {
              const inCategory = dishes.filter((d) => d.category === key);
              return (
                <Box key={key} sx={{ mt: 2 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textMuted, mb: 0.75 }}>
                    {label} · {inCategory.length}
                  </Typography>
                  {inCategory.length === 0 ? (
                    <AlertBanner tone="info">
                      No suggestions for this line yet. Customers can still book a buffet and write their own{' '}
                      {label.toLowerCase()}.
                    </AlertBanner>
                  ) : (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {inCategory.map((d) => (
                        <Box
                          key={d.id}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            pl: 1.5,
                            pr: 0.5,
                            py: 0.5,
                            borderRadius: 999,
                            border: `1px solid ${tokens.cardLightBorder}`
                          }}
                        >
                          <Typography sx={{ fontSize: 13.5 }}>{d.name}</Typography>
                          <Button size="small" sx={{ minWidth: 0, px: 0.75 }} onClick={() => setDishDialog(d)}>
                            Edit
                          </Button>
                          <Button
                            size="small"
                            sx={{ minWidth: 0, px: 0.75, color: tokens.textSecondary }}
                            onClick={() => setArchive({ type: 'dish', item: d })}
                          >
                            Archive
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            sx={{ minWidth: 0, px: 0.75 }}
                            onClick={() => setRemove({ type: 'dish', item: d })}
                          >
                            Delete
                          </Button>
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })}
          </DashCard>
        </Box>
      ) : (
        <DashCard>
          {archivedCount === 0 ? (
            <EmptyState
              compact
              title="Nothing archived"
              description="Archived packages, additional charges and dishes appear here and can be restored."
            />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[
                ...data.packages
                  .filter((p) => p.archived)
                  .map((p) => ({
                    type: 'package',
                    id: p.id,
                    name: p.name,
                    meta: `Package · ${isRentalPackage(p) ? 'priced per piece' : peso(p.price)}`,
                    restore: () => catalogApi.setPackageArchived(p.id, false)
                  })),
                ...data.addons
                  .filter((a) => a.archived)
                  .map((a) => ({
                    type: 'addon',
                    id: a.id,
                    name: a.name,
                    meta: a.hasPackages ? 'Additional charge with packages' : 'Additional charge',
                    restore: () => catalogApi.setAddonArchived(a.id, false)
                  })),
                ...data.dishes
                  .filter((d) => d.archived)
                  .map((d) => ({
                    type: 'dish',
                    id: d.id,
                    name: d.name,
                    meta: `Dish · ${(DISH_CATEGORIES.find((c) => c.key === d.category) || {}).label || d.category}`,
                    restore: () => catalogApi.setDishArchived(d.id, false)
                  }))
              ].map((item) => (
                <Box
                  key={`${item.type}-${item.id}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.25,
                    borderRadius: 1.5,
                    border: `1px solid ${tokens.cardLightBorder}`
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{item.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>{item.meta}</Typography>
                  </Box>
                  <Button size="small" variant="outlined" onClick={() => run(item.restore, `${item.name} restored.`)}>
                    Restore
                  </Button>
                  {item.type !== 'package' && (
                    <Button
                      size="small"
                      color="error"
                      onClick={() => setRemove({ type: item.type, item: { id: item.id, name: item.name } })}
                    >
                      Delete
                    </Button>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </DashCard>
      )}

      <AddonDialog
        addon={addonDialog}
        inventory={data ? data.inventory : []}
        onClose={() => setAddonDialog(null)}
        onSaved={(isNew) => {
          setAddonDialog(null);
          notify(isNew ? 'Additional charge created.' : 'Additional charge saved.');
        }}
      />

      <DishDialog
        dish={dishDialog}
        onClose={() => setDishDialog(null)}
        onSaved={(isNew) => {
          setDishDialog(null);
          notify(isNew ? 'Dish added to the menu.' : 'Dish saved.');
        }}
      />

      <ConfirmDialog
        open={Boolean(archive)}
        onClose={() => setArchive(null)}
        title={archive ? `Archive ${archive.item.name}?` : ''}
        description={
          archive?.type === 'package'
            ? 'The package disappears from the site and the reservation form. Existing reservations keep it.'
            : archive?.type === 'dish'
              ? 'The dish stops being suggested on the booking form. Customers can still type it, and past reservations keep what they wrote.'
              : 'Customers can no longer add this to new reservations. Existing reservations keep it.'
        }
        confirmLabel="Archive"
        tone="danger"
        onConfirm={async () => {
          const { type, item } = archive;
          if (type === 'package') await catalogApi.setPackageArchived(item.id, true);
          if (type === 'addon') await catalogApi.setAddonArchived(item.id, true);
          if (type === 'dish') await catalogApi.setDishArchived(item.id, true);
          setArchive(null);
          if (type === 'package') setEditingId(null);
          notify(`${item.name} archived.`);
        }}
      />

      <ConfirmDialog
        open={Boolean(remove)}
        onClose={() => setRemove(null)}
        title={remove ? `Delete ${remove.item.name}?` : ''}
        description={
          remove?.type === 'dish'
            ? 'The dish is removed for good and is no longer suggested on the booking form. Past reservations keep what customers wrote. This cannot be undone.'
            : 'The additional charge is removed for good, with its sizes or packages and prices; its inventory items stay in the inventory. A charge that is already on a reservation cannot be deleted: archive it instead. This cannot be undone.'
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={async () => {
          const { type, item } = remove;
          if (type === 'addon') await catalogApi.deleteAddon(item.id);
          if (type === 'dish') await catalogApi.deleteDish(item.id);
          setRemove(null);
          notify(`${item.name} deleted.`);
        }}
      />
    </>
  );
}

const editorField = (field) =>
  field === 'items'
    ? 'itemsText'
    : ['name', 'price', 'guests', 'description', 'itemsText', 'photo'].includes(field)
      ? field
      : null;

function PackageEditor({ pkg, isNew, onCancelNew, onSaved, onArchive }) {
  const rental = isRentalPackage(pkg);
  const [form, setForm] = useState(() => (pkg ? toForm(pkg) : blankPackage()));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const [photoFile, setPhotoFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const photoInput = useRef(null);

  const original = useMemo(() => (pkg ? JSON.stringify(toForm(pkg)) : null), [pkg]);
  const dirty = isNew || JSON.stringify(form) !== original || Boolean(photoFile) || removePhoto;

  const savedVisible = pkg ? pkg.visible : undefined;
  useEffect(() => {
    if (savedVisible !== undefined) setForm((f) => (f.visible === savedVisible ? f : { ...f, visible: savedVisible }));
  }, [savedVisible]);

  if (!pkg && !isNew) {
    return (
      <DashCard>
        <EmptyState
          compact
          title="Select a package"
          description="Choose a package on the left to edit it, or create a new one."
        />
      </DashCard>
    );
  }

  const set = (field) => (e) => {
    const value = e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((er) => ({ ...er, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 3) e.name = 'Enter a package name.';
    if (form.description.trim().length < 10) e.description = 'Describe the package in at least 10 characters.';
    if (rental) return e;
    const price = Number(form.price);
    if (!price || price < 100) e.price = 'Enter a price of at least ₱100.';
    const guests = Number(form.guests);
    if (!Number.isInteger(guests) || guests < 1 || guests > RULES.maxGuests)
      e.guests = `Between 1 and ${RULES.maxGuests}.`;
    if (!parseItems(form.itemsText).length) e.itemsText = 'List at least one item.';
    return e;
  };

  const toggleGrows = (item) => setForm((f) => ({ ...f, grows: { ...f.grows, [item.name]: !growsInForm(f, item) } }));
  const countedItems = rental ? [] : parseItems(form.itemsText).filter((item) => item.qty);

  const save = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const { itemsText, grows, ...rest } = form;
      const saved = await catalogApi.savePackage(
        {
          ...rest,
          name: form.name.trim(),
          description: form.description.trim(),
          price: Number(form.price),
          guests: Number(form.guests),
          items: parseItems(itemsText).map((item) => (item.qty ? { ...item, grows: growsInForm(form, item) } : item))
        },
        { photo: photoFile, removePhoto }
      );
      setForm(toForm(saved));
      setPhotoFile(null);
      setRemovePhoto(false);
      onSaved(saved, isNew);
    } catch (err) {
      const field = editorField(err.meta && err.meta.field);
      setErrors(field ? { [field]: err.message } : { form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashCard>
      <CardTitle subtitle={isNew ? 'New packages start hidden until you show them.' : undefined}>
        {isNew ? 'New Package' : `Editing · ${pkg.name}`}
      </CardTitle>
      {errors.form && (
        <AlertBanner tone="error" sx={{ mb: 2 }}>
          {errors.form}
        </AlertBanner>
      )}
      <Box sx={{ mb: 2, p: 1.5, borderRadius: 1.5, border: `1px solid ${tokens.borderInput}` }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 0.75 }}>Package photo</Typography>
        <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary, mb: 1.5 }}>
          Shown when customers open this package's details. JPG, PNG or WebP · up to {RULES.photoMaxMb} MB per photo.
          Save changes to publish.
        </Typography>
        <Box sx={{ borderRadius: 1.5, overflow: 'hidden' }}>
          <PackagePhoto
            pkg={pkg || { name: form.name, kind: rental ? 'rental' : 'package' }}
            file={photoFile}
            removePhoto={removePhoto}
            admin
            height={220}
          />
        </Box>
        <input
          ref={photoInput}
          id="package-photo"
          type="file"
          accept={PHOTO_ACCEPT}
          hidden
          disabled={busy}
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = '';
            if (!picked) return;
            const problem = photoProblem(picked);
            setErrors((current) => ({ ...current, photo: problem }));
            if (problem) return;
            setPhotoFile(picked);
            setRemovePhoto(false);
          }}
        />
        {photoFile && (
          <Typography sx={{ mt: 1, fontSize: 12, overflowWrap: 'anywhere', color: tokens.textSecondary }}>
            {photoFile.name} · {(photoFile.size / 1024 / 1024).toFixed(2)} MB
          </Typography>
        )}
        {errors.photo && (
          <Typography role="alert" sx={{ mt: 1, color: 'error.main', fontSize: 12.5 }}>
            {errors.photo}
          </Typography>
        )}
        {removePhoto && (
          <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textSecondary }}>
            The uploaded photo will be removed when you save. The sample setup will be shown.
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
          <Button variant="outlined" disabled={busy} onClick={() => photoInput.current?.click()}>
            {photoFile || (pkg?.photoVersion && !removePhoto) ? 'Replace photo' : 'Upload photo'}
          </Button>
          {(photoFile || (pkg?.photoVersion && !removePhoto)) && (
            <Button
              disabled={busy}
              color="error"
              onClick={() => {
                setPhotoFile(null);
                setRemovePhoto(Boolean(pkg?.photoVersion));
                setErrors((current) => ({ ...current, photo: '' }));
              }}
            >
              Remove photo
            </Button>
          )}
          {removePhoto && (
            <Button disabled={busy} onClick={() => setRemovePhoto(false)}>
              Keep current photo
            </Button>
          )}
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <FormField
          id="p-name"
          label="Package name"
          required
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          sx={{ gridColumn: { sm: '1 / -1' } }}
        />
        {!rental && (
          <>
            <FormField
              id="p-price"
              label="Package price"
              required
              type="number"
              value={form.price}
              onChange={set('price')}
              error={errors.price}
              hint="Flat price, food not included"
              InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
            />
            <FormField
              id="p-guests"
              label="Default guest count"
              required
              type="number"
              value={form.guests}
              onChange={set('guests')}
              error={errors.guests}
              hint="The guest count this package is set up for; customers book their own count"
            />
          </>
        )}
        <FormField
          id="p-desc"
          label="Description shown on the site"
          required
          multiline
          minRows={2}
          value={form.description}
          onChange={set('description')}
          error={errors.description}
          sx={{ gridColumn: { sm: '1 / -1' } }}
        />
        {!rental && (
          <FormField
            id="p-items"
            label="What's included"
            required
            multiline
            minRows={8}
            value={form.itemsText}
            onChange={set('itemsText')}
            error={errors.itemsText}
            hint='One item per line. Start with the quantity when there is one, e.g. "100 Porcelain Plates" or "Buffet Table".'
            sx={{ gridColumn: { sm: '1 / -1' } }}
          />
        )}
        {countedItems.length > 0 && (
          <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Grows with the guest count</Typography>
            <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
              When a booking has more guests than the default, ticked items grow with it (e.g. plates, glasses, chairs,
              tables). You set the count of the others in the quotation, with the price for the extra guests.
            </Typography>
            <Box sx={{ mt: 0.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, columnGap: 2 }}>
              {countedItems.map((item, i) => (
                <FormControlLabel
                  key={`${item.name}-${i}`}
                  sx={{ mr: 0 }}
                  control={
                    <Checkbox size="small" checked={growsInForm(form, item)} onChange={() => toggleGrows(item)} />
                  }
                  label={<Typography sx={{ fontSize: 13 }}>{formatPackageItem(item)}</Typography>}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
        <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
          {rental ? (
            <>
              <b>How it is priced</b> · customers pick items and pay each one's rent price per piece. Set which items
              can be rented, their rent price and their damage fee on the Inventory page (Edit → "Customers can rent
              this item").
            </>
          ) : (
            <>
              <b>How it can be booked</b> · as a Buffet (this equipment plus food we cook, charged per person) or as
              Catering only (this equipment on its own). Customers choose when they reserve.
            </>
          )}
        </Typography>
      </Box>

      <FormControlLabel
        sx={{ mt: 1.5 }}
        control={<Switch checked={Boolean(form.visible)} onChange={set('visible')} />}
        label={<Typography sx={{ fontSize: 13.5 }}>Visible on the website</Typography>}
      />

      <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <BusyButton busy={busy} disabled={!dirty} onClick={save}>
          {isNew ? 'Create package' : 'Save changes'}
        </BusyButton>
        {isNew ? (
          <Button onClick={onCancelNew}>Cancel</Button>
        ) : (
          <>
            {dirty && (
              <Button
                disabled={busy}
                onClick={() => {
                  setForm(toForm(pkg));
                  setPhotoFile(null);
                  setRemovePhoto(false);
                  setErrors({});
                }}
              >
                Discard
              </Button>
            )}
            <Button color="error" sx={{ ml: 'auto' }} onClick={() => onArchive(pkg)}>
              Archive
            </Button>
          </>
        )}
      </Box>
    </DashCard>
  );
}

function AddonPrice({ label, price, each }) {
  return (
    <Typography
      sx={{
        fontSize: 13.5,
        whiteSpace: 'nowrap',
        fontWeight: price ? 600 : 400,
        color: price ? tokens.textPrimary : tokens.textMuted
      }}
    >
      {label && (
        <Box component="span" sx={{ fontWeight: 400, color: tokens.textMuted }}>
          {label} ·{' '}
        </Box>
      )}
      {price ? `${peso(price)}${each ? ' each' : ''}` : 'Set in quotation'}
    </Typography>
  );
}

function InventoryLine({ item, error, sx }) {
  return (
    <Box sx={sx}>
      <Typography sx={{ fontSize: 12.5, color: item ? tokens.textSecondary : tokens.textMuted }}>
        Inventory:{' '}
        {item ? (
          <>
            <Box component="span" sx={{ fontWeight: 600, color: tokens.textPrimary }}>
              {item.name}
            </Box>{' '}
            · {item.total} pcs owned
          </>
        ) : (
          'none'
        )}
      </Typography>
      {error && <Typography sx={{ fontSize: 12, color: tokens.redPress }}>{error}</Typography>}
    </Box>
  );
}

function AddonDialog({ addon, inventory, onClose, onSaved }) {
  const [values, setValues] = useState({ name: '', description: '', price: '', inventoryItemId: '', sizes: [] });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(0);
  const packages = Boolean(addon && addon.hasPackages);
  const noun = packages ? 'package' : 'size';
  useEffect(() => {
    if (addon) {
      setValues({
        name: addon.name || '',
        description: addon.description || '',
        price: addon.price ? String(addon.price) : '',
        hasQuantity: Boolean(addon.hasQuantity),
        inventoryItemId: addon.inventoryItemId || '',
        sizes: (addon.sizes || []).map((s) => ({
          key: s.id,
          id: s.id,
          name: s.size,
          price: s.price ? String(s.price) : '',
          description: addon.hasPackages ? s.description || '' : '',
          inventoryItemId: s.inventoryItemId || ''
        }))
      });
      setErrors({});
    }
  }, [addon]);

  const sized = values.sizes.length > 0;
  const itemOf = (itemId) => (itemId && inventory.find((item) => item.id === itemId)) || null;
  const setSize = (index, field, value) => {
    setValues((v) => ({ ...v, sizes: v.sizes.map((s, i) => (i === index ? { ...s, [field]: value } : s)) }));
    setErrors((er) => ({ ...er, [`sizes.${index}.${field}`]: '' }));
  };
  const addSize = () =>
    setValues((v) => ({
      ...v,
      sizes: [
        ...v.sizes,
        { key: `new-${(nextKey.current += 1)}`, id: '', name: '', price: '', description: '', inventoryItemId: '' }
      ]
    }));
  const removeSize = (index) => {
    setValues((v) => ({ ...v, sizes: v.sizes.filter((_, i) => i !== index) }));
    setErrors((er) => Object.fromEntries(Object.entries(er).filter(([key]) => !key.startsWith('sizes'))));
  };

  const save = async () => {
    const e = {};
    if (values.name.trim().length < 3) e.name = 'Enter the name.';
    if (values.description.trim().length < 10) e.description = 'Add a short description.';
    const own = sized ? { price: null } : readAddonPrice(values.price);
    if (own.problem) e.price = own.problem;
    const checked = readAddonSizes(values.sizes, { packages });
    if (checked.problem) e[checked.field] = checked.problem;
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await catalogApi.saveAddon({
        id: addon.id,
        name: values.name,
        description: values.description,
        price: own.price,
        hasQuantity: sized || packages ? false : values.hasQuantity,
        hasPackages: packages,
        inventoryItemId: sized ? null : values.inventoryItemId || null,
        sizes: checked.sizes
      });
      onSaved(!addon.id);
    } catch (err) {
      const field = err.meta && err.meta.field;
      const known =
        field &&
        (['name', 'description', 'price', 'inventoryItemId', 'sizes'].includes(field) || field.startsWith('sizes.'));
      setErrors(known ? { [field]: err.message } : { form: err.message });
    } finally {
      setBusy(false);
    }
  };

  const pesoSign = { startAdornment: <InputAdornment position="start">₱</InputAdornment> };

  return (
    <AppDialog
      open={Boolean(addon)}
      onClose={onClose}
      busy={busy}
      maxWidth="sm"
      title={`${addon && addon.id ? 'Edit' : 'New'} additional charge${packages ? ' with packages' : ''}`}
      description={`${packages ? 'Customers pick one of its packages. ' : ''}Leave a price blank to set it in each reservation's quotation instead. A new price applies to bookings made from now on.`}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={save}>
            Save
          </BusyButton>
        </>
      }
    >
      {errors.form && (
        <AlertBanner tone="error" sx={{ mb: 2 }}>
          {errors.form}
        </AlertBanner>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormField
          id="addon-name"
          label="Name"
          required
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          error={errors.name}
          autoFocus
        />
        <FormField
          id="addon-desc"
          label="Description"
          required
          multiline
          minRows={2}
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          error={errors.description}
        />
        {!sized && (
          <>
            <FormField
              id="addon-price"
              label={values.hasQuantity && !packages ? 'Price of one' : 'Price'}
              optional
              value={values.price}
              onChange={(e) => setValues((v) => ({ ...v, price: e.target.value.replace(/\D/g, '') }))}
              error={errors.price}
              hint={
                errors.price
                  ? undefined
                  : packages
                    ? 'Blank: set the price in each quotation. Used only until you add a package.'
                    : 'Blank: set the price in each quotation'
              }
              InputProps={pesoSign}
              inputProps={{ inputMode: 'numeric', maxLength: 7 }}
            />
            {!packages && (
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={Boolean(values.hasQuantity)}
                    onChange={(e) => setValues((v) => ({ ...v, hasQuantity: e.target.checked }))}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontSize: 13.5 }}>Ask the customer how many</Typography>
                    <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
                      For charges counted by the piece, such as extra helpers. The price is then the price of one.
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start' }}
              />
            )}
            {itemOf(values.inventoryItemId) && (
              <InventoryLine item={itemOf(values.inventoryItemId)} error={errors.inventoryItemId} />
            )}
          </>
        )}

        <Box sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{packages ? 'Packages' : 'Sizes'}</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.textMuted }}>
            {packages
              ? 'Customers pick one package. Each has its own price and a list of what it includes, shown on the reservation form.'
              : 'Optional. For a charge that comes in sizes, such as a tent. Customers pick the size and how many of each, and each size has its own price of one. A size uses the Inventory item named after it (10 × 10 uses “Tent 10x10”), matched when you save: a booking uses up those pieces for the event date, so customers can only book what is left.'}
          </Typography>
          {values.sizes.map((s, i) => (
            <Box
              key={s.key}
              sx={{
                mt: 1.5,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr auto', sm: '1fr 170px auto' },
                gap: 1,
                alignItems: 'start',
                ...(packages && i > 0 ? { pt: 1.5, borderTop: `1px solid ${tokens.cardLightBorder}` } : {})
              }}
            >
              <FormField
                id={`addon-size-${i}`}
                label={packages ? 'Package name' : 'Size'}
                required
                value={s.name}
                onChange={(e) => setSize(i, 'name', e.target.value)}
                error={errors[`sizes.${i}.name`]}
                placeholder={packages ? 'e.g. Basic sound system' : 'e.g. 10 × 10'}
                inputProps={{ maxLength: 60 }}
              />
              <FormField
                id={`addon-size-price-${i}`}
                label={packages ? 'Price' : 'Price of one'}
                optional
                value={s.price}
                onChange={(e) => setSize(i, 'price', e.target.value.replace(/\D/g, ''))}
                error={errors[`sizes.${i}.price`]}
                InputProps={pesoSign}
                inputProps={{ inputMode: 'numeric', maxLength: 7 }}
              />
              <IconButton
                onClick={() => removeSize(i)}
                aria-label={`Remove ${noun} ${s.name || i + 1}`}
                sx={{ mt: 3.25 }}
              >
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
              {packages && (
                <FormField
                  id={`addon-size-includes-${i}`}
                  label="What's included"
                  optional
                  multiline
                  minRows={2}
                  value={s.description}
                  onChange={(e) => setSize(i, 'description', e.target.value)}
                  error={errors[`sizes.${i}.description`]}
                  hint={
                    errors[`sizes.${i}.description`] ? undefined : 'One thing per line, e.g. "2 speakers with stands"'
                  }
                  inputProps={{ maxLength: PACKAGE_INCLUDES_MAX }}
                  sx={{ gridColumn: '1 / -1' }}
                />
              )}
              {(!packages || itemOf(s.inventoryItemId) || errors[`sizes.${i}.inventoryItemId`]) && (
                <InventoryLine
                  item={itemOf(s.inventoryItemId)}
                  error={errors[`sizes.${i}.inventoryItemId`]}
                  sx={{ gridColumn: '1 / -1', mt: -0.5 }}
                />
              )}
            </Box>
          ))}
          {errors.sizes && <Typography sx={{ mt: 1, fontSize: 12, color: tokens.redPress }}>{errors.sizes}</Typography>}
          <Button
            size="small"
            startIcon={<AddRoundedIcon />}
            onClick={addSize}
            disabled={values.sizes.length >= MAX_ADDON_SIZES}
            sx={{ mt: 1 }}
          >
            Add {noun}
          </Button>
          {sized && (
            <Typography sx={{ mt: 0.5, fontSize: 12, color: tokens.textMuted }}>
              Leave a {noun}'s price blank to set it in each quotation. A {noun} you remove stays on bookings that
              already have it.
            </Typography>
          )}
        </Box>
      </Box>
    </AppDialog>
  );
}

function PricePerPlateCard({ current, onSaved }) {
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(String(current)), [current]);

  const save = async () => {
    setBusy(true);
    try {
      await catalogApi.setPricePerPlate(Number(value));
      setError('');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashCard>
      <CardTitle subtitle="What one guest costs on a buffet booking. Catering only bookings are not charged per person.">
        Buffet Price per Person
      </CardTitle>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <FormField
          id="price-per-plate"
          type="number"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          error={error}
          InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
          inputProps={{
            min: PRICE_PER_PLATE_RANGE.min,
            max: PRICE_PER_PLATE_RANGE.max,
            step: 50,
            'aria-label': 'Buffet price per person'
          }}
          sx={{ width: 170 }}
        />
        <BusyButton busy={busy} disabled={String(current) === value} onClick={save} sx={{ height: 40 }}>
          Save
        </BusyButton>
      </Box>
      <Typography sx={{ mt: 1.5, fontSize: 12.5, lineHeight: 1.6, color: tokens.textSecondary }}>
        A 100-guest buffet comes to {peso(100 * (Number(value) || 0))}. Reservations already made keep the price they
        were booked at, so raising this never changes what an existing customer owes.
      </Typography>
    </DashCard>
  );
}

function DishDialog({ dish, onClose, onSaved }) {
  const [values, setValues] = useState({ name: '', category: DISH_CATEGORIES[0].key });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (dish) setValues({ name: dish.name || '', category: dish.category || DISH_CATEGORIES[0].key });
    setErrors({});
  }, [dish]);

  const save = async () => {
    if (values.name.trim().length < 2) return setErrors({ name: 'Enter the name of the dish.' });
    setBusy(true);
    try {
      await catalogApi.saveDish({ id: dish.id, ...values });
      onSaved(!dish.id);
    } catch (e) {
      if (e.meta && e.meta.field) setErrors({ [e.meta.field]: e.message });
      else setErrors({ form: e.message });
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <AppDialog
      open={Boolean(dish)}
      onClose={onClose}
      busy={busy}
      maxWidth="xs"
      title={dish && dish.id ? 'Edit Dish' : 'New Dish'}
      description="Suggested under the matching box on the booking form. Customers can still write anything they like."
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <BusyButton busy={busy} onClick={save}>
            Save
          </BusyButton>
        </>
      }
    >
      {errors.form && (
        <AlertBanner tone="error" sx={{ mb: 2 }}>
          {errors.form}
        </AlertBanner>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FormField
          id="dish-name"
          label="Dish name"
          required
          value={values.name}
          onChange={(e) => {
            setValues((v) => ({ ...v, name: e.target.value }));
            setErrors({});
          }}
          error={errors.name}
          placeholder="e.g. Lechon Kawali"
          autoFocus
        />
        <SelectField
          id="dish-category"
          label="Part of the menu"
          required
          value={values.category}
          onChange={(e) => {
            setValues((v) => ({ ...v, category: e.target.value }));
            setErrors({});
          }}
          options={DISH_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
          error={errors.category}
        />
      </Box>
    </AppDialog>
  );
}

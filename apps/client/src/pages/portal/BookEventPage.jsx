import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import RestaurantMenuOutlinedIcon from '@mui/icons-material/RestaurantMenuOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import TableBarOutlinedIcon from '@mui/icons-material/TableBarOutlined';
import {
  AlertBanner,
  BUFFET_DRINKS,
  BusyButton,
  CardTitle,
  DashCard,
  DateField,
  EndTimeField,
  EquipmentPhoto,
  ErrorState,
  FormField,
  INVENTORY_CATEGORIES,
  ListSkeleton,
  MenuPicker,
  DessertFields,
  DESSERT_ADDON_ID,
  menuCount,
  menuProblem,
  buffetDrinks,
  dessertSummary,
  OCCASIONS,
  OCCASION_OTHER,
  OCCASION_OTHER_RANGE,
  PageHeader,
  RENTAL,
  RENTAL_SERVICE,
  RULES,
  SERVICE_TYPES,
  SelectField,
  StylingFields,
  StylingSummary,
  TimeField,
  addonPriceMap,
  bookingOccasion,
  calendarApi,
  catalogApi,
  packageProposalApi,
  cleanStyling,
  computeQuote,
  INCLUSIVE_PRICING_MODEL,
  decorReminders,
  endTimeProblem,
  eventHours,
  flattenAddons,
  formatClock,
  formatDate,
  formatBookingItem,
  formatEventTime,
  includesFood,
  initialEndTime,
  DEFAULT_SIX_HOUR_FEE,
  isRental,
  isRentalPackage,
  packageItemsFor,
  packageAllowsOccasion,
  peso,
  reservationApi,
  shiftEndTime,
  stylingEmpty,
  stylingProblem,
  themeLabel,
  titleCase,
  tokens,
  useDocumentTitle,
  useNotify,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import { clearDraft, clearIntent, readDraft, readIntent, saveDraft } from '../../lib/booking.js';
import { cleanDraftReferencePhotos } from '@tm/shared/domain/referencePhoto.js';
import Section from './booking/BookingSection.jsx';
import { QuoteLines, RentalQuoteLines } from './booking/BookingSummary.jsx';
import PackageAndBudgetSection, { PackageBudgetSummary } from './booking/PackageAndBudgetSection.jsx';
import {
  applyProposalHandoff,
  canClearRecoveredDraft,
  cleanProposalReference,
  loadProposalForRestore,
  proposalDraftConflicts,
  proposalFormPatch,
  proposalPatchIsStale,
  sameProposalReference
} from '../../lib/packageProposalDraft.js';
import { cleanBudgetDraft, budgetSubmission } from '../../lib/budgetDraft.js';
import { applyAssistantBooking } from '@tm/shared/domain/assistantBooking.js';
import {
  SECTIONS,
  sectionForField,
  hasSizes,
  lowestPackagePrice,
  EMPTY,
  draftStyling,
  wordList,
  DATES_LOADING
} from '../../lib/bookingForm.js';

const SECTION_ICONS = {
  details: EventNoteOutlinedIcon,
  service: CategoryOutlinedIcon,
  package: Inventory2OutlinedIcon,
  styling: PaletteOutlinedIcon,
  items: Inventory2OutlinedIcon,
  food: RestaurantMenuOutlinedIcon,
  venue: PlaceOutlinedIcon,
  addons: AddCircleOutlineRoundedIcon,
  budget: AccountBalanceWalletOutlinedIcon,
  review: FactCheckOutlinedIcon
};

const SECTION_STAGES = {
  details: 'Stage 1 · Celebration Basics',
  service: 'Stage 1 · Celebration Basics',
  package: 'Stage 2 · Setup, Menu & Style',
  styling: 'Stage 2 · Setup, Menu & Style',
  items: 'Stage 2 · Equipment Selection',
  food: 'Stage 2 · Setup, Menu & Style',
  venue: 'Stage 3 · Venue & Preferences',
  addons: 'Stage 3 · Venue & Preferences',
  budget: 'Stage 3 · Venue & Preferences',
  review: 'Stage 4 · Final Review'
};

const OPTIONAL_SECTIONS = new Set(['styling', 'addons', 'budget']);

const FORM_COLUMNS = {
  gridTemplateColumns: 'minmax(0, 1fr)',
  '@container booking-form (min-width: 520px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }
};
const SUMMARY_LAYOUT = '@container portal-content (min-width: 980px)';
const WIDE_LAYOUT = '@container portal-content (min-width: 1280px)';

const AVAILABILITY = {
  available: { label: (left) => `${left} available`, color: tokens.successText },
  limited: { label: (left) => `Only ${left} left`, color: tokens.warningText },
  out: { label: () => 'None left on this date', color: tokens.dangerText }
};

export default function BookEventPage() {
  useDocumentTitle('Book an Event');
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const catalog = useResource(() => catalogApi.getCatalog(), [], { live: false });

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [recoveredReservation, setRecoveredReservation] = useState('');
  const recoveredReference = useRef(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [proposalVerified, setProposalVerified] = useState(false);
  const [proposalHandoff, setProposalHandoff] = useState(null);
  useEffect(() => {
    if (!draftSaveFailed && !photoBusy) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draftSaveFailed, photoBusy]);
  const [active, setActive] = useState('details');
  const chipBar = useRef(null);
  const touched = useRef(false);
  const initialised = useRef(false);
  const occasionBox = useRef(null);
  const justPickedOther = useRef(false);

  useEffect(() => {
    if (!catalog.data || initialised.current) return;
    initialised.current = true;
    const draft = readDraft(user.id);
    const hasDraft = Boolean(draft && draft.form);
    const intent = readIntent(user.id);
    const intentIsNewer = Boolean(intent && (!hasDraft || !draft.savedAt || intent.savedAt > draft.savedAt));

    const base = hasDraft
      ? { ...EMPTY, ...Object.fromEntries(Object.entries(draft.form).filter(([key]) => key in EMPTY)) }
      : { ...EMPTY };
    base.styling = draftStyling(base.styling);
    base.budgetDraft = cleanBudgetDraft(base.budgetDraft);
    base.referencePhotos = cleanDraftReferencePhotos(draft?.form?.referencePhotos ?? draft?.form?.referencePhoto);
    const picks = intentIsNewer ? intent : {};
    const pkg = catalog.data.packages.find((p) => p.slug === (params.get('package') || picks.packageSlug));
    const serviceFor =
      pkg && isRentalPackage(pkg)
        ? { serviceType: RENTAL_SERVICE }
        : pkg && isRental(base.serviceType)
          ? { serviceType: EMPTY.serviceType }
          : {};
    const reviewed = applyAssistantBooking(base, picks, catalog.data);
    setForm({
      ...reviewed,
      ...(picks.occasion
        ? { occasion: picks.occasion, ...(picks.occasion === OCCASION_OTHER ? {} : { occasionOther: '' }) }
        : {}),
      ...(picks.startTime ? { startTime: picks.startTime } : {}),
      endTime: picks.clearedFields?.includes('endTime')
        ? ''
        : picks.endTime ||
          (picks.startTime ? initialEndTime(picks.startTime) : reviewed.endTime || initialEndTime(reviewed.startTime)),
      ...(picks.guests ? { guests: String(picks.guests) } : {}),
      ...(pkg
        ? {
            packageId: pkg.id,
            packageProposalRef: null,
            packageProposalDisplay: null,
            packageProposalContext: null,
            packageProposalStale: false,
            ...serviceFor
          }
        : {}),
      ...(pkg && pkg.kind !== 'rental' && ['Buffet and Catering', 'Catering only'].includes(picks.serviceType)
        ? { serviceType: picks.serviceType }
        : {}),
      ...(params.get('date') || picks.date ? { date: params.get('date') || picks.date } : {})
    });
    if (hasDraft) setSavedAt(draft.savedAt);
  }, [catalog.data, user.id, params]);

  const referenceKey = JSON.stringify(form.packageProposalRef);
  const routeProposal = params.get('proposal'),
    routeOption = params.get('option'),
    routeRevision = Number(params.get('revision'));
  useEffect(() => {
    const reference = routeProposal
      ? cleanProposalReference({ proposalId: routeProposal, optionId: routeOption, revision: routeRevision })
      : cleanProposalReference(form.packageProposalRef);
    setProposalVerified(false);
    setRecoveredReservation('');
    recoveredReference.current = null;
    if (!reference || !catalog.data) return undefined;
    let live = true;
    const owner = user.id;
    const initialSaved = readDraft(owner);
    const initialIntent = readIntent(owner);
    (async () => {
      try {
        const { proposal, selection, reservationRef, submittedAt } = await loadProposalForRestore(
          reference,
          packageProposalApi
        );
        if (!live) return;
        if (reservationRef) {
          recoveredReference.current = reference;
          setRecoveredReservation(reservationRef);
          setFormError('');
          // Only the untouched, identical saved form is the response-loss retry we may clear and route automatically.
          if (
            !touched.current &&
            !(initialIntent?.savedAt > submittedAt) &&
            canClearRecoveredDraft(initialSaved, readDraft(owner), reference, submittedAt)
          ) {
            clearDraft(owner);
            const intent = readIntent(owner);
            if (
              sameProposalReference(intent?.packageProposalRef, reference) &&
              intent.savedAt <= submittedAt &&
              JSON.stringify(intent) === JSON.stringify(initialIntent)
            )
              clearIntent();
            notify(`Reservation ${reservationRef} was already sent. Opening your saved request.`, 'success');
            navigate(`/portal/reservations/${encodeURIComponent(reservationRef)}`, { replace: true });
          }
          return;
        }
        const patch = proposalFormPatch(proposal, selection);
        if (!live) return;
        if (routeProposal)
          setProposalHandoff({ patch, owner, conflicts: proposalDraftConflicts(readDraft(owner)?.form, patch) });
        else {
          setForm((current) => ({
            ...current,
            packageProposalDisplay: selection.option,
            packageProposalContext: proposal.context,
            packageProposalStale: current.packageProposalStale || proposalPatchIsStale(current, patch)
          }));
          setProposalVerified(true);
        }
      } catch (failure) {
        if (live) {
          setFormError(`${failure.message} Your custom package needs a fresh review before submission.`);
          setForm((current) => ({ ...current, packageProposalStale: true }));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [referenceKey, routeProposal, routeOption, routeRevision, user.id, catalog.data]);

  useEffect(() => {
    if (form.occasion === OCCASION_OTHER && justPickedOther.current && occasionBox.current) occasionBox.current.focus();
    justPickedOther.current = false;
  }, [form.occasion]);

  useEffect(() => {
    if (!touched.current) return undefined;
    const timer = setTimeout(() => {
      const saved = saveDraft(user.id, form);
      setDraftSaveFailed(!saved);
      if (saved) setSavedAt(Date.now());
    }, 700);
    return () => clearTimeout(timer);
  }, [form, user.id]);

  useEffect(() => {
    if (!catalog.data) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace('sec-', ''));
      },
      { rootMargin: '-90px 0px -55% 0px' }
    );
    SECTIONS.forEach(([key]) => {
      const el = document.getElementById(`sec-${key}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [catalog.data, form.serviceType]);

  useEffect(() => {
    const bar = chipBar.current;
    const chip = bar && bar.querySelector(`[data-section="${active}"]`);
    if (!chip || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2, behavior: 'instant' });
  }, [active]);

  const data = catalog.data;
  const pkg = form.packageProposalRef
    ? form.packageProposalDisplay?.packageSnapshot || null
    : data
      ? data.packages.find((p) => p.id === form.packageId)
      : null;
  const rentalPkg = data ? data.packages.find(isRentalPackage) || null : null;
  const packages = data
    ? data.packages.filter((p) => !isRentalPackage(p) && packageAllowsOccasion(p, form.occasion))
    : [];
  useEffect(() => {
    if (!data) return;
    setForm((current) => {
      const selected = data.packages.find((p) => p.id === current.packageId);
      if (!selected || current.packageProposalRef || packageAllowsOccasion(selected, current.occasion)) return current;
      return { ...current, packageId: '' };
    });
  }, [data, form.occasion, form.packageId]);
  const rental = isRental(form.serviceType);
  const buffet = includesFood(form.serviceType);
  const addonById = data ? Object.fromEntries(flattenAddons(data.addons).map((a) => [a.id, a])) : {};
  const bookedAddonIds = rental
    ? []
    : form.addonIds.flatMap((id) => {
        const a = addonById[id];
        if (!a) return [];
        return hasSizes(a) ? a.sizes.filter((s) => Number(form.addonQty[s.id]) > 0).map((s) => s.id) : [id];
      });
  const chosenAddons = bookedAddonIds.map((id) => addonById[id]);
  const rentalChosen =
    data && rental
      ? data.rentals
          .filter((i) => Number(form.rentalQty[i.id]) > 0)
          .map((i) => ({ itemId: i.id, name: i.name, qty: Number(form.rentalQty[i.id]), price: i.price }))
      : [];
  const delivered = rental && form.fulfilment === 'delivery';
  const styling = rental ? null : cleanStyling(form.styling);
  const reminders = data && !rental ? decorReminders(form.styling.notes, data.addons, form.addonIds) : [];
  const quote = computeQuote({
    pkg,
    pricingModel: form.packageProposalRef
      ? form.packageProposalDisplay?.estimate?.pricingModel || INCLUSIVE_PRICING_MODEL
      : INCLUSIVE_PRICING_MODEL,
    serviceType: form.serviceType,
    guests: rental ? 0 : Number(form.guests) || 0,
    pricePerPlate: data ? data.pricePerPlate : 0,
    startTime: form.startTime,
    endTime: form.endTime,
    sixHourFee: data?.sixHourFee ?? DEFAULT_SIX_HOUR_FEE,
    rentalItems: rentalChosen,
    deliveryFee: delivered ? RENTAL.deliveryFee : 0,
    addonIds: bookedAddonIds,
    addonQty: form.addonQty,
    addonPrices: addonPriceMap(chosenAddons)
  });
  const knownTotal =
    form.packageProposalRef && !form.packageProposalStale && form.packageProposalDisplay
      ? form.packageProposalDisplay.estimate.knownTotal
      : quote.net;
  const packageItems = pkg && !rental ? packageItemsFor(pkg, Number(form.guests) || 0) : [];
  const extraGuests = rental ? 0 : quote.extraGuests;
  const extraNote = extraGuests && !buffet ? ` + equipment for ${extraGuests} extra guests (to be quoted)` : '';
  const plusQuoted = (extraGuests && !buffet) || chosenAddons.some((a) => a.price == null) ? ' + quoted' : '';
  const addonNote = quote.addons ? ` + additional charges ${peso(quote.addons)}` : '';
  const quotedNote = chosenAddons.some((a) => !a.price)
    ? ' Charges marked "To be quoted" are priced in your quotation.'
    : '';

  const tracksStock = Boolean(data) && flattenAddons(data.addons).some((a) => a.inventoryItemId);
  const [avail, setAvail] = useState({});
  useEffect(() => {
    if (!(rental || tracksStock) || !form.date) {
      setAvail({});
      return undefined;
    }
    let live = true;
    reservationApi
      .getRentalAvailability(form.date)
      .then((next) => live && setAvail(next))
      .catch(() => live && setAvail({}));
    return () => {
      live = false;
    };
  }, [rental, tracksStock, form.date]);
  const leftFor = (a) =>
    a.inventoryItemId && form.date && avail[a.inventoryItemId] ? avail[a.inventoryItemId].left : null;
  const stockError = (itemId) => {
    const free = avail[itemId];
    const qty = Number(form.rentalQty[itemId]) || 0;
    if (!free || !qty || qty <= free.left) return '';
    return free.left ? `Only ${free.left} available` : 'None available';
  };

  const update = (patch) => {
    touched.current = true;
    setForm((f) => ({
      ...f,
      ...patch,
      ...(patch.packageProposalRef !== null && proposalPatchIsStale(f, patch) ? { packageProposalStale: true } : {})
    }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      return next;
    });
  };

  const pickOccasion = (value) => {
    justPickedOther.current = value === OCCASION_OTHER;
    update({ occasion: value, ...(value === OCCASION_OTHER ? {} : { occasionOther: '' }) });
  };

  const updateStyling = (patch) => {
    touched.current = true;
    setForm((f) => {
      const styling = { ...f.styling, ...patch };
      return { ...f, styling, ...(proposalPatchIsStale(f, { styling }) ? { packageProposalStale: true } : {}) };
    });
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[`styling.${k}`]);
      if ('theme' in patch) delete next['styling.themeOther'];
      return next;
    });
  };

  const updateReferencePhoto = (photo) => {
    update({ referencePhotos: photo });
    setErrors((current) => {
      const next = { ...current };
      delete next['styling.referencePhoto'];
      return next;
    });
  };

  const chooseService = (value) => {
    if (isRental(value))
      update({
        serviceType: value,
        packageId: rentalPkg.id,
        packageProposalRef: null,
        packageProposalDisplay: null,
        packageProposalContext: null,
        packageProposalStale: false
      });
    else update({ serviceType: value, packageId: pkg && isRentalPackage(pkg) ? '' : form.packageId });
  };

  const updateRentalQty = (id, raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RENTAL.maxQty) return;
    update({ rentalQty: { ...form.rentalQty, [id]: digits } });
    setErrors((e) => {
      const next = { ...e };
      delete next[`rental.${id}`];
      delete next.rentalItems;
      return next;
    });
  };

  const updateGuests = (raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RULES.maxGuests) return;
    update({ guests: digits });
  };

  const toggleAddon = (id) => {
    const charge = addonById[id];
    const on = form.addonIds.includes(id);
    const qty = { ...form.addonQty };
    if (on) {
      delete qty[id];
      if (hasSizes(charge)) charge.sizes.forEach((s) => delete qty[s.id]);
    } else if (!hasSizes(charge)) qty[id] = '1';
    update({ addonIds: on ? form.addonIds.filter((a) => a !== id) : [...form.addonIds, id], addonQty: qty });
  };

  const updateAddonQty = (id, raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    update({ addonQty: { ...form.addonQty, [id]: digits } });
    const parentId = addonById[id] && addonById[id].parentId;
    setErrors((e) => {
      const next = { ...e };
      delete next[`addonQty.${id}`];
      if (parentId) delete next[`addonQty.${parentId}`];
      return next;
    });
  };

  const pickPackage = (charge, id) => {
    const qty = { ...form.addonQty };
    charge.sizes.forEach((s) => delete qty[s.id]);
    qty[id] = '1';
    update({ addonQty: qty });
    setErrors((e) => {
      const next = { ...e };
      delete next[`addonQty.${charge.id}`];
      charge.sizes.forEach((s) => delete next[`addonQty.${s.id}`]);
      return next;
    });
  };

  const setDish = (category, text) => {
    update({ menu: { ...form.menu, [category]: text } });
    setErrors((e) => {
      const next = { ...e };
      delete next[`menu.${category}`];
      delete next['menu.total'];
      if (category === 'dessert') {
        delete next['menu.dessert.name'];
        delete next['menu.dessert.description'];
      }
      return next;
    });
  };

  const scrollTo = (key) => {
    const el = document.getElementById(`sec-${key}`);
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  };

  const validate = () => {
    const e = {};
    if (form.eventName.trim().length < 3) e.eventName = 'Give your event a name (at least 3 characters).';
    const occasionCheck = bookingOccasion(form.occasion, form.occasionOther).problem;
    if (occasionCheck) e[occasionCheck.field] = occasionCheck.message;
    if (!agreed) e.agreeTerms = 'Please read and agree to the Terms of Service before sending your request.';
    if (rental) return { ...e, ...validateRental() };
    if (!form.date) e.date = 'Choose your event date.';
    else if (calendarApi.availabilitySnapshot().loading) e.date = DATES_LOADING;
    else {
      const reason = calendarApi.dateUnavailableReason(form.date, calendarApi.availabilitySnapshot());
      if (reason) e.date = `This date is not available (${reason.toLowerCase()}).`;
    }
    if (!form.startTime) e.startTime = 'Choose a start time.';
    else if (form.date && !e.date) {
      const reason = calendarApi.timeUnavailableReason(form.date, form.startTime, calendarApi.availabilitySnapshot());
      if (reason) e.startTime = `${reason}.`;
    }
    if (!form.endTime) e.endTime = 'Choose an end time.';
    else if (endTimeProblem(form.startTime, form.endTime))
      e.endTime = `${endTimeProblem(form.startTime, form.endTime)}.`;
    else if (form.date && !e.date && !e.startTime) {
      const reason = calendarApi.timeUnavailableReason(
        form.date,
        form.startTime,
        calendarApi.availabilitySnapshot(),
        eventHours(form.startTime, form.endTime)
      );
      if (reason) e.endTime = `${reason}.`;
    }
    const guests = Number(form.guests);
    if (!form.guests) e.guests = 'Enter your guest count.';
    else if (!Number.isInteger(guests) || guests < RULES.minGuests || guests > RULES.maxGuests)
      e.guests = `Between ${RULES.minGuests} and ${RULES.maxGuests} guests.`;
    if (!SERVICE_TYPES.includes(form.serviceType)) e.serviceType = 'Choose what you are booking.';
    if (!pkg) e.packageId = 'Choose a package.';
    const stylingCheck = stylingProblem(styling);
    if (stylingCheck) e[stylingCheck.field] = stylingCheck.message;
    const menuCheck = menuProblem(form.menu, { buffet, dessert: bookedAddonIds.includes(DESSERT_ADDON_ID) });
    if (menuCheck) e[menuCheck.field] = menuCheck.message;
    form.addonIds.forEach((id) => {
      const charge = addonById[id];
      if (hasSizes(charge) && !charge.sizes.some((s) => Number(form.addonQty[s.id]) > 0)) {
        e[`addonQty.${id}`] = charge.hasPackages
          ? 'Choose one of the packages.'
          : 'Enter how many for at least one size.';
      }
    });
    chosenAddons.forEach((a) => {
      if (!a.hasQuantity) return;
      const many = Number(form.addonQty[a.id]);
      if (!Number.isInteger(many) || many < 1 || many > 99) e[`addonQty.${a.id}`] = 'Enter 1 to 99.';
    });
    chosenAddons.forEach((a) => {
      const left = leftFor(a);
      const many = a.hasQuantity ? Number(form.addonQty[a.id]) : 1;
      if (!e[`addonQty.${a.id}`] && left !== null && many > left)
        e[`addonQty.${a.id}`] = left ? `Only ${left} left on this date.` : 'Fully booked on this date.';
    });
    if (!form.venueName.trim()) e.venueName = 'Enter the venue name.';
    if (!form.venueAddress.trim()) e.venueAddress = 'Enter the venue address.';
    if (!form.city.trim()) e.city = 'Enter the city.';
    return e;
  };

  const validateRental = () => {
    const e = {};
    if (!form.date) e.date = 'Choose the date you need the items.';
    else if (calendarApi.availabilitySnapshot().loading) e.date = DATES_LOADING;
    else {
      const reason = calendarApi.dateUnavailableReason(form.date, calendarApi.availabilitySnapshot(), { rental: true });
      if (reason) e.date = `This date is not available (${reason.toLowerCase()}).`;
    }
    if (!form.startTime) e.startTime = 'Choose a time.';
    else {
      const reason = calendarApi.timeUnavailableReason(form.date, form.startTime, {
        ...calendarApi.availabilitySnapshot(),
        events: []
      });
      if (reason) e.startTime = `${reason}.`;
    }
    if (!rentalChosen.length) e.rentalItems = 'Enter how many you need of at least one item.';
    rentalChosen.forEach((line) => {
      const free = avail[line.itemId];
      if (free && line.qty > free.left)
        e[`rental.${line.itemId}`] = free.left ? `Only ${free.left} free on this date.` : 'Not available on this date.';
    });
    if (form.fulfilment === 'delivery') {
      if (!form.venueName.trim()) e.venueName = 'Enter the place name.';
      if (!form.venueAddress.trim()) e.venueAddress = 'Enter the delivery address.';
      if (!form.city.trim()) e.city = 'Enter the city.';
    }
    return e;
  };

  const submit = async () => {
    if (busy || photoBusy) return;
    if (recoveredReservation && sameProposalReference(form.packageProposalRef, recoveredReference.current)) {
      navigate(`/portal/reservations/${encodeURIComponent(recoveredReservation)}`);
      return;
    }
    if (form.packageProposalRef && (!proposalVerified || form.packageProposalStale)) {
      setFormError(
        'Your custom package needs a fresh review. Open Package and Budget to adjust your answers and generate current options.'
      );
      scrollTo('budget');
      return;
    }
    const found = validate();
    setErrors(found);
    setFormError('');
    const firstField = Object.keys(found).sort(
      (a, b) =>
        SECTIONS.findIndex(([key]) => key === sectionForField(a)) -
        SECTIONS.findIndex(([key]) => key === sectionForField(b))
    )[0];
    if (firstField) {
      scrollTo(sectionForField(firstField));
      setFormError(
        `Please fix ${Object.keys(found).length === 1 ? 'the highlighted field' : `the ${Object.keys(found).length} highlighted fields`} before submitting.`
      );
      return;
    }
    setBusy(true);
    try {
      const created = await reservationApi.createReservation(
        user.id,
        rental
          ? {
              ...form,
              endTime: undefined,
              styling: undefined,
              referencePhotos: [],
              agreeTerms: agreed,
              rentalItems: rentalChosen.map(({ itemId, qty }) => ({ itemId, qty }))
            }
          : {
              ...form,
              agreeTerms: agreed,
              budgetRequest: form.packageProposalRef ? undefined : budgetSubmission(form, data),
              guests: Number(form.guests),
              menu: form.menu,
              styling,
              addonIds: bookedAddonIds,
              addonQty: Object.fromEntries(Object.entries(form.addonQty).map(([id, many]) => [id, Number(many)]))
            }
      );
      clearDraft(user.id);
      clearIntent();
      notify(`Reservation ${created.ref} sent. We will reply with your quotation within 24 hours.`);
      navigate('/portal', { replace: true });
    } catch (error) {
      setBusy(false);
      if (error.code === 'CATALOG_CHANGED') catalog.reload();
      if (error.code === 'PROPOSAL_STALE' && error.meta?.allowManual)
        update({ budgetDraft: { ...cleanBudgetDraft(form.budgetDraft), proposalRef: null } });
      if (error.meta && error.meta.field) {
        setErrors((e) => ({ ...e, [error.meta.field]: error.message }));
        scrollTo(sectionForField(error.meta.field));
      }
      setFormError(
        error.code === 'PROPOSAL_STALE' && error.meta?.allowManual
          ? `${error.message} The expired link has been removed. Your selections remain saved; submit again to continue manually.`
          : error.message
      );
    }
  };

  const saveAndExit = () => {
    if (!saveDraft(user.id, form)) {
      notify(
        'Your draft could not be saved. Free some browser storage or remove some reference photos and try again.',
        'error'
      );
      return;
    }
    notify('Draft saved. You can finish it any time from your dashboard.', 'info');
    navigate('/portal');
  };

  const discard = () => {
    clearDraft(user.id);
    clearIntent();
    initialised.current = false;
    touched.current = false;
    setSavedAt(null);
    setDraftSaveFailed(false);
    setErrors({});
    setForm(EMPTY);
    setAgreed(false);
    catalog.reload();
  };

  if (catalog.error)
    return (
      <DashCard>
        <ErrorState error={catalog.error} onRetry={catalog.reload} />
      </DashCard>
    );

  const sectionHasError = (key) => Object.keys(errors).some((f) => sectionForField(f) === key);
  const menuComplete = !menuProblem(form.menu);
  const dishCount = menuCount(form.menu);
  const totalRentalPieces = rentalChosen.reduce((sum, line) => sum + line.qty, 0);
  const sectionDone = {
    details: Boolean(
      form.eventName &&
      !bookingOccasion(form.occasion, form.occasionOther).problem &&
      form.date &&
      form.startTime &&
      (rental || (form.endTime && form.guests))
    ),
    service: Boolean(form.serviceType),
    package: Boolean(pkg),
    styling: (!stylingEmpty(styling) || Boolean(form.referencePhotos.length)) && !stylingProblem(styling),
    items: rentalChosen.length > 0,
    food: menuComplete,
    venue: Boolean(rental && !delivered ? true : form.venueName && form.venueAddress && form.city),
    addons: chosenAddons.length > 0,
    budget: Boolean(form.budgetDraft?.amount),
    review: Boolean(agreed)
  };
  const sectionSummary = {
    details: [form.date ? formatDate(form.date) : '', !rental && form.guests ? `${form.guests} guests` : '']
      .filter(Boolean)
      .join(' · '),
    service: form.serviceType || '',
    package: pkg ? pkg.name : '',
    styling:
      (styling && themeLabel(styling)) ||
      (form.referencePhotos.length ? `${form.referencePhotos.length} photo(s)` : ''),
    items: rentalChosen.length ? `${totalRentalPieces} pcs (${rentalChosen.length} items)` : '',
    food: `${dishCount}/4 dishes`,
    venue: rental ? (delivered ? form.city || 'Delivery' : 'Store pick-up') : form.venueName || form.city || '',
    addons: chosenAddons.length ? `${chosenAddons.length} selected` : '',
    budget: form.budgetDraft?.amount ? peso(Number(form.budgetDraft.amount)) : '',
    review: agreed ? 'Terms accepted' : ''
  };
  const sections = SECTIONS.filter(([key]) =>
    rental
      ? !['package', 'styling', 'food', 'addons', 'budget'].includes(key)
      : key !== 'items' && (key !== 'food' || buffet)
  ).map(([key, label, short]) => [
    key,
    rental && key === 'venue' ? 'Pick Up or Delivery' : label,
    rental && key === 'venue' ? 'Pick-up / delivery' : short
  ]);
  const sectionNo = (key) => sections.findIndex(([k]) => k === key) + 1;
  const nextSectionFor = (key) => {
    const idx = sections.findIndex(([k]) => k === key);
    return idx >= 0 && idx < sections.length - 1 ? sections[idx + 1] : null;
  };
  const requiredSections = sections.filter(([key]) => !OPTIONAL_SECTIONS.has(key));
  const completedRequired = requiredSections.filter(([key]) => sectionDone[key]).length;

  return (
    <Box sx={{ maxWidth: 1120, mx: 'auto' }}>
      <Dialog
        open={Boolean(proposalHandoff)}
        onClose={() => {
          setProposalHandoff(null);
          navigate('/portal/book', { replace: true });
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Review this custom package</DialogTitle>
        <DialogContent>
          <Typography>
            {proposalHandoff?.conflicts.length
              ? `This replaces your saved ${proposalHandoff.conflicts.join(', ')}. `
              : 'Add this reviewed package to your reservation. '}
            Your event name, venue, access notes and reference photos stay saved. Any different food notes stay saved
            and require a fresh package review.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setProposalHandoff(null);
              navigate('/portal/book', { replace: true });
            }}
          >
            Keep current form
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              try {
                const latest = readDraft(user.id)?.form || form;
                const next = applyProposalHandoff(user.id, proposalHandoff.owner, latest, proposalHandoff.patch, {
                  confirmed: true
                });
                if (!saveDraft(user.id, next))
                  throw new Error('Your browser could not save this package. Try again after freeing storage.');
                setForm({ ...EMPTY, ...next });
                touched.current = true;
                setProposalVerified(true);
                setProposalHandoff(null);
                navigate('/portal/book', { replace: true });
              } catch (failure) {
                setFormError(failure.message);
              }
            }}
          >
            Use reviewed package
          </Button>
        </DialogActions>
      </Dialog>
      <PageHeader
        crumbs={[{ label: 'My Reservations', to: '/portal/reservations' }, { label: 'Book an Event' }]}
        title="Book an Event"
        chip={
          !draftSaveFailed &&
          savedAt && (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: 12.5,
                color: tokens.textOnDarkSoft
              }}
            >
              <CloudDoneOutlinedIcon sx={{ fontSize: 17, color: tokens.green }} />
              Draft saved {formatClock(savedAt)}
            </Box>
          )
        }
        actions={
          savedAt && (
            <Button onClick={discard} sx={{ color: tokens.textOnDarkSoft }}>
              Start over
            </Button>
          )
        }
      />

      {draftSaveFailed && (
        <AlertBanner tone="warning" sx={{ mb: 2 }}>
          Your latest changes could not be saved as a draft. Free some browser storage or remove some reference photos
          and try again before leaving this page.
        </AlertBanner>
      )}
      {recoveredReservation && (
        <AlertBanner tone="success" sx={{ mb: 2 }}>
          This package was already submitted as {recoveredReservation}. Your current form has been preserved.{' '}
          <Button onClick={() => navigate(`/portal/reservations/${encodeURIComponent(recoveredReservation)}`)}>
            View saved request
          </Button>
        </AlertBanner>
      )}

      {data ? (
        <DashCard sx={{ mb: 2, p: { xs: 2, sm: 2.25 }, borderRadius: 2.5, borderTop: `3px solid ${tokens.gold}` }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.45fr) minmax(260px, 0.9fr)' },
              gap: { xs: 2, md: 2.5 },
              alignItems: 'center'
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 1.25,
                  mb: 1.25
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 700, color: tokens.textPrimary }}>
                    Plan your celebration, one detail at a time
                  </Typography>
                  <Typography sx={{ mt: 0.25, fontSize: 12.5, color: tokens.textSecondary }}>
                    Your request is reviewed before you accept a quotation or pay.
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.6,
                    px: 1.15,
                    py: 0.35,
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: completedRequired === requiredSections.length ? tokens.successText : tokens.goldText,
                    backgroundColor:
                      completedRequired === requiredSections.length ? tokens.successBg : tokens.goldSubtle,
                    border: `1px solid ${
                      completedRequired === requiredSections.length ? tokens.successBorder : tokens.shellBorder
                    }`
                  }}
                >
                  <CheckCircleRoundedIcon sx={{ fontSize: 14 }} />
                  {completedRequired} of {requiredSections.length} required steps ready
                </Box>
              </Box>

              <LinearProgress
                aria-label="Current booking form section"
                variant="determinate"
                value={(Math.max(1, sectionNo(active)) / sections.length) * 100}
                sx={{
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: tokens.surfaceMuted,
                  '& .MuiLinearProgress-bar': { backgroundColor: tokens.gold }
                }}
              />
            </Box>

            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                backgroundColor: tokens.goldWash,
                border: `1px solid ${tokens.shellBorder}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 1,
                minWidth: 0
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: 1.5,
                    flexShrink: 0,
                    display: 'grid',
                    placeItems: 'center',
                    backgroundColor: tokens.goldSubtle,
                    color: tokens.goldText
                  }}
                >
                  <AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.textPrimary }}>
                    AI Event Concierge
                  </Typography>
                  <Typography sx={{ mt: 0.15, fontSize: 11.5, lineHeight: 1.45, color: tokens.textSecondary }}>
                    Not sure which package, menu, or budget setup fits best? Let our assistant pre-fill your plan.
                  </Typography>
                </Box>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 15 }} />}
                onClick={() => navigate('/portal/assistant')}
                sx={{
                  borderRadius: 999,
                  alignSelf: 'flex-start',
                  backgroundColor: tokens.cardLight,
                  fontSize: 12,
                  px: 1.35,
                  py: 0.35
                }}
              >
                Questions about your event? Ask the AI Assistant
              </Button>
            </Box>
          </Box>
        </DashCard>
      ) : (
        <Button onClick={() => navigate('/portal/assistant')} sx={{ mb: 2 }}>
          Questions about your event? Ask the AI Assistant
        </Button>
      )}

      <Box
        ref={chipBar}
        component="nav"
        aria-label="Form sections"
        sx={{
          display: 'flex',
          position: 'sticky',
          top: tokens.headerHeight + 8,
          zIndex: 8,
          gap: 0.75,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          px: 1.25,
          py: 0.85,
          mb: 2.5,
          borderRadius: 2,
          backgroundColor: tokens.cardLight,
          border: `1px solid ${tokens.cardLightBorder}`,
          boxShadow: tokens.shadowDash
        }}
      >
        {sections.map(([key, , short], i) => {
          const isCurrent = active === key;
          const hasErr = sectionHasError(key);
          const isDone = sectionDone[key];
          return (
            <ButtonBase
              key={key}
              data-section={key}
              onClick={() => scrollTo(key)}
              aria-current={isCurrent ? 'true' : undefined}
              sx={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.65,
                px: 1.25,
                py: 0.6,
                borderRadius: 999,
                fontFamily: 'inherit',
                fontSize: 12,
                fontWeight: isCurrent ? 700 : 600,
                whiteSpace: 'nowrap',
                color: isCurrent ? tokens.onGold : hasErr ? tokens.dangerText : tokens.textPrimary,
                backgroundColor: isCurrent ? tokens.gold : hasErr ? tokens.dangerBg : tokens.surfaceSubtle,
                border: `1px solid ${
                  isCurrent
                    ? tokens.goldDark
                    : hasErr
                      ? tokens.dangerBorder
                      : isDone
                        ? tokens.successBorder
                        : tokens.cardLightBorder
                }`,
                transition: 'background-color 0.15s ease, border-color 0.15s ease',
                '&:hover': {
                  borderColor: isCurrent ? tokens.goldDark : tokens.gold
                },
                '@media (pointer: coarse)': { py: 0.8 }
              }}
            >
              {isDone ? (
                <CheckCircleRoundedIcon sx={{ fontSize: 14, color: isCurrent ? tokens.onGold : tokens.green }} />
              ) : (
                <Box
                  component="span"
                  sx={{
                    width: 17,
                    height: 17,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 10.5,
                    fontWeight: 700,
                    backgroundColor: isCurrent ? 'rgba(0,0,0,0.14)' : tokens.surfaceMuted,
                    color: isCurrent ? tokens.onGold : tokens.textSecondary
                  }}
                >
                  {i + 1}
                </Box>
              )}
              <span>{short}</span>
            </ButtonBase>
          );
        })}
      </Box>

      {!data ? (
        <DashCard>
          <ListSkeleton rows={8} height={52} />
        </DashCard>
      ) : (
        <Box
          className="booking-layout"
          component="form"
          aria-label="Customer reservation"
          autoComplete="off"
          noValidate
          onSubmit={(event) => event.preventDefault()}
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            [SUMMARY_LAYOUT]: { gridTemplateColumns: 'minmax(0, 1fr) 296px', pb: 0 },
            [WIDE_LAYOUT]: { gridTemplateColumns: 'minmax(0, 1fr) 316px' },
            gap: { xs: 2.5, md: 3 },
            alignItems: 'start',
            pb: '140px'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
              minWidth: 0,
              containerType: 'inline-size',
              containerName: 'booking-form'
            }}
          >
            {formError && <AlertBanner tone="error">{formError}</AlertBanner>}

            <Section
              id="details"
              index={sectionNo('details')}
              title="Event Details"
              subtitle={
                rental ? 'Tell us what the items are for and when you need them' : 'Tell us about the celebration'
              }
              done={sectionDone.details}
              active={active === 'details'}
              summary={sectionSummary.details}
              stageLabel={SECTION_STAGES.details}
              icon={SECTION_ICONS.details}
              nextSection={nextSectionFor('details')}
              onNext={scrollTo}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormField
                  id="f-eventName"
                  label="Event name"
                  autoComplete="off"
                  required
                  value={form.eventName}
                  onChange={(e) => update({ eventName: e.target.value })}
                  error={errors.eventName}
                  placeholder="e.g. Santos–Reyes Wedding Reception"
                  inputProps={{ maxLength: 80 }}
                />

                <Box
                  sx={{
                    display: 'grid',
                    ...FORM_COLUMNS,
                    gap: 2
                  }}
                >
                  <SelectField
                    id="f-occasion"
                    label="Occasion"
                    required
                    value={form.occasion}
                    onChange={(e) => pickOccasion(e.target.value)}
                    options={OCCASIONS}
                    placeholder="Select an occasion"
                    error={errors.occasion}
                    sx={rental ? { gridColumn: '1 / -1' } : undefined}
                  />
                  {!rental && (
                    <FormField
                      id="f-guests"
                      label="Guest count"
                      autoComplete="off"
                      required
                      value={form.guests}
                      onChange={(e) => updateGuests(e.target.value)}
                      error={errors.guests}
                      hint={
                        pkg
                          ? `Default for ${pkg.name}: ${pkg.guests} guests${extraGuests ? `. The package grows to your ${form.guests} guests; the ${extraGuests} extra are priced in your quotation.` : ''}`
                          : `Between ${RULES.minGuests} and ${RULES.maxGuests} guests`
                      }
                      inputProps={{ inputMode: 'numeric', maxLength: String(RULES.maxGuests).length }}
                    />
                  )}
                  {form.occasion === OCCASION_OTHER && (
                    <FormField
                      ref={occasionBox}
                      id="f-occasionOther"
                      label="Your occasion"
                      required
                      value={form.occasionOther}
                      onChange={(e) => update({ occasionOther: e.target.value })}
                      error={errors.occasionOther}
                      placeholder="e.g. Baby Shower, Despedida, Housewarming"
                      inputProps={{ maxLength: OCCASION_OTHER_RANGE.max }}
                      sx={{ gridColumn: '1 / -1' }}
                    />
                  )}
                </Box>

                <Divider sx={{ my: 0.25 }} />

                <DateField
                  id="f-date"
                  label={rental ? 'Date you need the items' : 'Event date'}
                  required
                  inline
                  rental={rental}
                  value={form.date}
                  onChange={(v) => update({ date: v })}
                  error={errors.date}
                />

                <Box
                  sx={{
                    display: 'grid',
                    ...FORM_COLUMNS,
                    gap: 2
                  }}
                >
                  <TimeField
                    id="f-startTime"
                    label={rental ? (delivered ? 'Delivery time' : 'Pick-up time') : 'Start time'}
                    required
                    value={form.startTime}
                    onChange={(v) =>
                      update({
                        startTime: v,
                        endTime: form.endTime ? shiftEndTime(form.startTime, form.endTime, v) : initialEndTime(v)
                      })
                    }
                    error={errors.startTime}
                    min={RULES.earliestStart}
                    max={RULES.latestStart}
                    step={30}
                  />
                  {!rental && (
                    <EndTimeField
                      id="f-endTime"
                      required
                      startTime={form.startTime}
                      sixHourFee={data.sixHourFee ?? DEFAULT_SIX_HOUR_FEE}
                      value={form.endTime}
                      onChange={(v) => update({ endTime: v })}
                      error={errors.endTime}
                      hint={`Events run ${RULES.minEventHours} to ${RULES.maxEventHours} hours.`}
                    />
                  )}
                </Box>
              </Box>
            </Section>

            <Section
              id="service"
              index={sectionNo('service')}
              title="What You Are Booking"
              subtitle="This decides whether we cook for you."
              error={errors.serviceType}
              done={sectionDone.service}
              active={active === 'service'}
              summary={sectionSummary.service}
              stageLabel={SECTION_STAGES.service}
              icon={SECTION_ICONS.service}
              nextSection={nextSectionFor('service')}
              onNext={scrollTo}
            >
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr)',
                  '@container booking-form (min-width: 480px)': {
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'
                  },
                  ...(rentalPkg
                    ? {
                        '@container booking-form (min-width: 620px)': {
                          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))'
                        }
                      }
                    : {}),
                  gap: 1.5
                }}
              >
                {[
                  [
                    'Buffet and Catering',
                    'We cook your food',
                    `Four dishes, with up to two per category, and ${BUFFET_DRINKS.toLowerCase()}. Charged ${peso(data.pricePerPlate)} per person.`,
                    RestaurantMenuOutlinedIcon,
                    `${peso(data.pricePerPlate)} / guest`,
                    'Full Service'
                  ],
                  [
                    'Catering only',
                    'Equipment and setup only',
                    'Tables, chairs, linens, food warmers and tableware. You provide the food, and there is no per-person charge.',
                    TableBarOutlinedIcon,
                    'Package rate',
                    'Setup & Dining'
                  ],
                  ...(rentalPkg
                    ? [
                        [
                          RENTAL_SERVICE,
                          'Rent items only',
                          `Pick the tables, chairs, linens, warmers or decor you need, priced per piece. Pick up in ${RENTAL.pickupAddress} or have them delivered.`,
                          Inventory2OutlinedIcon,
                          'Per piece',
                          'Equipment Only'
                        ]
                      ]
                    : [])
                ].map(([value, heading, description, TierIcon, priceBadge, tagLabel]) => {
                  const selected = form.serviceType === value;
                  return (
                    <ButtonBase
                      key={value}
                      onClick={() => chooseService(value)}
                      aria-pressed={selected}
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        justifyContent: 'space-between',
                        p: 1.75,
                        textAlign: 'left',
                        borderRadius: 2,
                        fontFamily: 'inherit',
                        transition: 'border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease',
                        border: `1.5px solid ${selected ? tokens.goldDark : tokens.cardLightBorder}`,
                        backgroundColor: selected ? tokens.goldWash : tokens.cardLight,
                        boxShadow: selected ? `0 6px 16px -10px ${tokens.goldGlow}` : 'none',
                        '&:hover': { borderColor: selected ? tokens.goldDark : tokens.placeholder }
                      }}
                    >
                      <Box>
                        <Box
                          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1 }}
                        >
                          <Box
                            component="span"
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              px: 0.9,
                              py: 0.25,
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              color: selected ? tokens.goldText : tokens.textSecondary,
                              backgroundColor: selected ? tokens.goldSubtle : tokens.surfaceMuted
                            }}
                          >
                            <TierIcon sx={{ fontSize: 13 }} />
                            {tagLabel}
                          </Box>
                          {selected ? (
                            <CheckCircleRoundedIcon sx={{ color: tokens.goldDark, fontSize: 19 }} />
                          ) : (
                            <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput, fontSize: 19 }} />
                          )}
                        </Box>
                        <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: tokens.textPrimary }}>
                          {value}
                        </Typography>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: tokens.goldText, mt: 0.15 }}>
                          {heading}
                        </Typography>
                        <Typography sx={{ mt: 0.65, fontSize: 12, lineHeight: 1.5, color: tokens.textSecondary }}>
                          {description}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          mt: 1.25,
                          pt: 1,
                          borderTop: `1px solid ${tokens.dividerFaint}`,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 1
                        }}
                      >
                        <Typography sx={{ fontSize: 11, color: tokens.textMuted }}>Pricing</Typography>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: tokens.textPrimary }}>
                          {priceBadge}
                        </Typography>
                      </Box>
                    </ButtonBase>
                  );
                })}
              </Box>
              {buffet && (
                <AlertBanner tone="info" sx={{ mt: 2 }}>
                  Our buffet is served plated by our team. The {peso(data.pricePerPlate)} per person covers the four
                  dishes and {BUFFET_DRINKS.toLowerCase()} for every guest.
                </AlertBanner>
              )}
            </Section>

            {!rental && (
              <Section
                id="package"
                index={sectionNo('package')}
                title="Package"
                subtitle="Choose a package closest to your guest count. Signature Wedding and Royal Wedding are available only for Wedding occasions."
                error={errors.packageId}
                done={sectionDone.package}
                active={active === 'package'}
                summary={sectionSummary.package}
                stageLabel={SECTION_STAGES.package}
                icon={SECTION_ICONS.package}
                nextSection={nextSectionFor('package')}
                onNext={scrollTo}
              >
                {form.packageProposalRef && (
                  <Box sx={{ mb: 2 }}>
                    <PackageBudgetSummary form={form} />
                    <Typography sx={{ fontSize: 12 }}>
                      Choosing a catalog package below replaces your custom package selection.
                    </Typography>
                  </Box>
                )}
                <Box sx={{ display: 'grid', ...FORM_COLUMNS, gap: 1.5 }}>
                  {packages.map((p) => {
                    const selected = p.id === form.packageId;
                    return (
                      <ButtonBase
                        key={p.id}
                        onClick={() =>
                          update({
                            packageId: p.id,
                            packageProposalRef: null,
                            packageProposalDisplay: null,
                            packageProposalContext: null,
                            packageProposalStale: false
                          })
                        }
                        aria-pressed={selected}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          justifyContent: 'space-between',
                          p: 1.75,
                          textAlign: 'left',
                          borderRadius: 2,
                          fontFamily: 'inherit',
                          transition: 'border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease',
                          border: `1.5px solid ${selected ? tokens.goldDark : tokens.cardLightBorder}`,
                          backgroundColor: selected ? tokens.goldWash : tokens.cardLight,
                          boxShadow: selected ? `0 6px 16px -10px ${tokens.goldGlow}` : 'none',
                          '&:hover': { borderColor: selected ? tokens.goldDark : tokens.placeholder }
                        }}
                      >
                        <Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                            <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: tokens.textPrimary }}>
                              {p.name}
                            </Typography>
                            {selected ? (
                              <CheckCircleRoundedIcon sx={{ color: tokens.goldDark, fontSize: 19 }} />
                            ) : (
                              <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput, fontSize: 19 }} />
                            )}
                          </Box>
                          <Typography sx={{ mt: 0.5, fontSize: 12, lineHeight: 1.5, color: tokens.textSecondary }}>
                            {p.description}
                          </Typography>
                        </Box>
                        <Box
                          onClick={(e) => e.stopPropagation()}
                          sx={{
                            mt: 1.5,
                            pt: 1.15,
                            borderTop: `1px solid ${tokens.dividerFaint}`,
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 1
                          }}
                        >
                          <Typography
                            sx={{
                              px: 0.9,
                              py: 0.2,
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 600,
                              color: tokens.textSecondary,
                              backgroundColor: tokens.surfaceMuted
                            }}
                          >
                            Default: {p.guests} guests
                          </Typography>
                          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.textPrimary }}>
                            {buffet ? 'Included in buffet rate' : peso(p.price)}
                          </Typography>
                        </Box>
                      </ButtonBase>
                    );
                  })}
                </Box>
                {pkg && (
                  <Box
                    sx={{
                      mt: 2,
                      p: 1.75,
                      borderRadius: 2,
                      backgroundColor: tokens.surfaceSubtle,
                      border: `1px solid ${tokens.cardLightBorder}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.25
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>
                        {pkg.name} includes{extraGuests ? ` for your ${form.guests} guests` : ''}
                      </Typography>
                      {extraGuests > 0 && (
                        <Typography sx={{ mt: 0.5, fontSize: 12, fontWeight: 600, color: tokens.goldDark }}>
                          Adjusted from {pkg.guests} to your {form.guests} guests. We confirm the items marked "to
                          confirm".
                          {buffet
                            ? ' Standard dining equipment is included in your buffet rate.'
                            : ` Equipment for ${extraGuests} extra guests is priced in your quotation.`}
                        </Typography>
                      )}
                      {form.serviceType && (
                        <Typography sx={{ mt: 0.35, fontSize: 12, lineHeight: 1.5, color: tokens.textSecondary }}>
                          {buffet
                            ? 'The per-person buffet rate includes four ulam and the standard equipment and setup listed here.'
                            : 'Booked as catering only: the equipment listed here, with no food.'}
                        </Typography>
                      )}
                    </Box>

                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 0.75,
                        minWidth: 0
                      }}
                    >
                      {packageItems.map((item, i) => (
                        <Box
                          key={`${item.name}-${i}`}
                          component="span"
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.4,
                            px: 1.05,
                            py: 0.4,
                            borderRadius: 1.5,
                            fontSize: 12,
                            backgroundColor: item.toConfirm ? tokens.goldSubtle : tokens.cardLight,
                            border: `1px solid ${item.toConfirm ? tokens.shellBorder : tokens.cardLightBorder}`,
                            color: item.toConfirm ? tokens.goldDark : tokens.textSecondary
                          }}
                        >
                          {item.toConfirm ? (
                            formatBookingItem(item)
                          ) : item.qty !== item.defaultQty ? (
                            <>
                              <Box component="b" sx={{ color: tokens.textPrimary }}>
                                {item.qty}
                              </Box>{' '}
                              {item.name}
                            </>
                          ) : (
                            formatBookingItem(item)
                          )}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
              </Section>
            )}

            {!rental && (
              <Section
                id="styling"
                index={sectionNo('styling')}
                title="Theme and Colors"
                subtitle="Optional. Tell us the look you want so our team sets up your tables, linens and backdrop to match."
                done={sectionDone.styling}
                active={active === 'styling'}
                optional
                summary={sectionSummary.styling}
                stageLabel={SECTION_STAGES.styling}
                icon={SECTION_ICONS.styling}
                nextSection={nextSectionFor('styling')}
                onNext={scrollTo}
              >
                <StylingFields
                  idPrefix="f-styling"
                  value={form.styling}
                  onChange={updateStyling}
                  occasion={form.occasion}
                  errors={errors}
                  forCustomer
                  referencePhotos={form.referencePhotos}
                  onPhotoBusyChange={setPhotoBusy}
                  onReferencePhotoChange={updateReferencePhoto}
                >
                  {reminders.length > 0 && (
                    <AlertBanner tone="info" sx={{ mt: 2 }}>
                      You mentioned {wordList(reminders.map((r) => r.word))}. {wordList(reminders.map((r) => r.name))}{' '}
                      {reminders.length === 1 ? 'is an additional charge' : 'are additional charges'}: tick{' '}
                      {reminders.length === 1 ? 'it' : 'them'} under Additional Charges if you want us to provide{' '}
                      {reminders.length === 1 ? 'it' : 'them'}.
                      <Box sx={{ mt: 0.5 }}>
                        <Button
                          size="small"
                          onClick={() => scrollTo('addons')}
                          sx={{ px: 0, minWidth: 0, fontWeight: 700 }}
                        >
                          Go to Additional Charges
                        </Button>
                      </Box>
                    </AlertBanner>
                  )}
                </StylingFields>
              </Section>
            )}

            {rental && (
              <Section
                id="items"
                index={sectionNo('items')}
                title="Items to Rent"
                subtitle="Type how many you need of each item. Prices are per piece for your whole rental."
                error={errors.rentalItems}
                done={sectionDone.items}
                active={active === 'items'}
                summary={sectionSummary.items}
                stageLabel={SECTION_STAGES.items}
                icon={SECTION_ICONS.items}
                nextSection={nextSectionFor('items')}
                onNext={scrollTo}
              >
                {!form.date && (
                  <AlertBanner tone="info" sx={{ mb: 2 }}>
                    Choose your date above to see what is available that day.
                  </AlertBanner>
                )}
                {rentalChosen.length > 0 && (
                  <Box
                    sx={{
                      mb: 2,
                      p: 1.5,
                      borderRadius: 2,
                      backgroundColor: tokens.goldWash,
                      border: `1px solid ${tokens.shellBorder}`,
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1
                    }}
                  >
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>
                      {rentalChosen.length} {rentalChosen.length === 1 ? 'item type' : 'item types'} ·{' '}
                      {totalRentalPieces} pieces selected
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 800, color: tokens.goldText }}>
                      Items subtotal: {peso(quote.rental)}
                    </Typography>
                  </Box>
                )}
                {INVENTORY_CATEGORIES.filter((category) => data.rentals.some((i) => i.category === category)).map(
                  (category) => (
                    <Box
                      key={category}
                      sx={{
                        mb: 2,
                        p: { xs: 1.5, sm: 2 },
                        borderRadius: 2,
                        backgroundColor: tokens.surfaceSubtle,
                        border: `1px solid ${tokens.cardLightBorder}`
                      }}
                    >
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.goldText, mb: 1.25 }}>
                        {titleCase(category)}
                      </Typography>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr)',
                          '@container booking-form (min-width: 600px)': {
                            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'
                          },
                          gap: 1.25
                        }}
                      >
                        {data.rentals
                          .filter((i) => i.category === category)
                          .map((item) => {
                            const qty = form.rentalQty[item.id] || '';
                            const on = Number(qty) > 0;
                            const free = avail[item.id] && AVAILABILITY[avail[item.id].status];
                            const left = avail[item.id] ? avail[item.id].left : null;
                            const tooMany = stockError(item.id);
                            return (
                              <Box
                                key={item.id}
                                sx={{
                                  display: 'grid',
                                  gridTemplateColumns: { xs: 'minmax(0, 1fr) 76px', sm: 'minmax(0, 1fr) 96px' },
                                  gap: 1.25,
                                  alignItems: 'center',
                                  p: 1.25,
                                  borderRadius: 1.5,
                                  border: `1.5px solid ${on ? tokens.goldDark : tokens.cardLightBorder}`,
                                  backgroundColor: on ? tokens.goldWash : tokens.cardLight
                                }}
                              >
                                <Box
                                  sx={{
                                    display: 'flex',
                                    gap: 1.25,
                                    minWidth: 0,
                                    alignItems: { xs: 'flex-start', sm: 'center' },
                                    flexDirection: { xs: 'column', sm: 'row' }
                                  }}
                                >
                                  <Box sx={{ width: 80, flexShrink: 0 }}>
                                    <EquipmentPhoto item={item} compact height={76} />
                                  </Box>
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{item.name}</Typography>
                                    <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>
                                      {peso(item.price)} per piece{on ? ` · ${peso(item.price * Number(qty))}` : ''}
                                    </Typography>
                                    <Typography sx={{ fontSize: 11, color: tokens.textMuted }}>
                                      Damage fee {peso(item.damageFee)} per piece
                                    </Typography>
                                    <Typography
                                      sx={{
                                        fontSize: 11.5,
                                        fontWeight: 700,
                                        color: free ? free.color : tokens.textMuted
                                      }}
                                    >
                                      {free
                                        ? free.label(left)
                                        : form.date
                                          ? 'Checking how many are free…'
                                          : 'Choose a date to see how many are free'}
                                    </Typography>
                                  </Box>
                                </Box>
                                <FormField
                                  id={`f-rent-${item.id}`}
                                  value={qty}
                                  onChange={(e) => updateRentalQty(item.id, e.target.value)}
                                  error={errors[`rental.${item.id}`] || tooMany}
                                  placeholder="0"
                                  disabled={left === 0 && !qty}
                                  inputProps={{
                                    inputMode: 'numeric',
                                    maxLength: String(RENTAL.maxQty).length,
                                    'aria-label': `How many ${item.name}`
                                  }}
                                />
                              </Box>
                            );
                          })}
                      </Box>
                    </Box>
                  )
                )}
                <AlertBanner tone="info">
                  Items that come back damaged or missing are charged at the damage fee shown for each item.
                </AlertBanner>
              </Section>
            )}

            {buffet && (
              <Section
                id="food"
                index={sectionNo('food')}
                title="Your Menu"
                subtitle={`Pick exactly 4 dishes, with up to 2 from any category, or add your own dish. ${peso(data.pricePerPlate)} per person covers all of it.`}
                done={sectionDone.food}
                active={active === 'food'}
                summary={sectionSummary.food}
                stageLabel={SECTION_STAGES.food}
                icon={SECTION_ICONS.food}
                nextSection={nextSectionFor('food')}
                onNext={scrollTo}
              >
                <MenuPicker
                  idPrefix="f-dish"
                  menu={form.menu}
                  dishes={data.dishes}
                  onChange={setDish}
                  errors={errors}
                  required
                />
                <AlertBanner tone="info" sx={{ mt: 2 }}>
                  For a dish not on the list, use Add other dish and enter one dish per box. Dessert is selected
                  separately under Additional Charges.
                </AlertBanner>

                <Divider sx={{ my: 2.25 }} />

                <Box sx={{ display: 'grid', ...FORM_COLUMNS, gap: 2, alignItems: 'start' }}>
                  <Box sx={{ gridColumn: '1 / -1' }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary, mb: 0.25 }}>
                      Drinks & Kitchen Instructions
                    </Typography>
                    <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                      Unlimited water is included. Tell us which juice you prefer and any dietary notes for our kitchen.
                    </Typography>
                  </Box>
                  <FormField
                    id="f-juice"
                    label="Preferred juice"
                    optional
                    value={form.menu.juice || ''}
                    onChange={(e) => setDish('juice', e.target.value)}
                    error={errors['menu.juice']}
                    placeholder="e.g. Orange, pineapple, or iced tea"
                    hint="We will confirm availability with your quotation."
                    inputProps={{ maxLength: 120 }}
                  />
                  <FormField
                    id="f-foodNotes"
                    label="Anything we should know about the food"
                    optional
                    multiline
                    minRows={3}
                    value={form.foodNotes}
                    onChange={(e) => update({ foodNotes: e.target.value })}
                    placeholder="Allergies, a vegetarian portion, softer food for elderly guests, serving time…"
                    hint="This does not change the price. Our kitchen reads it before the event."
                    inputProps={{ maxLength: 500 }}
                  />
                </Box>
              </Section>
            )}

            {rental ? (
              <Section
                id="venue"
                index={sectionNo('venue')}
                title="Pick Up or Delivery"
                error={errors.fulfilment}
                done={sectionDone.venue}
                active={active === 'venue'}
                summary={sectionSummary.venue}
                stageLabel={SECTION_STAGES.venue}
                icon={SECTION_ICONS.venue}
                nextSection={nextSectionFor('venue')}
                onNext={scrollTo}
              >
                <Box sx={{ display: 'grid', ...FORM_COLUMNS, gap: 1.5 }}>
                  {[
                    [
                      'pickup',
                      'Pick up',
                      `Free. Collect the items at ${RENTAL.pickupAddress}.`,
                      StorefrontOutlinedIcon,
                      'Free'
                    ],
                    [
                      'delivery',
                      'Delivery',
                      `${peso(RENTAL.deliveryFee)} standard fee. A large order may be quoted a different delivery fee.`,
                      LocalShippingOutlinedIcon,
                      peso(RENTAL.deliveryFee)
                    ]
                  ].map(([value, heading, description, ModeIcon, feeBadge]) => {
                    const selected = form.fulfilment === value;
                    return (
                      <ButtonBase
                        key={value}
                        onClick={() => update({ fulfilment: value })}
                        aria-pressed={selected}
                        sx={{
                          display: 'block',
                          p: 1.75,
                          textAlign: 'left',
                          borderRadius: 2,
                          fontFamily: 'inherit',
                          border: `1.5px solid ${selected ? tokens.goldDark : tokens.cardLightBorder}`,
                          backgroundColor: selected ? tokens.goldWash : tokens.cardLight,
                          '&:hover': { borderColor: selected ? tokens.goldDark : tokens.placeholder }
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85 }}>
                            <ModeIcon sx={{ fontSize: 19, color: selected ? tokens.goldDark : tokens.textSecondary }} />
                            <Typography sx={{ fontSize: 14.5, fontWeight: 700, color: tokens.textPrimary }}>
                              {heading}
                            </Typography>
                          </Box>
                          {selected ? (
                            <CheckCircleRoundedIcon sx={{ color: tokens.goldDark, fontSize: 19 }} />
                          ) : (
                            <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput, fontSize: 19 }} />
                          )}
                        </Box>
                        <Typography sx={{ mt: 0.65, fontSize: 12, lineHeight: 1.5, color: tokens.textSecondary }}>
                          {description}
                        </Typography>
                        <Box
                          sx={{
                            mt: 1.25,
                            pt: 1,
                            borderTop: `1px solid ${tokens.dividerFaint}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                        >
                          <Typography sx={{ fontSize: 11, color: tokens.textMuted }}>Fee</Typography>
                          <Typography sx={{ fontSize: 12, fontWeight: 700, color: tokens.textPrimary }}>
                            {feeBadge}
                          </Typography>
                        </Box>
                      </ButtonBase>
                    );
                  })}
                </Box>
                {delivered && (
                  <>
                    <Divider sx={{ my: 2.25 }} />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <Box sx={{ display: 'grid', ...FORM_COLUMNS, gap: 2 }}>
                        <FormField
                          id="f-venueName"
                          label="Place name"
                          required
                          value={form.venueName}
                          onChange={(e) => update({ venueName: e.target.value })}
                          error={errors.venueName}
                          placeholder="e.g. Santos Residence"
                        />
                        <FormField
                          id="f-city"
                          label="City"
                          required
                          value={form.city}
                          onChange={(e) => update({ city: e.target.value })}
                          error={errors.city}
                          placeholder="e.g. Lipa City"
                        />
                      </Box>
                      <FormField
                        id="f-venueAddress"
                        label="Delivery address"
                        required
                        value={form.venueAddress}
                        onChange={(e) => update({ venueAddress: e.target.value })}
                        error={errors.venueAddress}
                        placeholder="Street, barangay"
                      />
                      <FormField
                        id="f-accessNotes"
                        label="Notes for the delivery"
                        optional
                        multiline
                        minRows={3}
                        value={form.accessNotes}
                        onChange={(e) => update({ accessNotes: e.target.value })}
                        placeholder="Landmark, gate, who receives the items…"
                        hint="Include gate pass rules, landmark directions, or unloading instructions so our crew arrives on time."
                        inputProps={{ maxLength: 500 }}
                      />
                    </Box>
                  </>
                )}
              </Section>
            ) : (
              <Section
                id="venue"
                index={sectionNo('venue')}
                title="Venue and Logistics"
                subtitle="Tell us where the celebration takes place and any access instructions for our setup team."
                done={sectionDone.venue}
                active={active === 'venue'}
                summary={sectionSummary.venue}
                stageLabel={SECTION_STAGES.venue}
                icon={SECTION_ICONS.venue}
                nextSection={nextSectionFor('venue')}
                onNext={scrollTo}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'grid', ...FORM_COLUMNS, gap: 2 }}>
                    <FormField
                      id="f-venueName"
                      label="Venue name"
                      required
                      value={form.venueName}
                      onChange={(e) => update({ venueName: e.target.value })}
                      error={errors.venueName}
                      placeholder="e.g. The Glass Garden"
                    />
                    <FormField
                      id="f-city"
                      label="City"
                      required
                      value={form.city}
                      onChange={(e) => update({ city: e.target.value })}
                      error={errors.city}
                      placeholder="e.g. Pasig City"
                    />
                  </Box>
                  <FormField
                    id="f-venueAddress"
                    label="Venue address"
                    required
                    value={form.venueAddress}
                    onChange={(e) => update({ venueAddress: e.target.value })}
                    error={errors.venueAddress}
                    placeholder="Street, barangay"
                  />
                  <FormField
                    id="f-accessNotes"
                    label="Access notes"
                    optional
                    multiline
                    minRows={3}
                    value={form.accessNotes}
                    onChange={(e) => update({ accessNotes: e.target.value })}
                    placeholder="Gate, parking, elevator, loading area, setup time restrictions…"
                    hint="Let our crew know about building rules, ingress hours, or unloading points."
                    inputProps={{ maxLength: 500 }}
                  />
                </Box>
              </Section>
            )}

            {!rental && (
              <Section
                id="addons"
                index={sectionNo('addons')}
                title="Additional Charges"
                subtitle="Optional. Tick what you need. A charge marked Quoted is priced in your quotation."
                done={sectionDone.addons}
                active={active === 'addons'}
                optional
                summary={sectionSummary.addons}
                stageLabel={SECTION_STAGES.addons}
                icon={SECTION_ICONS.addons}
                nextSection={nextSectionFor('addons')}
                onNext={scrollTo}
              >
                {chosenAddons.length > 0 && (
                  <Box
                    sx={{
                      mb: 2,
                      p: 1.35,
                      borderRadius: 1.75,
                      backgroundColor: tokens.goldWash,
                      border: `1px solid ${tokens.shellBorder}`,
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1
                    }}
                  >
                    <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.textPrimary }}>
                      {chosenAddons.length} additional {chosenAddons.length === 1 ? 'service' : 'services'} selected
                    </Typography>
                    {quote.addons > 0 && (
                      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: tokens.goldText }}>
                        Known extras: {peso(quote.addons)}
                      </Typography>
                    )}
                  </Box>
                )}
                {[
                  { key: 'plain', list: data.addons.filter((a) => !a.hasPackages) },
                  {
                    key: 'packages',
                    list: data.addons.filter((a) => a.hasPackages),
                    title: 'Additional Charges With Packages',
                    hint: 'Tick one, then pick the package you want.'
                  }
                ]
                  .filter((group) => group.list.length)
                  .map((group, groupIndex) => (
                    <Box key={group.key} sx={groupIndex ? { mt: 2.5 } : undefined}>
                      {group.title && (
                        <Box sx={{ mb: 1.25 }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>
                            {group.title}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>{group.hint}</Typography>
                        </Box>
                      )}
                      <Box
                        sx={{
                          display: 'grid',
                          alignItems: 'start',
                          gridTemplateColumns: 'minmax(0, 1fr)',
                          ...(group.key === 'plain'
                            ? {
                                '@container booking-form (min-width: 520px)': {
                                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))'
                                }
                              }
                            : {}),
                          gap: 1.5
                        }}
                      >
                        {group.list.map((a) => {
                          const on = form.addonIds.includes(a.id);
                          const sized = hasSizes(a) && !a.hasPackages;
                          const packaged = hasSizes(a) && a.hasPackages;
                          const from = packaged ? lowestPackagePrice(a) : null;
                          return (
                            <Box
                              key={a.id}
                              onClick={(e) => {
                                if (
                                  !e.target.closest(
                                    'button,input,textarea,label,[role=combobox],[role=radio],[role=option],[role=listbox],.MuiCheckbox-root,.MuiFormControl-root'
                                  )
                                )
                                  toggleAddon(a.id);
                              }}
                              sx={{
                                display: 'flex',
                                gap: 1.15,
                                p: 1.75,
                                borderRadius: 2,
                                cursor: 'pointer',
                                transition: 'border-color 0.15s ease, background-color 0.15s ease',
                                border: `1.5px solid ${on ? tokens.goldDark : tokens.cardLightBorder}`,
                                backgroundColor: on ? tokens.goldWash : tokens.cardLight,
                                '&:hover': { borderColor: on ? tokens.goldDark : tokens.placeholder }
                              }}
                            >
                              <Checkbox
                                inputProps={{ 'aria-label': a.name }}
                                checked={on}
                                onChange={() => toggleAddon(a.id)}
                                size="small"
                                sx={{ p: 0.25, alignSelf: 'flex-start' }}
                              />
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Box
                                  sx={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 1
                                  }}
                                >
                                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>
                                    {a.name}
                                  </Typography>
                                  <Typography
                                    sx={{
                                      px: 0.9,
                                      py: 0.2,
                                      borderRadius: 999,
                                      fontSize: 11.5,
                                      fontWeight: 700,
                                      whiteSpace: 'nowrap',
                                      color: (packaged ? from : a.price && !sized)
                                        ? tokens.textPrimary
                                        : tokens.goldText,
                                      backgroundColor: (packaged ? from : a.price && !sized)
                                        ? tokens.surfaceMuted
                                        : tokens.goldSubtle
                                    }}
                                  >
                                    {sized
                                      ? 'By size'
                                      : packaged
                                        ? from
                                          ? `From ${peso(from)}`
                                          : 'Quoted'
                                        : a.price
                                          ? `${peso(a.price)}${a.hasQuantity ? ' each' : ''}`
                                          : 'Quoted'}
                                  </Typography>
                                </Box>
                                <Typography
                                  sx={{ mt: 0.35, fontSize: 12, lineHeight: 1.5, color: tokens.textSecondary }}
                                >
                                  {a.description}
                                </Typography>
                                {a.id === DESSERT_ADDON_ID && on && (
                                  <Box
                                    onClick={(e) => e.stopPropagation()}
                                    sx={{
                                      mt: 1.5,
                                      p: 1.35,
                                      borderRadius: 1.5,
                                      backgroundColor: tokens.cardLight,
                                      border: `1px solid ${tokens.cardLightBorder}`
                                    }}
                                  >
                                    <DessertFields
                                      idPrefix="f-dessert"
                                      value={form.menu.dessert}
                                      onChange={(value) => setDish('dessert', value)}
                                      errors={errors}
                                    />
                                  </Box>
                                )}
                                {a.hasQuantity && on && (
                                  <FormField
                                    id={`f-qty-${a.id}`}
                                    label="Quantity"
                                    value={form.addonQty[a.id] || ''}
                                    onChange={(e) => updateAddonQty(a.id, e.target.value)}
                                    error={errors[`addonQty.${a.id}`]}
                                    inputProps={{
                                      inputMode: 'numeric',
                                      maxLength: 2,
                                      'aria-label': `How many ${a.name}`
                                    }}
                                    sx={{ mt: 1.25, maxWidth: 140 }}
                                  />
                                )}
                                {sized && on && (
                                  <Box
                                    onClick={(e) => e.stopPropagation()}
                                    sx={{
                                      mt: 1.25,
                                      p: 1.35,
                                      borderRadius: 1.5,
                                      backgroundColor: tokens.cardLight,
                                      border: `1px solid ${tokens.cardLightBorder}`,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 1,
                                      cursor: 'default'
                                    }}
                                  >
                                    {a.sizes.map((s) => {
                                      const left = leftFor(s);
                                      return (
                                        <Box
                                          key={s.id}
                                          sx={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            justifyContent: 'space-between',
                                            gap: 1.5
                                          }}
                                        >
                                          <Box sx={{ minWidth: 0, pt: 3 }}>
                                            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{s.size}</Typography>
                                            <Typography
                                              sx={{
                                                fontSize: 12,
                                                color: s.price ? tokens.textSecondary : tokens.textMuted
                                              }}
                                            >
                                              {s.price ? `${peso(s.price)} each` : 'Quoted'}
                                            </Typography>
                                            {left !== null && (
                                              <Typography
                                                sx={{
                                                  fontSize: 11.5,
                                                  fontWeight: left ? 400 : 600,
                                                  color: left ? tokens.textMuted : tokens.redPress
                                                }}
                                              >
                                                {left ? `${left} left on this date` : 'Fully booked on this date'}
                                              </Typography>
                                            )}
                                          </Box>
                                          <FormField
                                            id={`f-qty-${s.id}`}
                                            label="Quantity"
                                            value={form.addonQty[s.id] || ''}
                                            onChange={(e) => updateAddonQty(s.id, e.target.value)}
                                            error={errors[`addonQty.${s.id}`]}
                                            disabled={left === 0}
                                            inputProps={{
                                              inputMode: 'numeric',
                                              maxLength: 2,
                                              'aria-label': `How many ${s.name}`
                                            }}
                                            sx={{ maxWidth: 130 }}
                                          />
                                        </Box>
                                      );
                                    })}
                                    {errors[`addonQty.${a.id}`] && (
                                      <Typography role="alert" sx={{ fontSize: 12, color: tokens.redPress }}>
                                        {errors[`addonQty.${a.id}`]}
                                      </Typography>
                                    )}
                                  </Box>
                                )}
                                {packaged && on && (
                                  <Box
                                    role="radiogroup"
                                    aria-label={`${a.name} package`}
                                    sx={{
                                      mt: 1.25,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 1,
                                      cursor: 'default'
                                    }}
                                  >
                                    {a.sizes.map((s) => {
                                      const picked = Number(form.addonQty[s.id]) > 0;
                                      const left = leftFor(s);
                                      return (
                                        <ButtonBase
                                          key={s.id}
                                          role="radio"
                                          aria-checked={picked}
                                          disabled={left === 0 && !picked}
                                          onClick={() => pickPackage(a, s.id)}
                                          sx={{
                                            display: 'block',
                                            width: '100%',
                                            p: 1.35,
                                            textAlign: 'left',
                                            borderRadius: 1.5,
                                            fontFamily: 'inherit',
                                            border: `1.5px solid ${picked ? tokens.ink : tokens.cardLightBorder}`,
                                            backgroundColor: picked ? tokens.surfaceSubtle : tokens.cardLight,
                                            '&:hover': { borderColor: picked ? tokens.ink : tokens.placeholder },
                                            '&.Mui-disabled': { opacity: 0.55 }
                                          }}
                                        >
                                          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {picked ? (
                                              <CheckCircleRoundedIcon sx={{ fontSize: 18, color: tokens.ink }} />
                                            ) : (
                                              <RadioButtonUncheckedRoundedIcon
                                                sx={{ fontSize: 18, color: tokens.borderInput }}
                                              />
                                            )}
                                            <Typography
                                              component="span"
                                              sx={{
                                                flex: 1,
                                                fontSize: 13,
                                                fontWeight: 700,
                                                color: tokens.textPrimary
                                              }}
                                            >
                                              {s.size}
                                            </Typography>
                                            <Typography
                                              component="span"
                                              sx={{
                                                fontSize: 12.5,
                                                fontWeight: 600,
                                                whiteSpace: 'nowrap',
                                                color: s.price ? tokens.textPrimary : tokens.textMuted
                                              }}
                                            >
                                              {s.price ? peso(s.price) : 'Quoted'}
                                            </Typography>
                                          </Box>
                                          {s.description
                                            .split('\n')
                                            .map((line) => line.trim())
                                            .filter(Boolean)
                                            .map((line, i) => (
                                              <Typography
                                                key={i}
                                                component="span"
                                                sx={{
                                                  display: 'block',
                                                  position: 'relative',
                                                  pl: 3.25,
                                                  fontSize: 12,
                                                  lineHeight: 1.55,
                                                  color: tokens.textSecondary,
                                                  '&::before': { content: '"•"', position: 'absolute', left: 14 }
                                                }}
                                              >
                                                {line}
                                              </Typography>
                                            ))}
                                          {left !== null && (
                                            <Typography
                                              component="span"
                                              sx={{
                                                display: 'block',
                                                pl: 3.25,
                                                fontSize: 11.5,
                                                fontWeight: left ? 400 : 600,
                                                color: left ? tokens.textMuted : tokens.redPress
                                              }}
                                            >
                                              {left ? `${left} left on this date` : 'Fully booked on this date'}
                                            </Typography>
                                          )}
                                          {errors[`addonQty.${s.id}`] && (
                                            <Typography
                                              component="span"
                                              role="alert"
                                              sx={{ display: 'block', pl: 3.25, fontSize: 12, color: tokens.redPress }}
                                            >
                                              {errors[`addonQty.${s.id}`]}
                                            </Typography>
                                          )}
                                        </ButtonBase>
                                      );
                                    })}
                                    {errors[`addonQty.${a.id}`] && (
                                      <Typography role="alert" sx={{ fontSize: 12, color: tokens.redPress }}>
                                        {errors[`addonQty.${a.id}`]}
                                      </Typography>
                                    )}
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  ))}
              </Section>
            )}

            {!rental && (
              <PackageAndBudgetSection
                form={form}
                catalog={data}
                stock={avail}
                index={sectionNo('budget')}
                onPatch={update}
                onCatalogChanged={catalog.reload}
                submissionError={errors.budgetRequest || errors.packageProposalRef ? formError : ''}
                onEditServices={() => scrollTo('addons')}
                done={sectionDone.budget}
                active={active === 'budget'}
                optional
                summary={sectionSummary.budget}
                stageLabel={SECTION_STAGES.budget}
                nextSection={nextSectionFor('budget')}
                onNext={scrollTo}
              />
            )}

            <Section
              id="review"
              index={sectionNo('review')}
              title="Review and Submit"
              subtitle="Check your event blueprint and itemized estimate before sending your reservation request."
              done={sectionDone.review}
              active={active === 'review'}
              summary={sectionSummary.review}
              stageLabel={SECTION_STAGES.review}
              icon={SECTION_ICONS.review}
            >
              <Box
                sx={{
                  mb: 2,
                  display: 'grid',
                  ...FORM_COLUMNS,
                  gap: 1.5
                }}
              >
                {[
                  [
                    'Celebration & Schedule',
                    form.eventName || 'Untitled event',
                    [
                      form.occasion === OCCASION_OTHER ? form.occasionOther : form.occasion,
                      form.date ? formatDate(form.date) : 'No date selected',
                      form.startTime && (rental || form.endTime) ? formatEventTime(form) : ''
                    ]
                      .filter(Boolean)
                      .join(' · '),
                    'details'
                  ],
                  [
                    rental ? 'Service & Items' : 'Service & Package',
                    form.serviceType || 'Service not chosen',
                    rental
                      ? rentalChosen.length
                        ? `${totalRentalPieces} pieces across ${rentalChosen.length} items`
                        : 'No rental items selected yet'
                      : [pkg ? pkg.name : 'No package chosen', form.guests ? `${form.guests} guests` : '']
                          .filter(Boolean)
                          .join(' · '),
                    rental ? 'items' : 'package'
                  ],
                  ...(rental
                    ? []
                    : [
                        [
                          'Menu & Styling',
                          buffet
                            ? menuComplete
                              ? '4 of 4 dishes selected'
                              : `${dishCount} of 4 dishes selected`
                            : 'Catering setup (no food)',
                          (styling && themeLabel(styling)) || 'Theme not specified',
                          buffet ? 'food' : 'styling'
                        ]
                      ]),
                  [
                    rental ? 'Pick-Up or Delivery' : 'Venue & Extras',
                    rental
                      ? delivered
                        ? form.venueName || 'Delivery selected'
                        : 'Store pick-up (Free)'
                      : form.venueName || 'Venue not entered',
                    rental
                      ? delivered
                        ? [form.venueAddress, form.city].filter(Boolean).join(', ')
                        : RENTAL.pickupAddress
                      : `${[form.venueAddress, form.city].filter(Boolean).join(', ') || 'No address yet'}${
                          chosenAddons.length ? ` · ${chosenAddons.length} add-on(s)` : ''
                        }`,
                    'venue'
                  ]
                ].map(([heading, primary, secondary, targetKey]) => (
                  <Box
                    key={heading}
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      backgroundColor: tokens.surfaceSubtle,
                      border: `1px solid ${tokens.cardLightBorder}`,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 0.6,
                      minWidth: 0
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.goldText }}>
                        {heading}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => scrollTo(targetKey)}
                        sx={{ minWidth: 0, px: 0.75, py: 0.15, fontSize: 11.5 }}
                      >
                        Edit
                      </Button>
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary, overflowWrap: 'anywhere' }}
                      >
                        {primary}
                      </Typography>
                      <Typography
                        sx={{
                          mt: 0.2,
                          fontSize: 12,
                          lineHeight: 1.45,
                          color: tokens.textSecondary,
                          overflowWrap: 'anywhere'
                        }}
                      >
                        {secondary}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>

              {!rental && <PackageBudgetSummary form={form} catalog={data} stock={avail} />}
              {!rental && buffet && (
                <Typography sx={{ mb: 1, fontSize: 13, fontWeight: 600, color: tokens.textSecondary }}>
                  {buffetDrinks(form.menu)}
                </Typography>
              )}
              {!rental && bookedAddonIds.includes(DESSERT_ADDON_ID) && (
                <Typography sx={{ mb: 1.5, fontSize: 13, fontWeight: 600, color: tokens.textSecondary }}>
                  Dessert: {dessertSummary(form.menu) || 'Choose a dessert in Additional Charges'} · additional charge
                </Typography>
              )}
              {rental ? (
                <RentalQuoteLines quote={quote} delivered={delivered} />
              ) : (
                <QuoteLines
                  quote={quote}
                  pkg={pkg}
                  serviceType={form.serviceType}
                  addons={chosenAddons}
                  addonQty={form.addonQty}
                />
              )}
              {!rental && (!stylingEmpty(styling) || form.referencePhotos.length > 0) && (
                <Box
                  sx={{
                    mt: 2,
                    p: 1.75,
                    borderRadius: 2,
                    backgroundColor: tokens.surfaceSubtle,
                    border: `1px solid ${tokens.cardLightBorder}`
                  }}
                >
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>Theme and Colors</Typography>
                  <StylingSummary styling={styling} referencePhotos={form.referencePhotos} compact />
                </Box>
              )}
              <AlertBanner tone="info" sx={{ mt: 2 }}>
                {rental
                  ? 'This is a request, not a confirmed rental. We check the items and send your quotation within 24 hours; accepting it approves your rental.'
                  : `This is a request, not a confirmed booking. We review it and send your quotation with the additional charges${extraGuests && !buffet ? ` and the equipment for your ${extraGuests} extra guests` : ''} priced within 24 hours; accepting it approves your reservation.`}
              </AlertBanner>
              <Box
                sx={{
                  mt: 2,
                  p: 1.75,
                  borderRadius: 2,
                  backgroundColor: agreed ? tokens.goldWash : tokens.surfaceSubtle,
                  border: `1.5px solid ${
                    errors.agreeTerms ? tokens.red : agreed ? tokens.goldDark : tokens.cardLightBorder
                  }`
                }}
              >
                <FormControlLabel
                  sx={{ alignItems: 'flex-start', mr: 0 }}
                  control={
                    <Checkbox
                      id="f-agreeTerms"
                      size="small"
                      checked={agreed}
                      onChange={(e) => {
                        setAgreed(e.target.checked);
                        setErrors((er) => ({ ...er, agreeTerms: '' }));
                      }}
                      sx={{ mt: -0.5 }}
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: 13, lineHeight: 1.55, color: tokens.textSecondary }}>
                      I have read and agree to the{' '}
                      <Link
                        href="/terms"
                        target="_blank"
                        rel="noopener"
                        sx={{ fontWeight: 600, color: tokens.goldDark }}
                      >
                        Terms of Service
                      </Link>
                      , including the payment, cancellation and refund rules, and the{' '}
                      <Link
                        href="/privacy"
                        target="_blank"
                        rel="noopener"
                        sx={{ fontWeight: 600, color: tokens.goldDark }}
                      >
                        Privacy Policy
                      </Link>
                      .
                    </Typography>
                  }
                />
                {errors.agreeTerms && (
                  <Typography role="alert" sx={{ mt: 0.5, fontSize: 12.5, fontWeight: 600, color: tokens.redPress }}>
                    {errors.agreeTerms}
                  </Typography>
                )}
              </Box>
            </Section>
          </Box>

          <Box
            sx={{
              minWidth: 0,
              [SUMMARY_LAYOUT]: { position: 'sticky', top: tokens.headerHeight + 24 },
              '@media (max-height: 799px)': { position: 'static' }
            }}
          >
            <DashCard sx={{ p: { xs: 2, sm: 2.25 }, borderRadius: 2.5, borderTop: `3px solid ${tokens.gold}` }}>
              <CardTitle subtitle={`${completedRequired} of ${requiredSections.length} required steps ready`}>
                Your Reservation
              </CardTitle>

              <Box
                sx={{
                  mb: 1.75,
                  p: 1.5,
                  borderRadius: 2,
                  backgroundColor: tokens.goldWash,
                  border: `1px solid ${tokens.shellBorder}`
                }}
              >
                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.goldText }}>
                  {rental ? 'Rental total' : 'Starting total'}
                </Typography>
                <Typography sx={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, overflowWrap: 'anywhere', mt: 0.25 }}>
                  {pkg && (!rental || rentalChosen.length) ? peso(knownTotal) : '—'}
                  {pkg && plusQuoted && (
                    <Box component="span" sx={{ fontSize: 13, fontWeight: 700, color: tokens.textSecondary }}>
                      {plusQuoted}
                    </Box>
                  )}
                </Typography>
                <Typography sx={{ mt: 0.5, fontSize: 11.5, lineHeight: 1.45, color: tokens.textSecondary }}>
                  {rental
                    ? rentalChosen.length
                      ? `Items ${peso(quote.rental)}${delivered ? ` + delivery ${peso(quote.deliveryFee)}` : ', picked up for free'}.`
                      : 'Type how many you need of each item to see your total'
                    : !pkg
                      ? 'Choose a package to see your total'
                      : !form.serviceType
                        ? `Package ${peso(quote.packageTotal)}${extraNote}${addonNote}. Choose what you are booking to finish your total.${quotedNote}`
                        : buffet && quote.plates
                          ? `Buffet and standard setup for ${quote.plates} at ${peso(quote.pricePerPlate)} each${addonNote}.${quotedNote}`
                          : buffet
                            ? 'Enter your guest count to see the buffet price'
                            : `Package ${peso(quote.packageTotal)}${extraNote}${addonNote}. Catering only, so there is no per-person charge.${quotedNote}`}
                </Typography>
              </Box>

              {!rental && <PackageBudgetSummary form={form} catalog={data} stock={avail} compact />}
              {pkg && (
                <Box
                  sx={{
                    mb: 1.75,
                    p: 1.5,
                    borderRadius: 1.75,
                    backgroundColor: tokens.surfaceSubtle,
                    border: `1px solid ${tokens.cardLightBorder}`
                  }}
                >
                  <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.goldText, mb: 0.75 }}>
                    Live estimate
                  </Typography>
                  {[
                    ...(rental
                      ? quote.rentalItems.map((line) => [`${line.name} × ${line.qty}`, peso(line.total)])
                      : [['Setup package', buffet ? 'Included in buffet rate' : peso(quote.packageTotal)]]),
                    ...(buffet
                      ? [[`Buffet · ${quote.plates || 0} × ${peso(quote.pricePerPlate)}`, peso(quote.food)]]
                      : []),
                    ...(!rental && !buffet && extraGuests
                      ? [[`Equipment for ${extraGuests} extra guests`, 'To be quoted']]
                      : []),
                    ...(quote.durationCharge > 0 ? [['6-hour event charge', peso(quote.durationCharge)]] : []),
                    ...(quote.setupAdjustment ? [['Equipment adjustment', peso(quote.setupAdjustment)]] : []),
                    ...chosenAddons.map((a) => [a.name, a.price ? peso(quote.addonTotals[a.id]) : 'To be quoted']),
                    ...(rental && delivered ? [['Delivery', peso(quote.deliveryFee)]] : [])
                  ].map(([label, value], i) => (
                    <Box
                      key={`${label}-${i}`}
                      sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.4 }}
                    >
                      <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>{label}</Typography>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                  <Typography sx={{ mt: 0.75, fontSize: 11, color: tokens.textMuted }}>
                    Final charges are confirmed in the quotation you review and accept.
                  </Typography>
                </Box>
              )}
              <Box sx={{ mb: 1.75 }}>
                {(rental
                  ? [
                      ['Booking', form.serviceType],
                      ['Date', form.date ? formatDate(form.date) : '—'],
                      ['Items', rentalChosen.length ? `${totalRentalPieces} pcs` : '—'],
                      ['Pick up or delivery', delivered ? 'Delivery' : 'Pick up']
                    ]
                  : [
                      ['Booking', form.serviceType || '—'],
                      ['Date', form.date ? formatDate(form.date) : '—'],
                      ['Time', form.startTime && form.endTime ? formatEventTime(form) : '—'],
                      ['Guests', form.guests ? `${form.guests}${extraGuests ? ` (${extraGuests} extra)` : ''}` : '—'],
                      ['Package', pkg ? pkg.name : '—'],
                      ['Theme', (styling && themeLabel(styling)) || '—'],
                      ['Colors', styling && styling.colors.length ? `${styling.colors.length} chosen` : '—'],
                      ...(buffet ? [['Menu', menuComplete ? 'Chosen' : '—']] : []),
                      ['Additional charges', chosenAddons.length || 'None']
                    ]
                ).map(([label, value]) => (
                  <Box
                    key={label}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 1.5,
                      py: 0.6,
                      borderBottom: `1px solid ${tokens.dividerFaint}`
                    }}
                  >
                    <Typography sx={{ fontSize: 12, color: tokens.textMuted, flexShrink: 0 }}>{label}</Typography>
                    <Typography
                      sx={{
                        minWidth: 0,
                        maxWidth: '65%',
                        textAlign: 'right',
                        overflowWrap: 'anywhere',
                        fontSize: 12,
                        fontWeight: 600,
                        color: tokens.textPrimary
                      }}
                    >
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <BusyButton
                fullWidth
                size="large"
                busy={busy}
                disabled={photoBusy}
                onClick={submit}
                sx={{ display: 'none', [SUMMARY_LAYOUT]: { display: 'inline-flex' } }}
              >
                Submit request
              </BusyButton>
              <Button
                fullWidth
                size="large"
                variant="outlined"
                onClick={saveAndExit}
                disabled={busy || photoBusy}
                sx={{ mt: 1, display: 'none', [SUMMARY_LAYOUT]: { display: 'inline-flex' } }}
              >
                Save as draft
              </Button>
            </DashCard>
          </Box>
        </Box>
      )}

      {data && (
        <Box
          className="booking-actions"
          sx={{
            position: 'fixed',
            left: 'var(--tm-sidebar-offset, 0px)',
            right: 0,
            bottom: 'var(--tm-bottom-nav, 0px)',
            zIndex: 1090,
            display: 'flex',
            [SUMMARY_LAYOUT]: { display: 'none' },
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: { xs: 1, sm: 2 },
            px: { xs: 1.5, sm: 2 },
            py: 1.25,
            backgroundColor: tokens.cardLight,
            color: tokens.textPrimary,
            borderTop: `1px solid ${tokens.cardLightBorder}`,
            boxShadow: '0 -10px 30px -12px rgba(0,0,0,0.4)'
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 11, color: tokens.textMuted }}>
              {rental
                ? 'Rental total'
                : buffet && quote.plates
                  ? `Buffet and setup for ${quote.plates}`
                  : 'Starting total'}
            </Typography>
            <Typography
              sx={{
                fontSize: 19,
                fontWeight: 800,
                color: tokens.textPrimary,
                lineHeight: 1.1,
                overflowWrap: 'anywhere'
              }}
            >
              {rental
                ? rentalChosen.length
                  ? peso(knownTotal)
                  : 'Pick your items'
                : pkg
                  ? `${peso(knownTotal)}${plusQuoted}`
                  : 'Pick a package'}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              maxWidth: '100%',
              '@media (max-width: 399px)': { width: '100%', '& > button': { flex: 1, minWidth: 0 } }
            }}
          >
            <Button
              variant="outlined"
              onClick={saveAndExit}
              disabled={busy || photoBusy}
              sx={{ px: { xs: 1.5, sm: 2.5 }, whiteSpace: 'nowrap' }}
            >
              Save draft
            </Button>
            <BusyButton
              busy={busy}
              disabled={photoBusy}
              onClick={submit}
              sx={{
                px: { xs: 2, sm: 3 },
                whiteSpace: 'nowrap',
                bgcolor: tokens.ink,
                color: tokens.onInk,
                '&:hover': { bgcolor: tokens.inkHover }
              }}
            >
              Submit request
            </BusyButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}

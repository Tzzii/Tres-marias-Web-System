import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import {
  AlertBanner,
  BUFFET_DRINKS,
  BusyButton,
  CardTitle,
  DISH_CATEGORIES,
  DashCard,
  DateField,
  EndTimeField,
  ErrorState,
  FormField,
  INVENTORY_CATEGORIES,
  ListSkeleton,
  MENU_LINE_MAX,
  OCCASIONS,
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
  calendarApi,
  catalogApi,
  cleanStyling,
  computeQuote,
  decorReminders,
  endTimeProblem,
  eventHours,
  flattenAddons,
  formatClock,
  formatDate,
  formatEventTime,
  formatPackageItem,
  includesFood,
  isRental,
  isRentalPackage,
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

// Form sections as [key, title, short name], in page order. The short name labels the section chips
// on phones and tablets. The menu section is skipped for Catering only.
// An equipment rental has no package, theme and colours, menu or additional charges: it shows
// "Items to Rent" instead, and its venue section becomes "Pick Up or Delivery".
const SECTIONS = [
  ['details', 'Event Details', 'Event'],
  ['service', 'What You Are Booking', 'Service'],
  ['package', 'Package', 'Package'],
  ['styling', 'Theme and Colors', 'Styling'],
  ['items', 'Items to Rent', 'Items'],
  ['food', 'Your Menu', 'Menu'],
  ['venue', 'Venue and Logistics', 'Venue'],
  ['addons', 'Additional Charges', 'Add-ons'],
  ['review', 'Review and Submit', 'Review']
];

// Which section each field lives in (used to scroll to the first error)
const FIELD_SECTION = { eventName: 'details', occasion: 'details', date: 'details', startTime: 'details', endTime: 'details', agreeTerms: 'review', guests: 'details', serviceType: 'service', packageId: 'package', rentalItems: 'items', foodNotes: 'food', fulfilment: 'venue', venueName: 'venue', venueAddress: 'venue', city: 'venue' };

/**
 * The section an error belongs to. Menu dishes, add-on quantities and rented items have one field per id,
 * and the theme and colours one per part ('styling.themeOther', 'styling.colors', 'styling.notes').
 */
const sectionForField = (field) => {
  if (field.startsWith('menu.')) return 'food';
  if (field.startsWith('styling.')) return 'styling';
  if (field.startsWith('addonQty.')) return 'addons';
  if (field.startsWith('rental.')) return 'items';
  return FIELD_SECTION[field] || 'details';
};

// True for an additional charge that comes in sizes (the customer books its sizes, each by the piece) or,
// for a charge with packages (`hasPackages`), in packages (the customer books one of them, once). Either
// way the chosen ones are kept in addonQty: a size's count as typed, a picked package as '1'.
const hasSizes = (addon) => Boolean(addon && addon.sizes && addon.sizes.length);

// The lowest price among a charge's packages, for "From ₱3,500"; null when none has a price yet
const lowestPackagePrice = (addon) => {
  const prices = addon.sizes.map((s) => s.price).filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : null;
};

// Blank form values. `serviceType` starts empty, so nothing under "What You Are Booking" is picked
// until the customer chooses it themselves.
// `fulfilment` and `rentalQty` ({ itemId: how many, as typed }) are only used by an equipment rental, and
// `endTime` only by an event (2 to 6 hours after the start; blank until the customer picks it).
// `styling` is an event's theme, colour motif and design details (section 4, optional; domain/styling.js).
const EMPTY_STYLING = { theme: '', themeOther: '', colors: [], notes: '' };
const EMPTY = { eventName: '', occasion: '', date: '', startTime: '18:00', endTime: '', guests: '', serviceType: '', packageId: '', menu: {}, foodNotes: '', styling: EMPTY_STYLING, venueName: '', venueAddress: '', city: '', accessNotes: '', addonIds: [], addonQty: {}, fulfilment: 'pickup', rentalQty: {} };

// A draft's styling in the form's shape: a draft saved before the section existed, or one changed by hand
// in the browser, still loads (only known themes, real colour codes and text are kept, by cleanStyling)
const draftStyling = (value) => ({ ...EMPTY_STYLING, ...(cleanStyling(value) || {}) });

// "balloons", "balloons and stage", "balloons, stage and tent"
const wordList = (words) => (words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]);

// Date error while the availability map is still on its way from the API (the date cannot be checked yet)
const DATES_LOADING = 'The available dates are still loading. Please try again in a moment.';

// Colour and words of a rental item's availability on the chosen date, from how many pieces are left
const AVAILABILITY = {
  available: { label: (left) => `${left} available`, color: '#047857' },
  limited: { label: (left) => `Only ${left} left`, color: '#b45309' },
  out: { label: () => 'None left on this date', color: '#b91c1c' }
};

/**
 * 1f / 1o · Reservation form: one long page, sections on the left, live summary on the right.
 *
 * The customer first says what they are booking - a Buffet (our food, one dish from each of the
 * four categories, charged per person) or Catering only (the package's equipment on its own).
 * A buffet has a fixed price per person, so the running total on this page is a real figure, not
 * a placeholder; only the additional charges are still priced by the admin in the quotation.
 *
 * The third choice, Equipment rental, books the Equipment Rental package: the customer types how
 * many of each rentable item they need, sees each item's availability on their date, and chooses
 * pick up (free) or delivery (standard fee). Every price is known, so its total is exact.
 *
 * An event has a start and an end time (2 to 6 hours, maybe past midnight); a rental only the time the
 * items are picked up or delivered. Before sending, the customer ticks "I agree to the Terms of Service",
 * which is not kept in the draft: it is asked again for every request.
 *
 * After the package, an event (not a rental) has "Theme and Colors": an optional theme (the ones popular
 * for the occasion first, "Other" with a text box, or "Not decided yet"), up to five colours from the colour
 * picker or the metallic buttons, and design details. It never changes the price.
 */
export default function BookEventPage() {
  useDocumentTitle('Book an Event');
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const [params] = useSearchParams();
  // Packages and additional charges. live: false = don't reload while the customer is filling the form.
  const catalog = useResource(() => catalogApi.getCatalog(), [], { live: false });

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false); // "I agree to the Terms of Service" (never saved in the draft)
  const [savedAt, setSavedAt] = useState(null); // time of the last draft autosave
  const [active, setActive] = useState('details'); // section currently on screen
  const chipBar = useRef(null); // phone / tablet row of section chips
  const touched = useRef(false); // true once the customer changes something (don't autosave before that)
  const initialised = useRef(false); // true once the form has been pre-filled

  // Start from the saved draft and/or what was picked while browsing (package, date, start time,
  // guests, occasion). Picks made after the draft was saved (e.g. "Reserve this date" on another
  // package) win over the draft's values; the draft's other fields (food, venue, …) are kept.
  // ?package= / ?date= in the URL win over both.
  useEffect(() => {
    if (!catalog.data || initialised.current) return;
    initialised.current = true;
    const draft = readDraft(user.id);
    const hasDraft = Boolean(draft && draft.form);
    const intent = readIntent();
    const intentIsNewer = Boolean(intent && (!hasDraft || !draft.savedAt || intent.savedAt > draft.savedAt));

    // Only known fields are kept, so a draft saved before the form changed still loads
    const base = hasDraft ? { ...EMPTY, ...Object.fromEntries(Object.entries(draft.form).filter(([key]) => key in EMPTY)) } : { ...EMPTY };
    base.styling = draftStyling(base.styling);
    const picks = intentIsNewer ? intent : {};
    const pkg = catalog.data.packages.find((p) => p.slug === (params.get('package') || picks.packageSlug));
    // Picking the Equipment Rental package makes the booking a rental; any other package leaves a rental
    // and clears the choice, so the customer picks Buffet or Catering only again
    const serviceFor = pkg && isRentalPackage(pkg) ? { serviceType: RENTAL_SERVICE } : pkg && isRental(base.serviceType) ? { serviceType: EMPTY.serviceType } : {};
    setForm({
      ...base,
      ...(picks.occasion ? { occasion: picks.occasion } : {}),
      ...(picks.startTime ? { startTime: picks.startTime } : {}),
      ...(picks.endTime ? { endTime: picks.endTime } : {}),
      ...(picks.guests ? { guests: String(picks.guests) } : {}),
      ...(pkg ? { packageId: pkg.id, ...serviceFor } : {}),
      ...(params.get('date') || picks.date ? { date: params.get('date') || picks.date } : {})
    });
    if (hasDraft) setSavedAt(draft.savedAt);
  }, [catalog.data, user.id, params]);

  // Autosave the draft shortly after each change
  useEffect(() => {
    if (!touched.current) return undefined;
    const timer = setTimeout(() => {
      if (saveDraft(user.id, form)) setSavedAt(Date.now());
    }, 700);
    return () => clearTimeout(timer);
  }, [form, user.id]);

  // Highlight the section in view
  useEffect(() => {
    if (!catalog.data) return undefined;
    // IntersectionObserver tells us which sections are visible; the top-most visible one is marked active
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace('sec-', ''));
      },
      { rootMargin: '-90px 0px -55% 0px' }
    );
    SECTIONS.forEach(([key]) => {
      const el = document.getElementById(`sec-${key}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
    // Re-run when the booking type changes (the menu, package, items and additional charges sections
    // appear or disappear), so the new set of sections is watched
  }, [catalog.data, form.serviceType]);

  // Phones / tablets: slide the chip row sideways so the chip of the section in view sits in the middle,
  // instead of staying hidden off the edge of the screen
  useEffect(() => {
    const bar = chipBar.current;
    const chip = bar && bar.querySelector(`[data-section="${active}"]`);
    if (!chip || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
  }, [active]);

  const data = catalog.data;
  // The chosen package object
  const pkg = data ? data.packages.find((p) => p.id === form.packageId) : null;
  // The Equipment Rental package, when the admin shows it; the rental choice only appears if it exists
  const rentalPkg = data ? data.packages.find(isRentalPackage) || null : null;
  // The ordinary packages for the package cards (the rental one is chosen under "What You Are Booking")
  const packages = data ? data.packages.filter((p) => !isRentalPackage(p)) : [];
  // True when this booking is an equipment rental
  const rental = isRental(form.serviceType);
  // True when the booking includes our food, and so a menu and a per-person charge
  const buffet = includesFood(form.serviceType);
  // The dishes still offered in one menu category
  const dishesIn = (category) => (data ? data.dishes.filter((d) => d.category === category) : []);
  // Every additional charge, size and package by id. A charge with sizes stays ticked in addonIds while the
  // customer fills in its sizes, but only the sizes given a count are booked, never the charge itself; a
  // charge with packages likewise books only the package picked.
  const addonById = data ? Object.fromEntries(flattenAddons(data.addons).map((a) => [a.id, a])) : {};
  const bookedAddonIds = rental
    ? []
    : form.addonIds.flatMap((id) => {
        const a = addonById[id];
        if (!a) return []; // archived since the draft was saved
        return hasSizes(a) ? a.sizes.filter((s) => Number(form.addonQty[s.id]) > 0).map((s) => s.id) : [id];
      });
  // The additional charges booked, a size named in full ("Tent 10 × 10"); a rental has none
  const chosenAddons = bookedAddonIds.map((id) => addonById[id]);
  // The items a rental asks for, with today's price per piece: [{ itemId, name, qty, price }]
  const rentalChosen = data && rental ? data.rentals.filter((i) => Number(form.rentalQty[i.id]) > 0).map((i) => ({ itemId: i.id, name: i.name, qty: Number(form.rentalQty[i.id]), price: i.price })) : [];
  const delivered = rental && form.fulfilment === 'delivery';
  // The theme, colours and design details as they will be sent (cleaned, each colour named from its code),
  // or null when the section is left blank; a rental has none
  const styling = rental ? null : cleanStyling(form.styling);
  // Decorations the design details mention that are additional charges not ticked yet ("You mentioned balloons…")
  const reminders = data && !rental ? decorReminders(form.styling.notes, data.addons, form.addonIds) : [];
  // The running total, worked out exactly as the admin's quotation will be. An additional charge with
  // its own price is counted at it; one without a price comes out as 0 here and shows "To be quoted".
  const quote = computeQuote({
    pkg,
    serviceType: form.serviceType,
    guests: rental ? 0 : Number(form.guests) || 0,
    pricePerPlate: data ? data.pricePerPlate : 0,
    rentalItems: rentalChosen,
    deliveryFee: delivered ? RENTAL.deliveryFee : 0,
    addonIds: bookedAddonIds,
    addonQty: form.addonQty,
    addonPrices: addonPriceMap(chosenAddons)
  });
  // What is known now: the package, the food for a buffet, and the additional charges that have their
  // own price; the others are quoted later. A rental is fully priced already: its items plus the delivery fee.
  const knownTotal = quote.net;
  // The ticked charges' total that is already known, and a reminder when some are still to be quoted
  const addonNote = quote.addons ? ` + additional charges ${peso(quote.addons)}` : '';
  const quotedNote = chosenAddons.some((a) => !a.price) ? ' Charges marked "To be quoted" are priced in your quotation.' : '';

  // How many of each item are free on the chosen date, { itemId: { left, status } }: a rental's items,
  // and the items additional charges book (a tent size), so the form can say how many are left
  const tracksStock = Boolean(data) && flattenAddons(data.addons).some((a) => a.inventoryItemId);
  const [avail, setAvail] = useState({});
  useEffect(() => {
    if (!(rental || tracksStock) || !form.date) {
      setAvail({});
      return undefined;
    }
    let live = true; // ignore an answer that arrives after the date changed again
    reservationApi
      .getRentalAvailability(form.date)
      .then((next) => live && setAvail(next))
      .catch(() => live && setAvail({}));
    return () => {
      live = false;
    };
  }, [rental, tracksStock, form.date]);
  // Pieces still free on the chosen date for a stock-tracked charge or size (a tent size); null when it
  // isn't tracked, or before a date is chosen and its count has arrived
  const leftFor = (a) => (a.inventoryItemId && form.date && avail[a.inventoryItemId] ? avail[a.inventoryItemId].left : null);
  // A rental line asking for more pieces than are free on the chosen date: said at once, while typing (and
  // again by submit and by the server), short enough for the narrow box; '' when it fits or the counts haven't arrived
  const stockError = (itemId) => {
    const free = avail[itemId];
    const qty = Number(form.rentalQty[itemId]) || 0;
    if (!free || !qty || qty <= free.left) return '';
    return free.left ? `Only ${free.left} available` : 'None available';
  };

  // Change one or more fields, mark the form as touched, and clear those fields' errors
  const update = (patch) => {
    touched.current = true;
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      return next;
    });
  };

  // Change the theme, the colours or the design details (section 4), and clear those parts' messages;
  // a new theme also clears the message under the "Other" box
  const updateStyling = (patch) => {
    touched.current = true;
    setForm((f) => ({ ...f, styling: { ...f.styling, ...patch } }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[`styling.${k}`]);
      if ('theme' in patch) delete next['styling.themeOther'];
      return next;
    });
  };

  // Buffet, Catering only or Equipment rental. A rental books the Equipment Rental package; leaving
  // it clears that package so the customer picks a real one.
  const chooseService = (value) => {
    if (isRental(value)) update({ serviceType: value, packageId: rentalPkg.id });
    else update({ serviceType: value, packageId: pkg && isRentalPackage(pkg) ? '' : form.packageId });
  };

  // How many of a rental item: digits only, never above the most one line can ask for
  const updateRentalQty = (id, raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RENTAL.maxQty) return; // typing past the cap is ignored
    update({ rentalQty: { ...form.rentalQty, [id]: digits } });
    setErrors((e) => {
      const next = { ...e };
      delete next[`rental.${id}`];
      delete next.rentalItems;
      return next;
    });
  };

  // Guest count: digits only, and never above the largest count the venue takes
  const updateGuests = (raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RULES.maxGuests) return; // typing past the cap is ignored
    update({ guests: digits });
  };

  // Add or remove an additional charge. One counted by the piece starts at 1 when it is ticked
  // and drops its count when it is unticked, so an untouched charge never keeps an old number.
  // A charge with sizes starts with every size blank (the customer types how many of the sizes they
  // want) and drops all of its sizes' counts when it is unticked; a charge with packages likewise starts
  // with no package picked and drops its pick when it is unticked.
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

  // How many of a by-the-piece charge or of one size: digits only, at most two (1-99). A size's
  // count also clears its charge's "at least one size" message.
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

  // Pick one package of a ticked charge with packages: it is booked once ('1'), and the charge's other
  // packages are dropped, so a booking never carries two of them (the server refuses that too). Clears
  // the charge's "Choose one of the packages" message and any package's own message.
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

  // Write the menu line for one category. It is the customer's own words, so it may name
  // more than one dish, e.g. "Lechon kawali and pork barbecue".
  const setDish = (category, text) => {
    update({ menu: { ...form.menu, [category]: text } });
    setErrors((e) => {
      const next = { ...e };
      delete next[`menu.${category}`];
      return next;
    });
  };

  // Smooth-scroll to a form section
  const scrollTo = (key) => {
    const el = document.getElementById(`sec-${key}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Check every required field and return error messages by field name
  const validate = () => {
    const e = {};
    if (form.eventName.trim().length < 3) e.eventName = 'Give your event a name (at least 3 characters).';
    if (!form.occasion) e.occasion = 'Choose the occasion.';
    if (!agreed) e.agreeTerms = 'Please read and agree to the Terms of Service before sending your request.';
    if (rental) return { ...e, ...validateRental() };
    if (!form.date) e.date = 'Choose your event date.';
    else if (calendarApi.availabilitySnapshot().loading) e.date = DATES_LOADING;
    else {
      // Re-check the date in case it was blocked or filled up since it was picked
      const reason = calendarApi.dateUnavailableReason(form.date, calendarApi.availabilitySnapshot());
      if (reason) e.date = `This date is not available (${reason.toLowerCase()}).`;
    }
    if (!form.startTime) e.startTime = 'Choose a start time.';
    else if (form.date && !e.date) {
      // Same check as the server: on the hour or half hour, within hours, and not clashing with another event that day
      const reason = calendarApi.timeUnavailableReason(form.date, form.startTime, calendarApi.availabilitySnapshot());
      if (reason) e.startTime = `${reason}.`;
    }
    // The end: 2 to 6 hours after the start, and the event may not run into the next one that day
    if (!form.endTime) e.endTime = 'Choose an end time.';
    else if (endTimeProblem(form.startTime, form.endTime)) e.endTime = `${endTimeProblem(form.startTime, form.endTime)}.`;
    else if (form.date && !e.date && !e.startTime) {
      const reason = calendarApi.timeUnavailableReason(form.date, form.startTime, calendarApi.availabilitySnapshot(), eventHours(form.startTime, form.endTime));
      if (reason) e.endTime = `${reason}.`;
    }
    const guests = Number(form.guests);
    if (!form.guests) e.guests = 'Enter your guest count.';
    else if (!Number.isInteger(guests) || guests < RULES.minGuests || guests > RULES.maxGuests) e.guests = `Between ${RULES.minGuests} and ${RULES.maxGuests} guests.`;
    if (!SERVICE_TYPES.includes(form.serviceType)) e.serviceType = 'Choose what you are booking.';
    if (!pkg) e.packageId = 'Choose a package.';
    // The theme and colours are optional; only "Other" with nothing typed, or text that is too long, is wrong
    const stylingCheck = stylingProblem(styling);
    if (stylingCheck) e[stylingCheck.field] = stylingCheck.message;
    // A buffet needs something written on every line; catering only has no menu at all
    if (buffet) {
      DISH_CATEGORIES.forEach(({ key, label }) => {
        if ((form.menu[key] || '').trim().length < 2) e[`menu.${key}`] = `Tell us what you would like for your ${label.toLowerCase()}.`;
      });
    }
    // A ticked charge with sizes needs a count for at least one size, and one with packages a package
    form.addonIds.forEach((id) => {
      const charge = addonById[id];
      if (hasSizes(charge) && !charge.sizes.some((s) => Number(form.addonQty[s.id]) > 0)) {
        e[`addonQty.${id}`] = charge.hasPackages ? 'Choose one of the packages.' : 'Enter how many for at least one size.';
      }
    });
    // Every by-the-piece charge that was ticked needs a count
    chosenAddons.forEach((a) => {
      if (!a.hasQuantity) return;
      const many = Number(form.addonQty[a.id]);
      if (!Number.isInteger(many) || many < 1 || many > 99) e[`addonQty.${a.id}`] = 'Enter 1 to 99.';
    });
    // A stock-tracked charge (a tent size) can't ask for more than are free on the date (the server checks again)
    chosenAddons.forEach((a) => {
      const left = leftFor(a);
      const many = a.hasQuantity ? Number(form.addonQty[a.id]) : 1;
      if (!e[`addonQty.${a.id}`] && left !== null && many > left) e[`addonQty.${a.id}`] = left ? `Only ${left} left on this date.` : 'Fully booked on this date.';
    });
    if (!form.venueName.trim()) e.venueName = 'Enter the venue name.';
    if (!form.venueAddress.trim()) e.venueAddress = 'Enter the venue address.';
    if (!form.city.trim()) e.city = 'Enter the city.';
    return e;
  };

  // The rental part of validate(): an open date, a pick-up or delivery time, at least one item with
  // no more than is free that day, and an address when it is delivered
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
      // A rental never clashes with events, so only the hours and the half-hour steps are checked
      const reason = calendarApi.timeUnavailableReason(form.date, form.startTime, { ...calendarApi.availabilitySnapshot(), events: [] });
      if (reason) e.startTime = `${reason}.`;
    }
    if (!rentalChosen.length) e.rentalItems = 'Enter how many you need of at least one item.';
    rentalChosen.forEach((line) => {
      const free = avail[line.itemId];
      if (free && line.qty > free.left) e[`rental.${line.itemId}`] = free.left ? `Only ${free.left} free on this date.` : 'Not available on this date.';
    });
    if (form.fulfilment === 'delivery') {
      if (!form.venueName.trim()) e.venueName = 'Enter the place name.';
      if (!form.venueAddress.trim()) e.venueAddress = 'Enter the delivery address.';
      if (!form.city.trim()) e.city = 'Enter the city.';
    }
    return e;
  };

  // Validate; if there are errors, scroll to the first one. Otherwise create the reservation,
  // clear the draft and saved picks, and go back to the dashboard.
  const submit = async () => {
    const found = validate();
    setErrors(found);
    setFormError('');
    const firstField = Object.keys(found)[0];
    if (firstField) {
      scrollTo(sectionForField(firstField));
      setFormError(`Please fix ${Object.keys(found).length === 1 ? 'the highlighted field' : `the ${Object.keys(found).length} highlighted fields`} before submitting.`);
      return;
    }
    setBusy(true);
    try {
      // Catering only carries no menu, and only by-the-piece charges carry a count. A charge with
      // sizes is sent as the sizes given a count, and one with packages as the package picked. The theme
      // and colours go cleaned (null when left blank). A rental sends the items it asks for instead, and
      // no theme or colours.
      const created = await reservationApi.createReservation(
        user.id,
        rental
          ? { ...form, endTime: undefined, styling: undefined, agreeTerms: agreed, rentalItems: rentalChosen.map(({ itemId, qty }) => ({ itemId, qty })) }
          : {
              ...form,
              agreeTerms: agreed,
              guests: Number(form.guests),
              menu: buffet ? form.menu : {},
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
      if (error.meta && error.meta.field) {
        setErrors((e) => ({ ...e, [error.meta.field]: error.message }));
        scrollTo(sectionForField(error.meta.field));
      }
      setFormError(error.message);
    }
  };

  // Save the draft now and leave the form
  const saveAndExit = () => {
    saveDraft(user.id, form);
    notify('Draft saved. You can finish it any time from your dashboard.', 'info');
    navigate('/portal');
  };

  // "Start over": delete the draft and saved picks, empty the form, and reload the catalog to pre-fill again
  const discard = () => {
    clearDraft(user.id);
    clearIntent();
    initialised.current = false;
    touched.current = false;
    setSavedAt(null);
    setErrors({});
    setForm(EMPTY);
    setAgreed(false);
    catalog.reload();
  };

  if (catalog.error) return <DashCard><ErrorState error={catalog.error} onRetry={catalog.reload} /></DashCard>;

  // Does any field in this section have an error? (turns its nav link red)
  const sectionHasError = (key) => Object.keys(errors).some((f) => sectionForField(f) === key);
  // Every category has its dish (a Catering only booking has no menu to fill in)
  const menuComplete = DISH_CATEGORIES.every(({ key }) => (form.menu[key] || '').trim().length >= 2);
  // Which sections are complete (shows a green tick in the section nav).
  // Additional charges and the theme and colours are optional, so those sections are ticked only once
  // something is chosen (and, for the theme, nothing in it is wrong).
  const sectionDone = {
    details: form.eventName && form.occasion && form.date && form.startTime && (rental || (form.endTime && form.guests)),
    service: Boolean(form.serviceType),
    package: Boolean(pkg),
    styling: !stylingEmpty(styling) && !stylingProblem(styling),
    items: rentalChosen.length > 0,
    food: menuComplete,
    venue: rental && !delivered ? true : form.venueName && form.venueAddress && form.city,
    addons: chosenAddons.length > 0,
    review: false
  };
  // The menu section is hidden for Catering only, so it drops out of the nav and the numbering.
  // A rental shows its items instead of the package, theme and colours, menu and additional charges.
  const sections = SECTIONS.filter(([key]) => (rental ? !['package', 'styling', 'food', 'addons'].includes(key) : key !== 'items' && (key !== 'food' || buffet))).map(([key, label, short]) => [
    key,
    rental && key === 'venue' ? 'Pick Up or Delivery' : label,
    rental && key === 'venue' ? 'Pick-up / delivery' : short
  ]);
  // A section's number on the page, which shifts when the menu section is hidden
  const sectionNo = (key) => sections.findIndex(([k]) => k === key) + 1;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'My Reservations', to: '/portal/reservations' }, { label: 'Book an Event' }]}
        title="Book an Event"
        chip={
          savedAt && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12.5, color: tokens.textOnDarkSoft }}>
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

      {/* Phone / tablet: section chips (1o), labelled with each section's short name.
          A finished section shows a tick instead of its number, like the desktop list. */}
      <Box ref={chipBar} className="tm-scroll" sx={{ display: { xs: 'flex', lg: 'none' }, position: 'sticky', top: tokens.headerHeight, zIndex: 5, gap: 0.75, overflowX: 'auto', mx: { xs: -1.5, sm: -2.5, md: -3 }, px: { xs: 1.5, sm: 2.5, md: 3 }, py: 1, mb: 2, backgroundColor: tokens.shellScrim, backdropFilter: 'blur(10px)' }}>
        {sections.map(([key, , short], i) => (
          <ButtonBase key={key} data-section={key} onClick={() => scrollTo(key)} aria-current={active === key ? 'true' : undefined} sx={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1.5, py: 0.75, borderRadius: 999, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: active === key ? tokens.onGold : sectionHasError(key) ? tokens.dangerSoft : tokens.textOnDarkSoft, backgroundColor: active === key ? tokens.gold : tokens.shellInset, border: `1px solid ${sectionHasError(key) ? 'rgba(239,68,68,0.5)' : 'transparent'}`, '@media (pointer: coarse)': { py: 1 } }}>
            {sectionDone[key] ? <CheckCircleRoundedIcon sx={{ fontSize: 15, color: active === key ? tokens.onGold : tokens.green }} /> : <span>{i + 1}</span>}
            {short}
          </ButtonBase>
        ))}
      </Box>

      {!data ? (
        <DashCard>
          <ListSkeleton rows={8} height={52} />
        </DashCard>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '200px minmax(0, 1fr) 300px' }, gap: 2.5, alignItems: 'start', pb: { xs: 10, lg: 0 } }}>
          {/* ============ Left: on this page ============ */}
          <Box component="nav" aria-label="Form sections" sx={{ display: { xs: 'none', lg: 'block' }, position: 'sticky', top: tokens.headerHeight + 24 }}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: tokens.textOnDarkMuted, mb: 1, px: 1.5 }}>On This Page</Typography>
            {sections.map(([key, label], i) => (
              <ButtonBase key={key} onClick={() => scrollTo(key)} aria-current={active === key ? 'true' : undefined} sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderRadius: 1.25, fontFamily: 'inherit', fontSize: 13.5, fontWeight: active === key ? 700 : 500, textAlign: 'left', color: active === key ? tokens.goldText : sectionHasError(key) ? tokens.dangerSoft : tokens.textOnDarkSoft, backgroundColor: active === key ? 'rgba(197,160,89,0.14)' : 'transparent', borderLeft: `3px solid ${active === key ? tokens.gold : 'transparent'}` }}>
                {sectionDone[key] ? <CheckCircleRoundedIcon sx={{ fontSize: 16, color: tokens.green }} /> : <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 16, opacity: 0.5 }} />}
                {i + 1} · {label}
              </ButtonBase>
            ))}
          </Box>

          {/* ============ Middle: the form ============ */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            {formError && <AlertBanner tone="error">{formError}</AlertBanner>}

            <Section id="details" index={sectionNo('details')} title="Event Details" subtitle={rental ? 'Tell us what the items are for and when you need them' : 'Tell us about the celebration'}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <FormField id="f-eventName" label="Event name" required value={form.eventName} onChange={(e) => update({ eventName: e.target.value })} error={errors.eventName} placeholder="e.g. Santos–Reyes Wedding Reception" sx={{ gridColumn: { sm: '1 / -1' } }} inputProps={{ maxLength: 80 }} />
                <SelectField id="f-occasion" label="Occasion" required value={form.occasion} onChange={(e) => update({ occasion: e.target.value })} options={OCCASIONS} placeholder="Select an occasion" error={errors.occasion} sx={{ gridColumn: { sm: '1 / -1' } }} />
                {/* Calendar always open across the full row; tapping a date picks it and lists the times already booked */}
                <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
                  {/* A rental takes no event slot, so only too-soon and blocked days are greyed out */}
                  <DateField id="f-date" label={rental ? 'Date you need the items' : 'Event date'} required inline rental={rental} value={form.date} onChange={(v) => update({ date: v })} error={errors.date} />
                </Box>
                {/* Moving the start keeps the event's length, so a chosen end time never stops fitting */}
                <TimeField id="f-startTime" label={rental ? (delivered ? 'Delivery time' : 'Pick-up time') : 'Start time'} required value={form.startTime} onChange={(v) => update({ startTime: v, ...(form.endTime ? { endTime: shiftEndTime(form.startTime, form.endTime, v) } : {}) })} error={errors.startTime} min={RULES.earliestStart} max={RULES.latestStart} step={30} />
                {/* An event's end, 2 to 6 hours after the start (past midnight allowed); a rental has none */}
                {!rental && (
                  <EndTimeField id="f-endTime" required startTime={form.startTime} value={form.endTime} onChange={(v) => update({ endTime: v })} error={errors.endTime} hint={`Events run ${RULES.minEventHours} to ${RULES.maxEventHours} hours.`} />
                )}
                {/* A rental has no guest count: the customer says how many of each item instead */}
                {!rental && (
                  <FormField id="f-guests" label="Guest count" required value={form.guests} onChange={(e) => updateGuests(e.target.value)} error={errors.guests} hint={pkg ? `Default for ${pkg.name}: ${pkg.guests} guests` : `Between ${RULES.minGuests} and ${RULES.maxGuests} guests`} inputProps={{ inputMode: 'numeric', maxLength: String(RULES.maxGuests).length }} />
                )}
              </Box>
            </Section>

            {/* Asked before the package, because it decides whether there is a menu to fill in and
                how the price is worked out. Every package can be booked either way. */}
            <Section id="service" index={sectionNo('service')} title="What You Are Booking" subtitle="This decides whether we cook for you." error={errors.serviceType}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', xl: rentalPkg ? 'repeat(3, 1fr)' : '1fr 1fr' }, gap: 1.5 }}>
                {[
                  ['Buffet and Catering', 'We cook your food', `One pork, chicken, fish and vegetable dish, with ${BUFFET_DRINKS.toLowerCase()}. Charged ${peso(data.pricePerPlate)} per person.`],
                  ['Catering only', 'Equipment and setup only', 'Tables, chairs, linens, food warmers and tableware. You provide the food, and there is no per-person charge.'],
                  // Only while the admin shows the Equipment Rental package
                  ...(rentalPkg ? [[RENTAL_SERVICE, 'Rent items only', `Pick the tables, chairs, linens, warmers or decor you need, priced per piece. Pick up in ${RENTAL.pickupAddress} or have them delivered.`]] : [])
                ].map(([value, heading, description]) => {
                  const selected = form.serviceType === value;
                  return (
                    <ButtonBase key={value} onClick={() => chooseService(value)} aria-pressed={selected} sx={{ display: 'block', p: 2, textAlign: 'left', borderRadius: 2, fontFamily: 'inherit', border: `2px solid ${selected ? tokens.ink : tokens.cardLightBorder}`, backgroundColor: selected ? tokens.surfaceSubtle : tokens.cardLight, transition: 'border-color 0.15s ease', '&:hover': { borderColor: selected ? tokens.ink : tokens.placeholder } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>{value}</Typography>
                        {selected ? <CheckCircleRoundedIcon sx={{ color: tokens.ink }} /> : <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput }} />}
                      </Box>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: tokens.textSecondary }}>{heading}</Typography>
                      <Typography sx={{ mt: 0.5, fontSize: 12.5, lineHeight: 1.5, color: tokens.textSecondary }}>{description}</Typography>
                    </ButtonBase>
                  );
                })}
              </Box>
              {/* Our buffet is served plated, which customers often ask about before booking */}
              {buffet && (
                <AlertBanner tone="info" sx={{ mt: 2 }}>
                  Our buffet is served plated by our team. The {peso(data.pricePerPlate)} per person covers the four dishes and {BUFFET_DRINKS.toLowerCase()} for every guest.
                </AlertBanner>
              )}
            </Section>

            {!rental && (
            <Section id="package" index={sectionNo('package')} title="Package" subtitle="Any package works for any occasion. Each one shows its default guest count, so pick the one closest to yours." error={errors.packageId}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                {packages.map((p) => {
                  const selected = p.id === form.packageId;
                  return (
                    <ButtonBase key={p.id} onClick={() => update({ packageId: p.id })} aria-pressed={selected} sx={{ display: 'block', p: 2, textAlign: 'left', borderRadius: 2, fontFamily: 'inherit', border: `2px solid ${selected ? tokens.ink : tokens.cardLightBorder}`, backgroundColor: selected ? tokens.surfaceSubtle : tokens.cardLight, transition: 'border-color 0.15s ease', '&:hover': { borderColor: selected ? tokens.ink : tokens.placeholder } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>{p.name}</Typography>
                        {selected ? <CheckCircleRoundedIcon sx={{ color: tokens.ink }} /> : <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput }} />}
                      </Box>
                      <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{p.description}</Typography>
                      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                        <Typography sx={{ fontSize: 12.5, color: tokens.textMuted }}>Default: {p.guests} guests</Typography>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>{peso(p.price)}</Typography>
                      </Box>
                    </ButtonBase>
                  );
                })}
              </Box>
              {/* What the chosen package includes, and how it is booked once "What You Are Booking" is picked */}
              {pkg && (
                <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>{pkg.name} includes</Typography>
                  <Typography sx={{ fontSize: 12.5, lineHeight: 1.6, color: tokens.textSecondary }}>{pkg.items.map(formatPackageItem).join(' · ')}</Typography>
                  {form.serviceType && (
                    <Typography sx={{ mt: 0.75, fontSize: 12.5, color: tokens.textSecondary }}>
                      {buffet ? 'Your food is cooked by us and charged per person on top of this package.' : 'Booked as catering only: the equipment above, with no food.'}
                    </Typography>
                  )}
                </Box>
              )}
            </Section>
            )}

            {/* The look of the event (optional): a theme (the ones popular for the chosen occasion first), up to
                five colours and the design details. It never changes the price; decorations the details mention
                that are additional charges get a gentle reminder. A rental has none. */}
            {!rental && (
              <Section id="styling" index={sectionNo('styling')} title="Theme and Colors" subtitle="Optional. Tell us the look you want so our team sets up your tables, linens and backdrop to match.">
                <StylingFields idPrefix="f-styling" value={form.styling} onChange={updateStyling} occasion={form.occasion} errors={errors} forCustomer>
                  {reminders.length > 0 && (
                    <AlertBanner tone="info" sx={{ mt: 1.5 }}>
                      You mentioned {wordList(reminders.map((r) => r.word))}. {wordList(reminders.map((r) => r.name))} {reminders.length === 1 ? 'is an additional charge' : 'are additional charges'}: tick {reminders.length === 1 ? 'it' : 'them'} under Additional Charges if you want us to provide {reminders.length === 1 ? 'it' : 'them'}.
                      <Box sx={{ mt: 0.5 }}>
                        <Button size="small" onClick={() => scrollTo('addons')} sx={{ px: 0, minWidth: 0, fontWeight: 700 }}>
                          Go to Additional Charges
                        </Button>
                      </Box>
                    </AlertBanner>
                  )}
                </StylingFields>
              </Section>
            )}

            {/* Equipment rental: how many of each item, grouped like the inventory, with each item's
                availability on the chosen date */}
            {rental && (
              <Section id="items" index={sectionNo('items')} title="Items to Rent" subtitle="Type how many you need of each item. Prices are per piece for your whole rental." error={errors.rentalItems}>
                {!form.date && (
                  <AlertBanner tone="info" sx={{ mb: 2 }}>
                    Choose your date above to see what is available that day.
                  </AlertBanner>
                )}
                {INVENTORY_CATEGORIES.filter((category) => data.rentals.some((i) => i.category === category)).map((category) => (
                  <Box key={category} sx={{ mb: 2 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textMuted, mb: 1 }}>{titleCase(category)}</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {data.rentals
                        .filter((i) => i.category === category)
                        .map((item) => {
                          const qty = form.rentalQty[item.id] || '';
                          const on = Number(qty) > 0;
                          // How many are free on the chosen date, and a message as soon as the number typed is more
                          const free = avail[item.id] && AVAILABILITY[avail[item.id].status];
                          const left = avail[item.id] ? avail[item.id].left : null;
                          const tooMany = stockError(item.id);
                          return (
                            <Box key={item.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 104px', gap: 1.25, alignItems: 'start', p: 1.25, borderRadius: 1.5, border: `1.5px solid ${on ? tokens.goldDark : tokens.cardLightBorder}`, backgroundColor: on ? 'rgba(197,160,89,0.08)' : '#fff' }}>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{item.name}</Typography>
                                <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                                  {peso(item.price)} per piece{on ? ` · ${peso(item.price * Number(qty))}` : ''}
                                </Typography>
                                <Typography sx={{ fontSize: 11.5, color: tokens.textMuted }}>
                                  Damage fee {peso(item.damageFee)} per piece
                                </Typography>
                                {/* "18 available" on the chosen date; before a date is picked there is nothing to count yet */}
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: free ? free.color : tokens.textMuted }}>
                                  {free ? free.label(left) : form.date ? 'Checking how many are free…' : 'Choose a date to see how many are free'}
                                </Typography>
                              </Box>
                              <FormField
                                id={`f-rent-${item.id}`}
                                value={qty}
                                onChange={(e) => updateRentalQty(item.id, e.target.value)}
                                error={errors[`rental.${item.id}`] || tooMany}
                                placeholder="0"
                                // None left that day: nothing can be asked for (a number typed before the date changed can still be cleared)
                                disabled={left === 0 && !qty}
                                inputProps={{ inputMode: 'numeric', maxLength: String(RENTAL.maxQty).length, 'aria-label': `How many ${item.name}` }}
                              />
                            </Box>
                          );
                        })}
                    </Box>
                  </Box>
                ))}
                <AlertBanner tone="info">Items that come back damaged or missing are charged at the damage fee shown for each item.</AlertBanner>
              </Section>
            )}

            {/* Only for a buffet: one dish from each category, and unlimited water and juice for everyone */}
            {buffet && (
              <Section id="food" index={sectionNo('food')} title="Your Menu" subtitle={`Write what you would like for each part of the menu. ${peso(data.pricePerPlate)} per person covers all of it.`}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  {DISH_CATEGORIES.map(({ key, label }) => {
                    // The admin's dish list is offered as autocomplete, but anything can be typed,
                    // so a customer who wants two pork dishes just writes both on the pork line.
                    const suggestions = dishesIn(key);
                    return (
                      <Box key={key} sx={{ minWidth: 0 }}>
                        <FormField
                          id={`f-dish-${key}`}
                          label={label}
                          required
                          value={form.menu[key] || ''}
                          onChange={(e) => setDish(key, e.target.value)}
                          error={errors[`menu.${key}`]}
                          placeholder={suggestions.length ? `e.g. ${suggestions[0].name}` : `Your ${label.toLowerCase()}`}
                          hint={suggestions.length ? `We often cook: ${suggestions.slice(0, 4).map((d) => d.name).join(', ')}` : undefined}
                          inputProps={{ maxLength: MENU_LINE_MAX, list: `dishes-${key}`, autoComplete: 'off' }}
                        />
                        {/* Native autocomplete: suggests, never restricts */}
                        <Box component="datalist" id={`dishes-${key}`}>
                          {suggestions.map((d) => (
                            <option key={d.id} value={d.name} />
                          ))}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
                <AlertBanner tone="info" sx={{ mt: 2 }}>
                  Write it however you like. You can ask for more than one dish on a line, for example "Lechon kawali and pork barbecue" for your pork.
                </AlertBanner>
                {/* Fixed for every buffet, so it is shown rather than asked */}
                <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, backgroundColor: tokens.surfaceSubtle }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.25 }}>Drinks</Typography>
                  <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{BUFFET_DRINKS} for every guest, included in the price per person.</Typography>
                </Box>
                <FormField id="f-foodNotes" label="Anything we should know about the food" optional multiline minRows={3} value={form.foodNotes} onChange={(e) => update({ foodNotes: e.target.value })} placeholder="Allergies, a vegetarian portion, softer food for elderly guests, serving time…" hint="This does not change the price. Our kitchen reads it before the event." inputProps={{ maxLength: 500 }} sx={{ mt: 2 }} />
              </Section>
            )}

            {rental ? (
              <Section id="venue" index={sectionNo('venue')} title="Pick Up or Delivery" error={errors.fulfilment}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  {[
                    ['pickup', 'Pick up', `Free. Collect the items at ${RENTAL.pickupAddress}.`],
                    ['delivery', 'Delivery', `${peso(RENTAL.deliveryFee)} standard fee. A large order may be quoted a different delivery fee.`]
                  ].map(([value, heading, description]) => {
                    const selected = form.fulfilment === value;
                    return (
                      <ButtonBase key={value} onClick={() => update({ fulfilment: value })} aria-pressed={selected} sx={{ display: 'block', p: 2, textAlign: 'left', borderRadius: 2, fontFamily: 'inherit', border: `2px solid ${selected ? tokens.ink : tokens.cardLightBorder}`, backgroundColor: selected ? tokens.surfaceSubtle : tokens.cardLight, '&:hover': { borderColor: selected ? tokens.ink : tokens.placeholder } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.textPrimary }}>{heading}</Typography>
                          {selected ? <CheckCircleRoundedIcon sx={{ color: tokens.ink }} /> : <RadioButtonUncheckedRoundedIcon sx={{ color: tokens.borderInput }} />}
                        </Box>
                        <Typography sx={{ mt: 0.5, fontSize: 12.5, lineHeight: 1.5, color: tokens.textSecondary }}>{description}</Typography>
                      </ButtonBase>
                    );
                  })}
                </Box>
                {/* Where to deliver: the same fields as an event venue */}
                {delivered && (
                  <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                    <FormField id="f-venueName" label="Place name" required value={form.venueName} onChange={(e) => update({ venueName: e.target.value })} error={errors.venueName} placeholder="e.g. Santos Residence" />
                    <FormField id="f-venueAddress" label="Delivery address" required value={form.venueAddress} onChange={(e) => update({ venueAddress: e.target.value })} error={errors.venueAddress} placeholder="Street, barangay" />
                    <FormField id="f-city" label="City" required value={form.city} onChange={(e) => update({ city: e.target.value })} error={errors.city} placeholder="e.g. Lipa City" />
                    <FormField id="f-accessNotes" label="Notes for the delivery" optional multiline minRows={3} value={form.accessNotes} onChange={(e) => update({ accessNotes: e.target.value })} placeholder="Landmark, gate, who receives the items…" sx={{ gridColumn: { sm: '1 / -1' } }} inputProps={{ maxLength: 500 }} />
                  </Box>
                )}
              </Section>
            ) : (
            <Section id="venue" index={sectionNo('venue')} title="Venue and Logistics">
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <FormField id="f-venueName" label="Venue name" required value={form.venueName} onChange={(e) => update({ venueName: e.target.value })} error={errors.venueName} placeholder="e.g. The Glass Garden" />
                <FormField id="f-venueAddress" label="Venue address" required value={form.venueAddress} onChange={(e) => update({ venueAddress: e.target.value })} error={errors.venueAddress} placeholder="Street, barangay" />
                <FormField id="f-city" label="City" required value={form.city} onChange={(e) => update({ city: e.target.value })} error={errors.city} placeholder="e.g. Pasig City" />
                <FormField id="f-accessNotes" label="Access notes" optional multiline minRows={3} value={form.accessNotes} onChange={(e) => update({ accessNotes: e.target.value })} placeholder="Gate, parking, elevator, loading area, setup time restrictions…" sx={{ gridColumn: { sm: '1 / -1' } }} inputProps={{ maxLength: 500 }} />
              </Box>
            </Section>
            )}

            {!rental && (
            <Section id="addons" index={sectionNo('addons')} title="Additional Charges" subtitle="Optional. Tick what you need. A charge marked Quoted is priced in your quotation.">
              {/* The charges customers tick, then the charges with packages, where a ticked charge asks for one package */}
              {[
                { key: 'plain', list: data.addons.filter((a) => !a.hasPackages) },
                { key: 'packages', list: data.addons.filter((a) => a.hasPackages), title: 'Additional Charges With Packages', hint: 'Tick one, then pick the package you want.' }
              ]
                .filter((group) => group.list.length)
                .map((group, groupIndex) => (
                  <Box key={group.key} sx={groupIndex ? { mt: 2.5 } : undefined}>
                    {group.title && (
                      <Box sx={{ mb: 1.25 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>{group.title}</Typography>
                        <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{group.hint}</Typography>
                      </Box>
                    )}
                    {/* A charge with packages lists them with what each includes, so it takes the full width */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: group.key === 'packages' ? 'minmax(0, 1fr)' : { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
                      {group.list.map((a) => {
                        const on = form.addonIds.includes(a.id);
                        const sized = hasSizes(a) && !a.hasPackages;
                        const packaged = hasSizes(a) && a.hasPackages;
                        const from = packaged ? lowestPackagePrice(a) : null;
                        return (
                          <Box key={a.id} component="label" sx={{ display: 'flex', gap: 1, p: 1.5, borderRadius: 1.5, cursor: 'pointer', border: `1.5px solid ${on ? tokens.goldDark : tokens.cardLightBorder}`, backgroundColor: on ? 'rgba(197,160,89,0.08)' : '#fff' }}>
                            <Checkbox checked={on} onChange={() => toggleAddon(a.id)} size="small" sx={{ p: 0.25, alignSelf: 'flex-start' }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{a.name}</Typography>
                                {/* Its own price (of one, when counted by the piece), "Quoted" when the admin prices it per event,
                                    "By size" when each size has its own price, or the cheapest package ("From ₱3,500") */}
                                <Typography sx={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', color: (packaged ? from : a.price && !sized) ? tokens.textPrimary : tokens.textMuted }}>
                                  {sized ? 'By size' : packaged ? (from ? `From ${peso(from)}` : 'Quoted') : a.price ? `${peso(a.price)}${a.hasQuantity ? ' each' : ''}` : 'Quoted'}
                                </Typography>
                              </Box>
                              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{a.description}</Typography>
                              {/* Charges counted by the piece ask how many; the price is that of one */}
                              {a.hasQuantity && on && (
                                <FormField
                                  id={`f-qty-${a.id}`}
                                  label="How many do you need?"
                                  value={form.addonQty[a.id] || ''}
                                  onChange={(e) => updateAddonQty(a.id, e.target.value)}
                                  error={errors[`addonQty.${a.id}`]}
                                  inputProps={{ inputMode: 'numeric', maxLength: 2, 'aria-label': `How many ${a.name}` }}
                                  sx={{ mt: 1, maxWidth: 150 }}
                                />
                              )}
                              {/* A charge with sizes: how many of each size, blank for a size not wanted. A click on the
                                  rows (other than in a box) must not untick the charge, which the card's label would do. */}
                              {sized && on && (
                                <Box onClick={(e) => e.target.tagName !== 'INPUT' && e.preventDefault()} sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1, cursor: 'default' }}>
                                  {a.sizes.map((s) => {
                                    const left = leftFor(s);
                                    return (
                                      <Box key={s.id} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                                        <Box sx={{ minWidth: 0, pt: 3 }}>
                                          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{s.size}</Typography>
                                          <Typography sx={{ fontSize: 12, color: s.price ? tokens.textSecondary : tokens.textMuted }}>{s.price ? `${peso(s.price)} each` : 'Quoted'}</Typography>
                                          {/* How many are still free on the chosen date, for a size that books from the inventory */}
                                          {left !== null && (
                                            <Typography sx={{ fontSize: 11.5, fontWeight: left ? 400 : 600, color: left ? tokens.textMuted : tokens.redPress }}>
                                              {left ? `${left} left on this date` : 'Fully booked on this date'}
                                            </Typography>
                                          )}
                                        </Box>
                                        <FormField
                                          id={`f-qty-${s.id}`}
                                          label="How many"
                                          value={form.addonQty[s.id] || ''}
                                          onChange={(e) => updateAddonQty(s.id, e.target.value)}
                                          error={errors[`addonQty.${s.id}`]}
                                          disabled={left === 0}
                                          inputProps={{ inputMode: 'numeric', maxLength: 2, 'aria-label': `How many ${s.name}` }}
                                          sx={{ maxWidth: 130 }}
                                        />
                                      </Box>
                                    );
                                  })}
                                  {errors[`addonQty.${a.id}`] && <Typography role="alert" sx={{ fontSize: 12, color: tokens.redPress }}>{errors[`addonQty.${a.id}`]}</Typography>}
                                </Box>
                              )}
                              {/* A charge with packages: pick one, each with its price and what it includes. A click here
                                  must not untick the charge, which the card's label would do, so the label's action is cancelled. */}
                              {packaged && on && (
                                <Box role="radiogroup" aria-label={`${a.name} package`} onClick={(e) => e.preventDefault()} sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1, cursor: 'default' }}>
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
                                        sx={{ display: 'block', width: '100%', p: 1.25, textAlign: 'left', borderRadius: 1.5, fontFamily: 'inherit', border: `1.5px solid ${picked ? tokens.ink : tokens.cardLightBorder}`, backgroundColor: picked ? tokens.surfaceSubtle : tokens.cardLight, transition: 'border-color 0.15s ease', '&:hover': { borderColor: picked ? tokens.ink : tokens.placeholder }, '&.Mui-disabled': { opacity: 0.55 } }}
                                      >
                                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                          {picked ? <CheckCircleRoundedIcon sx={{ fontSize: 18, color: tokens.ink }} /> : <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 18, color: tokens.borderInput }} />}
                                          <Typography component="span" sx={{ flex: 1, fontSize: 13, fontWeight: 700, color: tokens.textPrimary }}>{s.size}</Typography>
                                          <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', color: s.price ? tokens.textPrimary : tokens.textMuted }}>{s.price ? peso(s.price) : 'Quoted'}</Typography>
                                        </Box>
                                        {/* What it includes, one line each as the admin wrote them */}
                                        {s.description
                                          .split('\n')
                                          .map((line) => line.trim())
                                          .filter(Boolean)
                                          .map((line, i) => (
                                            <Typography key={i} component="span" sx={{ display: 'block', position: 'relative', pl: 3.25, fontSize: 12, lineHeight: 1.55, color: tokens.textSecondary, '&::before': { content: '"•"', position: 'absolute', left: 14 } }}>
                                              {line}
                                            </Typography>
                                          ))}
                                        {/* How many are still free on the chosen date, for a package that books from the inventory */}
                                        {left !== null && (
                                          <Typography component="span" sx={{ display: 'block', pl: 3.25, fontSize: 11.5, fontWeight: left ? 400 : 600, color: left ? tokens.textMuted : tokens.redPress }}>
                                            {left ? `${left} left on this date` : 'Fully booked on this date'}
                                          </Typography>
                                        )}
                                        {errors[`addonQty.${s.id}`] && (
                                          <Typography component="span" role="alert" sx={{ display: 'block', pl: 3.25, fontSize: 12, color: tokens.redPress }}>{errors[`addonQty.${s.id}`]}</Typography>
                                        )}
                                      </ButtonBase>
                                    );
                                  })}
                                  {errors[`addonQty.${a.id}`] && <Typography role="alert" sx={{ fontSize: 12, color: tokens.redPress }}>{errors[`addonQty.${a.id}`]}</Typography>}
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

            <Section id="review" index={sectionNo('review')} title="Review and Submit">
              {rental ? <RentalQuoteLines quote={quote} delivered={delivered} /> : <QuoteLines quote={quote} pkg={pkg} serviceType={form.serviceType} addons={chosenAddons} addonQty={form.addonQty} />}
              {/* The look chosen in section 4, as the quotation and contract will print it */}
              {!stylingEmpty(styling) && (
                <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}` }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, mb: 0.5 }}>Theme and Colors</Typography>
                  <StylingSummary styling={styling} compact />
                </Box>
              )}
              <AlertBanner tone="info" sx={{ mt: 2 }}>
                {rental
                  ? 'This is a request, not a confirmed rental. We check the items and send your quotation within 24 hours; accepting it approves your rental.'
                  : 'This is a request, not a confirmed booking. We review it and send your quotation with the additional charges priced within 24 hours; accepting it approves your reservation.'}
              </AlertBanner>
              {/* Asked for every request; the link opens the full terms in a new tab so the form stays as it is */}
              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  sx={{ alignItems: 'flex-start', mr: 0 }}
                  control={<Checkbox id="f-agreeTerms" size="small" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setErrors((er) => ({ ...er, agreeTerms: '' })); }} sx={{ mt: -0.5 }} />}
                  label={
                    <Typography sx={{ fontSize: 13, lineHeight: 1.55, color: tokens.textSecondary }}>
                      I have read and agree to the{' '}
                      <Link href="/terms" target="_blank" rel="noopener" sx={{ fontWeight: 600, color: tokens.goldDark }}>Terms of Service</Link>, including the payment, cancellation and refund rules, and the{' '}
                      <Link href="/privacy" target="_blank" rel="noopener" sx={{ fontWeight: 600, color: tokens.goldDark }}>Privacy Policy</Link>.
                    </Typography>
                  }
                />
                {errors.agreeTerms && <Typography role="alert" sx={{ mt: 0.5, fontSize: 12.5, fontWeight: 600, color: tokens.redPress }}>{errors.agreeTerms}</Typography>}
              </Box>
              <Box sx={{ mt: 2.5, display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
                <BusyButton size="large" busy={busy} onClick={submit}>
                  Submit reservation request
                </BusyButton>
                <Button size="large" variant="outlined" onClick={saveAndExit} disabled={busy}>
                  Save as draft
                </Button>
              </Box>
            </Section>
          </Box>

          {/* ============ Right: live summary ============ */}
          <Box sx={{ display: { xs: 'none', lg: 'block' }, position: 'sticky', top: tokens.headerHeight + 24 }}>
            <DashCard>
              <CardTitle>Your Reservation</CardTitle>
              {(rental
                ? [
                    ['Booking', form.serviceType],
                    ['Date', form.date ? formatDate(form.date) : '—'],
                    ['Items', rentalChosen.length ? `${rentalChosen.reduce((sum, line) => sum + line.qty, 0)} pcs` : '—'],
                    ['Pick up or delivery', delivered ? 'Delivery' : 'Pick up']
                  ]
                : [
                    ['Booking', form.serviceType || '—'],
                    ['Date', form.date ? formatDate(form.date) : '—'],
                    ['Time', form.startTime && form.endTime ? formatEventTime(form) : '—'],
                    ['Guests', form.guests || '—'],
                    ['Package', pkg ? pkg.name : '—'],
                    // Section 4 (optional): the theme's name and how many colours
                    ['Theme', (styling && themeLabel(styling)) || '—'],
                    ['Colors', styling && styling.colors.length ? `${styling.colors.length} chosen` : '—'],
                    // Only a buffet has a menu to report on
                    ...(buffet ? [['Menu', menuComplete ? 'Chosen' : '—']] : []),
                    ['Additional charges', chosenAddons.length || 'None']
                  ]
              ).map(([label, value]) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                  <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{label}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{value}</Typography>
                </Box>
              ))}
              <Divider sx={{ my: 1.5 }} />
              {/* The package price plus, for a buffet, the food: both are known now, so this is a real figure */}
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: tokens.textMuted }}>{rental ? 'Rental total' : 'Starting total'}</Typography>
              <Typography sx={{ fontSize: 28, fontWeight: 800 }}>{pkg && (!rental || rentalChosen.length) ? peso(knownTotal) : '—'}</Typography>
              <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
                {rental
                  ? rentalChosen.length
                    ? `Items ${peso(quote.rental)}${delivered ? ` + delivery ${peso(quote.deliveryFee)}` : ', picked up for free'}.`
                    : 'Type how many you need of each item to see your total'
                  : !pkg
                  ? 'Choose a package to see your total'
                  : !form.serviceType
                  ? `Package ${peso(quote.packageTotal)}${addonNote}. Choose what you are booking to finish your total.${quotedNote}`
                  : buffet && quote.plates
                    ? `Package ${peso(quote.packageTotal)} + buffet for ${quote.plates} at ${peso(quote.pricePerPlate)} each${addonNote}.${quotedNote}`
                    : buffet
                      ? 'Enter your guest count to see the buffet price'
                      : `Package ${peso(quote.packageTotal)}${addonNote}. Catering only, so there is no per-person charge.${quotedNote}`}
              </Typography>
              <BusyButton fullWidth size="large" busy={busy} onClick={submit} sx={{ mt: 2 }}>
                Submit request
              </BusyButton>
            </DashCard>
          </Box>
        </Box>
      )}

      {/* Phone / tablet sticky price bar (1o), sitting right on top of the phone tab bar
          (--tm-bottom-nav is its height, set by PortalShell; 0px where there is no tab bar) */}
      {data && (
        <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 'var(--tm-bottom-nav, 0px)', zIndex: 1090, display: { xs: 'flex', lg: 'none' }, alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 2, py: 1.25, backgroundColor: '#fff', borderTop: `1px solid ${tokens.cardLightBorder}`, boxShadow: '0 -10px 30px -12px rgba(0,0,0,0.4)' }}>
          <Box>
            <Typography sx={{ fontSize: 11, color: tokens.textMuted }}>{rental ? 'Rental total' : buffet && quote.plates ? `Package + buffet for ${quote.plates}` : 'Starting total'}</Typography>
            <Typography sx={{ fontSize: 19, fontWeight: 800, color: tokens.textPrimary, lineHeight: 1.1 }}>{rental ? (rentalChosen.length ? peso(knownTotal) : 'Pick your items') : pkg ? peso(knownTotal) : 'Pick a package'}</Typography>
          </Box>
          <BusyButton busy={busy} onClick={submit} sx={{ px: 3, bgcolor: tokens.ink, color: tokens.onInk, '&:hover': { bgcolor: tokens.inkHover } }}>
            Submit request
          </BusyButton>
        </Box>
      )}
    </>
  );
}

/** A numbered form section card. Gets a red border and message when it has an error. */
function Section({ id, index, title, subtitle, error, children }) {
  return (
    <DashCard component="section" id={`sec-${id}`} aria-labelledby={`sec-${id}-title`} sx={{ scrollMarginTop: `${tokens.headerHeight + 64}px`, ...(error && { borderColor: tokens.red }) }}>
      <Box sx={{ mb: 2 }}>
        <Typography id={`sec-${id}-title`} component="h2" sx={{ fontSize: 17, fontWeight: 700 }}>
          {index} · {title}
        </Typography>
        {subtitle && <Typography sx={{ mt: 0.25, fontSize: 13, color: tokens.textSecondary }}>{subtitle}</Typography>}
        {error && <Typography role="alert" sx={{ mt: 0.75, fontSize: 12.5, fontWeight: 600, color: tokens.redPress }}>{error}</Typography>}
      </Box>
      {children}
    </DashCard>
  );
}

/**
 * Price breakdown before the quotation. The package price and, for a buffet, the food are both
 * known here, because a buffet is charged per person, and so is each additional charge with its own
 * price. Only the charges without one are still "To be quoted", so the starting total is what the
 * customer can already count on.
 */
function QuoteLines({ quote, pkg, serviceType, addons, addonQty }) {
  const rows = [
    [pkg ? `Package · ${pkg.name}` : 'Package', pkg ? peso(quote.packageTotal) : '—'],
    // A buffet line only once the guest count is in; catering only never has one
    ...(includesFood(serviceType)
      ? [[quote.plates ? `Buffet · ${quote.plates} × ${peso(quote.pricePerPlate)}` : 'Buffet · enter your guest count', quote.plates ? peso(quote.food) : '—']]
      : []),
    ...addons.map((a) => [a.hasQuantity ? `${a.name} × ${Number(addonQty[a.id]) || 1}` : a.name, a.price ? peso(quote.addonTotals[a.id]) : 'To be quoted'])
  ];
  return (
    <Box sx={{ borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, overflow: 'hidden' }}>
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, px: 2, py: 1.25, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>
          <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>{label}</Typography>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{value}</Typography>
        </Box>
      ))}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, px: 2, py: 1.5, backgroundColor: tokens.surfaceSubtle }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Starting total</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 800 }}>{pkg ? peso(quote.net) : '—'}</Typography>
      </Box>
    </Box>
  );
}

/**
 * Price breakdown of an equipment rental: one line per item (how many x the price per piece), then
 * the delivery fee or free pick-up. Every price is known, so the total is what the quotation will
 * show unless the admin sets a different delivery fee for a large order.
 */
function RentalQuoteLines({ quote, delivered }) {
  const rows = [
    ...quote.rentalItems.map((line) => [`${line.name} · ${line.qty} × ${peso(line.price)}`, peso(line.total)]),
    [delivered ? 'Delivery (standard fee)' : 'Pick up', delivered ? peso(quote.deliveryFee) : 'Free']
  ];
  return (
    <Box sx={{ borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, overflow: 'hidden' }}>
      {quote.rentalItems.length === 0 && <Typography sx={{ px: 2, py: 1.25, fontSize: 13.5, color: tokens.textSecondary, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>No items yet</Typography>}
      {rows.map(([label, value]) => (
        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, px: 2, py: 1.25, borderBottom: `1px solid ${tokens.cardLightBorder}` }}>
          <Typography sx={{ fontSize: 13.5, color: tokens.textSecondary }}>{label}</Typography>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{value}</Typography>
        </Box>
      ))}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, px: 2, py: 1.5, backgroundColor: tokens.surfaceSubtle }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Rental total</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 800 }}>{quote.rentalItems.length ? peso(quote.net) : '—'}</Typography>
      </Box>
    </Box>
  );
}

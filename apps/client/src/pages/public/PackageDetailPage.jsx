import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import NavigateNextRoundedIcon from '@mui/icons-material/NavigateNextRounded';
import RestaurantMenuOutlinedIcon from '@mui/icons-material/RestaurantMenuOutlined';
import {
  DateField,
  FormField,
  INVENTORY_CATEGORIES,
  NotFoundPage,
  OCCASIONS,
  RENTAL,
  RULES,
  SelectField,
  catalogApi,
  extraGuests,
  formatPackageItem,
  isRentalPackage,
  peso,
  tokens,
  useDocumentTitle,
  useResource
} from '@tm/shared';
import { useAuth } from '../../auth.js';
import AuthGate from '../../components/AuthGate.jsx';
import { MoodPanel } from '../../components/Marketing.jsx';
import SiteFooter from '../../components/SiteFooter.jsx';
import SiteNav from '../../components/SiteNav.jsx';
import { readIntent, saveIntent } from '../../lib/booking.js';
import { site } from '../../theme/siteTheme.js';

/**
 * 1b · Package detail, where the Reserve CTA lives. 1c gate opens from here.
 * The Equipment Rental package has no fixed items or price: its page lists every item that can be
 * rented with its price per piece, and its panel asks only for the date and the occasion.
 */
export default function PackageDetailPage() {
  // Package name from the URL, e.g. /packages/package-1
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Load the package and the additional charges customers can ask for (the rental price list for the rental package)
  const { data, loading, error } = useResource(async () => {
    const pkg = await catalogApi.getPackageBySlug(slug);
    const [addons, rentals] = await Promise.all([catalogApi.listAddons(), isRentalPackage(pkg) ? catalogApi.listRentalItems() : []]);
    return { pkg, addons, rentals };
  }, [slug]);
  useDocumentTitle(data ? data.pkg.name : 'Package');

  // Pre-fill the reserve panel with anything picked earlier in the booking bar
  const intent = readIntent() || {};
  const [date, setDate] = useState(intent.date || '');
  const [guests, setGuests] = useState(intent.guests ? String(intent.guests) : '');
  const [occasion, setOccasion] = useState(intent.occasion || '');
  const [guestError, setGuestError] = useState('');
  const [gateOpen, setGateOpen] = useState(false); // "Create an account to reserve" popup
  const isDesktop = useMediaQuery('(min-width:900px)');

  // Unknown package slug: show the 404 page
  if (error) return <NotFoundPage homePath="/#packages" homeLabel="See all packages" />;

  const pkg = data && data.pkg;
  // True for the Equipment Rental package
  const rental = isRentalPackage(pkg);
  // Guests above what this package covers; allowed, the team may add charges in the quotation
  const overBy = extraGuests(pkg, guests);

  // Guest count is typed only (no up/down arrows): digits only, and never above the largest count the business serves
  const updateGuests = (raw) => {
    const digits = raw.replace(/\D/g, '');
    if (digits && Number(digits) > RULES.maxGuests) return; // typing past the cap is ignored
    setGuests(digits);
    setGuestError('');
  };

  // "Reserve this date": check the guest count, save the picks, then go to the form (or ask to sign up first)
  const reserve = () => {
    // Guest count is optional here, but if entered it must be within what the business serves (a rental has none)
    if (guests && !rental) {
      const n = Number(guests);
      if (!Number.isInteger(n) || n < RULES.minGuests || n > RULES.maxGuests) {
        setGuestError(`Between ${RULES.minGuests} and ${RULES.maxGuests} guests.`);
        document.getElementById('reserve-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    saveIntent({ packageSlug: pkg.slug, packageName: pkg.name, date, guests: guests && !rental ? Number(guests) : null, occasion });
    // Signed in: straight to the booking form. Signed out: show the account popup.
    if (user) navigate('/portal/book');
    else setGateOpen(true);
  };

  // White price/reserve card (the light website theme already styles its fields). Built once and placed in a different spot on mobile vs desktop.
  const reservePanel = pkg && (
      <Paper id="reserve-panel" elevation={0} sx={{ p: 3, borderRadius: 3, backgroundColor: site.card, color: site.ink, border: `1px solid ${site.border}`, boxShadow: site.shadowPanel, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rental ? (
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: site.inkMuted }}>Rental prices</Typography>
            <Typography sx={{ fontFamily: site.fontSerif, fontSize: 30, fontWeight: 700, color: site.goldText }}>Per piece</Typography>
            <Typography sx={{ fontSize: 13, color: site.inkSoft }}>
              Free pick-up in {RENTAL.pickupAddress}, or delivery from {peso(RENTAL.deliveryFee)}
            </Typography>
          </Box>
        ) : (
          <Box>
            <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: site.inkMuted }}>Package price</Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography sx={{ fontFamily: site.fontSerif, fontSize: 34, fontWeight: 700, color: site.goldText }}>{peso(pkg.price)}</Typography>
              <Typography sx={{ fontSize: 13, color: site.inkMuted }}>covers {pkg.guests} guests</Typography>
            </Box>
            <Typography sx={{ fontSize: 13, color: site.inkSoft }}>Food and additional charges are priced in your quotation</Typography>
          </Box>
        )}
        {/* Calendar shown right on the card: tapping a date picks it and lists the times already booked
            (a rental takes no event slot, so only too-soon and blocked days are greyed out) */}
        <DateField id="pkg-date" label={rental ? 'Date you need the items' : 'Event date'} inline rental={rental} value={date} onChange={setDate} hint="Optional for now, you can choose it on the form." />
        <Box sx={{ display: 'grid', gridTemplateColumns: rental ? '1fr' : '1fr 1fr', gap: 1.5 }}>
          {!rental && <FormField id="pkg-guests" label="Guests" value={guests} placeholder={String(pkg.guests)} onChange={(e) => updateGuests(e.target.value)} error={guestError} inputProps={{ inputMode: 'numeric', maxLength: String(RULES.maxGuests).length }} />}
          <SelectField id="pkg-occasion" label="Occasion" value={occasion} onChange={(e) => setOccasion(e.target.value)} options={OCCASIONS} placeholder="Select" />
        </Box>
        {/* Heads-up when the guest count is above what the package covers */}
        {overBy > 0 && !guestError && (
          <Typography sx={{ px: 1.5, py: 1, borderRadius: 1.5, fontSize: 12.5, lineHeight: 1.55, color: site.inkSoft, backgroundColor: site.sand }}>
            That is {overBy} more guests than this package covers. You can still reserve it; our team may add charges for the extra guests.
          </Typography>
        )}
        <Button variant="contained" size="large" onClick={reserve} sx={{ py: 1.4, borderRadius: 999 }}>
          {rental ? 'Choose items to rent' : 'Reserve this date'}
        </Button>
        <Typography sx={{ fontSize: 12, lineHeight: 1.55, color: site.inkMuted, textAlign: 'center' }}>
          Browsing and enquiries are free. An account is only needed once you reserve.
        </Typography>
      </Paper>
  );

  return (
    <Box sx={{ backgroundColor: site.ivory, color: site.ink, minHeight: '100vh' }}>
      <SiteNav />
      <Container maxWidth={false} sx={{ maxWidth: tokens.containerMax, py: { xs: 3, md: 5 }, pb: { xs: 14, md: 8 } }}>
        <Breadcrumbs separator={<NavigateNextRoundedIcon sx={{ fontSize: 16 }} />} sx={{ mb: 3, color: site.inkMuted }}>
          <Link component={RouterLink} to="/#packages" underline="hover" sx={{ fontSize: 13, color: site.inkSoft }}>
            Packages
          </Link>
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: site.goldText }}>{pkg ? pkg.name : '…'}</Typography>
        </Breadcrumbs>

        {loading || !pkg ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr' }, gap: 4 }}>
            <Skeleton variant="rounded" height={520} sx={{ bgcolor: site.sand, borderRadius: 3 }} />
            <Skeleton variant="rounded" height={420} sx={{ bgcolor: site.sand, borderRadius: 3 }} />
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr' }, gap: { xs: 3, md: 4 }, alignItems: 'start' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <Paper elevation={0} sx={{ overflow: 'hidden', borderRadius: 3, backgroundColor: site.card, border: `1px solid ${site.border}`, boxShadow: site.shadowCard }}>
                <MoodPanel pkg={pkg} light height={240} iconSize={96} />
                <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
                  <Typography component="h1" sx={{ fontFamily: site.fontSerif, fontSize: { xs: 34, md: 46 }, fontWeight: 600, color: site.ink }}>
                    {pkg.name}
                  </Typography>
                  <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 2.5, color: site.inkSoft, fontSize: 13.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {rental ? <SellOutlinedIcon sx={{ fontSize: 18, color: site.gold }} /> : <GroupsOutlinedIcon sx={{ fontSize: 18, color: site.gold }} />}
                      {rental ? 'Priced per piece' : `Covers ${pkg.guests} guests`}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {rental ? <LocalShippingOutlinedIcon sx={{ fontSize: 18, color: site.gold }} /> : <RestaurantMenuOutlinedIcon sx={{ fontSize: 18, color: site.gold }} />}
                      {rental ? 'Pick up or delivery' : 'For any occasion'}
                    </Box>
                  </Box>
                  <Typography sx={{ mt: 2.5, fontSize: 15, lineHeight: 1.8, color: site.inkSoft }}>{pkg.description}</Typography>
                </Box>
              </Paper>

              {/* Mobile: reserve panel sits here, before the long lists */}
              {!isDesktop && reservePanel}

              {/* The rental package lists its price per piece instead of what is included, and has no food */}
              {rental && <RentalPriceList rentals={data.rentals} />}

              {!rental && (
              <>
              <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 3, backgroundColor: site.card, border: `1px solid ${site.border}`, boxShadow: site.shadowCard }}>
                <Typography component="h2" sx={{ fontFamily: site.fontSerif, fontSize: 23, fontWeight: 600, color: site.ink, mb: 2 }}>
                  What's included
                </Typography>
                <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  {pkg.items.map((item) => (
                    <Box component="li" key={item.name} sx={{ display: 'flex', gap: 1.25, fontSize: 14, color: site.inkSoft }}>
                      <CheckRoundedIcon sx={{ fontSize: 18, color: site.gold, mt: '1px' }} />
                      {formatPackageItem(item)}
                    </Box>
                  ))}
                </Box>
              </Paper>

              <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 3, backgroundColor: site.card, border: `1px solid ${site.border}`, boxShadow: site.shadowCard }}>
                <Typography component="h2" sx={{ fontFamily: site.fontSerif, fontSize: 23, fontWeight: 600, color: site.ink }}>
                  Food and additional charges
                </Typography>
                <Typography sx={{ mt: 0.5, mb: 2.5, fontSize: 13.5, lineHeight: 1.75, color: site.inkSoft }}>
                  Food is not part of the package. On the reservation form you choose a buffet, where you pick one pork, chicken, fish and vegetable dish and we charge per person on top of this package, or catering only, where you get the equipment above and cook the food yourself. Anything you add below is priced in your quotation.
                </Typography>
                {/* Extras the customer can tick on the form; the team prices them per event */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {data.addons.map((a) => (
                    <Box key={a.id} component="span" title={a.description} sx={{ px: 1.25, py: 0.5, borderRadius: 999, fontSize: 12.5, color: site.ink, backgroundColor: site.ivory, border: `1px solid ${site.border}` }}>
                      {a.name}
                    </Box>
                  ))}
                </Box>
              </Paper>
              </>
              )}
            </Box>

            {/* Desktop: reserve panel on the right side. Not sticky: with the calendar always open it is taller than the screen,
                so sticking would hide the Reserve button until the end of the page. */}
            {isDesktop && reservePanel}
          </Box>
        )}
      </Container>

      {/* 1n · sticky price bar with the Reserve CTA on phones */}
      {pkg && (
        <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1050, display: { xs: 'flex', md: 'none' }, alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 2, py: 1.25, pb: 'calc(10px + env(safe-area-inset-bottom))', backgroundColor: 'rgba(251, 247, 240, 0.97)', backdropFilter: 'blur(14px)', borderTop: `1px solid ${site.border}`, boxShadow: '0 -10px 30px -22px rgba(60, 42, 20, 0.45)' }}>
          <Box>
            <Typography sx={{ fontSize: 11, color: site.inkMuted }}>{rental ? 'Rental prices' : 'Package price'}</Typography>
            <Typography sx={{ fontFamily: site.fontSerif, fontSize: 20, fontWeight: 700, color: site.goldText, lineHeight: 1.1 }}>{rental ? 'Per piece' : peso(pkg.price)}</Typography>
          </Box>
          <Button variant="contained" onClick={reserve} sx={{ px: 3, py: 1.2, borderRadius: 999 }}>
            {rental ? 'Choose items' : 'Reserve this date'}
          </Button>
        </Box>
      )}

      <SiteFooter bottomSpace />
      {/* Account popup shown to signed-out visitors who press Reserve */}
      {pkg && <AuthGate open={gateOpen} onClose={() => setGateOpen(false)} intent={{ date, guests: guests ? Number(guests) : null }} packageName={pkg.name} />}
    </Box>
  );
}

/**
 * The Equipment Rental price list: every item that can be rented, grouped like the inventory, with
 * its price per piece and the fee for a piece that comes back damaged or missing. Stock counts are
 * never shown here; the booking form says what is available on the customer's date.
 */
function RentalPriceList({ rentals }) {
  return (
    <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 3, backgroundColor: site.card, border: `1px solid ${site.border}`, boxShadow: site.shadowCard }}>
      <Typography component="h2" sx={{ fontFamily: site.fontSerif, fontSize: 23, fontWeight: 600, color: site.ink }}>
        What you can rent
      </Typography>
      <Typography sx={{ mt: 0.5, mb: 2.5, fontSize: 13.5, lineHeight: 1.75, color: site.inkSoft }}>
        Prices are per piece for your whole rental. Pick up for free in {RENTAL.pickupAddress}, or have it delivered for {peso(RENTAL.deliveryFee)} (a large order may be quoted a different delivery fee). A piece that comes back damaged or missing is charged at its damage fee.
      </Typography>
      {INVENTORY_CATEGORIES.filter((category) => rentals.some((i) => i.category === category)).map((category) => (
        <Box key={category} sx={{ mb: 2.5 }}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: site.goldText, mb: 1 }}>{category}</Typography>
          <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none' }}>
            {rentals
              .filter((i) => i.category === category)
              .map((item) => (
                <Box component="li" key={item.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.9, borderBottom: `1px solid ${site.border}` }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, color: site.ink }}>{item.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: site.inkMuted }}>Damage fee {peso(item.damageFee)}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: site.ink, whiteSpace: 'nowrap' }}>{peso(item.price)}</Typography>
                </Box>
              ))}
          </Box>
        </Box>
      ))}
    </Paper>
  );
}

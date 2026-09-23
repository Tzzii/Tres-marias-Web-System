import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { DashCard, ErrorState, ListSkeleton, PageHeader, RENTAL, catalogApi, formatPackageItem, isRentalPackage, peso, tokens, useDocumentTitle, useResource } from '@tm/shared';
import { MoodPanel } from '../../components/Marketing.jsx';
import { saveIntent } from '../../lib/booking.js';

/**
 * Available packages, from inside the account. "Book this package" goes straight to the form.
 * The Equipment Rental package is priced per piece, so its card shows how renting works instead of a list of items.
 */
export default function PackagesPage() {
  useDocumentTitle('Available packages');
  const navigate = useNavigate();
  // Load the packages visible to customers
  const { data, loading, error, reload } = useResource(() => catalogApi.listPackages(), []);

  // Remember the chosen package and open the reservation form with it selected
  const book = (pkg) => {
    saveIntent({ packageSlug: pkg.slug, packageName: pkg.name });
    navigate(`/portal/book?package=${pkg.slug}`);
  };

  return (
    <>
      <PageHeader title="Available packages" subtitle="Each package is a flat price for the buffet setup, tableware, tables and chairs, and works for any occasion. Food is cooked to your request and priced in your quotation." />
      {/* Error with Retry, loading placeholders, or one card per package */}
      {error ? (
        <DashCard>
          <ErrorState error={error} onRetry={reload} />
        </DashCard>
      ) : loading ? (
        <DashCard>
          <ListSkeleton rows={4} height={90} />
        </DashCard>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
          {data.map((pkg) => (
            <DashCard key={pkg.id} sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <MoodPanel pkg={pkg} height={120} iconSize={46}>
                {pkg.featured && (
                  <Typography component="span" sx={{ position: 'absolute', top: 12, right: 12, px: 1.25, py: 0.5, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', borderRadius: 999, color: tokens.onGold, backgroundColor: tokens.gold }}>
                    Most booked
                  </Typography>
                )}
              </MoodPanel>
              <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
                  <Typography sx={{ fontSize: 19, fontWeight: 700 }}>{pkg.name}</Typography>
                  <Typography sx={{ fontSize: 17, fontWeight: 800 }}>{isRentalPackage(pkg) ? 'Per piece' : peso(pkg.price)}</Typography>
                </Box>
                <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>{pkg.description}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12.5, color: tokens.textMuted }}>
                  <GroupsOutlinedIcon sx={{ fontSize: 16 }} />
                  {isRentalPackage(pkg) ? `Free pick-up in ${RENTAL.pickupAddress} · delivery ${peso(RENTAL.deliveryFee)}` : `Covers ${pkg.guests} guests · food quoted separately`}
                </Box>
                {/* Everything the package includes, with quantities (a rental's items are picked on the form) */}
                {isRentalPackage(pkg) && (
                  <Typography sx={{ mt: 0.5, fontSize: 12.5, color: tokens.textSecondary }}>
                    Choose tables, chairs, linens, food warmers, tableware, tents or decor on the form and type how many you need. See details for the full price list.
                  </Typography>
                )}
                <IncludedItems items={pkg.items} />
                <Box sx={{ mt: 'auto', pt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button variant="contained" onClick={() => book(pkg)}>
                    {isRentalPackage(pkg) ? 'Rent equipment' : 'Book this package'}
                  </Button>
                  <Button variant="outlined" onClick={() => navigate(`/packages/${pkg.slug}`)}>
                    See details
                  </Button>
                </Box>
              </Box>
            </DashCard>
          ))}
        </Box>
      )}
    </>
  );
}

// Items a package card lists on a phone before "Show all"
const PHONE_ITEMS = 5;

/**
 * What a package includes, with quantities. On phones only the first few items show, with a
 * "Show all" button, so each card stays short and the next package is a quick scroll away.
 * Tablets and computers always show the whole list in two columns.
 */
function IncludedItems({ items }) {
  const isPhone = useMediaQuery('(max-width:599px)');
  const [expanded, setExpanded] = useState(false);
  const cut = isPhone && !expanded && items.length > PHONE_ITEMS; // list is shortened right now
  const shown = cut ? items.slice(0, PHONE_ITEMS) : items;
  return (
    <>
      <Box component="ul" sx={{ m: 0, mt: 0.5, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.75 }}>
        {shown.map((item) => (
          <Box component="li" key={item.name} sx={{ display: 'flex', gap: 0.75, fontSize: 12.5, color: tokens.textSecondary }}>
            <CheckRoundedIcon sx={{ fontSize: 15, color: tokens.goldDark, mt: '2px' }} />
            {formatPackageItem(item)}
          </Box>
        ))}
      </Box>
      {/* Phones only: open or close the rest of the list */}
      {isPhone && items.length > PHONE_ITEMS && (
        <Button size="small" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded} sx={{ alignSelf: 'flex-start', px: 0.5, color: tokens.goldDark }}>
          {expanded ? 'Show fewer' : `Show all ${items.length} items`}
        </Button>
      )}
    </>
  );
}

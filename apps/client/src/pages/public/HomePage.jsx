import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';

import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LocalBarOutlinedIcon from '@mui/icons-material/LocalBarOutlined';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import RestaurantMenuOutlinedIcon from '@mui/icons-material/RestaurantMenuOutlined';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { BUSINESS, RULES, cancelWindowText, catalogApi, feedbackApi, isRentalPackage, peso, useDocumentTitle, useResource } from '@tm/shared';
import { useAuth } from '../../auth.js';
import BookingBar from '../../components/BookingBar.jsx';
import GalleryDialog from '../../components/GalleryDialog.jsx';
import { PackageCard, SectionHead } from '../../components/Marketing.jsx';
import SiteFooter from '../../components/SiteFooter.jsx';
import SiteNav from '../../components/SiteNav.jsx';
import MobileAuthBar from '../../components/MobileAuthBar.jsx';
import { Reveal } from '../../components/Reveal.jsx';
import { GALLERY, photoCount } from '../../lib/gallery.js';
import { site, siteContainerSx } from '../../theme/siteTheme.js';
import { AlertBanner, EmptyState, appearanceApi } from '@tm/shared';
import HeroScene from '../../components/HeroScene.jsx';
import PackageComparison from '../../components/PackageComparison.jsx';
import BookingJourney from '../../components/BookingJourney.jsx';
import CustomerReviews from '../../components/CustomerReviews.jsx';


const servicesList = (minimum) => [
  [RestaurantMenuOutlinedIcon, 'A buffet you choose yourself', 'Pick exactly four dishes from our menu, with a maximum of two per category. You may skip any category. Unlimited water and juice are included for every guest. Served plated by our team, at one price per person.'],
  [AutoAwesomeOutlinedIcon, 'Event styling', 'Themed table setups, floral centrepieces, backdrops and mood lighting designed around your motif.'],
  [EventAvailableOutlinedIcon, 'Online reservations', 'Check open dates, reserve online and follow every step, from approval to the final headcount.'],
  [CreditCardOutlinedIcon, 'Flexible payments', `Secure your date with a downpayment${minimum ? ` of at least ${peso(minimum)}` : ''} by QR Ph (GCash, Maya or your bank app) or bank transfer, then pay the rest in parts or in cash on the day.`],
  [LocalBarOutlinedIcon, 'Food tasting', 'Buffet bookings include a complimentary food tasting for four dishes.']
];

const faqList = (minimum) => [
  ['How far in advance should I book?', `Reserve at least ${RULES.leadDays} days before your event. Popular dates, especially weekends in wedding season, fill up early, so we recommend booking as soon as your date is set.`],
  [
    'How much is the downpayment?',
    `${minimum ? `At least ${peso(minimum)}` : 'A downpayment'} secures your date, and you can pay more, up to the full amount. It is due within ${RULES.downpaymentDueDays} days after we approve your reservation. The rest can be paid in parts and is settled by the event day.${minimum ? ` If your total is below ${peso(minimum)}, you pay it in full.` : ''}`
  ],
  [
    'How can I pay?',
    'In your account: scan our QR Ph code with GCash, Maya or your bank app, which is confirmed right away, or pay by bank transfer and upload a photo of the receipt with its reference number; our team verifies it within a day. The balance can also be paid in cash on the event day.'
  ],
  [
    'Can I cancel and get my money back?',
    `Yes. Before you pay, you can cancel online any time before the event day. After you pay, you can cancel online during ${cancelWindowText()}, as long as we haven't started preparing; your reservation page shows the exact date. After that, message us in your chat or call ${BUSINESS.phone}. We return everything you paid, and if we ever return less, we tell you the amount and the reason in your chat.`
  ],
  ['Where do you cater?', `We serve ${BUSINESS.serviceArea}. For venues farther away, send us a message and we will let you know if we can accommodate your event.`],
  ['Is food included in a package?', 'A package covers the equipment: buffet setup, tableware, tables and chairs, and some include helpers. When you reserve, you choose a buffet, where we cook for you and charge per person on top of the package, or catering only, where you get the equipment alone and cook the food yourself.'],
  ['What is on the buffet?', `Choose exactly four dishes in total, with a maximum of two dishes per category. You do not have to choose from every category. For example, you can choose two pork dishes, one vegetable dish and one chicken dish, with no fish. Unlimited water and juice are included for every guest. It is served plated by our team and charged per person, so you know your food cost the moment you enter your guest count.`],
  ['What time can our event start?', `Any time, any day. We run 24 hours a day, Monday to Sunday, so an event can start at six in the morning or at midnight. Pick the hour that suits your celebration and that is when our team arrives.`],
  ['Can I use any package for my event?', 'Yes. Packages are not tied to an occasion, so you can book any package for a wedding, birthday, corporate event or anything else.'],
  ['How many guests can you serve?', `From ${RULES.minGuests} up to ${RULES.maxGuests.toLocaleString('en-PH')} guests. Each package shows its default guest count, so you can pick the one closest to yours, and we follow the guest count you give us.`]
];

const GALLERY_WASH = {
  wedding: 'linear-gradient(150deg, #fbf3ea 0%, #efdcc9 100%)',
  debut: 'linear-gradient(150deg, #f9ecef 0%, #ecd3da 100%)',
  corporate: 'linear-gradient(150deg, #eef0ea 0%, #d9ded2 100%)',
  anniversary: 'linear-gradient(150deg, #f8eedd 0%, #e9d3ae 100%)',
  christening: 'linear-gradient(150deg, #edf2f1 0%, #d5e2df 100%)',
  birthday: 'linear-gradient(150deg, #f6eee6 0%, #e6d6c6 100%)'
};

const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export default function HomePage() {
  useDocumentTitle('Celebrations Worth Savouring');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const packages = useResource(() => catalogApi.listPackages(), []);
  const testimonials = useResource(() => feedbackApi.listPublished({ limit: 3 }), []);
  const appearance = useResource(appearanceApi.getAppearance, []);
  const minimum = packages.data ? catalogApi.minDownpayment() : null;
  const services = servicesList(minimum);
  const faqs = faqList(minimum);

  useEffect(() => {
    if (!location.hash) return undefined;
    const timer = setTimeout(() => scrollToId(location.hash.slice(1)), 120);
    return () => clearTimeout(timer);
  }, [location.hash, packages.loading]);

  const gallery = (location.state && location.state.gallery) || null;
  const galleryEvent = gallery ? GALLERY.find((event) => event.key === gallery.key) || null : null;
  const steppingBack = useRef(false);
  useEffect(() => {
    steppingBack.current = false;
  }, [location.key]);
  const setGallery = (next, replace = false) => {
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace, state: { ...location.state, gallery: next } });
  };
  const stepBack = (steps) => {
    if (steppingBack.current) return;
    steppingBack.current = true;
    navigate(-steps);
  };
  const openGallery = (event) => {
    if (gallery) return;
    setGallery(event.photos.length === 1 ? { key: event.key, photo: 0, depth: 1 } : { key: event.key, depth: 1 });
  };
  const showPhoto = (index) => {
    if (gallery) setGallery({ key: gallery.key, photo: index, depth: 2 });
  };
  const stepPhoto = (index) => {
    if (gallery) setGallery({ ...gallery, photo: index }, true);
  };
  const backToGrid = () => {
    if (!gallery) return;
    if (gallery.depth > 1) stepBack(1);
    else setGallery({ key: gallery.key, depth: 1 }, true);
  };
  const closeGallery = () => {
    if (gallery) stepBack(gallery.depth > 1 ? 2 : 1);
  };

  const reviews = testimonials.data || [];
  const noReviews = !testimonials.loading && !testimonials.error && reviews.length === 0;

  return (
    <Box sx={{ backgroundColor: site.ivory, color: site.ink, minHeight: '100vh' }}>
      <SiteNav />

      <Box
        component="section"
        sx={{
          position: 'relative',
          overflow: 'hidden',
          pt: { xs: 5, md: 8 },
          pb: { xs: 6, md: 8 },
          background: site.gradientHero,
          '&::before': { content: '""', position: 'absolute', inset: '-40%', background: 'radial-gradient(circle at 50% 50%, rgba(197, 160, 89, 0.16) 0%, transparent 45%)', animation: 'tmHeroDrift 18s ease-in-out infinite alternate', pointerEvents: 'none' },
          '&::after': { content: '""', position: 'absolute', inset: 0, backgroundImage: site.textureLinen, maskImage: 'linear-gradient(180deg, #000 45%, transparent 100%)', WebkitMaskImage: 'linear-gradient(180deg, #000 45%, transparent 100%)', pointerEvents: 'none' },
          '@media (prefers-reduced-motion: reduce)': { '&::before': { animation: 'none' } }
        }}
      >
        <Container maxWidth={false} sx={{ ...siteContainerSx, position: 'relative', zIndex: 2 }}>
          <Box sx={{ maxWidth: 1440, mx: 'auto', display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 0.95fr) minmax(0, 1.05fr)' }, alignItems: 'center', gap: { xs: 4, md: 5, lg: 7 } }}>
            <Box sx={{ minWidth: 0, maxWidth: { xs: 640, md: 'none' }, mx: { xs: 'auto', md: 0 }, textAlign: { xs: 'center', md: 'left' } }}>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2, py: 0.875, mb: 3, borderRadius: 999, border: `1px solid ${site.borderHover}`, backgroundColor: 'rgba(255, 255, 255, 0.6)', fontSize: { xs: 10, sm: 12 }, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: site.goldText }}>
                <AutoAwesomeOutlinedIcon aria-hidden="true" sx={{ fontSize: 16, color: site.goldText }} />
                Full-service event catering
              </Box>
              <Typography component="h1" sx={{ fontFamily: site.fontSerif, fontSize: { xs: 40, sm: 56, md: 58, lg: 68 }, fontWeight: 600, lineHeight: 1.08, letterSpacing: '-0.025em', textWrap: 'balance', color: site.ink }}>
                Celebrations Worth Savouring
              </Typography>
              <Typography sx={{ mt: 2.5, maxWidth: 520, mx: { xs: 'auto', md: 0 }, fontSize: { xs: 15, md: 16 }, lineHeight: 1.8, color: site.inkSoft }}>
                Thoughtful setups, Filipino flavours and a warm welcome for every guest. Find the right package for your next celebration.
              </Typography>
              <Box sx={{ mt: 3.5, display: 'flex', gap: 1.5, justifyContent: { xs: 'center', md: 'flex-start' }, flexWrap: 'wrap' }}>
                <Button variant="contained" onClick={() => scrollToId('packages')} sx={{ px: 3, py: 1.5, fontSize: 14, borderRadius: 999 }}>
                  See our packages
                </Button>
                <Button onClick={() => scrollToId('availability')} sx={{ px: 3, py: 1.5, fontSize: 14, borderRadius: 999, color: site.ink, backgroundColor: 'rgba(255, 255, 255, 0.55)', border: `1px solid ${site.border}`, '&:hover': { color: site.goldText, borderColor: site.gold, backgroundColor: '#fff' } }}>
                  Check availability
                </Button>
              </Box>
              <Typography sx={{ mt: 2, fontSize: 12.5, lineHeight: 1.7, color: site.inkSoft }}>
                Explore without an account. Food is priced separately from setup packages.
              </Typography>
              <Typography sx={{ mt: 1, fontSize: 12, color: site.goldText }}>Serving {BUSINESS.serviceArea}</Typography>
            </Box>
            <HeroScene settings={appearance.data} />
          </Box>
        </Container>
      </Box>

      <Box component="section" id="packages" sx={{ py: { xs: 10, md: 12 }, scrollMarginTop: { xs: '88px', lg: '100px' } }}>
        <Container maxWidth={false} sx={siteContainerSx}>
          <SectionHead eyebrow="Our Packages" title="Pick the Package That Fits Your Guest Count" description={`${packages.data ? packages.data.filter((p) => !isRentalPackage(p)).length : 'Our'} packages, each a flat price for the buffet setup, tableware, tables and chairs. Any package works for any occasion, as a buffet we cook for you or as catering only. Need only a few things? Rent them by the piece.`} />
          {packages.error && (
            <AlertBanner
              tone="error"
              title="Packages could not be refreshed"
              action={<Button onClick={packages.reload}>Try again</Button>}
              sx={{ mb: 3 }}
            >
              {packages.data?.length ? 'Showing the last loaded packages. Please try again for the latest details.' : 'We could not load our packages. Please try again.'}
            </AlertBanner>
          )}
          {!packages.loading && !packages.error && packages.data?.length === 0 && (
            <EmptyState title="No packages available yet" description="Please check back soon or contact us to discuss your event." />
          )}
          <Box aria-busy={packages.loading} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 4 }}>
            {packages.loading
              ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} variant="rounded" height={420} sx={{ borderRadius: 3, bgcolor: site.sand }} />)
              : (packages.data || []).map((pkg, index) => <PackageCard key={pkg.id} pkg={pkg} index={index} />)}
          </Box>
          {!packages.loading && <PackageComparison packages={packages.data || []} />}
          <BookingJourney />
        </Container>
      </Box>

      <Box component="section" id="availability" sx={{ py: { xs: 10, md: 12 }, backgroundColor: site.sand, scrollMarginTop: { xs: '88px', lg: '100px' } }}>
        <Container maxWidth={false} sx={siteContainerSx}>
          <Reveal y={28}>
            <BookingBar onAvailable={() => setTimeout(() => scrollToId('packages'), 900)} />
          </Reveal>
        </Container>
      </Box>

      <Box component="section" id="gallery" sx={{ py: { xs: 10, md: 12 }, scrollMarginTop: { xs: '88px', lg: '100px' } }}>
        <Container maxWidth={false} sx={siteContainerSx}>
          <SectionHead eyebrow="Gallery" title="Moments We Have Served" description="A glimpse of the celebrations our team has had the honour of catering." />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 3 }}>
            {GALLERY.map((event, i) => (
              <Reveal key={event.key} delay={(i % 3) * 100} sx={{ width: { xs: '100%', sm: 'calc((100% - 24px) / 2)', lg: 'calc((100% - 48px) / 3)' } }}>
                <ButtonBase
                  onClick={() => openGallery(event)}
                  aria-haspopup="dialog"

                  sx={{
                    position: 'relative',
                    display: 'flex',
                    width: '100%',
                    height: { xs: 240, md: 300 },
                    alignItems: 'flex-end',
                    justifyContent: 'flex-start',
                    p: 2.5,
                    textAlign: 'left',
                    borderRadius: 3,
                    overflow: 'hidden',
                    background: GALLERY_WASH[event.key],
                    border: `1px solid ${site.border}`,
                    transition: 'border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease',
                    '@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)': {
                      '&:hover': { borderColor: site.borderHover, transform: 'translateY(-4px)', boxShadow: site.shadowCardHover },
                      '&:hover .tm-gallery-cover': { transform: 'scale(1.06)' }
                    },
                    '@media (prefers-reduced-motion: reduce)': {
                      transition: 'none',
                      '&:hover, &:active': { transform: 'none' },
                      '& .tm-gallery-cover': { transition: 'none', transform: 'none' }
                    },
                    '&.Mui-focusVisible': { outline: `2px solid ${site.gold}`, outlineOffset: 3 }
                  }}
                >
                  <Box component="img" className="tm-gallery-cover" src={event.photos[0].thumb} alt="" width={640} height={420} loading="lazy" decoding="async" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s ease' }} />
                  <Box component="span" sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(23, 19, 17, 0) 38%, rgba(23, 19, 17, 0.74) 100%)' }} />
                  <Box component="span" sx={{ position: 'relative', display: 'block' }}>
                    <Typography component="span" sx={{ display: 'block', fontFamily: site.fontSerif, fontSize: { xs: 16, md: 20 }, fontWeight: 600, lineHeight: 1.25, color: '#fff' }}>
                      {event.story?.headline || event.label}
                    </Typography>
                    <Typography component="span" sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.75, fontSize: { xs: 12, md: 13 }, color: 'rgba(255, 255, 255, 0.85)' }}>
                      <PhotoLibraryOutlinedIcon sx={{ fontSize: 15 }} />
                      {photoCount(event.photos.length)}
                    </Typography>
                  </Box>
                </ButtonBase>
              </Reveal>
            ))}
          </Box>

          {noReviews && (
            <Paper elevation={0} sx={{ mt: 6, mx: 'auto', maxWidth: 364, p: 3.5, borderRadius: 3, backgroundColor: site.card, border: `1px solid ${site.border}`, boxShadow: site.shadowCard, textAlign: 'center' }}>
              <Box aria-hidden="true" sx={{ display: 'flex', justifyContent: 'center', color: site.gold, mb: 1.5 }}>
                {Array.from({ length: 5 }, (_, star) => (
                  <StarBorderRoundedIcon key={star} sx={{ fontSize: 17 }} />
                ))}
              </Box>
              <Typography sx={{ fontFamily: site.fontSerif, fontSize: 16.5, fontStyle: 'italic', color: site.inkSoft }}>No reviews yet</Typography>
            </Paper>
          )}

          <CustomerReviews reviews={reviews} />
        </Container>
      </Box>

      <Box component="section" id="services" sx={{ py: { xs: 10, md: 12 }, backgroundColor: site.sand, scrollMarginTop: { xs: '88px', lg: '100px' } }}>
        <Container maxWidth={false} sx={siteContainerSx}>
          <SectionHead eyebrow="What We Handle" title="Everything Under One Roof" description="You plan the guest list. We take care of the rest, from the first tasting to the last cleared plate." />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 4 }}>
            {services.map(([Icon, name, text], i) => (
              <Reveal key={name} delay={(i % 3) * 110} sx={{ height: '100%' }}>
                <Paper elevation={0} sx={{ height: '100%', p: 3.5, borderRadius: 3, backgroundColor: site.card, border: `1px solid ${site.border}`, boxShadow: site.shadowCard, transition: 'border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease', '&:hover': { borderColor: site.borderHover, transform: 'translateY(-4px)', boxShadow: site.shadowCardHover }, '&:hover .tm-service-icon': { color: '#fff', backgroundColor: site.gold, borderColor: site.gold } }}>
                  <Box className="tm-service-icon" sx={{ width: 52, height: 52, mb: 2.25, borderRadius: '50%', display: 'grid', placeItems: 'center', color: site.goldText, backgroundColor: site.goldTint, border: '1px solid rgba(197, 160, 89, 0.3)', transition: 'color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease' }}>
                    <Icon sx={{ fontSize: 22 }} />
                  </Box>
                  <Typography component="h3" sx={{ fontFamily: site.fontSerif, fontSize: 20, fontWeight: 600, color: site.ink }}>
                    {name}
                  </Typography>
                  <Typography sx={{ mt: 1, fontSize: 13.5, lineHeight: 1.75, color: site.inkSoft }}>{text}</Typography>
                </Paper>
              </Reveal>
            ))}
          </Box>
        </Container>
      </Box>

      <Box component="section" sx={{ py: { xs: 10, md: 12 } }}>
        <Container maxWidth={false} sx={siteContainerSx}>
          <Reveal y={18} scale={0.98}>
            <Paper elevation={0} sx={{ p: { xs: 4, md: 8 }, textAlign: 'center', borderRadius: 4, backgroundColor: site.espresso, border: `1px solid ${site.espressoBorder}`, backgroundImage: site.gradientCta, boxShadow: site.shadowCardHover }}>
              <Typography component="h2" sx={{ fontFamily: site.fontSerif, fontSize: { xs: 30, md: 42 }, fontWeight: 600, color: site.onEspresso }}>
                Ready to Reserve Your Date?
              </Typography>
              <Typography sx={{ mt: 2, mx: 'auto', maxWidth: 600, fontSize: 15, lineHeight: 1.75, color: site.onEspressoSoft }}>
                {user
                  ? 'Start a new reservation from your account, or check on the ones already in progress.'
                  : 'Create your account to submit a reservation, follow its status and manage payments in one place.'}
              </Typography>
              <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button variant="contained" onClick={() => (user ? navigate('/portal/book') : scrollToId('packages'))} sx={{ px: 4, py: 1.5, fontSize: 14.5, borderRadius: 999, color: site.espresso, backgroundColor: site.gold, '&:hover': { backgroundColor: site.goldLight } }}>
                  {user ? 'New reservation' : 'Choose a package'}
                </Button>
                <Button onClick={() => navigate(user ? '/portal' : '/login')} sx={{ px: 4, py: 1.5, fontSize: 14.5, borderRadius: 999, color: site.onEspresso, border: '1px solid rgba(245, 239, 230, 0.35)', '&:hover': { borderColor: site.gold, backgroundColor: 'rgba(197, 160, 89, 0.1)' } }}>
                  {user ? 'Go to my account' : 'I have an account'}
                </Button>
              </Box>
            </Paper>
          </Reveal>
        </Container>
      </Box>

      <Box component="section" id="faq" sx={{ py: { xs: 10, md: 12 }, backgroundColor: site.sand, scrollMarginTop: { xs: '88px', lg: '100px' } }}>
        <Container maxWidth={false} sx={{ maxWidth: 820 }}>
          <SectionHead eyebrow="FAQ" title="Questions We Hear Often" description="Everything you might want to know before reserving. Still unsure? Our team is happy to help." />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {faqs.map(([question, answer], i) => (
              <Reveal key={question} delay={i * 70} y={14}>
                <Accordion
                  disableGutters
                  elevation={0}
                  sx={{
                    borderRadius: '14px !important',
                    backgroundColor: site.card,
                    border: `1px solid ${site.border}`,
                    boxShadow: 'none',
                    transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
                    '&::before': { display: 'none' },
                    '&:hover, &.Mui-expanded': { borderColor: site.borderHover, boxShadow: site.shadowCard }
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreRoundedIcon sx={{ color: site.goldText }} />} sx={{ px: 3, py: 0.75 }}>
                    <Typography component="h3" sx={{ fontSize: 15.5, fontWeight: 600, color: site.ink }}>
                      {question}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 3, pt: 0, pb: 2.5 }}>
                    <Typography sx={{ fontSize: 14, lineHeight: 1.8, color: site.inkSoft }}>{answer}</Typography>
                  </AccordionDetails>
                </Accordion>
              </Reveal>
            ))}
          </Box>
        </Container>
      </Box>

      <SiteFooter bottomSpace={!user} />
      <MobileAuthBar />

      <GalleryDialog event={galleryEvent} photo={gallery ? gallery.photo : null} onShowPhoto={showPhoto} onStep={stepPhoto} onBack={backToGrid} onClose={closeGallery} />
    </Box>
  );
}

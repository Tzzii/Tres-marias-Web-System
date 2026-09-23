import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LocalBarOutlinedIcon from '@mui/icons-material/LocalBarOutlined';
import RestaurantMenuOutlinedIcon from '@mui/icons-material/RestaurantMenuOutlined';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { BUSINESS, RULES, catalogApi, feedbackApi, isRentalPackage, tokens, useDocumentTitle, useResource } from '@tm/shared';
import { useAuth } from '../../auth.js';
import BookingBar from '../../components/BookingBar.jsx';
import { PackageCard, SectionHead } from '../../components/Marketing.jsx';
import SiteFooter from '../../components/SiteFooter.jsx';
import SiteNav from '../../components/SiteNav.jsx';
import MobileAuthBar from '../../components/MobileAuthBar.jsx';
import { Reveal, reducedMotionSx, useInView } from '../../components/Reveal.jsx';
import { site } from '../../theme/siteTheme.js';

// Hero line fade-up: hidden and lowered until the hero is on screen, then eased in `delay` ms later.
// Replays when the visitor scrolls back up to the hero.
const heroLine = (shown, delay) => ({
  opacity: shown ? 1 : 0,
  transform: shown ? 'none' : 'translateY(18px)',
  transition: `opacity 0.8s ease ${delay}ms, transform 0.9s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
  ...reducedMotionSx
});

// Services section cards as [icon, title, description]
const SERVICES = [
  [RestaurantMenuOutlinedIcon, 'A buffet you choose yourself', 'Pick one pork, chicken, fish and vegetable dish from our menu, with water and juice for every guest. Served plated by our team, at one price per person.'],
  [AutoAwesomeOutlinedIcon, 'Event styling', 'Themed table setups, floral centrepieces, backdrops and mood lighting designed around your motif.'],
  [EventAvailableOutlinedIcon, 'Online reservations', 'Check open dates, reserve online and follow every step, from approval to the final headcount.'],
  [CreditCardOutlinedIcon, 'Flexible payments', 'Secure your date with a 50% downpayment through cash, GCash or bank transfer and settle the rest on the day.'],
  [LocalBarOutlinedIcon, 'Food tasting', 'Wedding package bookings include a complimentary tasting for four so you can finalise the menu with confidence.']
];

// FAQ section as [question, answer]. Numbers come from BUSINESS and RULES in config.js,
// so the answers stay correct if those settings change.
const FAQS = [
  ['How far in advance should I book?', `Reserve at least ${RULES.leadDays} days before your event. Popular dates, especially weekends in wedding season, fill up early, so we recommend booking as soon as your date is set.`],
  ['How much is the downpayment?', `A ${RULES.downpaymentRate * 100}% downpayment secures your date. It is due within ${RULES.downpaymentDueDays} days after we approve your reservation, and the balance is settled on the event day.`],
  ['How can I pay?', 'Through GCash or bank transfer. Upload your proof of payment in your account and our team will verify it.'],
  ['Where do you cater?', `We serve ${BUSINESS.serviceArea}. For venues farther away, send us a message and we will let you know if we can accommodate your event.`],
  ['Is food included in a package?', 'A package covers the equipment: buffet setup, tableware, tables and chairs, and some include waiters. When you reserve, you choose a buffet, where we cook for you and charge per person on top of the package, or catering only, where you get the equipment alone and cook the food yourself.'],
  ['What is on the buffet?', `One pork dish, one chicken dish, one fish dish and one vegetable dish, all picked by you from our menu, with water and juice for every guest. It is served plated by our team and charged per person, so you know your food cost the moment you enter your guest count.`],
  ['What time can our event start?', `Any time, any day. We run 24 hours a day, Monday to Sunday, so an event can start at six in the morning or at midnight. Pick the hour that suits your celebration and that is when our team arrives.`],
  ['Can I use any package for my event?', 'Yes. Packages are not tied to an occasion, so you can book any package for a wedding, birthday, corporate event or anything else.'],
  ['How many guests can you serve?', `Each package lists how many guests its tableware and chairs cover. If you have more guests than that, you can still book it and we add the extra charges to your quotation, from ${RULES.minGuests} up to ${RULES.maxGuests.toLocaleString('en-PH')} guests.`]
];

// Gallery tiles as [label, soft light background gradient, icon file name]
const GALLERY = [
  ['Wedding', 'linear-gradient(150deg, #fbf3ea 0%, #efdcc9 100%)', 'wedding'],
  ['Debut', 'linear-gradient(150deg, #f9ecef 0%, #ecd3da 100%)', 'debut'],
  ['Corporate', 'linear-gradient(150deg, #eef0ea 0%, #d9ded2 100%)', 'corporate'],
  ['Anniversary', 'linear-gradient(150deg, #f8eedd 0%, #e9d3ae 100%)', 'anniversary'],
  ['Christenings', 'linear-gradient(150deg, #edf2f1 0%, #d5e2df 100%)', 'christening'],
  ['Birthdays', 'linear-gradient(150deg, #f6eee6 0%, #e6d6c6 100%)', 'birthday']
];

// Smooth-scroll to the element with this id
const scrollToId = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/** 1a · Browse / landing: the public entry point, no login required. */
export default function HomePage() {
  useDocumentTitle('Celebrations worth savouring');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  // Load visible packages and the reviews the team published (featured ones first)
  const packages = useResource(() => catalogApi.listPackages(), []);
  const testimonials = useResource(() => feedbackApi.listPublished({ limit: 3 }), []);
  // Whether the hero text is on screen (drives its fade-up)
  const [heroRef, heroShown] = useInView();

  // Arriving with /#section (from another page) scrolls to that section
  useEffect(() => {
    if (!location.hash) return undefined;
    const timer = setTimeout(() => scrollToId(location.hash.slice(1)), 120);
    return () => clearTimeout(timer);
  }, [location.hash, packages.loading]);

  // Only reviews the admin published on the Feedbacks page reach the website
  const reviews = testimonials.data || [];

  return (
    <Box sx={{ backgroundColor: site.ivory, color: site.ink, minHeight: '100vh' }}>
      <SiteNav />

      {/* ==================== HERO ==================== */}
      <Box
        component="section"
        sx={{
          position: 'relative',
          overflow: 'hidden',
          textAlign: 'center',
          px: 3,
          pt: { xs: 8, md: 11 },
          pb: { xs: 16, md: 19 },
          background: site.gradientHero,
          // Slowly drifting warm glow and a faint linen texture over the ivory hero.
          // The texture fades out towards the bottom so the hero blends into the page with no visible edge.
          '&::before': { content: '""', position: 'absolute', inset: '-40%', background: 'radial-gradient(circle at 50% 50%, rgba(197, 160, 89, 0.16) 0%, transparent 45%)', animation: 'tmHeroDrift 18s ease-in-out infinite alternate', pointerEvents: 'none' },
          '&::after': { content: '""', position: 'absolute', inset: 0, backgroundImage: site.textureLinen, maskImage: 'linear-gradient(180deg, #000 45%, transparent 100%)', WebkitMaskImage: 'linear-gradient(180deg, #000 45%, transparent 100%)', pointerEvents: 'none' }
        }}
      >
        <Box ref={heroRef} sx={{ position: 'relative', zIndex: 2, maxWidth: 860, mx: 'auto' }}>
          {/* Badge, title, text and buttons fade up in turn whenever the hero comes on screen */}
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2.25, py: 0.875, mb: 3.25, borderRadius: 999, border: `1px solid ${site.borderHover}`, backgroundColor: 'rgba(255, 255, 255, 0.6)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: site.goldText, ...heroLine(heroShown, 100) }}>
            <Box sx={{ display: 'flex', color: site.gold }}>
              {Array.from({ length: 5 }, (_, i) => (
                <StarRoundedIcon key={i} sx={{ fontSize: 14 }} />
              ))}
            </Box>
            Full-service event catering
          </Box>
          <Typography component="h1" sx={{ fontFamily: site.fontSerif, fontSize: { xs: 40, sm: 56, md: 70 }, fontWeight: 600, lineHeight: 1.08, color: site.ink, ...heroLine(heroShown, 250) }}>
            Celebrations worth savouring
          </Typography>
          <Typography sx={{ mt: 3, mx: 'auto', maxWidth: 640, fontSize: { xs: 15, md: 17 }, lineHeight: 1.75, color: site.inkSoft, ...heroLine(heroShown, 400) }}>
            Browse every package, price and open date. No account needed to look around. When you are ready, reserve your date in minutes.
          </Typography>
          <Box sx={{ mt: 4.5, display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap', ...heroLine(heroShown, 550) }}>
            <Button variant="contained" onClick={() => scrollToId('packages')} sx={{ px: 4, py: 1.5, fontSize: 14.5, borderRadius: 999 }}>
              See our packages
            </Button>
            <Button onClick={() => scrollToId('faq')} sx={{ px: 4, py: 1.5, fontSize: 14.5, borderRadius: 999, color: site.ink, backgroundColor: 'rgba(255, 255, 255, 0.55)', border: `1px solid ${site.border}`, '&:hover': { color: site.goldText, borderColor: site.gold, backgroundColor: '#fff' } }}>
              Common questions
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ==================== AVAILABILITY BAR ==================== */}
      <Container maxWidth={false} sx={{ maxWidth: tokens.containerMax, mt: { xs: -10, md: -11 }, position: 'relative', zIndex: 5 }}>
        {/* Rises in after the hero text. If the date is open, wait a moment so the message can be read, then scroll to the packages */}
        <Reveal delay={450} y={28}>
          <BookingBar onAvailable={() => setTimeout(() => scrollToId('packages'), 900)} />
        </Reveal>
      </Container>

      {/* ==================== PACKAGES ==================== */}
      <Box component="section" id="packages" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: '80px' }}>
        <Container maxWidth={false} sx={{ maxWidth: tokens.containerMax }}>
          {/* The count leaves out the Equipment Rental package, which is priced per piece rather than flat */}
          <SectionHead eyebrow="Our packages" title="Pick the package that fits your guest count" description={`${packages.data ? packages.data.filter((p) => !isRentalPackage(p)).length : 'Our'} packages, each a flat price for the buffet setup, tableware, tables and chairs. Any package works for any occasion, as a buffet we cook for you or as catering only. Need only a few things? Rent them by the piece.`} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
            {/* Grey placeholder cards while loading, then one card per package (its position staggers the entrance animation) */}
            {packages.loading
              ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} variant="rounded" height={420} sx={{ borderRadius: 3, bgcolor: site.sand }} />)
              : (packages.data || []).map((pkg, index) => <PackageCard key={pkg.id} pkg={pkg} index={index} />)}
          </Box>
        </Container>
      </Box>

      {/* ==================== SERVICES ==================== */}
      <Box component="section" id="services" sx={{ py: { xs: 8, md: 10 }, backgroundColor: site.sand, scrollMarginTop: '80px' }}>
        <Container maxWidth={false} sx={{ maxWidth: tokens.containerMax }}>
          <SectionHead eyebrow="What we handle" title="Everything under one roof" description="You plan the guest list. We take care of the rest, from the first tasting to the last cleared plate." />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
            {/* White cards fade up as they come into view (cards in a row follow one another); on hover the card lifts and the icon tile fills gold */}
            {SERVICES.map(([Icon, name, text], i) => (
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

      {/* ==================== GALLERY ==================== */}
      <Box component="section" id="gallery" sx={{ py: { xs: 8, md: 10 }, scrollMarginTop: '80px' }}>
        <Container maxWidth={false} sx={{ maxWidth: tokens.containerMax }}>
          <SectionHead eyebrow="Gallery" title="Moments we have served" description="A glimpse of the celebrations our team has had the honour of catering." />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
            {/* Soft pastel tiles fade up as they come into view; on hover the tile lifts and the icon brightens and grows slightly */}
            {GALLERY.map(([label, background, icon], i) => (
              <Reveal key={label} delay={(i % 3) * 100}>
                <Box sx={{ position: 'relative', height: { xs: 150, md: 200 }, display: 'flex', alignItems: 'flex-end', p: 2.5, borderRadius: 3, overflow: 'hidden', background, border: `1px solid ${site.border}`, transition: 'border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease', '&:hover': { borderColor: site.borderHover, transform: 'translateY(-4px)', boxShadow: site.shadowCardHover }, '&:hover img': { opacity: 1, transform: 'scale(1.08)' } }}>
                  <Box component="img" src={`/images/icons/${icon}.svg`} alt="" sx={{ position: 'absolute', top: 16, right: 16, width: { xs: 40, md: 56 }, opacity: 0.8, transition: 'opacity 0.35s ease, transform 0.35s ease' }} />
                  <Typography sx={{ position: 'relative', fontFamily: site.fontSerif, fontSize: { xs: 16, md: 20 }, fontWeight: 600, color: site.ink }}>{label}</Typography>
                </Box>
              </Reveal>
            ))}
          </Box>

          {/* Customer reviews under the gallery (only if there are any) */}
          {reviews.length > 0 && (
            <Box sx={{ mt: 6, display: 'grid', gridTemplateColumns: { xs: '1fr', md: `repeat(${reviews.length}, 1fr)` }, gap: 2.5 }}>
              {/* Reviews fade up one after another */}
              {reviews.map((review, i) => (
                <Reveal key={review.id} delay={i * 120} sx={{ height: '100%' }}>
                  <Paper component="figure" elevation={0} sx={{ height: '100%', m: 0, p: 3.5, borderRadius: 3, backgroundColor: site.card, border: `1px solid ${site.border}`, boxShadow: site.shadowCard }}>
                    <Box sx={{ display: 'flex', color: site.gold, mb: 1.5 }} aria-label={`${review.rating} out of 5 stars`}>
                      {Array.from({ length: review.rating }, (_, i) => (
                        <StarRoundedIcon key={i} sx={{ fontSize: 17 }} />
                      ))}
                    </Box>
                    <Typography component="blockquote" sx={{ m: 0, fontFamily: site.fontSerif, fontSize: 16.5, fontStyle: 'italic', lineHeight: 1.65, color: site.ink }}>
                      “{review.body}”
                    </Typography>
                    <Typography component="figcaption" sx={{ mt: 2, fontSize: 13, fontWeight: 600, color: site.ink }}>
                      {review.customerName}
                      <Box component="span" sx={{ display: 'block', fontSize: 12, fontWeight: 400, color: site.inkMuted }}>
                        {review.eventName}
                      </Box>
                    </Typography>
                  </Paper>
                </Reveal>
              ))}
            </Box>
          )}
        </Container>
      </Box>

      {/* ==================== CLOSING CTA ==================== */}
      <Box component="section" sx={{ py: { xs: 8, md: 10 } }}>
        <Container maxWidth={false} sx={{ maxWidth: tokens.containerMax }}>
          {/* Espresso panel (the one dark block before the footer); it fades in and grows very slightly into place */}
          <Reveal y={18} scale={0.98}>
            <Paper elevation={0} sx={{ p: { xs: 4, md: 8 }, textAlign: 'center', borderRadius: 4, backgroundColor: site.espresso, border: `1px solid ${site.espressoBorder}`, backgroundImage: site.gradientCta, boxShadow: site.shadowCardHover }}>
              <Typography component="h2" sx={{ fontFamily: site.fontSerif, fontSize: { xs: 30, md: 42 }, fontWeight: 600, color: site.onEspresso }}>
                Ready to reserve your date?
              </Typography>
              <Typography sx={{ mt: 2, mx: 'auto', maxWidth: 600, fontSize: 15, lineHeight: 1.75, color: site.onEspressoSoft }}>
                {user
                  ? 'Start a new reservation from your account, or check on the ones already in progress.'
                  : 'Create your account to submit a reservation, follow its status and manage payments in one place.'}
              </Typography>
              {/* Buttons change depending on whether the visitor is signed in */}
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

      {/* ==================== FAQ ==================== */}
      {/* Last section before the footer. Click a question to show or hide its answer; several can be open at once */}
      <Box component="section" id="faq" sx={{ py: { xs: 8, md: 10 }, backgroundColor: site.sand, scrollMarginTop: '80px' }}>
        <Container maxWidth={false} sx={{ maxWidth: 820 }}>
          <SectionHead eyebrow="FAQ" title="Questions we hear often" description="Everything you might want to know before reserving. Still unsure? Our team is happy to help." />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Questions fade up one after another as the list comes into view */}
            {FAQS.map(([question, answer], i) => (
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
                    '&::before': { display: 'none' }, // hide MUI's default divider line between accordions
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
    </Box>
  );
}

import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import NorthEastRoundedIcon from '@mui/icons-material/NorthEastRounded';
import { DashCard, HeroPhoto, appearanceApi, catalogApi, isRentalPackage, peso, tokens, useResource } from '@tm/shared';
import { MoodPanel } from './Marketing.jsx';

const STEPS = [
  {
    title: 'Make it yours',
    description: 'Choose a package, your date, and the details you have in mind.'
  },
  {
    title: 'Review your quotation',
    description: 'Our team prepares a quotation for you to review and accept.'
  },
  {
    title: 'Secure your date',
    description: 'Pay your downpayment, then follow your booking right here.'
  }
];

export default function FirstReservationWelcome({ draft }) {
  const packages = useResource(() => catalogApi.listPackages(), []);
  const appearance = useResource(() => appearanceApi.getAppearance(), []);
  const suggestions = (packages.data || [])
    .filter((pkg) => !isRentalPackage(pkg))
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
    .slice(0, 3);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 3 } }}>
      <DashCard
        aria-labelledby="first-reservation-title"
        sx={{ p: 0, overflow: 'hidden', boxShadow: 'none', borderRadius: 2.5 }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' } }}>
          <Box
            sx={{
              p: { xs: 2.5, sm: 3.5, lg: 4.5 },
              background: `${tokens.textureLinen}, linear-gradient(120deg, ${tokens.surfaceSubtle}, ${tokens.cardLight})`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'center'
            }}
          >
            <Typography
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: tokens.textSecondary
              }}
            >
              <Box component="span" aria-hidden="true" sx={{ width: 22, height: 2, bgcolor: tokens.gold }} />
              Your first celebration with us
            </Typography>
            <Typography
              id="first-reservation-title"
              component="h2"
              sx={{
                mt: 2,
                maxWidth: 520,
                fontFamily: '"Playfair Display", Georgia, serif',
                fontSize: { xs: 32, sm: 38, lg: 46 },
                lineHeight: 1.16,
                letterSpacing: '-0.025em',
                fontWeight: 600,
                textWrap: 'balance'
              }}
            >
              Let’s plan something worth celebrating.
            </Typography>
            <Typography sx={{ mt: 2, maxWidth: 460, fontSize: 14, lineHeight: 1.8, color: tokens.textSecondary }}>
              A birthday, a wedding, or a simple get-together. Tell us what you’re planning, and we’ll help bring it to
              the table.
            </Typography>
            <Box sx={{ mt: 3, display: 'flex', gap: 1.25, flexWrap: 'wrap', width: '100%' }}>
              <Button
                component={RouterLink}
                to={draft ? '/portal/book?draft=1' : '/portal/book'}
                variant="contained"
                endIcon={<ArrowForwardRoundedIcon />}
                sx={{ minHeight: 46, px: 2.5, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}
              >
                {draft ? 'Continue my reservation' : 'Plan my first event'}
              </Button>
              <Button
                component={RouterLink}
                to="/portal/packages"
                variant="outlined"
                sx={{ minHeight: 46, px: 2.5, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}
              >
                Browse packages
              </Button>
            </Box>
            <Typography
              sx={{
                mt: 2,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0.75,
                fontSize: 12,
                color: tokens.textSecondary
              }}
            >
              <CheckRoundedIcon sx={{ fontSize: 16, mt: '1px', flexShrink: 0, color: tokens.goldDark }} />
              Review and accept your quotation before paying.
            </Typography>
          </Box>
          <Box component="figure" sx={{ m: 0, position: 'relative', minWidth: 0, minHeight: { xs: 210, md: 340 } }}>
            <HeroPhoto
              settings={appearance.data}
              sx={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                inset: 0,
                objectFit: 'cover',
                objectPosition: '58% center'
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, transparent 45%, rgba(32, 25, 18, 0.72))'
              }}
            />
            <Box
              component="figcaption"
              sx={{ position: 'absolute', bottom: { xs: 20, md: 28 }, left: { xs: 20, md: 28 }, right: 20 }}
            >
              <Typography
                sx={{ color: '#fff', fontFamily: '"Playfair Display", Georgia, serif', fontSize: 24, lineHeight: 1.3 }}
              >
                Good food. Beautifully shared.
              </Typography>
              <Typography sx={{ mt: 0.75, color: '#fff', fontSize: 12 }}>Tres Marias Catering Services</Typography>
            </Box>
          </Box>
        </Box>
      </DashCard>

      <Box component="section" aria-labelledby="getting-started-title">
        <Typography
          id="getting-started-title"
          component="h2"
          sx={{ mb: 1.5, fontSize: 15, fontWeight: 700, color: tokens.textLight }}
        >
          Your first reservation, in three steps
        </Typography>
        <Box
          component="ol"
          sx={{
            m: 0,
            p: 0,
            listStyle: 'none',
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
            gap: { xs: 2, md: 3 }
          }}
        >
          {STEPS.map((step, index) => (
            <Box
              component="li"
              key={step.title}
              sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minWidth: 0 }}
            >
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  width: 34,
                  height: 34,
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  border: `1px solid ${tokens.divider}`,
                  borderRadius: '50%',
                  bgcolor: tokens.goldWash,
                  color: tokens.goldText,
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {String(index + 1).padStart(2, '0')}
              </Box>
              <Box>
                <Typography component="h3" sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textLight }}>
                  {step.title}
                </Typography>
                <Typography
                  sx={{ mt: 0.5, maxWidth: 340, fontSize: 12.5, lineHeight: 1.7, color: tokens.textOnDarkSoft }}
                >
                  {step.description}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <DashCard sx={{ boxShadow: 'none' }} aria-labelledby="package-suggestions-title">
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
            mb: 2
          }}
        >
          <Box>
            <Typography id="package-suggestions-title" component="h2" sx={{ fontSize: 16, fontWeight: 700 }}>
              Find your starting point
            </Typography>
            <Typography sx={{ mt: 0.5, fontSize: 12.5, color: tokens.textSecondary }}>
              Setup packages for your guest list. Food is quoted separately.
            </Typography>
          </Box>
          <Button
            component={RouterLink}
            to="/portal/packages"
            size="small"
            endIcon={<ArrowForwardRoundedIcon />}
            sx={{ minHeight: 40 }}
          >
            View all packages
          </Button>
        </Box>
        {packages.error ? (
          <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>
              We couldn’t load the package previews.
            </Typography>
            <Button size="small" onClick={packages.reload}>
              Try again
            </Button>
          </Box>
        ) : packages.loading ? (
          <Box
            aria-label="Loading package suggestions"
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}
          >
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={100} />
            ))}
          </Box>
        ) : suggestions.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
            {suggestions.map((pkg) => (
              <ButtonBase
                key={pkg.id}
                component={RouterLink}
                to={`/packages/${pkg.slug}`}
                aria-label={`Explore ${pkg.name}, ${pkg.guests} guests, ${peso(pkg.price)} setup`}
                sx={{
                  display: 'flex',
                  alignItems: 'stretch',
                  justifyContent: 'flex-start',
                  border: `1px solid ${tokens.cardLightBorder}`,
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  textAlign: 'left',
                  minWidth: 0,
                  '&:hover': { borderColor: tokens.gold },
                  '&.Mui-focusVisible': { outline: `2px solid ${tokens.goldDark}`, outlineOffset: 3 }
                }}
              >
                <MoodPanel
                  pkg={pkg}
                  height="auto"
                  sx={{ width: { xs: 100, sm: 65, lg: 110 }, minHeight: 100, flexShrink: 0 }}
                />
                <Box sx={{ p: 1.5, minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>{pkg.name}</Typography>
                  <Typography sx={{ mt: 0.5, fontSize: 12, color: tokens.textSecondary }}>
                    {pkg.guests} guests
                  </Typography>
                  <Typography sx={{ mt: 0.75, fontSize: 13, fontWeight: 700 }}>{peso(pkg.price)}</Typography>
                </Box>
                <NorthEastRoundedIcon
                  sx={{
                    fontSize: 16,
                    color: tokens.textMuted,
                    alignSelf: 'flex-start',
                    mt: 1.5,
                    mr: 1.25,
                    flexShrink: 0
                  }}
                />
              </ButtonBase>
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>
            Have something in mind? Start a reservation or chat with our team to explore your options.
          </Typography>
        )}
      </DashCard>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          flexWrap: 'wrap',
          pr: { xs: 7, md: 8 }
        }}
      >
        <Typography sx={{ fontSize: 13, color: tokens.textOnDarkSoft }}>
          Still working out the details? We’re here to help.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            component={RouterLink}
            to="/portal/calendar"
            startIcon={<CalendarMonthOutlinedIcon />}
            sx={{ minHeight: 44, color: tokens.textLight }}
          >
            Check available dates
          </Button>
          <Button
            component={RouterLink}
            to="/portal/messages"
            startIcon={<ChatBubbleOutlineRoundedIcon />}
            sx={{ minHeight: 44, color: tokens.textLight }}
          >
            Chat with our team
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { attachBookingJourneyScroll } from '../lib/bookingJourneyMotion.js';
import { site, siteContainerSx } from '../theme/siteTheme.js';

const steps = [
  ['Discover your setup', 'Explore the packages, compare inclusions and check your preferred date.'],
  ['Make it yours', 'Share your guest count, menu, venue and styling preferences in your request.'],
  ['Review & secure', 'Accept your quotation and pay the required downpayment to secure your date.'],
  ['Enjoy your celebration', 'Follow your booking, settle your balance and keep in touch with our team.']
];

export default function BookingJourney() {
  const sectionRef = useRef(null);
  const viewportRef = useRef(null);
  const journeyRef = useRef(null);

  useEffect(
    () =>
      attachBookingJourneyScroll({
        section: sectionRef.current,
        viewport: viewportRef.current,
        header: document.querySelector('.MuiAppBar-root'),
        track: journeyRef.current,
        win: window,
        doc: document
      }),
    []
  );

  return (
    <Box
      ref={sectionRef}
      component="section"
      id="booking-journey"
      aria-labelledby="booking-journey-heading"
      sx={{
        position: 'relative',
        backgroundColor: site.espresso,
        backgroundImage: site.gradientCta,
        color: site.onEspresso,
        scrollMarginTop: { xs: '88px', lg: '100px' },
        '&[data-journey-pinned="true"]': {
          height: 'calc(var(--journey-viewport-height) + var(--journey-scroll-distance))',
          '& [data-journey-viewport]': {
            position: 'sticky',
            top: 'var(--journey-top)',
            minHeight: 'var(--journey-viewport-height)',
            display: 'flex',
            alignItems: 'center'
          }
        },
        '@media (prefers-reduced-motion: reduce)': {
          height: 'auto !important',
          '& [data-journey-viewport]': { position: 'relative !important', minHeight: '0 !important' }
        }
      }}
    >
      <Box ref={viewportRef} data-journey-viewport sx={{ py: { xs: 8, md: 'clamp(40px, 7svh, 80px)' } }}>
        <Container maxWidth={false} sx={siteContainerSx}>
          <Box sx={{ maxWidth: 1440, mx: 'auto' }}>
            <Box sx={{ textAlign: { xs: 'left', md: 'center' } }}>
              <Typography sx={{ color: site.goldLight, fontSize: 12, fontWeight: 600, letterSpacing: '0.12em' }}>
                HOW TO BOOK
              </Typography>
              <Typography
                id="booking-journey-heading"
                component="h2"
                sx={{
                  mt: 2,
                  fontFamily: site.fontSerif,
                  fontSize: { xs: 30, sm: 36, md: 42 },
                  fontWeight: 600,
                  lineHeight: 1.2,
                  textWrap: 'balance'
                }}
              >
                A little planning.
                <br />A beautiful celebration.
              </Typography>
              <Typography sx={{ mt: 2, fontSize: 13, color: site.onEspressoSoft }}>
                From your first idea to the final toast
              </Typography>
            </Box>

            <Box
              ref={journeyRef}
              data-booking-journey
              sx={{
                '--journey-length': '0px',
                '--journey-progress': 1,
                position: 'relative',
                mt: { xs: 4, md: 5 }
              }}
            >
              <Box
                data-journey-track
                aria-hidden="true"
                role="presentation"
                sx={{
                  position: 'absolute',
                  top: { xs: 32, md: 29 },
                  left: { xs: 29, md: 32 },
                  width: { xs: 6, md: 'var(--journey-length)' },
                  height: { xs: 'var(--journey-length)', md: 6 },
                  backgroundColor: 'rgba(197, 160, 89, 0.25)',
                  borderRadius: 999,
                  pointerEvents: 'none'
                }}
              >
                <Box
                  data-journey-fill
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 'inherit',
                    background: `linear-gradient(135deg, ${site.goldText}, ${site.goldLight})`,
                    transform: { xs: 'scaleY(var(--journey-progress))', md: 'scaleX(var(--journey-progress))' },
                    transformOrigin: { xs: 'top', md: 'left' },
                    '@media (prefers-reduced-motion: reduce)': { transform: 'none' }
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: site.goldLight,
                    boxShadow: '0 0 0 4px rgba(197, 160, 89, 0.12), 0 0 14px rgba(197, 160, 89, 0.4)',
                    transform: {
                      xs: 'translate3d(-3px, calc(var(--journey-length) * var(--journey-progress) - 6px), 0)',
                      md: 'translate3d(calc(var(--journey-length) * var(--journey-progress) - 6px), -3px, 0)'
                    },
                    '@media (prefers-reduced-motion: reduce)': { display: 'none' }
                  }}
                />
              </Box>

              <Box
                component="ol"
                sx={{
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(4, minmax(0, 1fr))' },
                  gap: { xs: 3, lg: 4 },
                  p: 0,
                  m: 0,
                  listStyle: 'none'
                }}
              >
                {steps.map(([title, text], index) => (
                  <Box
                    component="li"
                    key={title}
                    data-journey-step
                    data-state={index === steps.length - 1 ? 'current' : 'complete'}
                    sx={{
                      position: 'relative',
                      display: 'grid',
                      gridTemplateColumns: { xs: '64px minmax(0, 1fr)', md: 'minmax(0, 1fr)' },
                      gridTemplateRows: { md: 'auto 1fr' },
                      columnGap: 2,
                      alignContent: 'start',
                      '&[data-state="complete"] .tm-journey-number, &[data-state="current"] .tm-journey-number': {
                        color: site.espresso,
                        backgroundColor: site.gold,
                        borderColor: site.gold
                      },
                      '&[data-state="current"] .tm-journey-number': {
                        boxShadow: '0 0 0 5px rgba(197, 160, 89, 0.15)'
                      },
                      '&[data-state="current"] .tm-journey-copy': {
                        color: site.ink,
                        backgroundColor: site.ivory,
                        borderColor: site.gold,
                        transform: { xs: 'translate3d(3px, 0, 0)', md: 'translate3d(0, -5px, 0)' }
                      },
                      '&[data-state="current"] .tm-journey-copy p': { color: site.inkSoft },
                      '@media (prefers-reduced-motion: reduce)': {
                        '& .tm-journey-copy': { transition: 'none' },
                        '&[data-state="current"] .tm-journey-copy': { transform: 'none' }
                      }
                    }}
                  >
                    <Typography
                      component="span"
                      className="tm-journey-number"
                      data-journey-marker
                      data-reached="true"
                      aria-hidden="true"
                      sx={{
                        position: 'relative',
                        display: 'grid',
                        placeItems: 'center',
                        width: 64,
                        height: 64,
                        mb: { xs: 0, md: 3 },
                        borderRadius: '50%',
                        border: `2px solid ${site.borderHover}`,
                        backgroundColor: site.espresso,
                        color: site.onEspressoSoft,
                        fontFamily: site.fontSerif,
                        fontSize: 30,
                        transition: 'background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease',
                        '@media (prefers-reduced-motion: reduce)': { transition: 'none' }
                      }}
                    >
                      0{index + 1}
                    </Typography>
                    <Box
                      className="tm-journey-copy"
                      sx={{
                        minWidth: 0,
                        p: { xs: 2, md: 2.5 },
                        borderRadius: 2.5,
                        border: `1px solid ${site.espressoBorder}`,
                        color: site.onEspresso,
                        backgroundColor: site.espressoDeep,
                        transition:
                          'background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease, transform 0.25s ease'
                      }}
                    >
                      <Typography component="h3" sx={{ fontSize: 15, lineHeight: 1.5, fontWeight: 600 }}>
                        {title}
                      </Typography>
                      <Typography sx={{ mt: 1, fontSize: 13, lineHeight: 1.8, color: site.onEspressoSoft }}>
                        {text}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
            <Typography
              sx={{ mt: 4, fontSize: 12, textAlign: { xs: 'left', md: 'center' }, color: site.onEspressoSoft }}
            >
              Thoughtful details. Every step of the way.
            </Typography>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

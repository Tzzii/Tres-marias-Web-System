import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import LocalPhoneOutlinedIcon from '@mui/icons-material/LocalPhoneOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { BUSINESS, BrandMark, tokens } from '@tm/shared';
import { site } from '../theme/siteTheme.js';

// Shared styles for the column headings, the page links and the contact rows
const headingSx = { fontSize: 11.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: site.gold, mb: 2 };
// On touch screens the links get 6px more above and below (a finger-sized target) and the list gap
// drops to 0, so the space between two links stays about the same (12px instead of 10px)
const linkSx = { display: 'flex', alignItems: 'center', gap: 1, fontSize: 13.5, color: site.onEspressoSoft, textDecoration: 'none', '&:hover': { color: site.goldLight }, '@media (pointer: coarse)': { py: 0.75 } };
const linkListSx = { display: 'flex', flexDirection: 'column', gap: 1.25, '@media (pointer: coarse)': { gap: 0 } };
// Contact details are plain text, not tel:/mailto: links, so clicking them never asks to open another app
const contactSx = { display: 'flex', alignItems: 'center', gap: 1, fontSize: 13.5, color: site.onEspressoSoft };

/** Public footer on warm espresso (one of the few dark areas of the light website), also the #contact anchor. */
export default function SiteFooter({ bottomSpace = false }) {
  const navigate = useNavigate();
  // Current year for the copyright line
  const year = new Date().getFullYear();

  return (
    // bottomSpace adds extra padding on phones so the fixed Log in / Sign up bar doesn't cover the footer
    <Box component="footer" id="contact" sx={{ backgroundColor: site.espresso, borderTop: `3px solid ${site.gold}`, pt: 8, pb: { xs: bottomSpace ? 12 : 4, md: 4 }, scrollMarginTop: '90px' }}>
      <Container maxWidth={false} sx={{ maxWidth: tokens.containerMax }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1.4fr 1fr 1fr 1fr' }, gap: 5 }}>
          <Box>
            <BrandMark />
            <Typography sx={{ mt: 2, maxWidth: 320, fontSize: 13.5, lineHeight: 1.7, color: site.onEspressoSoft }}>
              Heritage Filipino cooking, elegant table styling and a service team that treats your guests like their own.
            </Typography>
          </Box>

          <Box>
            <Typography sx={headingSx}>Visit or call</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              <Box sx={{ ...contactSx, alignItems: 'flex-start' }}>
                <PlaceOutlinedIcon sx={{ fontSize: 17, mt: '2px' }} />
                {BUSINESS.address}
              </Box>
              <Box sx={contactSx}>
                <LocalPhoneOutlinedIcon sx={{ fontSize: 17 }} />
                {BUSINESS.phone}
              </Box>
              <Box sx={{ ...contactSx, wordBreak: 'break-all' }}>
                <EmailOutlinedIcon sx={{ fontSize: 17 }} />
                {BUSINESS.email}
              </Box>
              <Box sx={contactSx}>
                <AccessTimeRoundedIcon sx={{ fontSize: 17 }} />
                {BUSINESS.hours}
              </Box>
            </Box>
          </Box>

          <Box>
            <Typography sx={headingSx}>Packages</Typography>
            <Box sx={linkListSx}>
              {/* [URL slug, display name] for each package page link */}
              {[
                ['mini-package', 'Mini Package'],
                ['package-1', 'Package 1'],
                ['package-2', 'Package 2'],
                ['package-3', 'Package 3'],
                ['wedding-package-1', 'Wedding Package 1']
              ].map(([slug, name]) => (
                <Link key={slug} component="button" type="button" onClick={() => navigate(`/packages/${slug}`)} sx={{ ...linkSx, textAlign: 'left' }}>
                  {name}
                </Link>
              ))}
            </Box>
          </Box>

          <Box>
            <Typography sx={headingSx}>Your account</Typography>
            <Box sx={linkListSx}>
              <Link component="button" type="button" onClick={() => navigate('/login')} sx={{ ...linkSx, textAlign: 'left' }}>
                Log in
              </Link>
              <Link component="button" type="button" onClick={() => navigate('/signup')} sx={{ ...linkSx, textAlign: 'left' }}>
                Create an account
              </Link>
              <Link component="button" type="button" onClick={() => navigate('/portal/reservations')} sx={{ ...linkSx, textAlign: 'left' }}>
                Track a reservation
              </Link>
            </Box>
          </Box>
        </Box>

        <Box sx={{ mt: 6, pt: 3, borderTop: `1px solid ${site.espressoBorder}`, display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 12.5, color: site.onEspressoMuted }}>
            © {year} {BUSINESS.name}. All rights reserved.
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: site.onEspressoMuted }}>Serving {BUSINESS.serviceArea}</Typography>
        </Box>
      </Container>
    </Box>
  );
}

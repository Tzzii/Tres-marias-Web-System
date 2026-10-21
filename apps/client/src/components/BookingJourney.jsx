import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { site } from '../theme/siteTheme.js';

const steps = [
  ['Discover your setup', 'Explore the packages, compare inclusions and check your preferred date.'],
  ['Make it yours', 'Share your guest count, menu, venue and styling preferences in your request.'],
  ['Review & secure', 'Accept your quotation and pay the required downpayment to secure your date.'],
  ['Enjoy your celebration', 'Follow your booking, settle your balance and keep in touch with our team.']
];
export default function BookingJourney() {
  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', py: { xs: 5, md: 7 }, borderTop: `1px solid ${site.border}` }}>
      <Typography sx={{ color: site.goldText, fontSize: 12, fontWeight: 600 }}>
        From your first idea to the final toast
      </Typography>
      <Typography component="h2" sx={{ fontFamily: site.fontSerif, fontSize: { xs: 28, md: 36 }, mt: 1, mb: 4 }}>
        A little planning. A beautiful celebration.
      </Typography>
      <Box
        component="ol"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          gap: 4,
          p: 0,
          m: 0,
          listStyle: 'none'
        }}
      >
        {steps.map(([title, text], i) => (
          <Box component="li" key={title}>
            <Typography
              aria-hidden="true"
              sx={{ fontFamily: site.fontSerif, color: site.goldText, fontSize: 36, mb: 1 }}
            >
              0{i + 1}
            </Typography>
            <Typography component="h3" sx={{ fontSize: 15, fontWeight: 600 }}>
              {title}
            </Typography>
            <Typography sx={{ mt: 1, fontSize: 13, lineHeight: 1.8, color: site.inkSoft }}>{text}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

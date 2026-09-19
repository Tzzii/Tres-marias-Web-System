import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import { formatDateLong } from '@tm/shared';
import { site } from '../theme/siteTheme.js';

/**
 * The account wall that fires on "Reserve this date" (1c). A centred modal on
 * desktop, a bottom sheet on phones (1n) so the package stays visible behind it.
 */
export default function AuthGate({ open, onClose, intent, packageName }) {
  const navigate = useNavigate();
  const isPhone = useMediaQuery('(max-width:599px)');

  // The content is the same for the modal and the bottom sheet, so build it once
  const body = (
    <Box sx={{ p: { xs: 3, sm: 3.5 }, color: site.ink }}>
      {/* Small grab handle at the top of the bottom sheet (phones only) */}
      {isPhone && <Box sx={{ width: 40, height: 4, borderRadius: 999, backgroundColor: site.border, mx: 'auto', mt: -1, mb: 2 }} />}
      <Box sx={{ width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center', backgroundColor: site.goldTint, color: site.goldText, mb: 2 }}>
        <LockOpenOutlinedIcon />
      </Box>
      <Typography id="gate-title" component="h2" sx={{ fontFamily: site.fontSerif, fontSize: 24, fontWeight: 600 }}>
        Create an account to reserve
      </Typography>
      <Typography sx={{ mt: 1, fontSize: 13.5, lineHeight: 1.6, color: site.inkSoft }}>
        Creating an account is free and takes about a minute. The package and date you picked are already saved.
      </Typography>

      <Box sx={{ mt: 2.5, p: 2, borderRadius: 1.5, backgroundColor: site.ivory, border: `1px solid ${site.border}` }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: site.inkMuted, mb: 1 }}>Saved details</Typography>
        {/* Show what the visitor already picked, as [label, value] rows */}
        {[
          ['Package', packageName],
          ['Date', intent?.date ? formatDateLong(intent.date) : 'Choose on the next step'],
          ['Guests', intent?.guests ? `${intent.guests} guests` : 'Choose on the next step']
        ].map(([label, value]) => (
          <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
            <Typography sx={{ fontSize: 13, color: site.inkSoft }}>{label}</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{value}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {/* Both options send the customer to the booking form once they're signed in */}
        <Button variant="contained" size="large" onClick={() => navigate('/signup?continue=booking')} sx={{ borderRadius: 999 }}>
          Create an account
        </Button>
        <Button variant="outlined" size="large" onClick={() => navigate('/login?next=/portal/book')} sx={{ borderRadius: 999, borderColor: site.border }}>
          I already have an account — Log in
        </Button>
        <Button onClick={onClose} sx={{ color: site.inkSoft }}>
          Back to browsing
        </Button>
      </Box>
    </Box>
  );

  // No LightSurface wrapper: the public pages already use the light website theme (see PublicSite in App.jsx)
  return (
    <>
      {isPhone ? (
        <Drawer anchor="bottom" open={open} onClose={onClose} PaperProps={{ sx: { borderTopLeftRadius: 20, borderTopRightRadius: 20, pt: 2 }, 'aria-labelledby': 'gate-title' }}>
          {body}
        </Drawer>
      ) : (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="gate-title">
          {body}
        </Dialog>
      )}
    </>
  );
}

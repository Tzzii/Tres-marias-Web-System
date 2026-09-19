import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { tokens } from '../theme/tokens.js';

export const LOGO_SRC = '/images/logo.jpg';

/** The white circular logo medallion (auth screens, splash). */
export function BrandLogo({ size = 165, sx }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        maxWidth: '70vmin',
        maxHeight: '70vmin',
        borderRadius: '50%',
        backgroundColor: '#fff',
        border: '3px solid rgba(255, 255, 255, 0.95)',
        outline: '2px solid rgba(212, 175, 55, 0.5)',
        outlineOffset: '4px',
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: tokens.shadowMedallion,
        ...sx
      }}
    >
      <Box component="img" src={LOGO_SRC} alt="Tres Marias Catering Services" width={500} height={500} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
    </Box>
  );
}

/** Logo avatar with the wordmark and a subtitle ("Catering Services", "Admin"). */
export function BrandMark({ subtitle = 'Catering Services', size = 42, hideTextOnXs = false, onClick, light = true }) {
  return (
    // Rendered as a real <button> when clickable (keyboard accessible), otherwise a plain <div>
    <Box
      component={onClick ? 'button' : 'div'}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={onClick ? 'Tres Marias home' : undefined}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1.5, p: 0, border: 0, background: 'none', cursor: onClick ? 'pointer' : 'default', textAlign: 'left', flexShrink: 0 }}
    >
      <Avatar src={LOGO_SRC} alt="" sx={{ width: size, height: size, border: `2px solid ${tokens.gold}` }} />
      <Box sx={{ display: hideTextOnXs ? { xs: 'none', sm: 'flex' } : 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <Typography sx={{ fontSize: 15.5, fontWeight: 700, color: light ? tokens.textLight : tokens.textPrimary }}>Tres Marias</Typography>
        <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: light ? tokens.gold : tokens.goldDark }}>
          {subtitle}
        </Typography>
      </Box>
    </Box>
  );
}

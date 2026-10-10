import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { tokens } from '../theme/tokens.js';
import { passwordChecks, passwordStrength } from '../utils/validation.js';

/**
 * What a new password still needs, shown live under its field: a strength bar (Weak, Fair, Good, Strong)
 * and the five checks of the password rule (passwordChecks in utils/validation.js), each ticked green once
 * met. Used under every new-password field: sign-up, reset and change (customer), Change Password (admin).
 * `value` is the password as typed; `id` lets the field point at the list (aria-describedby).
 */
export function PasswordChecklist({ id, value = '', sx }) {
  const checks = passwordChecks(value);
  const strength = passwordStrength(value);
  const color = ['', tokens.red, '#d97706', '#65a30d', tokens.green][strength.score];

  return (
    <Box id={id} sx={{ mt: 1, ...sx }}>
      {/* Strength bar: four segments filled by score */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} aria-live="polite">
        <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5 }}>
          {[1, 2, 3, 4].map((i) => (
            <Box key={i} sx={{ height: 5, borderRadius: 999, backgroundColor: strength.score >= i ? color : tokens.cardLightBorder, transition: 'background-color 0.2s ease' }} />
          ))}
        </Box>
        <Typography sx={{ width: 48, textAlign: 'right', fontSize: 12, fontWeight: 700, color: color || tokens.textMuted }}>{strength.label}</Typography>
      </Box>
      {/* Every check is required */}
      <Box component="ul" aria-label="Password needs" sx={{ m: 0, mt: 1, p: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.5 }}>
        {checks.map((c) => (
          <Box component="li" key={c.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12, color: c.met ? tokens.green : tokens.textMuted }}>
            {c.met ? <CheckRoundedIcon sx={{ fontSize: 15 }} /> : <CloseRoundedIcon sx={{ fontSize: 15 }} />}
            {c.label}
            <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{c.met ? ' (done)' : ' (missing)'}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

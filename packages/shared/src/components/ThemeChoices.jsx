import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { darkPalette, lightPalette } from '../theme/palettes.js';
import { tokens } from '../theme/tokens.js';
import { useColorMode } from '../theme/colorMode.jsx';

/** Small previews make the two visual directions clear before changing the portal. */
export function ThemeChoices() {
  const { mode, setMode } = useColorMode();
  return (
    <Box
      role="group"
      aria-label="Portal color theme"
      sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5, mb: 3 }}
    >
      {[
        { key: 'light', title: 'Light mode', description: 'Warm ivory & gold', palette: lightPalette },
        { key: 'dark', title: 'Dark mode', description: 'Midnight & champagne', palette: darkPalette }
      ].map(({ key, title, description, palette: p }) => (
        <ButtonBase
          key={key}
          aria-label={`Choose ${key} theme`}
          aria-pressed={mode === key}
          onClick={(event) => {
            if (mode === key) return;
            const box = event.currentTarget.getBoundingClientRect();
            setMode(key, { x: box.left + box.width / 2, y: box.top + box.height / 2 });
          }}
          sx={{
            display: 'block',
            textAlign: 'left',
            p: 1.25,
            borderRadius: '14px',
            border: `1px solid ${mode === key ? tokens.gold : tokens.cardLightBorder}`,
            backgroundColor: mode === key ? tokens.goldWash : 'transparent',
            minWidth: 0,
            '&:hover': { borderColor: tokens.gold }
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              height: { xs: 94, sm: 124 },
              borderRadius: '8px',
              overflow: 'hidden',
              bgcolor: p.bgBase,
              border: `1px solid ${p.cardLightBorder}`
            }}
          >
            <Box sx={{ height: 15, backgroundColor: p.headerBg, borderBottom: `1px solid ${p.divider}` }} />
            <Box sx={{ display: 'flex', height: 'calc(100% - 15px)' }}>
              <Box
                sx={{ width: '23%', bgcolor: p.sidebarBg, p: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}
              >
                {[0, 1, 2, 3].map((row) => (
                  <Box
                    key={row}
                    sx={{ height: 5, borderRadius: '2px', bgcolor: row === 0 ? p.sidebarActiveBg : p.sidebarHover }}
                  />
                ))}
              </Box>
              <Box sx={{ flex: 1, p: 1, minWidth: 0 }}>
                <Box sx={{ width: '52%', height: 4, mb: 1, borderRadius: 2, bgcolor: p.textSecondary, opacity: 0.8 }} />
                <Box
                  sx={{
                    height: '43%',
                    borderRadius: '4px',
                    bgcolor: p.cardLight,
                    border: `1px solid ${p.cardLightBorder}`,
                    p: 0.75
                  }}
                >
                  <Box sx={{ width: '36%', height: 4, borderRadius: 2, bgcolor: p.gold, opacity: 0.9 }} />
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, height: '26%', mt: 0.75 }}>
                  <Box sx={{ bgcolor: p.cardLight, borderRadius: '3px', border: `1px solid ${p.cardLightBorder}` }} />
                  <Box sx={{ bgcolor: p.cardLight, borderRadius: '3px', border: `1px solid ${p.cardLightBorder}` }} />
                </Box>
              </Box>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', justifyContent: 'space-between', mt: 1.25 }}>
            <Typography component="span" sx={{ fontSize: 13, fontWeight: 600, color: tokens.textPrimary }}>
              {title}
            </Typography>
            {mode === key && <CheckCircleRoundedIcon sx={{ fontSize: 16, color: tokens.goldText }} />}
          </Box>
          <Typography
            component="span"
            sx={{ display: 'block', mt: 0.5, fontSize: 11, color: tokens.textSecondary, lineHeight: 1.6 }}
          >
            {description}
          </Typography>
        </ButtonBase>
      ))}
    </Box>
  );
}

import { Box, ButtonBase, IconButton, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import AssistantMascot from './AssistantMascot.jsx';
import { site } from '../../theme/siteTheme.js';

export default function AssistantHeroInvite({ onClick, signedIn, paused, onToggleMotion }) {
  return (
    <Box
      sx={{
        position: 'relative',
        mt: 2.5,
        width: '100%',
        maxWidth: 440,
        mx: { xs: 'auto', md: 0 },
        order: { xs: 1, md: 2 },
        '@media (max-width:359px)': { order: 0 }
      }}
    >
      <ButtonBase
        data-assistant-hero
        onClick={onClick}
        aria-label="Ask the AI assistant about your event"
        sx={{
          p: 1.25,
          pr: 5,
          width: '100%',
          display: 'flex',
          gap: 1.5,
          textAlign: 'left',
          justifyContent: 'flex-start',
          borderRadius: '20px',
          border: '1px solid #dbc79f',
          background: 'linear-gradient(115deg, rgba(255,253,248,.97), rgba(246,234,211,.87))',
          boxShadow: '0 8px 25px -20px rgba(88,61,29,.45)',
          transition: 'box-shadow .2s, border-color .2s',
          '&:hover': { borderColor: site.goldText, boxShadow: '0 12px 28px -16px rgba(88,61,29,.35)' },
          '&.Mui-focusVisible': { outline: `3px solid ${site.goldText}`, outlineOffset: 3 }
        }}
      >
        <Box sx={{ width: 57, height: 62, flexShrink: 0 }}>
          <AssistantMascot portrait />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="span"
            sx={{
              display: 'block',
              color: site.goldText,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.08em',
              textTransform: 'uppercase'
            }}
          >
            Your AI planning assistant
          </Typography>
          <Typography
            component="span"
            sx={{ display: 'block', color: site.ink, fontSize: { xs: 13, sm: 14 }, fontWeight: 600, mt: 0.3 }}
          >
            Need a hand with your celebration?
          </Typography>
          <Typography component="span" sx={{ display: 'block', color: site.inkSoft, fontSize: 11, mt: 0.4 }}>
            {signedIn ? 'Ask about packages, prices and dates' : 'Try 2 free questions · Type or talk'}
          </Typography>
        </Box>
        <ArrowForwardRoundedIcon
          sx={{ position: 'absolute', right: 14, bottom: 16, color: site.goldText, fontSize: 20 }}
        />
      </ButtonBase>
      <IconButton
        aria-label={paused ? 'Resume assistant animation' : 'Pause assistant animation'}
        title={paused ? 'Resume animation' : 'Pause animation'}
        onClick={onToggleMotion}
        sx={{ position: 'absolute', right: 7, top: 7, width: 32, height: 32, color: site.goldText }}
      >
        {paused ? <PlayArrowRoundedIcon sx={{ fontSize: 16 }} /> : <PauseRoundedIcon sx={{ fontSize: 16 }} />}
      </IconButton>
    </Box>
  );
}

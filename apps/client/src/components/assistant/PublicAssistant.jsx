import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, ButtonBase, CircularProgress, Dialog, Portal, Typography, useMediaQuery } from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { ASSISTANT_PATH } from '@tm/shared/domain/assistant.js';
import { useAuth } from '../../auth.js';
import { site } from '../../theme/siteTheme.js';
import AssistantMascot from './AssistantMascot.jsx';
import { LANDING_GUIDE } from '../../lib/landingGuide.js';

const AssistantPanel = lazy(() => import('./AssistantPanel.jsx'));

export default function PublicAssistant({ section = 'welcome' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const mobile = useMediaQuery('(max-width:599px)');
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const guide = LANDING_GUIDE[section] || LANDING_GUIDE.welcome;
  const launch = useCallback(
    (text = '') => {
      if (user) {
        navigate(`${ASSISTANT_PATH}${text ? `?question=${encodeURIComponent(text)}` : ''}`);
        return;
      }
      setQuestion(text);
      setOpen(true);
    },
    [user?.id, navigate]
  );
  useEffect(() => {
    const update = () =>
      document.documentElement.style.setProperty(
        '--tm-assistant-play-state',
        document.visibilityState === 'hidden' ? 'paused' : 'running'
      );
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      document.documentElement.style.removeProperty('--tm-assistant-play-state');
    };
  }, []);
  return (
    <>
      <Portal>
        <Box
          data-assistant-character
          sx={{
            position: 'fixed',
            right: { xs: 10, sm: 22 },
            bottom: { xs: user ? 18 : 'calc(80px + env(safe-area-inset-bottom))', sm: 18 },
            width: { xs: 'min(330px, calc(100vw - 20px))', sm: 330 },
            height: { xs: 146, sm: 214 },
            zIndex: 1100,
            pointerEvents: 'none',
            display: open ? 'none' : 'block'
          }}
        >
          <Box
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-assistant-guide={section}
            sx={{
              position: 'absolute',
              left: 0,
              top: { xs: 0, sm: 30 },
              width: { xs: 'calc(100% - 104px)', sm: 192 },
              display: { xs: section === 'welcome' ? 'none' : 'block', sm: 'block' },
              p: { xs: 1.25, sm: 1.75 },
              bgcolor: '#fffdf8',
              border: '1px solid #d9c298',
              borderRadius: '19px 19px 5px 19px',
              boxShadow: '0 12px 35px -15px rgba(67,43,20,.3)',
              '&::after': {
                content: '""',
                position: 'absolute',
                width: 11,
                height: 11,
                right: -6,
                bottom: 19,
                bgcolor: '#fffdf8',
                transform: 'rotate(-45deg)',
                borderRight: '1px solid #d9c298',
                borderBottom: '1px solid #d9c298'
              }
            }}
          >
            <Typography
              sx={{
                color: site.goldText,
                fontSize: { xs: 8, sm: 10 },
                fontWeight: 700,
                letterSpacing: '.09em',
                mb: 0.5
              }}
            >
              YOUR AI ASSISTANT
            </Typography>
            <Typography sx={{ color: site.ink, fontSize: { xs: 12, sm: 14 }, fontWeight: 600, lineHeight: 1.5 }}>
              {guide.title}
            </Typography>
            <Typography sx={{ color: site.inkSoft, fontSize: { xs: 10.5, sm: 11 }, lineHeight: 1.7, mt: 0.5 }}>
              {guide.detail}
            </Typography>
          </Box>
          <ButtonBase
            className="tm-assistant-launcher"
            aria-label="Open AI assistant"
            onClick={() => launch()}
            sx={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: { xs: 96, sm: 140 },
              height: { xs: 128, sm: 204 },
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              borderRadius: 4,
              pointerEvents: 'auto',
              '&:hover .tm-assistant-launcher__label': { bgcolor: site.goldText }
            }}
          >
            <Box
              sx={{
                width: { xs: 76, sm: 144 },
                height: { xs: 91, sm: 173 },
                position: 'relative',
                flexShrink: 0
              }}
            >
              <AssistantMascot />
            </Box>
            <Box
              className="tm-assistant-launcher__label"
              sx={{
                display: 'flex',
                gap: 0.75,
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: site.espresso,
                color: site.onEspresso,
                borderRadius: 999,
                width: '100%',
                py: 1,
                boxShadow: '0 6px 20px -6px rgba(45,30,18,.4)',
                transition: 'background-color .2s'
              }}
            >
              <AutoAwesomeOutlinedIcon sx={{ fontSize: { xs: 13, sm: 15 } }} />
              <Typography component="span" sx={{ fontSize: { xs: 10.5, sm: 12 }, fontWeight: 600 }}>
                AI Assistant
              </Typography>
            </Box>
          </ButtonBase>
        </Box>
      </Portal>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullScreen={mobile}
        transitionDuration={0}
        maxWidth={false}
        fullWidth
        aria-labelledby="assistant-panel-title"
        sx={{
          '& .MuiDialog-container': {
            justifyContent: { xs: 'center', sm: 'flex-end' },
            alignItems: { xs: 'center', sm: 'flex-end' }
          }
        }}
        slotProps={{
          backdrop: { sx: { bgcolor: 'rgba(35,28,21,.36)' } },
          paper: {
            sx: {
              height: mobile ? '100dvh' : 'min(820px, calc(100dvh - 48px))',
              width: mobile ? '100%' : 520,
              maxWidth: '100%',
              m: mobile ? 0 : 3,
              borderRadius: mobile ? 0 : '24px',
              overflow: 'hidden',
              boxShadow: '0 24px 80px -20px rgba(41,29,18,.35)'
            }
          }
        }}
      >
        {open && (
          <Suspense
            fallback={
              <Box role="status" sx={{ p: 4 }}>
                <CircularProgress size={22} /> Loading assistant…
              </Box>
            }
          >
            <AssistantPanel key={user?.id || 'guest'} initialQuestion={question} onClose={() => setOpen(false)} />
          </Suspense>
        )}
      </Dialog>
    </>
  );
}

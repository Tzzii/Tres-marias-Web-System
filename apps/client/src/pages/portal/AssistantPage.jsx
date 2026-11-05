import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useLayoutEffect, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import { tokens, useDocumentTitle } from '@tm/shared';
import AssistantPanel from '../../components/assistant/AssistantPanel.jsx';
import PackagePlanningSummary from '../../components/assistant/PackagePlanningSummary.jsx';
import { useAuth } from '../../auth.js';
import { buildCelebrationSummary } from '../../lib/assistantSummary.js';

export default function AssistantPage() {
  useDocumentTitle('AI Assistant');
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [conversation, setConversation] = useState(null);
  const panelRef = useRef(null);
  const [panelHeight, setPanelHeight] = useState(null);

  const summary = buildCelebrationSummary(conversation);
  const planning =
    params.get('mode') === 'package' ||
    conversation?.bookingDraft?.planningMode === 'custom' ||
    summary.completedCount > 0;

  useLayoutEffect(() => {
    const updateHeight = () => {
      const el = panelRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const bottomNav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tm-bottom-nav')) || 0;
      const bottomGap = bottomNav > 0 ? bottomNav + 12 : 16;
      const available = Math.floor(window.innerHeight - rect.top - bottomGap);
      setPanelHeight(Math.max(380, Math.min(920, available)));
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [planning]);

  return (
    <Box sx={{ maxWidth: 1640, mx: 'auto', width: '100%' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1}
        sx={{ mb: { xs: 1.25, md: 1.75 } }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: 21, md: 25 },
              fontWeight: 600,
              letterSpacing: '-0.03em',
              color: tokens.textLight,
              lineHeight: 1.2
            }}
          >
            AI Assistant
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: { xs: 12.5, md: 13.5 }, color: tokens.textOnDarkSoft }}>
            Plan your celebration with guided package recommendations, live estimates, and custom setup options.
          </Typography>
        </Box>
        <Button
          component={RouterLink}
          to="/portal/messages"
          size="small"
          variant="outlined"
          startIcon={<ChatBubbleOutlineRoundedIcon sx={{ fontSize: 16 }} />}
          sx={{
            flexShrink: 0,
            borderRadius: 999,
            px: 1.75,
            py: 0.6,
            borderColor: 'divider',
            bgcolor: 'background.paper'
          }}
        >
          Prefer a person? Message admin
        </Button>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 340px', xl: 'minmax(0, 1fr) 370px' },
          gap: { xs: 1.5, md: 2.25 },
          alignItems: 'start'
        }}
      >
        {planning && (
          <Paper variant="outlined" component="details" sx={{ display: { xs: 'block', lg: 'none' }, borderRadius: 3 }}>
            <Box
              component="summary"
              sx={{
                px: 2,
                py: 1.25,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span>Your saved event summary</span>
              <Typography component="span" variant="caption" sx={{ fontWeight: 700, color: tokens.goldText }}>
                {summary.completedCount}/{summary.totalCount} saved
              </Typography>
            </Box>
            <PackagePlanningSummary conversation={conversation} />
          </Paper>
        )}

        <Paper
          ref={panelRef}
          variant="outlined"
          sx={{
            width: '100%',
            minWidth: 0,
            mx: 'auto',
            borderRadius: 3.5,
            overflow: 'hidden',
            boxShadow: tokens.shadowDash,
            height: panelHeight ? `${panelHeight}px` : { xs: 'calc(100dvh - 190px)', md: 'calc(100dvh - 160px)' },
            minHeight: { xs: 420, md: 480 }
          }}
        >
          <AssistantPanel
            key={`${user.id}:${params.get('mode') || ''}:${params.get('proposal') || ''}`}
            fullPage
            initialQuestion={(params.get('question') || '').slice(0, 2000)}
            packagePlanning={params.get('mode') === 'package'}
            proposalId={params.get('proposal') || ''}
            onConversationChange={setConversation}
          />
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            display: { xs: 'none', lg: 'block' },
            borderRadius: 3.5,
            boxShadow: tokens.shadowDash,
            position: 'sticky',
            top: 86,
            maxHeight: panelHeight ? `${panelHeight}px` : 'calc(100dvh - 160px)',
            overflowY: 'auto',
            scrollbarWidth: 'thin'
          }}
        >
          <PackagePlanningSummary conversation={conversation} />
        </Paper>
      </Box>
    </Box>
  );
}

import { Box, Button, Drawer, IconButton, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, Navigate, useSearchParams } from 'react-router-dom';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const summary = buildCelebrationSummary(conversation);

  if (params.get('mode') === 'package' || params.get('proposal')) {
    const proposal = params.get('proposal');
    return (
      <Navigate replace to={`/portal/ai-budgeting${proposal ? `?proposal=${encodeURIComponent(proposal)}` : ''}`} />
    );
  }

  return (
    <Box className="tm-assistant-page">
      <Stack className="tm-assistant-page__heading" direction="row" justifyContent="space-between" spacing={2}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{ fontSize: { xs: 24, md: 28 }, fontWeight: 600, letterSpacing: '-0.04em', color: tokens.textLight }}
          >
            AI Assistant
          </Typography>
          <Typography sx={{ mt: 0.25, fontSize: 14, color: tokens.textOnDarkSoft }}>
            A little inspiration. A clearer plan.
          </Typography>
        </Box>
        <Button
          component={RouterLink}
          to="/portal/messages"
          startIcon={<ChatBubbleOutlineRoundedIcon />}
          className="tm-assistant-page__contact"
        >
          Talk to our team
        </Button>
      </Stack>

      <Box className="tm-assistant-page__workspace">
        <AssistantPanel
          key={user.id}
          fullPage
          initialQuestion={(params.get('question') || '').slice(0, 2000)}
          onConversationChange={setConversation}
          onShowDetails={() => setDetailsOpen(true)}
          savedDetailsCount={summary.completedCount}
          totalDetailsCount={summary.totalCount}
        />
      </Box>

      <Drawer
        anchor="right"
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        PaperProps={{
          role: 'dialog',
          'aria-modal': true,
          'aria-labelledby': 'assistant-event-details-title',
          sx: { width: { xs: '100%', sm: 400 }, maxWidth: '100%', bgcolor: 'background.paper' }
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Typography component="h2" id="assistant-event-details-title" sx={{ fontSize: 18, fontWeight: 600 }}>
            Your event details
          </Typography>
          <IconButton aria-label="Close event details" onClick={() => setDetailsOpen(false)}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
        <PackagePlanningSummary conversation={conversation} />
      </Drawer>
    </Box>
  );
}

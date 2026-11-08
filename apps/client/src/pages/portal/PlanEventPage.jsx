import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { DashCard, PageHeader, useDocumentTitle } from '@tm/shared';

export default function PlanEventPage() {
  useDocumentTitle('Plan an Event');
  const [params] = useSearchParams();
  const date = params.get('date');
  return (
    <Box>
      <PageHeader
        title="Let’s plan your event"
        subtitle="Start with a package you love, or build one around your celebration."
      />
      <Box
        sx={{
          maxWidth: 1000,
          mx: 'auto',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
          gap: 3,
          mt: 3
        }}
      >
        {[
          [
            'I already have a package',
            'Browse our collections or continue your saved reservation. Your existing details stay saved.',
            `/portal/book${date ? `?date=${encodeURIComponent(date)}` : ''}`,
            'Continue to booking'
          ],
          [
            'Help me build a package',
            'Tell the assistant your service, guest count and budget. Review complete options with setup, menu and prices before choosing.',
            '/portal/ai-budgeting',
            'Build my package'
          ]
        ].map(([title, description, to, action]) => (
          <DashCard key={title} sx={{ p: { xs: 2.5, sm: 4 }, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h5" sx={{ mb: 2 }}>
              {title}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 4, lineHeight: 1.8, flex: 1 }}>
              {description}
            </Typography>
            <Button component={RouterLink} to={to} variant="contained" size="large">
              {action}
            </Button>
          </DashCard>
        ))}
      </Box>
      <Stack alignItems="center" sx={{ mt: 3 }}>
        <Typography variant="caption" color="text.secondary">
          Your selection starts a request. Availability and final charges are confirmed by the team.
        </Typography>
      </Stack>
    </Box>
  );
}

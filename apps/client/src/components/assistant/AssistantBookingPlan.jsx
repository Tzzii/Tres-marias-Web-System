import { memo, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';

export default memo(function AssistantBookingPlan({ plan, disabled, onReview, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  if (!plan?.canReview) return null;
  return (
    <Box className="tm-assistant-plan">
      <Stack direction="row" spacing={1} alignItems="center">
        <AssignmentOutlinedIcon sx={{ fontSize: 18, color: '#8a6a2f' }} />
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Your reservation plan</Typography>
      </Stack>
      <Box sx={{ mt: 1 }}>
        {plan.summary.slice(0, expanded ? undefined : 4).map((row) => (
          <Typography key={row.label} sx={{ fontSize: 12, lineHeight: 1.8, overflowWrap: 'anywhere' }}>
            <strong>{row.label}:</strong> {row.value}
          </Typography>
        ))}
      </Box>
      {plan.summary.length > 4 && (
        <Button size="small" onClick={() => setExpanded((v) => !v)} sx={{ fontSize: 11, p: 0, mt: 0.5 }}>
          {expanded ? 'Show less' : 'See all details'}
        </Button>
      )}
      {plan.warnings?.map((warning) => (
        <Typography key={warning} sx={{ fontSize: 11, color: '#8a5b25', mt: 1 }}>
          {warning}
        </Typography>
      ))}
      <Typography sx={{ fontSize: 11, color: '#6c6258', mt: 1 }}>
        {plan.missing.length
          ? `${plan.missing.length} details still need review. You can complete them in the reservation form.`
          : 'Your text details are ready to review. Complete uploads and terms in the reservation form.'}
      </Typography>
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} sx={{ mt: 1.5 }}>
        <Button size="small" variant="contained" disabled={disabled} onClick={onReview}>
          Review reservation
        </Button>
        <Button size="small" disabled={disabled} onClick={onEdit}>
          Change details in chat
        </Button>
      </Stack>
      <Typography sx={{ fontSize: 11, color: '#6c6258', mt: 1 }}>
        Saved with this conversation for up to 24 hours. No slot has been reserved.
      </Typography>
    </Box>
  );
});

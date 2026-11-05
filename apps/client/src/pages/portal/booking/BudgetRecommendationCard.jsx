import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import { peso, tokens } from '@tm/shared';

export default function BudgetRecommendationCard({ candidate, source, target, problem, savings, active, onApply }) {
  const action = candidate.action;
  const suggestion =
    action.type === 'remove'
      ? `Remove ${source?.name || 'this service'}`
      : action.type === 'reduce'
        ? `Reduce ${source?.name || 'quantity'} to ${action.quantity}`
        : `Change to ${target?.name || 'the approved alternative'}`;
  const actionLabel =
    action.type === 'remove' ? 'Remove service' : action.type === 'reduce' ? 'Reduce quantity' : 'Change option';

  return (
    <Box
      sx={{
        p: 2,
        minWidth: 0,
        border: `1px solid ${tokens.cardLightBorder}`,
        borderRadius: 2,
        backgroundColor: tokens.cardLight,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25
      }}
    >
      <Box
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Box
            aria-hidden="true"
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              color: tokens.goldText,
              backgroundColor: tokens.goldSubtle
            }}
          >
            <SwapHorizRoundedIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h3" sx={{ fontWeight: 700, fontSize: 14, color: tokens.textPrimary }}>
              {suggestion}
            </Typography>
            <Typography sx={{ fontSize: 12, color: tokens.textSecondary }}>
              Current choice: {source?.name || 'Service'} · quantity {candidate.preconditions.quantity}
            </Typography>
          </Box>
        </Box>
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1.15,
            py: 0.35,
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            color: savings ? tokens.successText : tokens.goldText,
            backgroundColor: savings ? tokens.successBg : tokens.goldSubtle,
            border: `1px solid ${savings ? tokens.successBorder : tokens.shellBorder}`
          }}
        >
          <SavingsOutlinedIcon sx={{ fontSize: 14 }} />
          {savings === null ? 'Savings to be confirmed' : `Estimated savings: ${peso(savings)}`}
        </Box>
      </Box>

      {candidate.tradeoffs.length > 0 && (
        <Box
          component="ul"
          sx={{
            pl: 2.25,
            my: 0.25,
            py: 1,
            pr: 1.5,
            borderRadius: 1.5,
            backgroundColor: tokens.surfaceSubtle,
            fontSize: 12.5,
            color: tokens.textSecondary
          }}
        >
          {candidate.tradeoffs.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </Box>
      )}

      <Typography sx={{ fontSize: 12.5, color: tokens.textSecondary }}>{candidate.reason}</Typography>
      {problem && <Typography sx={{ fontSize: 12, fontWeight: 600, color: tokens.warningText }}>{problem}</Typography>}
      <Box sx={{ pt: 0.5, display: 'flex', justifyContent: 'flex-end' }}>
        <Button size="small" variant="outlined" disabled={!active || Boolean(problem)} onClick={onApply}>
          {actionLabel}
        </Button>
      </Box>
    </Box>
  );
}

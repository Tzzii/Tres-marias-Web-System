import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DashCard, tokens } from '@tm/shared';

export default function Section({ id, index, title, subtitle, error, children }) {
  return (
    <DashCard
      component="section"
      id={`sec-${id}`}
      aria-labelledby={`sec-${id}-title`}
      sx={{ scrollMarginTop: `${tokens.headerHeight + 64}px`, ...(error && { borderColor: tokens.red }) }}
    >
      <Box sx={{ mb: 2 }}>
        <Typography id={`sec-${id}-title`} component="h2" sx={{ fontSize: 17, fontWeight: 700 }}>
          {index} · {title}
        </Typography>
        {subtitle && <Typography sx={{ mt: 0.25, fontSize: 13, color: tokens.textSecondary }}>{subtitle}</Typography>}
        {error && (
          <Typography role="alert" sx={{ mt: 0.75, fontSize: 12.5, fontWeight: 600, color: tokens.redPress }}>
            {error}
          </Typography>
        )}
      </Box>
      {children}
    </DashCard>
  );
}

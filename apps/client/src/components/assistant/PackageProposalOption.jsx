import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { peso, StylingSummary } from '@tm/shared';

export default function PackageProposalOption({ option, context, index, disabled, onSelect }) {
  const estimate = option.estimate;
  const buffet = context?.serviceType === 'Buffet and Catering';
  return (
    <Box
      component="article"
      sx={{ p: { xs: 2, sm: 2.5 }, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Typography variant="overline">Option {index + 1}</Typography>
        <Chip
          size="small"
          color={estimate.budgetStatus === 'within' ? 'success' : 'warning'}
          label={
            estimate.budgetStatus === 'within'
              ? 'Within budget'
              : estimate.budgetStatus === 'over'
                ? 'Above budget'
                : 'Prices pending'
          }
        />
      </Stack>
      <Typography variant="h6" sx={{ mt: 1 }}>
        {option.packageSnapshot.name}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>
        {option.reason || option.packageSnapshot.description}
      </Typography>
      <Typography sx={{ fontSize: 26, fontWeight: 700 }}>
        {peso(estimate.knownTotal)}
        {estimate.unknownCharges?.length > 0 ? ' · adjustments pending' : ''}
      </Typography>
      <Typography variant="caption">
        {estimate.budgetStatus === 'incomplete'
          ? 'Priced estimate before pending adjustments. The final total is not yet known.'
          : estimate.difference > 0
            ? `${peso(estimate.difference)} above your ${peso(context?.budget)} budget`
            : `${peso(Math.abs(estimate.difference))} below your ${peso(context?.budget)} budget`}
      </Typography>
      <Box component="ul" sx={{ pl: 2.25, fontSize: 13 }}>
        {option.tradeoffs?.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </Box>
      <Box component="details" sx={{ my: 2 }}>
        <Typography component="summary" sx={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          See complete package
        </Typography>
        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          Setup for {context?.guests} guests
        </Typography>
        <Box component="ul" sx={{ pl: 2.25, fontSize: 13 }}>
          {option.packageSnapshot.items.map((item, i) => (
            <li key={`${item.name}-${i}`}>
              {item.qty ? `${item.qty} × ` : ''}
              {item.name}
            </li>
          ))}
        </Box>
        <Typography variant="subtitle2">{buffet ? 'Buffet menu' : 'Catering setup · no food included'}</Typography>
        {buffet && (
          <Box component="ul" sx={{ pl: 2.25, fontSize: 13 }}>
            {Object.entries(option.menu || {})
              .filter(([, dishes]) => Array.isArray(dishes))
              .flatMap(([category, dishes]) => dishes.map((dish) => <li key={`${category}-${dish}`}>{dish}</li>))}
          </Box>
        )}
        {buffet && (
          <Typography variant="body2">Drinks: unlimited water and {option.menu?.juice || 'juice'}.</Typography>
        )}
        {option.menu?.dessert?.name && (
          <Typography variant="body2">
            Dessert: {option.menu.dessert.name}
            {option.menu.dessert.description ? ` · ${option.menu.dessert.description}` : ''}.
          </Typography>
        )}
        {option.styling && <StylingSummary styling={option.styling} compact />}
        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          Additional services
        </Typography>
        <Box component="ul" sx={{ pl: 2.25, fontSize: 13 }}>
          {option.addons?.length ? (
            option.addons.map((addon) => (
              <li key={addon.id}>
                {addon.name} × {addon.qty} · {addon.price == null ? 'To be quoted' : peso(addon.price * addon.qty)}
              </li>
            ))
          ) : (
            <li>No additional services</li>
          )}
        </Box>
        <Typography variant="subtitle2">Estimate breakdown</Typography>
        <Typography variant="body2">
          {buffet ? `Buffet and standard setup · ${context?.guests} guests` : 'Catering setup'}:{' '}
          {peso(
            buffet ? (estimate.quote?.food ?? estimate.baseTotal) : (estimate.quote?.packageTotal ?? estimate.baseTotal)
          )}
        </Typography>
        {estimate.quote?.durationCharge > 0 && (
          <Typography variant="body2">Six-hour event charge: {peso(estimate.quote.durationCharge)}</Typography>
        )}
        {Boolean(estimate.quote?.setupAdjustment) && (
          <Typography variant="body2">Equipment adjustment: {peso(estimate.quote.setupAdjustment)}</Typography>
        )}
        <Typography variant="body2">Known additional services: {peso(estimate.knownAddonsTotal)}</Typography>
        {estimate.unknownCharges?.map((charge) => (
          <Typography variant="body2" key={charge.id}>
            {charge.label}: to be quoted
          </Typography>
        ))}
      </Box>
      <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 2, mb: 2 }}>
        <Typography variant="caption" component="div" fontWeight={600}>
          Pending confirmation
        </Typography>
        {option.pending?.map((line) => (
          <Typography variant="caption" component="p" key={line}>
            {line}
          </Typography>
        ))}
      </Box>
      {onSelect && (
        <Button fullWidth variant="contained" disabled={disabled} onClick={onSelect}>
          Use this package
        </Button>
      )}
    </Box>
  );
}

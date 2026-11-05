import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DashCard, CardTitle, DetailRow } from './DashCard.jsx';
import { peso, formatDateTime } from '../utils/format.js';
import { tokens } from '../theme/tokens.js';
import { budgetDifference } from '../domain/budgetRequest.js';
import { StylingSummary } from './Styling.jsx';

export function BudgetComparison({ reservation, total }) {
  const value = budgetDifference(reservation, total);
  if (!value) return null;
  return (
    <DetailRow label="Compared with requested budget">
      {value.difference > 0
        ? `${peso(value.difference)} above`
        : value.difference < 0
          ? `${peso(-value.difference)} below`
          : 'Matches budget'}
      {` (${peso(value.budget)})`}
    </DetailRow>
  );
}
export function BudgetRequestCard({ reservation }) {
  const b = reservation.budgetRequest;
  if (!b) return null;
  if (b.version === 2 && b.source === 'custom')
    return <CustomPackageRequestCard reservation={reservation} request={b} />;
  return (
    <DashCard id="budget-request-card">
      <CardTitle subtitle={`Submitted ${formatDateTime(b.submittedAt)} · Saved customer request`}>
        Requested Budget and Services
      </CardTitle>
      <Typography sx={{ mb: 1.5, fontSize: 12.5, color: tokens.textSecondary }}>
        This records the original request. The working services and final quotation may differ after review.
      </Typography>
      <DetailRow label="Customer's event budget">{peso(b.budget)}</DetailRow>
      <DetailRow label={b.estimate.budgetStatus === 'incomplete' ? 'Known submitted subtotal' : 'Submitted estimate'}>
        {peso(b.estimate.knownTotal)}
      </DetailRow>
      <Typography sx={{ mt: 0.5, fontSize: 12.5 }}>
        {b.estimate.budgetStatus === 'incomplete'
          ? 'Estimate incomplete · pending service prices'
          : b.estimate.budgetStatus === 'over'
            ? 'Submitted above budget · for quotation review'
            : 'Submitted estimate within budget'}
      </Typography>
      {b.preferences && (
        <Typography sx={{ mt: 1.5, fontSize: 13, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          Priorities: {b.preferences}
        </Typography>
      )}
      <Box component="ul" sx={{ pl: 2.25, my: 1.5, fontSize: 13 }}>
        {b.lines.length ? (
          b.lines.map((a) => (
            <li key={a.id}>
              {a.name} × {a.quantity} · {a.total === null ? 'To be quoted' : peso(a.total)}
              {b.protectedAddonIds.includes(a.id) ? ' · Customer asked to keep' : ''}
            </li>
          ))
        ) : (
          <li>No additional services requested</li>
        )}
      </Box>
      <Box component="details" sx={{ mt: 1.5, fontSize: 13 }}>
        <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 600 }}>
          Original inclusions and budget-review changes
        </Box>
        <Typography sx={{ my: 1, fontSize: 13 }}>
          {b.inclusions.packageName} · {b.context.guests} guests · Four ulam · {peso(b.inclusions.pricePerPlate)} per
          guest
        </Typography>
        <Box component="ul" sx={{ pl: 2.25 }}>
          {b.inclusions.items.map((a, i) => (
            <li key={i}>{a.toConfirm ? `${a.name} (to confirm)` : `${a.qty ? `${a.qty} ` : ''}${a.name}`}</li>
          ))}
        </Box>
        {b.proposal ? (
          <>
            <Typography sx={{ fontSize: 13 }}>
              Before budget review: {peso(b.proposal.originalEstimate.knownTotal)} known subtotal. Changes below include
              any manual edits before submission.
            </Typography>
            <Box component="ul" sx={{ pl: 2.25 }}>
              {b.changes.length ? (
                b.changes.map((c) => (
                  <li key={c.id}>
                    {c.name}: {c.before} → {c.after}
                  </li>
                ))
              ) : (
                <li>No service changes from the linked review</li>
              )}
            </Box>
          </>
        ) : (
          <Typography sx={{ fontSize: 13 }}>
            Submitted without a linked recommendation. The budget and requested services are still saved.
          </Typography>
        )}
      </Box>
      {reservation.quotation && (
        <Box sx={{ mt: 1.5 }}>
          <BudgetComparison reservation={reservation} total={reservation.quotation.net} />
        </Box>
      )}
    </DashCard>
  );
}

function CustomPackageRequestCard({ reservation, request: b }) {
  const candidate = b.candidate || {};
  const context = b.context || {};
  const estimate = b.estimate || {};
  const pkg = candidate.packageSnapshot || reservation.packageSnapshot || {};
  const buffet = context.serviceType === 'Buffet and Catering';
  return (
    <DashCard id="budget-request-card">
      <CardTitle subtitle="Original customer selection · Saved with the request">
        Custom Package and Requested Budget
      </CardTitle>
      <Typography sx={{ mb: 1.5, fontSize: 12.5, color: tokens.textSecondary }}>
        This preserves the reviewed package exactly as submitted. Quotation edits are recorded separately.
      </Typography>
      <DetailRow label="Selected package">{pkg.name || b.inclusions?.packageName || 'Custom package'}</DetailRow>
      <DetailRow label="Service">{context.serviceType}</DetailRow>
      <DetailRow label="Guests">{context.guests}</DetailRow>
      <DetailRow label="Customer’s event budget">{peso(b.budget)}</DetailRow>
      <DetailRow label={estimate.budgetStatus === 'incomplete' ? 'Known submitted subtotal' : 'Submitted estimate'}>
        {peso(estimate.knownTotal)}
      </DetailRow>
      <Typography sx={{ mt: 1, fontSize: 12.5 }}>
        {estimate.budgetStatus === 'incomplete'
          ? 'Prices pending · the final total and budget fit were not confirmed'
          : estimate.budgetStatus === 'over'
            ? 'Submitted above budget · requires quotation review'
            : 'Within the reviewed budget · subject to final quotation'}
      </Typography>
      {estimate.unknownCharges?.map((charge) => (
        <Typography sx={{ fontSize: 12.5 }} key={charge.id}>
          {charge.label}: to be quoted
        </Typography>
      ))}
      {context.preferences && (
        <Typography sx={{ mt: 1.5, fontSize: 13, whiteSpace: 'pre-wrap' }}>
          Priorities: {context.preferences}
        </Typography>
      )}
      <Box component="details" sx={{ mt: 2, fontSize: 13 }}>
        <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 600 }}>
          Original setup, menu and services
        </Box>
        <Typography sx={{ mt: 1.5, fontWeight: 600, fontSize: 13 }}>Setup for {context.guests} guests</Typography>
        <Box component="ul" sx={{ pl: 2.25 }}>
          {(pkg.items || b.inclusions?.items || []).map((item, index) => (
            <li key={index}>
              {item.qty ? `${item.qty} × ` : ''}
              {item.name}
              {item.toConfirm ? ' · to confirm' : ''}
            </li>
          ))}
        </Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
          {buffet
            ? 'Buffet menu · food and approved standard setup'
            : 'Catering setup only · no buffet food or per-person food charge'}
        </Typography>
        {buffet && (
          <Box component="ul" sx={{ pl: 2.25 }}>
            {Object.entries(candidate.menu || {})
              .filter(([, value]) => Array.isArray(value))
              .flatMap(([key, dishes]) => dishes.map((dish) => <li key={`${key}-${dish}`}>{dish}</li>))}
          </Box>
        )}
        {buffet && (
          <Typography sx={{ fontSize: 13 }}>Drinks: unlimited water and {candidate.menu?.juice || 'juice'}.</Typography>
        )}
        {candidate.menu?.dessert?.name && (
          <Typography sx={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
            Dessert: {candidate.menu.dessert.name}
            {candidate.menu.dessert.description ? ` · ${candidate.menu.dessert.description}` : ''}
          </Typography>
        )}
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Additional services</Typography>
        <Box component="ul" sx={{ pl: 2.25 }}>
          {candidate.addons?.length ? (
            candidate.addons.map((addon) => (
              <li key={addon.id}>
                {addon.name} × {addon.qty} · {addon.price == null ? 'To be quoted' : peso(addon.price * addon.qty)}
              </li>
            ))
          ) : (
            <li>No additional services</li>
          )}
        </Box>
        {context.foodNotes && (
          <Typography sx={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>Food notes: {context.foodNotes}</Typography>
        )}
        {candidate.styling && (
          <Box sx={{ mt: 1.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Reviewed styling</Typography>
            <StylingSummary styling={candidate.styling} compact />
          </Box>
        )}
        {candidate.tradeoffs?.map((line) => (
          <Typography sx={{ fontSize: 12.5, mt: 0.5 }} key={line}>
            {line}
          </Typography>
        ))}
        {candidate.pending?.map((line) => (
          <Typography sx={{ fontSize: 12.5, mt: 0.5, color: tokens.textSecondary }} key={line}>
            Pending: {line}
          </Typography>
        ))}
      </Box>
      {reservation.quotation && (
        <Box sx={{ mt: 1.5 }}>
          <BudgetComparison reservation={reservation} total={reservation.quotation.net} />
        </Box>
      )}
    </DashCard>
  );
}

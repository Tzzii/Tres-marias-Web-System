import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RestoreRoundedIcon from '@mui/icons-material/RestoreRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import {
  AlertBanner,
  BusyButton,
  ConfirmDialog,
  FormField,
  applyBudgetCandidate,
  budgetBookableAddons,
  estimateBudget,
  isBudgetFoodAddon,
  peso,
  tokens
} from '@tm/shared';
import { cleanBudgetDraft, buildBudgetContext, verifiedDraftSavings } from '../../../lib/budgetDraft.js';
import Section from './BookingSection.jsx';
import BudgetRecommendationCard from './BudgetRecommendationCard.jsx';
import { useBudgetProposal } from './useBudgetProposal.js';

function estimateFor(form, catalog, stock) {
  try {
    const context = buildBudgetContext(form, catalog);
    return { context, estimate: estimateBudget(context, { catalog, stock }) };
  } catch {
    return { context: null, estimate: null };
  }
}

export function BudgetSummary({ form, catalog, stock = {}, compact = false, announce = false }) {
  const draft = cleanBudgetDraft(form.budgetDraft);
  if (!draft.amount || form.serviceType !== 'Buffet and Catering') return null;
  const { estimate } = estimateFor(form, catalog, stock);
  if (!estimate)
    return (
      <Typography sx={{ mb: 1.5, fontSize: 12.5, color: tokens.textSecondary }}>
        Complete your guest count, package and service quantities to see the budget estimate.
      </Typography>
    );
  const savings = verifiedDraftSavings(form, catalog, estimate);
  const status =
    estimate.budgetStatus === 'incomplete'
      ? 'Estimate incomplete'
      : estimate.budgetStatus === 'over'
        ? 'Over budget'
        : 'Within budget';
  const isWithin = estimate.budgetStatus === 'within';
  const isOver = estimate.budgetStatus === 'over';
  const fillPct = estimate.budget > 0 ? Math.min(100, Math.round((estimate.knownTotal / estimate.budget) * 100)) : 0;

  const row = (label, value, highlight = false) => (
    <Box
      key={label}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 0.75,
        py: 0.5,
        ...(highlight && {
          pt: 1,
          mt: 0.5,
          borderTop: `1px solid ${tokens.dividerFaint}`
        })
      }}
    >
      <Typography
        sx={{
          fontSize: compact ? 12 : 13,
          fontWeight: highlight ? 700 : 500,
          color: highlight ? tokens.textPrimary : tokens.textSecondary
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: compact ? 12 : 13,
          fontWeight: highlight ? 800 : 600,
          color: tokens.textPrimary
        }}
      >
        {value}
      </Typography>
    </Box>
  );

  return (
    <Box
      sx={{
        mb: 2,
        p: compact ? 1.5 : 2,
        borderRadius: 2,
        backgroundColor: tokens.surfaceSubtle,
        border: `1px solid ${isWithin ? tokens.successBorder : isOver ? tokens.warningBorder : tokens.cardLightBorder}`,
        minWidth: 0
      }}
    >
      <Box
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}
      >
        <Typography
          aria-live={announce ? 'polite' : undefined}
          sx={{
            fontSize: 13,
            fontWeight: 700,
            px: 1.15,
            py: 0.35,
            borderRadius: 999,
            color: isWithin ? tokens.successText : isOver ? tokens.warningText : tokens.goldText,
            backgroundColor: isWithin ? tokens.successBg : isOver ? tokens.warningBg : tokens.goldSubtle
          }}
        >
          {isWithin ? '✓ ' : 'ⓘ '}
          {status}
        </Typography>
        {!compact && estimate.budget > 0 && (
          <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: tokens.textMuted }}>
            {fillPct}% of target budget
          </Typography>
        )}
      </Box>

      {!compact && estimate.budget > 0 && (
        <LinearProgress
          aria-hidden="true"
          variant="determinate"
          value={fillPct}
          sx={{
            height: 6,
            borderRadius: 999,
            mb: 1.5,
            backgroundColor: tokens.surfaceMuted,
            '& .MuiLinearProgress-bar': {
              backgroundColor: isWithin ? tokens.green : isOver ? tokens.amber : tokens.gold
            }
          }}
        />
      )}

      {row('Your event budget', peso(estimate.budget))}
      {row('Buffet and standard setup', peso(estimate.baseTotal))}
      {row('Known additional services', peso(estimate.knownAddonsTotal))}
      {estimate.knownTotal > estimate.baseTotal + estimate.knownAddonsTotal &&
        row('Event duration charge', peso(estimate.knownTotal - estimate.baseTotal - estimate.knownAddonsTotal))}
      {row(
        estimate.budgetStatus === 'incomplete' ? 'Known subtotal' : 'Estimated total',
        peso(estimate.knownTotal),
        true
      )}
      {estimate.difference !== null &&
        row(estimate.difference > 0 ? 'Above your budget' : 'Remaining budget', peso(Math.abs(estimate.difference)))}
      {savings !== null && savings > 0 && row('Savings from your changes', peso(savings))}
      {estimate.unknownCharges.length > 0 && (
        <Typography sx={{ mt: 0.75, fontSize: 12.5, color: tokens.textSecondary }}>
          {estimate.unknownCharges.length} selected service{estimate.unknownCharges.length === 1 ? '' : 's'} to be
          quoted: {estimate.unknownCharges.map((a) => a.label).join(', ')}.
          {estimate.knownOverBudget > 0
            ? ` The known subtotal is already at least ${peso(estimate.knownOverBudget)} above your budget.`
            : ' The final budget status depends on these prices.'}
        </Typography>
      )}
      {estimate.baseExceedsBudget && (
        <Typography sx={{ mt: 0.75, fontSize: 12.5, fontWeight: 600 }}>
          The fixed buffet base alone exceeds your budget. Removing additional services cannot bring this request within
          budget.
        </Typography>
      )}
      {(estimate.budgetStatus === 'over' || estimate.knownOverBudget > 0) && (
        <Typography sx={{ mt: 0.75, fontSize: 12.5 }}>
          You can still submit this request. Our team will review it and send the final quotation.
        </Typography>
      )}
    </Box>
  );
}

export default function BudgetProposalSection({
  form,
  catalog,
  stock,
  index,
  onPatch,
  onCatalogChanged,
  onEditServices,
  submissionError,
  done = false,
  active = false,
  optional = true,
  summary = '',
  stageLabel = '',
  nextSection = null,
  onNext = null
}) {
  const assistant = useBudgetProposal({ form, catalog, stock, onPatch, onCatalogChanged });
  const draft = cleanBudgetDraft(form.budgetDraft);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const offered = budgetBookableAddons(catalog);
  const byId = new Map(offered.map((a) => [a.id, a]));
  const { context, estimate } = estimateFor(form, catalog, stock);
  let selection;
  try {
    selection = buildBudgetContext(form, catalog).selection;
  } catch {
    selection = { addonIds: [], addonQty: {} };
  }
  const setDraft = (change) => onPatch({ budgetDraft: { ...draft, ...change } });
  const keep = (id, checked) => {
    const expanded = selection.addonIds.filter((chosen) =>
      draft.protectedAddonIds.some((p) => p === chosen || p === byId.get(chosen)?.parentId)
    );
    setDraft({ protectedAddonIds: checked ? [...new Set([...expanded, id])] : expanded.filter((p) => p !== id) });
  };
  return (
    <Section
      id="budget"
      index={index}
      title="Budget and Recommendations"
      subtitle="Compare optional additional services while keeping four ulam, meals for every guest, and standard dining essentials fixed."
      done={done}
      active={active}
      optional={optional}
      summary={summary}
      stageLabel={stageLabel}
      icon={AccountBalanceWalletOutlinedIcon}
      nextSection={nextSection}
      onNext={onNext}
    >
      <Box
        sx={{
          mb: 2,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 2
        }}
      >
        <FormField
          id="event-budget"
          label="Your event budget"
          optional
          value={draft.amount}
          onChange={(e) => setDraft({ amount: e.target.value.replace(/\D/g, '').slice(0, 8) })}
          InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
          inputProps={{ inputMode: 'numeric', maxLength: 8 }}
          hint="A target for recommendations. You may still submit above this amount."
        />
        <FormField
          id="budget-preferences"
          label="What would you like to prioritize?"
          optional
          multiline
          minRows={3}
          value={draft.preferences}
          onChange={(e) => setDraft({ preferences: e.target.value })}
          inputProps={{ maxLength: 500 }}
          hint="For example: keep the stage decoration and use a simpler sound option."
        />
      </Box>

      <BudgetSummary form={form} catalog={catalog} stock={stock} announce />

      <Box
        sx={{
          p: { xs: 1.5, sm: 2 },
          mb: 2,
          borderRadius: 2,
          border: `1px solid ${tokens.cardLightBorder}`,
          backgroundColor: tokens.surfaceSubtle
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            mb: 1.25
          }}
        >
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: tokens.textPrimary }}>
            Your requested additional services
          </Typography>
          <Button size="small" onClick={onEditServices}>
            Edit additional service options
          </Button>
        </Box>

        {selection.addonIds.length === 0 ? (
          <Typography sx={{ fontSize: 13, lineHeight: 1.55, color: tokens.textSecondary }}>
            Choose any additional services you need. You can also review the fixed buffet base without extras.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {selection.addonIds.map((id) => {
              const a = byId.get(id);
              const qty = selection.addonQty[id];
              const food = isBudgetFoodAddon(a);
              const isKept = draft.protectedAddonIds.includes(id) || draft.protectedAddonIds.includes(a.parentId);
              return (
                <Box
                  key={id}
                  sx={{
                    p: 1.5,
                    border: `1.5px solid ${isKept ? tokens.goldDark : tokens.cardLightBorder}`,
                    backgroundColor: isKept ? tokens.goldWash : tokens.cardLight,
                    borderRadius: 1.5,
                    minWidth: 0
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 1
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      {isKept && <LockOutlinedIcon sx={{ fontSize: 15, color: tokens.goldDark, flexShrink: 0 }} />}
                      <Typography sx={{ fontWeight: 700, fontSize: 13, color: tokens.textPrimary }}>
                        {a.name}
                        {a.hasQuantity ? ` × ${qty}` : ''}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: tokens.textPrimary }}>
                      {typeof a.price === 'number'
                        ? `${peso(a.price)}${a.hasQuantity ? ' each' : ''} · ${peso(a.price * qty)}`
                        : 'To be quoted'}
                    </Typography>
                  </Box>
                  {food ? (
                    <Typography sx={{ mt: 0.5, fontSize: 12, color: tokens.textSecondary }}>
                      Food is excluded from recommendations. Edit this item in Additional Charges.
                    </Typography>
                  ) : (
                    <Box
                      sx={{
                        mt: 0.75,
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1
                      }}
                    >
                      <FormControlLabel
                        sx={{ mr: 1 }}
                        control={
                          <Checkbox size="small" checked={isKept} onChange={(e) => keep(id, e.target.checked)} />
                        }
                        label={<Typography sx={{ fontSize: 12.5, fontWeight: 500 }}>Keep {a.name}</Typography>}
                      />
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
                        {a.hasQuantity && (
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              px: 0.5,
                              py: 0.25,
                              borderRadius: 1.25,
                              border: `1px solid ${tokens.cardLightBorder}`,
                              backgroundColor: tokens.cardLight
                            }}
                          >
                            <Button
                              size="small"
                              aria-label={`Decrease ${a.name} quantity`}
                              disabled={qty <= 1}
                              onClick={() => assistant.manual(id, qty - 1)}
                              sx={{ minWidth: 28, px: 0.5 }}
                            >
                              −
                            </Button>
                            <Typography sx={{ fontSize: 12.5, fontWeight: 600, px: 0.5 }}>Qty {qty}</Typography>
                            <Button
                              size="small"
                              aria-label={`Increase ${a.name} quantity`}
                              disabled={qty >= 99}
                              onClick={() => assistant.manual(id, qty + 1)}
                              sx={{ minWidth: 28, px: 0.5 }}
                            >
                              +
                            </Button>
                          </Box>
                        )}
                        <Button
                          size="small"
                          aria-label={`Remove ${a.name}`}
                          onClick={() => assistant.manual(id, null)}
                          sx={{ color: tokens.dangerText }}
                        >
                          Remove
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <BusyButton
          variant="contained"
          startIcon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 17 }} />}
          busy={assistant.status === 'generating'}
          disabled={!draft.amount}
          onClick={assistant.generate}
        >
          Review my budget
        </BusyButton>
        <Button
          startIcon={<UndoRoundedIcon sx={{ fontSize: 17 }} />}
          onClick={assistant.undo}
          disabled={!draft.history.length || assistant.status === 'generating'}
        >
          Undo last recommendation
        </Button>
        <Button
          startIcon={<RestoreRoundedIcon sx={{ fontSize: 17 }} />}
          onClick={() => setRestoreOpen(true)}
          disabled={!draft.baseline || assistant.status === 'generating'}
        >
          Restore original services
        </Button>
      </Box>
      {assistant.status === 'generating' && (
        <Box sx={{ mt: 2 }} role="status" aria-live="polite">
          <LinearProgress />
          <Typography sx={{ mt: 0.5, fontSize: 12.5 }}>
            Reviewing approved options. Your selections stay unchanged.
          </Typography>
        </Box>
      )}
      {submissionError && (
        <AlertBanner tone="warning" sx={{ mt: 2 }}>
          {submissionError}
        </AlertBanner>
      )}
      {assistant.error && (
        <AlertBanner tone="error" sx={{ mt: 2 }}>
          {assistant.error}
        </AlertBanner>
      )}
      {assistant.status === 'stale' && (
        <AlertBanner tone="info" sx={{ mt: 2 }}>
          Your selections or event details changed. Review your budget again to refresh recommendations.
        </AlertBanner>
      )}
      {assistant.status === 'idle' && draft.proposalRef && (
        <Typography sx={{ mt: 1, fontSize: 12.5, color: tokens.textSecondary }}>
          Your draft selections were restored. Review your budget again before using recommendations.
        </Typography>
      )}
      {['unavailable', 'no-changes'].includes(assistant.status) && (
        <AlertBanner tone="info" sx={{ mt: 2 }}>
          {assistant.proposal?.message ||
            'Recommendations are temporarily unavailable. You can still edit services and submit your request.'}
        </AlertBanner>
      )}
      {assistant.proposal?.candidates.length > 0 && (
        <Box sx={{ mt: 2.5 }}>
          <Typography component="h3" sx={{ fontWeight: 700, fontSize: 15 }}>
            Your proposed adjustments
          </Typography>
          <Typography sx={{ my: 1, fontSize: 12.5, color: tokens.textSecondary }}>
            Draft · For admin review. These are alternatives; their savings cannot simply be added together.
          </Typography>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {assistant.proposal.candidates.map((candidate) => {
              const result = context
                ? applyBudgetCandidate(context.selection, candidate, { context, catalog, stock })
                : { problem: 'Complete the current event details first.' };
              const savings =
                candidate.knownSavings === null
                  ? null
                  : result.problem
                    ? candidate.knownSavings
                    : estimate.knownTotal - result.estimate.knownTotal;
              return (
                <BudgetRecommendationCard
                  key={candidate.id}
                  candidate={candidate}
                  source={byId.get(candidate.action.addonId)}
                  target={byId.get(candidate.action.replacementId)}
                  problem={result.problem}
                  savings={savings}
                  active={assistant.status === 'ready'}
                  onApply={() => assistant.apply(candidate)}
                />
              );
            })}
          </Box>
        </Box>
      )}
      <ConfirmDialog
        open={restoreOpen}
        title="Restore original additional services?"
        description="This replaces your current additional services with the selections from your first budget review. Event details and the four-ulam menu stay unchanged."
        confirmLabel="Restore services"
        onClose={() => setRestoreOpen(false)}
        onConfirm={() => {
          assistant.restore();
          setRestoreOpen(false);
        }}
      />
    </Section>
  );
}

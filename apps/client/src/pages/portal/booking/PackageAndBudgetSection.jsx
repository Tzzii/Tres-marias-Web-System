import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { peso } from '@tm/shared';
import Section from './BookingSection.jsx';
import PackageProposalOption from '../../../components/assistant/PackageProposalOption.jsx';

export function PackageBudgetSummary({ form, compact = false }) {
  const option = form.packageProposalDisplay;
  if (!form.packageProposalRef || !option) return null;
  const estimate = option.estimate;
  return (
    <Box sx={{ mb: 2, p: compact ? 1.25 : 2, bgcolor: 'action.hover', borderRadius: 2 }}>
      <Typography variant="subtitle2">Custom package · {option.packageSnapshot.name}</Typography>
      <Typography variant="body2">
        Budget {peso(form.packageProposalContext?.budget)} ·{' '}
        {estimate.budgetStatus === 'incomplete' ? 'Known subtotal' : 'Reviewed estimate'} {peso(estimate.knownTotal)}
      </Typography>
      <Typography variant="caption">
        {form.packageProposalStale
          ? 'Selections changed. Review fresh options before submitting.'
          : estimate.budgetStatus === 'within'
            ? 'Within the reviewed budget. Final quotation follows team review.'
            : estimate.budgetStatus === 'over'
              ? 'Above your budget. Review the trade-offs before submitting.'
              : 'Some charges remain unpriced; this is not a confirmed budget fit.'}
      </Typography>
    </Box>
  );
}

export default function PackageAndBudgetSection({
  form,
  index,
  done,
  active,
  stageLabel,
  nextSection,
  onNext,
  summary,
  submissionError
}) {
  const reference = form.packageProposalRef;
  return (
    <Section
      id="budget"
      title="Package and Budget"
      index={index}
      done={done}
      active={active}
      optional
      summary={summary}
      stageLabel={stageLabel}
      nextSection={nextSection}
      onNext={onNext}
    >
      {submissionError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {submissionError}
        </Alert>
      )}
      {reference ? (
        <Stack spacing={2}>
          {form.packageProposalStale && (
            <Alert severity="warning">
              Your reviewed package no longer matches these selections. Your event details remain saved. Adjust your
              answers and generate fresh options before submitting.
            </Alert>
          )}
          {form.packageProposalDisplay ? (
            <PackageProposalOption
              option={form.packageProposalDisplay}
              context={form.packageProposalContext}
              index={0}
            />
          ) : (
            <Alert severity="info">Verifying your saved custom package…</Alert>
          )}
          <Button
            component={RouterLink}
            to={`/portal/assistant?mode=package&proposal=${encodeURIComponent(reference.proposalId)}`}
            variant="outlined"
          >
            Adjust package and budget
          </Button>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Typography variant="body2">
            Your selected catalog package uses its current service prices. To compare complete setups around a total
            event budget, start the guided package builder. Your reservation details stay saved.
          </Typography>
          <Button
            component={RouterLink}
            to="/portal/assistant?mode=package"
            variant="outlined"
            sx={{ alignSelf: 'flex-start' }}
          >
            Build a package around my budget
          </Button>
        </Stack>
      )}
    </Section>
  );
}

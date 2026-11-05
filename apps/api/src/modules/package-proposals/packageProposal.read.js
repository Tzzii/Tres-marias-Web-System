import { ApiError } from '../../lib/ApiError.js';

/** A submitted envelope is read-only history; only an owner-scoped repository lookup may supply it. */
export async function readOwnedPackageProposal(
  customerId,
  id,
  { findOwned, findSubmittedReservation, clock = Date.now }
) {
  const row = await findOwned(customerId, id);
  if (!row) throw new ApiError('NOT_FOUND', 'Package proposal not found.');
  const { revision, context, options, status, noFitReasons, catalogFingerprint, expiresAt, selectedOptionId } = row;
  let submission = null;
  if (row.submittedRef) {
    if (!selectedOptionId || !options?.some((option) => option.id === selectedOptionId))
      throw new ApiError('PROPOSAL_STALE', 'The submitted package reference cannot be recovered. Contact the team.');
    const saved = await findSubmittedReservation(customerId, row.submittedRef);
    if (!saved || saved.reservationRef !== row.submittedRef)
      throw new ApiError('NOT_FOUND', 'Submitted reservation not found. Contact the team.');
    submission = { ...saved, packageProposalRef: { proposalId: row.id, revision, optionId: selectedOptionId } };
  } else if (expiresAt <= clock()) {
    throw new ApiError('PROPOSAL_STALE', 'The package proposal changed or expired. Review fresh options.', {
      field: 'packageProposalRef'
    });
  }
  if (status === 'pending' && clock() - row.createdAt <= 120000)
    throw new ApiError('ASSISTANT_BUSY', 'This proposal is being prepared. Retry the same request.');
  return {
    id: row.id,
    revision,
    context,
    options: status === 'pending' ? [] : options,
    status: status === 'pending' ? 'unavailable' : status,
    noFitReasons:
      status === 'pending' ? ['Your review could not be completed. Refresh and review again.'] : noFitReasons,
    catalogFingerprint,
    expiresAt,
    selectedOptionId,
    submission
  };
}

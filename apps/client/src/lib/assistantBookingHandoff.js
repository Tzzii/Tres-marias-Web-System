import { assistantApi } from './assistantApi.js';
import { readDraft, saveDraft } from './booking.js';
import {
  cleanDraftReferencePhotos,
  REFERENCE_PHOTO_MAX_COUNT
} from '../../../../packages/shared/src/domain/referencePhoto.js';

async function draftPhoto(blob, name) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return { name, dataUrl: `data:${blob.type};base64,${btoa(binary)}` };
}

/** Keep the existing form handoff lossless; no navigation occurs if browser storage cannot carry photos. */
export async function carryAssistantPhotos(
  conversation,
  customerId,
  { api = assistantApi, read = readDraft, save = saveDraft, signal } = {}
) {
  if (!conversation.referencePhotos?.length) return;
  if (!customerId)
    throw new Error(
      'Please sign in before moving reference photos to the booking form. Your photos remain saved in this chat.'
    );
  const verify = async () => {
    const current = await api.read(conversation.conversationId, signal);
    if (current.draftRevision !== conversation.draftRevision || current.submittedRef)
      throw new Error('Your reservation plan changed. Refresh and review it again before continuing.');
  };
  await verify();
  const added = [];
  for (const photo of conversation.referencePhotos) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    added.push(await draftPhoto(await api.photo(conversation.conversationId, photo.index, signal), photo.name));
  }
  await verify();
  // Read after downloading so unrelated form work saved meanwhile is preserved.
  const form = read(customerId)?.form || {};
  const existing = cleanDraftReferencePhotos(form.referencePhotos ?? form.referencePhoto);
  const photos = [...existing];
  for (const photo of added)
    if (!photos.some((p) => p.name === photo.name && p.dataUrl === photo.dataUrl)) photos.push(photo);
  if (photos.length > REFERENCE_PHOTO_MAX_COUNT)
    throw new Error(
      'The booking form already has reference photos. Keep at most five combined photos, or finish this reservation in chat.'
    );
  if (!save(customerId, { ...form, referencePhotos: photos }))
    throw new Error(
      'Browser storage cannot carry these reference photos into the form. Finish your reservation in chat to keep all photos attached.'
    );
}

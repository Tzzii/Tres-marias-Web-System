import { useEffect, useState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import {
  REFERENCE_PHOTO_MAX_COUNT,
  REFERENCE_PHOTO_MAX_MB,
  REFERENCE_PHOTO_TYPES,
  referencePhotoProblem
} from '@tm/shared/domain/referencePhoto.js';
import { assistantApi } from '../../lib/assistantApi.js';

function PrivatePhoto({ conversationId, photo, revision }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let preview;
    setUrl('');
    setFailed(false);
    assistantApi
      .photo(conversationId, photo.index, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        preview = URL.createObjectURL(blob);
        setUrl(preview);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setFailed(true);
      });
    return () => {
      controller.abort();
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [conversationId, photo.index, revision]);
  return (
    <Box>
      {url && (
        <Box
          component="img"
          src={url}
          alt={`Reference photo: ${photo.name}`}
          sx={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 1 }}
        />
      )}
      {failed && <Typography sx={{ fontSize: 11 }}>Preview unavailable. The saved photo remains attached.</Typography>}
      <Typography sx={{ fontSize: 11, overflowWrap: 'anywhere' }}>{photo.name}</Typography>
    </Box>
  );
}

export default function AssistantReferencePhotos({ conversation, disabled, onUpload, onRemove }) {
  const [error, setError] = useState('');
  const photos = conversation.referencePhotos || [];
  return (
    <Stack spacing={1.5}>
      <Typography sx={{ fontSize: 12 }}>
        Upload up to {REFERENCE_PHOTO_MAX_COUNT} JPG, PNG or WebP photos, up to {REFERENCE_PHOTO_MAX_MB} MB each. These
        are shared with the team as design references.
      </Typography>
      {photos.map((photo) => (
        <Box key={`${photo.index}-${photo.name}`} className="tm-assistant-item-choice">
          <PrivatePhoto
            conversationId={conversation.conversationId}
            photo={photo}
            revision={conversation.draftRevision}
          />
          <Button
            type="button"
            size="small"
            disabled={disabled}
            onClick={() => onRemove(photo.index)}
            aria-label={`Remove reference photo ${photo.index + 1}`}
          >
            Remove photo
          </Button>
        </Box>
      ))}
      <Button component="label" variant="outlined" disabled={disabled || photos.length >= REFERENCE_PHOTO_MAX_COUNT}>
        Upload reference photos
        <input
          aria-label="Upload reference photos"
          type="file"
          accept={REFERENCE_PHOTO_TYPES.join(',')}
          multiple
          hidden
          disabled={disabled || photos.length >= REFERENCE_PHOTO_MAX_COUNT}
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            if (!files.length) return;
            const problem =
              photos.length + files.length > REFERENCE_PHOTO_MAX_COUNT
                ? `Choose up to ${REFERENCE_PHOTO_MAX_COUNT} photos in total.`
                : files.map((f) => referencePhotoProblem(f)).find(Boolean);
            setError(problem || '');
            if (!problem) void onUpload(files);
          }}
        />
      </Button>
      {error && <Alert severity="warning">{error}</Alert>}
      <Typography sx={{ fontSize: 11 }}>
        Photos are optional. Uploading a reference does not guarantee that an exact design can be reproduced.
      </Typography>
    </Stack>
  );
}

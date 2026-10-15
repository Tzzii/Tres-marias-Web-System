import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import {
  REFERENCE_PHOTO_MAX_COUNT,
  REFERENCE_PHOTO_MAX_MB,
  REFERENCE_PHOTO_TYPES,
  referencePhotoList,
  referencePhotoProblem
} from '../domain/referencePhoto.js';
import { referencePhotoUrl } from '../services/remote/reservation.js';
import { tokens } from '../theme/tokens.js';

const imageSx = {
  display: 'block',
  width: '100%',
  maxWidth: 420,
  maxHeight: 260,
  objectFit: 'contain',
  borderRadius: 1.5,
  border: `1px solid ${tokens.cardLightBorder}`,
  backgroundColor: tokens.surfaceSubtle
};

export function ReferencePhotoPicker({ id, value, onChange, onBusyChange, error }) {
  const photos = referencePhotoList(value);
  const input = useRef(null);
  const reader = useRef(null);
  const active = useRef(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      reader.current?.abort();
    };
  }, []);

  const choose = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length || busy) return;
    if (photos.length + files.length > REFERENCE_PHOTO_MAX_COUNT) {
      setProblem(
        `Upload up to ${REFERENCE_PHOTO_MAX_COUNT} reference photos. You can add ${Math.max(0, REFERENCE_PHOTO_MAX_COUNT - photos.length)} more.`
      );
      return;
    }
    const invalid = files.map((file) => referencePhotoProblem({ size: file.size, type: file.type })).find(Boolean);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setProblem('');
    setBusy(true);
    onBusyChange?.(true);
    try {
      const added = [];
      for (const file of files) {
        const dataUrl = await new Promise((resolve, reject) => {
          const current = new FileReader();
          reader.current = current;
          current.onload = () => resolve(current.result);
          current.onerror = () => reject(new Error('The photo could not be read. Choose it again.'));
          current.onabort = () => reject(new Error('Photo selection cancelled.'));
          current.readAsDataURL(file);
        });
        // Decode every photo before accepting the selection.
        const preview = new Image();
        preview.src = dataUrl;
        await preview.decode();
        if (!active.current) return;
        added.push({ name: file.name, dataUrl });
      }
      onChange([...photos, ...added]);
    } catch {
      if (active.current) setProblem('A photo could not be opened. Choose valid JPG, PNG or WebP photos.');
    } finally {
      if (active.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };

  return (
    <Box id={id}>
      <Typography component="h3" sx={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>
        Reference photos{' '}
        <Box component="span" sx={{ ml: 0.75, fontWeight: 500, fontSize: 12.5, color: tokens.textSecondary }}>
          Optional
        </Box>
      </Typography>
      <Typography id={`${id}-hint`} sx={{ mt: 0.5, mb: 1.5, fontSize: 12.5, color: tokens.textSecondary }}>
        Share up to {REFERENCE_PHOTO_MAX_COUNT} photos of the backdrop, table setup or overall look you have in mind.
        JPG, PNG or WebP, up to {REFERENCE_PHOTO_MAX_MB} MB each. No photos are required.
      </Typography>
      <Typography role="status" sx={{ mb: 1, fontSize: 12, color: tokens.textMuted }}>
        {photos.length} / {REFERENCE_PHOTO_MAX_COUNT} photos selected
      </Typography>
      {photos.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
            gap: 1.5,
            mb: 1.5
          }}
        >
          {photos.map((photo, index) => (
            <Box key={index} sx={{ minWidth: 0 }}>
              <Box
                component="img"
                src={photo.dataUrl}
                alt={`Your event design reference ${index + 1}`}
                sx={{ ...imageSx, height: 150 }}
              />
              <Typography sx={{ mt: 0.75, fontSize: 12.5, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>
                {photo.name}
              </Typography>
              <Button
                type="button"
                size="small"
                disabled={busy}
                aria-label={`Remove reference photo ${index + 1}: ${photo.name}`}
                onClick={() => {
                  setProblem('');
                  onChange(photos.filter((_, photoIndex) => photoIndex !== index));
                }}
              >
                Remove photo
              </Button>
            </Box>
          ))}
        </Box>
      )}
      <input
        ref={input}
        id={`${id}-input`}
        type="file"
        multiple
        accept={REFERENCE_PHOTO_TYPES.join(',')}
        hidden
        onChange={choose}
        aria-label="Choose reference photos"
        aria-describedby={`${id}-hint`}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <ButtonBase
          type="button"
          disabled={busy || photos.length >= REFERENCE_PHOTO_MAX_COUNT}
          onClick={() => input.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            choose({ target: { files: event.dataTransfer.files, value: '' } });
          }}
          aria-describedby={`${id}-hint`}
          sx={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.75,
            py: 3,
            px: 2,
            fontFamily: 'inherit',
            borderRadius: 1.5,
            border: `2px dashed ${problem || error ? tokens.red : tokens.borderInput}`,
            backgroundColor: tokens.surfaceSubtle,
            '&.Mui-disabled': { opacity: 0.6 },
            '&:hover': { borderColor: tokens.ink },
            '&.Mui-focusVisible': { outline: `2px solid ${tokens.ink}`, outlineOffset: 3 }
          }}
        >
          <CloudUploadOutlinedIcon sx={{ fontSize: 30, color: tokens.textMuted }} />
          <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 600, color: tokens.textPrimary }}>
            {busy
              ? 'Reading photos…'
              : photos.length >= REFERENCE_PHOTO_MAX_COUNT
                ? 'Maximum of 5 photos selected'
                : photos.length
                  ? 'Add reference photos'
                  : 'Upload reference photos'}
          </Typography>
          <Typography component="span" sx={{ fontSize: 12, color: tokens.textMuted }}>
            JPG, PNG or WebP · up to {REFERENCE_PHOTO_MAX_MB} MB each
          </Typography>
        </ButtonBase>
      </Box>
      {(problem || error) && (
        <Typography role="alert" sx={{ mt: 1, fontSize: 12.5, color: tokens.redPress }}>
          {problem || error}
        </Typography>
      )}
      <Typography sx={{ mt: 1, fontSize: 12, color: tokens.textMuted }}>
        These photos guide our design discussion. You can submit your reservation without any photos.
      </Typography>
    </Box>
  );
}

export function ReferencePhotoPreview({ photo, ...props }) {
  const photos = referencePhotoList(photo);
  if (!photos.length) return null;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {photos.map((item, index) => (
        <SingleReferencePhotoPreview key={item.key || index} photo={item} photoIndex={index} {...props} />
      ))}
    </Box>
  );
}

function SingleReferencePhotoPreview({ photo, photoIndex, reservationRef, forAdmin = false, compact = false }) {
  const [state, setState] = useState({ url: '', error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!photo?.key || !reservationRef || compact) return undefined;
    let active = true;
    let objectUrl;
    setState({ url: '', error: '' });
    referencePhotoUrl(reservationRef, { forAdmin, photoIndex })
      .then((url) => {
        objectUrl = url;
        if (active) setState({ url, error: '' });
        else URL.revokeObjectURL(url);
      })
      .catch((error) => {
        if (active) setState({ url: '', error: error.message });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo?.key, photoIndex, reservationRef, forAdmin, compact, attempt]);
  if (!photo) return null;
  if (compact)
    return (
      <Typography sx={{ mt: 0.5, fontSize: 12.5, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>
        Reference photo: {photo.name}
      </Typography>
    );
  const url = photo.dataUrl || state.url;
  return (
    <Box>
      <Typography sx={{ mb: 0.75, fontSize: 11.5, fontWeight: 700, color: tokens.textMuted }}>
        Reference Photo
      </Typography>
      {url ? (
        <>
          <Box component="img" src={url} alt="Event design reference supplied by the customer" sx={imageSx} />
          <Typography sx={{ mt: 0.75, fontSize: 12.5, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>
            {photo.name}
          </Typography>
          {reservationRef && (
            <Button component="a" href={url} target="_blank" rel="noopener noreferrer" size="small" sx={{ mt: 0.5 }}>
              View full photo
            </Button>
          )}
        </>
      ) : state.error ? (
        <>
          <Typography role="alert" sx={{ fontSize: 12.5, color: tokens.redPress }}>
            {state.error}
          </Typography>
          <Button size="small" onClick={() => setAttempt((n) => n + 1)}>
            Retry photo
          </Button>
        </>
      ) : (
        <Typography role="status" sx={{ fontSize: 12.5, color: tokens.textSecondary }}>
          Loading reference photo…
        </Typography>
      )}
    </Box>
  );
}

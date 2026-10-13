import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded';
import { REFERENCE_PHOTO_MAX_MB, REFERENCE_PHOTO_TYPES, referencePhotoProblem } from '../domain/referencePhoto.js';
import { referencePhotoUrl } from '../services/remote/reservation.js';
import { tokens } from '../theme/tokens.js';

const imageSx = { display: 'block', width: '100%', maxWidth: 420, maxHeight: 260, objectFit: 'contain', borderRadius: 1.5, border: `1px solid ${tokens.cardLightBorder}`, backgroundColor: tokens.surfaceSubtle };

export function ReferencePhotoPicker({ id, value, onChange, onBusyChange, error }) {
  const input = useRef(null);
  const reader = useRef(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => () => reader.current?.abort(), []);

  const choose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const invalid = referencePhotoProblem({ size: file.size, type: file.type });
    if (invalid) { setProblem(invalid); return; }
    setProblem('');
    setBusy(true);
    onBusyChange?.(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const current = new FileReader();
        reader.current = current;
        current.onload = () => resolve(current.result);
        current.onerror = () => reject(new Error('The photo could not be read. Choose it again.'));
        current.onabort = () => reject(new Error('Photo selection cancelled.'));
        current.readAsDataURL(file);
      });
      // Decode it before accepting it, so a renamed or damaged file gets a useful message.
      const preview = new Image();
      preview.src = dataUrl;
      await preview.decode();
      onChange({ name: file.name, dataUrl });
    } catch {
      setProblem('The photo could not be opened. Choose a valid JPG, PNG or WebP photo.');
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return <Box id={id}>
    <Typography component="h3" sx={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>
      Reference photo <Box component="span" sx={{ ml: 0.75, fontWeight: 500, fontSize: 12.5, color: tokens.textSecondary }}>Optional</Box>
    </Typography>
    <Typography id={`${id}-hint`} sx={{ mt: 0.5, mb: 1.5, fontSize: 12.5, color: tokens.textSecondary }}>
      Share a photo of the backdrop, table setup or overall look you have in mind. JPG, PNG or WebP, up to {REFERENCE_PHOTO_MAX_MB} MB.
    </Typography>
    {value?.dataUrl && <>
      <Box component="img" src={value.dataUrl} alt="Your event design reference" sx={imageSx} />
      <Typography sx={{ mt: 0.75, mb: 1, fontSize: 12.5, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>{value.name}</Typography>
    </>}
    <input ref={input} id={`${id}-input`} type="file" accept={REFERENCE_PHOTO_TYPES.join(',')} hidden onChange={choose} aria-label="Choose a reference photo" aria-describedby={`${id}-hint`} />
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      <Button type="button" variant="outlined" startIcon={<AddPhotoAlternateRoundedIcon />} disabled={busy} onClick={() => input.current?.click()} aria-describedby={`${id}-hint`}>
        {busy ? 'Reading photo…' : value ? 'Replace photo' : 'Upload reference photo'}
      </Button>
      {value && <Button type="button" disabled={busy} onClick={() => { setProblem(''); onChange(null); }}>Remove photo</Button>}
    </Box>
    {(problem || error) && <Typography role="alert" sx={{ mt: 1, fontSize: 12.5, color: tokens.redPress }}>{problem || error}</Typography>}
    <Typography sx={{ mt: 1, fontSize: 12, color: tokens.textMuted }}>This photo guides our design discussion. You can submit your reservation without one.</Typography>
  </Box>;
}

export function ReferencePhotoPreview({ photo, reservationRef, forAdmin = false, compact = false }) {
  const [state, setState] = useState({ url: '', error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!photo?.key || !reservationRef || compact) return undefined;
    let active = true;
    let objectUrl;
    setState({ url: '', error: '' });
    referencePhotoUrl(reservationRef, { forAdmin }).then((url) => {
      objectUrl = url;
      if (active) setState({ url, error: '' });
      else URL.revokeObjectURL(url);
    }).catch((error) => { if (active) setState({ url: '', error: error.message }); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photo?.key, reservationRef, forAdmin, compact, attempt]);
  if (!photo) return null;
  if (compact) return <Typography sx={{ mt: 0.5, fontSize: 12.5, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>Reference photo: {photo.name}</Typography>;
  const url = photo.dataUrl || state.url;
  return <Box>
    <Typography sx={{ mb: 0.75, fontSize: 11.5, fontWeight: 700, color: tokens.textMuted }}>Reference Photo</Typography>
    {url ? <>
      <Box component="img" src={url} alt="Event design reference supplied by the customer" sx={imageSx} />
      <Typography sx={{ mt: 0.75, fontSize: 12.5, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>{photo.name}</Typography>
      {reservationRef && <Button component="a" href={url} target="_blank" rel="noopener noreferrer" size="small" sx={{ mt: 0.5 }}>View full photo</Button>}
    </> : state.error ? <>
      <Typography role="alert" sx={{ fontSize: 12.5, color: tokens.redPress }}>{state.error}</Typography>
      <Button size="small" onClick={() => setAttempt((n) => n + 1)}>Retry photo</Button>
    </> : <Typography role="status" sx={{ fontSize: 12.5, color: tokens.textSecondary }}>Loading reference photo…</Typography>}
  </Box>;
}

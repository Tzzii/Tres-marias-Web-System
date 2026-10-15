import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import {
  BusyButton,
  CardTitle,
  DashCard,
  ErrorState,
  HeroPhoto,
  ListSkeleton,
  PHOTO_ACCEPT,
  RULES,
  appearanceApi,
  photoProblem,
  tokens,
  useNotify,
  useResource
} from '@tm/shared';

export default function HeroPhotoSection() {
  const resource = useResource(appearanceApi.getAppearance, []);
  const notify = useNotify();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [restore, setRestore] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = Boolean(file || restore);

  const discard = () => {
    setFile(null);
    setRestore(false);
    setError('');
  };

  const save = async (event) => {
    event.preventDefault();
    if (!dirty) return;
    setError('');
    setSaving(true);
    try {
      const saved = restore ? await appearanceApi.restoreHeroPhoto() : await appearanceApi.saveHeroPhoto(file);
      resource.setData(saved);
      discard();
      notify('Hero photo saved. The homepage now uses the updated photo.');
    } catch (failure) {
      setError(failure.message);
      notify(failure.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashCard sx={{ maxWidth: 640 }}>
      <CardTitle subtitle="Change the large photo beside the welcome message on the public homepage.">
        Homepage hero photo
      </CardTitle>
      {resource.error ? (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      ) : !resource.data ? (
        <ListSkeleton rows={3} />
      ) : (
        <Box component="form" onSubmit={save} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ borderRadius: 2, overflow: 'hidden', border: `1px solid ${tokens.cardLightBorder}` }}>
            <HeroPhoto settings={resource.data} file={file} restore={restore} />
          </Box>
          <Typography sx={{ fontSize: 13, color: tokens.textSecondary }}>
            Use a landscape JPG, PNG or WebP photo, up to {RULES.photoMaxMb} MB. Photos are cropped to fit the homepage;
            keep the subject near the centre.
          </Typography>
          <input
            ref={input}
            type="file"
            accept={PHOTO_ACCEPT}
            aria-label="Choose homepage hero photo"
            hidden
            disabled={saving}
            onChange={(event) => {
              const picked = event.target.files?.[0];
              event.target.value = '';
              if (!picked) return;
              const problem = photoProblem(picked);
              setError(problem);
              if (problem) return;
              setFile(picked);
              setRestore(false);
            }}
          />
          {file && (
            <Typography sx={{ fontSize: 13, color: tokens.textSecondary, overflowWrap: 'anywhere' }}>
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
            </Typography>
          )}
          {error && (
            <Typography role="alert" sx={{ fontSize: 13, color: 'error.main' }}>
              {error}
            </Typography>
          )}
          {dirty && (
            <Typography role="status" sx={{ fontSize: 13, color: tokens.textSecondary }}>
              {restore
                ? 'Default photo preview. Save to restore it on the homepage.'
                : 'New photo preview. Save to publish it on the homepage.'}
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button variant="outlined" disabled={saving} onClick={() => input.current?.click()}>
              Choose photo
            </Button>
            {resource.data.heroPhotoVersion && !restore && (
              <Button
                disabled={saving}
                onClick={() => {
                  setFile(null);
                  setRestore(true);
                  setError('');
                }}
              >
                Restore default photo
              </Button>
            )}
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <BusyButton type="submit" busy={saving} disabled={!dirty}>
              Save hero photo
            </BusyButton>
            {(dirty || error) && (
              <Button disabled={saving} onClick={discard}>
                Discard changes
              </Button>
            )}
          </Box>
        </Box>
      )}
    </DashCard>
  );
}

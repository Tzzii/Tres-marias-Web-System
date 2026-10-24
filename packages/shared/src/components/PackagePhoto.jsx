import { useEffect, useState } from 'react';
import { tokens } from '../theme/tokens.js';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import { samplePackagePhoto } from '../domain/packagePhotos.js';
import { adminPackagePhotoUrl, packagePhotoUrl } from '../services/remote/catalog.js';

/** Shared package image for landing cards, detail pages and protected admin previews. */
export function PackagePhoto({ pkg, file, removePhoto = false, admin = false, height = 320, thumbnail = false }) {
  const [preview, setPreview] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl;
    setPreview(null);
    setFailed(false);
    setOpen(false);
    if (file) {
      objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
    } else if (admin && pkg?.photoVersion && !removePhoto) {
      adminPackagePhotoUrl(pkg)
        .then((url) => {
          if (!active) URL.revokeObjectURL(url);
          else {
            objectUrl = url;
            setPreview(url);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, admin, pkg?.id, pkg?.slug, pkg?.photoVersion, removePhoto]);

  const saved = !removePhoto && pkg?.photoVersion;
  const loading = admin && saved && !file && !preview && !failed;
  const sample = failed || (!file && !saved);
  const src = sample ? samplePackagePhoto(pkg) : preview || (!admin && packagePhotoUrl(pkg));
  const cardSrc = sample && thumbnail ? samplePackagePhoto(pkg, { thumbnail: true }) : src;
  const caption = loading
    ? 'Loading package photo…'
    : failed
      ? 'Photo unavailable · Sample setup shown'
      : sample
        ? 'Sample setup · For illustration only'
        : file && admin
          ? 'New photo preview · Save changes to publish'
          : 'Package setup';
  const alt = `${pkg?.name || 'Package'} ${sample ? 'sample ' : ''}setup`;
  return (
    <Box>
      <ButtonBase
        className="tm-package-photo-surface"
        onClick={() => setOpen(true)}
        disabled={!src || loading}
        aria-label={`Enlarge ${alt}`}
        sx={{
          display: 'block',
          width: '100%',
          height,
          position: 'relative',
          bgcolor: tokens.surfaceSubtle,
          overflow: 'hidden'
        }}
      >
        {src && (
          <Box
            component="img"
            src={cardSrc}
            alt={alt}
            loading="lazy"
            decoding="async"
            width={640}
            height={400}
            onError={() => setFailed(true)}
            sx={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
          />
        )}
        {src && !loading && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 14,
              right: 14,
              bgcolor: 'rgba(15,23,42,0.7)',
              color: '#fff',
              borderRadius: 999,
              px: 1.25,
              py: 0.75,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              fontSize: 12
            }}
          >
            <ZoomInRoundedIcon sx={{ fontSize: 18 }} /> View photo
          </Box>
        )}
      </ButtonBase>
      <Typography sx={{ px: 2, py: 1, fontSize: 12, color: tokens.textSecondary, bgcolor: tokens.surfaceSubtle }}>
        {caption}
      </Typography>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="lg" fullWidth aria-labelledby="package-photo-title">
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, gap: 1 }}>
          <Typography id="package-photo-title" component="h2" sx={{ flex: 1, fontWeight: 600, fontSize: 16 }}>
            {pkg?.name} · {sample ? 'Sample setup' : 'Package setup'}
          </Typography>
          <IconButton aria-label="Close photo" onClick={() => setOpen(false)}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        <Box
          component="img"
          src={src || undefined}
          alt={alt}
          sx={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', bgcolor: tokens.surfaceSubtle }}
        />
      </Dialog>
    </Box>
  );
}

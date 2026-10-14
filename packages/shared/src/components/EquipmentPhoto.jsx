import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { sampleEquipmentPhoto } from '../domain/equipmentPhotos.js';
import { adminInventoryPhotoUrl, inventoryPhotoUrl } from '../services/remote/inventory.js';

/** One appearance photo per item type; stock and rental quantities never affect the image. */
export function EquipmentPhoto({ item, file, removePhoto = false, admin = false, compact = false, height = 220 }) {
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
    } else if (admin && item?.photoVersion && !removePhoto) {
      adminInventoryPhotoUrl(item)
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
  }, [file, admin, item?.id, item?.photoVersion, removePhoto]);

  const saved = !removePhoto && item?.photoVersion;
  const loading = admin && saved && !file && !preview && !failed;
  const sample = failed || (!file && !saved);
  const src = sample ? sampleEquipmentPhoto(item) : preview || (!admin && inventoryPhotoUrl(item));
  const label = loading
    ? 'Loading photo…'
    : !src
      ? 'Photo coming soon'
      : file
        ? 'New photo preview'
        : 'Equipment photo';
  const alt = `${item?.name || 'Equipment'} · ${label}`;
  return (
    <Box sx={{ minWidth: 0 }}>
      <ButtonBase
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        disabled={!src || loading}
        aria-label={`View photo of ${item?.name || 'equipment'}`}
        sx={{
          display: 'block',
          width: '100%',
          height,
          borderRadius: 1.5,
          position: 'relative',
          bgcolor: '#f3f0e9',
          overflow: 'hidden'
        }}
      >
        {src && (
          <Box
            component="img"
            src={src}
            alt={alt}
            loading="lazy"
            onError={() => setFailed(true)}
            sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        )}
        {!src && <Typography sx={{ fontSize: 11, color: '#665e51', p: 1 }}>{label}</Typography>}
      </ButtonBase>
      {!compact && (loading || file) && (
        <Typography sx={{ mt: 0.75, fontSize: 12, color: '#665e51' }}>
          {label}
          {file ? ' · Save changes to publish' : ''}
        </Typography>
      )}
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          maxWidth="md"
          fullWidth
          aria-labelledby="equipment-photo-title"
          onClick={(e) => e.stopPropagation()}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, gap: 1 }}>
            <Typography id="equipment-photo-title" component="h2" sx={{ flex: 1, fontWeight: 600, fontSize: 16 }}>
              {item?.name}
            </Typography>
            <IconButton aria-label="Close photo" onClick={() => setOpen(false)}>
              <CloseRoundedIcon />
            </IconButton>
          </Box>
          <Box
            component="img"
            src={src || undefined}
            alt={alt}
            sx={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', bgcolor: '#f3f0e9' }}
          />
          <Typography sx={{ px: 2, py: 1.5, fontSize: 12, color: '#665e51' }}>
            Your rental quantity is selected separately.
          </Typography>
        </Dialog>
      )}
    </Box>
  );
}

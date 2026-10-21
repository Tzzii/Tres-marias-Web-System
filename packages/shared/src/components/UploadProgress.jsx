import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { subscribeUploads } from '../services/upload.js';
import { tokens } from '../theme/tokens.js';

export function UploadProgress() {
  const [uploads, setUploads] = useState([]);
  useEffect(() => subscribeUploads(setUploads), []);
  if (!uploads.length) return null;
  const total = uploads.reduce((sum, upload) => sum + upload.total, 0);
  const loaded = uploads.reduce((sum, upload) => sum + upload.loaded, 0);
  const known = total > 0 && uploads.every((upload) => upload.total > 0);
  const percent = known ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'fixed',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(340px, calc(100vw - 32px))',
        zIndex: 1600,
        bgcolor: tokens.cardLight,
        color: tokens.textPrimary,
        border: `1px solid ${tokens.cardLightBorder}`,
        borderRadius: 2,
        p: 1.5,
        boxShadow: tokens.shadowDash
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1 }}>
        {known && percent >= 100 ? 'Upload received. Saving…' : `Uploading${known ? ` · ${percent}%` : '…'}`}
      </Typography>
      <LinearProgress
        aria-label="File upload progress"
        variant={known && percent < 100 ? 'determinate' : 'indeterminate'}
        value={percent}
      />
    </Box>
  );
}

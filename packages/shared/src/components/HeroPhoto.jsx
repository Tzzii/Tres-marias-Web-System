import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import defaultHeroPhoto from '../assets/hero/catering-garden.webp';
import { heroPhotoUrl } from '../services/remote/appearance.js';

/** Same image and crop for the public hero and the admin's draft preview. */
export function HeroPhoto({ settings, file, restore = false, ...props }) {
  const [preview, setPreview] = useState(null);
  const [failedSource, setFailedSource] = useState(null);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const source = (file && preview) || (!restore && heroPhotoUrl(settings)) || defaultHeroPhoto;
  return (
    <Box
      component="img"
      src={failedSource === source ? defaultHeroPhoto : source}
      alt="Catering event setup"
      width={1536}
      height={1024}
      onError={() => setFailedSource(source)}
      sx={{
        display: 'block',
        width: '100%',
        height: 'auto',
        aspectRatio: { xs: '3 / 2', md: '6 / 5' },
        objectFit: 'cover',
        objectPosition: '58% center'
      }}
      {...props}
    />
  );
}

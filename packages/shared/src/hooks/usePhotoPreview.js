import { useEffect, useRef, useState } from 'react';

/** Shared lifecycle for local uploads and authenticated photo blobs. */
export function usePhotoPreview({ record, file, admin, removePhoto, loadPhoto }) {
  const [preview, setPreview] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const current = useRef(record);
  current.current = record;

  useEffect(() => {
    let active = true;
    let objectUrl;
    setPreview(null);
    setFailed(false);
    setOpen(false);
    if (file) {
      objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
    } else if (admin && record?.photoVersion && !removePhoto) {
      loadPhoto(current.current)
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
  }, [file, admin, record?.id, record?.slug, record?.photoVersion, removePhoto, loadPhoto]);

  return { preview, failed, setFailed, open, setOpen };
}

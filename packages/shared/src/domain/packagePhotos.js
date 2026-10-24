// Shared sample photos keep landing cards, detail pages and admin previews consistent.
const samples = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/package-photos/*.webp', { eager: true, import: 'default' })).map(
    ([file, url]) => [file.split('/').pop().replace('.webp', ''), url]
  )
);
const thumbnails = Object.fromEntries(
  Object.entries(
    import.meta.glob('../assets/package-photos/thumbnails/*.webp', { eager: true, import: 'default' })
  ).map(([file, url]) => [file.split('/').pop().replace('.webp', ''), url])
);

export function samplePackagePhoto(pkg, { thumbnail = false } = {}) {
  const slug = pkg?.slug || '';
  const photos = thumbnail ? thumbnails : samples;
  return (
    photos[slug] ||
    photos[slug.replace(/-full-service$/, '')] ||
    (pkg?.kind === 'rental' ? photos['equipment-rental'] : photos.petite)
  );
}

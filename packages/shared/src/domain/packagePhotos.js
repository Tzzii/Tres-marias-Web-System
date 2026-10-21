// Shared sample photos keep landing cards, detail pages and admin previews consistent.
const samples = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/package-photos/*.png', { eager: true, import: 'default' })).map(
    ([file, url]) => [file.split('/').pop().replace('.png', ''), url]
  )
);

export function samplePackagePhoto(pkg) {
  const slug = pkg?.slug || '';
  return (
    samples[slug] ||
    samples[slug.replace(/-full-service$/, '')] ||
    (pkg?.kind === 'rental' ? samples['equipment-rental'] : samples.petite)
  );
}

// Stable inventory codes keep each mock matched to its item even after an admin renames it.
const samples = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/equipment-photos/*.webp', { eager: true, import: 'default' })).map(
    ([file, url]) => [file.split('/').pop().replace('.webp', ''), url]
  )
);

export function sampleEquipmentPhoto(item) {
  return samples[String(item?.code || '').toLowerCase()] || null;
}

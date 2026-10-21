import { EVENT_STORIES } from '../content/eventStories.js';

const PHOTOS = import.meta.glob('../assets/gallery/*/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', {
  eager: true,
  import: 'default'
});
const THUMBS = import.meta.glob('../assets/gallery/*/thumbs/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', {
  eager: true,
  import: 'default'
});

const EVENTS = [
  ['wedding', 'Wedding'],
  ['debut', 'Debut'],
  ['corporate', 'Corporate'],
  ['anniversary', 'Anniversary'],
  ['christening', 'Christenings'],
  ['birthday', 'Birthdays']
];

const baseName = (file) => file.replace(/\.[^.]+$/, '');

const thumbByName = {};
for (const [path, url] of Object.entries(THUMBS)) {
  const [folder, , file] = path.split('/').slice(-3);
  thumbByName[`${folder}/${baseName(file)}`] = url;
}

const photosByFolder = {};
for (const [path, src] of Object.entries(PHOTOS)) {
  const [folder, file] = path.split('/').slice(-2);
  if (!photosByFolder[folder]) photosByFolder[folder] = [];
  photosByFolder[folder].push({ file, src, thumb: thumbByName[`${folder}/${baseName(file)}`] || src });
}

export const GALLERY = EVENTS.map(([key, label]) => ({
  key,
  label,
  story: EVENT_STORIES[key] || null,
  photos: (photosByFolder[key] || []).sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true }))
})).filter((event) => event.photos.length > 0);

export const photoCount = (count) => `${count} photo${count === 1 ? '' : 's'}`;

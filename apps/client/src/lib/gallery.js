/**
 * Event photos for the Gallery section of the home page.
 *
 * Each event has its own folder in src/assets/gallery (wedding, debut, corporate, anniversary,
 * christening, birthday). Vite finds every photo in those folders when the site is built, and the dev
 * server picks up new ones by itself, so adding a photo only means putting it in the right folder.
 * Photos are shown in file-name order and the first one is the cover of the event's box.
 * A smaller copy with the same name in the folder's `thumbs` subfolder is used for the box and the
 * pop-up grid; a photo without one uses its full-size file there too.
 * See src/assets/gallery/README.md.
 */

// Every photo and every small copy, as { '../assets/gallery/wedding/wedding-01.jpg': url, ... }.
// Upper-case extensions are listed too because phones often save photos as .JPG.
const PHOTOS = import.meta.glob('../assets/gallery/*/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', { eager: true, import: 'default' });
const THUMBS = import.meta.glob('../assets/gallery/*/thumbs/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}', { eager: true, import: 'default' });

// The gallery boxes in the order they appear, as [folder name, label]
const EVENTS = [
  ['wedding', 'Wedding'],
  ['debut', 'Debut'],
  ['corporate', 'Corporate'],
  ['anniversary', 'Anniversary'],
  ['christening', 'Christenings'],
  ['birthday', 'Birthdays']
];

// File name without its extension ("wedding-01.jpg" -> "wedding-01")
const baseName = (file) => file.replace(/\.[^.]+$/, '');

// Small copies by folder and name without extension (e.g. "wedding/wedding-01"), so a .png photo
// still finds its .jpg copy
const thumbByName = {};
for (const [path, url] of Object.entries(THUMBS)) {
  const [folder, , file] = path.split('/').slice(-3);
  thumbByName[`${folder}/${baseName(file)}`] = url;
}

// Photos grouped by event folder: { wedding: [{ file, src, thumb }, ...], ... }
const photosByFolder = {};
for (const [path, src] of Object.entries(PHOTOS)) {
  const [folder, file] = path.split('/').slice(-2);
  if (!photosByFolder[folder]) photosByFolder[folder] = [];
  photosByFolder[folder].push({ file, src, thumb: thumbByName[`${folder}/${baseName(file)}`] || src });
}

/**
 * The events that have at least one photo, in box order, each as { key, label, photos }.
 * `photos` is [{ file, src, thumb }]: src is the full-size photo, thumb the small copy (or src again).
 * Photos follow their file names, with numbers compared as numbers ("wedding-2" before "wedding-10").
 * An event whose folder is empty (anniversary for now) is left out, so its box only shows once it has photos.
 */
export const GALLERY = EVENTS.map(([key, label]) => ({
  key,
  label,
  photos: (photosByFolder[key] || []).sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true }))
})).filter((event) => event.photos.length > 0);

/** "26 photos", or "1 photo". */
export const photoCount = (count) => `${count} photo${count === 1 ? '' : 's'}`;

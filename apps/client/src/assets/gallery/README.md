# Gallery photos

Photos for the **Gallery** section of the home page. Each folder is one box on the website:

| Folder        | Box          |
| ------------- | ------------ |
| `wedding`     | Wedding      |
| `debut`       | Debut        |
| `corporate`   | Corporate    |
| `anniversary` | Anniversary  |
| `christening` | Christenings |
| `birthday`    | Birthdays    |

Clicking a box opens a pop-up with all the photos in its folder.

## Adding a photo

1. Put it in its event's folder as `.jpg`, `.png` or `.webp`. iPhone `.heic` photos must be converted to
   JPG first, because browsers cannot show them.
2. Name it after the folder with the next number, e.g. `wedding-27.jpg`. Photos are shown in file-name order.
3. The dev server shows it right away. The live website needs a new build (`npm run build:client`).

- The first photo (`-01`) is the cover of the box. To change the cover, swap the numbers.
- A box only shows when its folder has at least one photo, so Anniversary stays hidden until then.
- Landscape photos look best. Keep each one under about 2048 px and 500 KB.
- Only put photos here that may be shown on the public website.

## Small copies (`thumbs/`)

A folder can have a `thumbs` subfolder with smaller copies (about 800 px wide, same file name). The box and
the pop-up grid load those instead of the full photo, so the page stays fast on phones; the full photo opens
when a photo is clicked. A photo without a small copy still works, it just uses the full-size file. Photos
that are already small (under about 80 KB) do not need one.

When you remove or rename a photo, do the same to its copy in `thumbs/`.

## Where the code is

- `src/lib/gallery.js` reads these folders.
- `src/components/GalleryDialog.jsx` is the pop-up.
- The boxes are in `src/pages/public/HomePage.jsx` (Gallery section).

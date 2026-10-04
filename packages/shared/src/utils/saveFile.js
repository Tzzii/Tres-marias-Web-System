/**
 * Saving a file the user asked for (the TXT exports and the Save PDF buttons), with the computer's own
 * "Save as" window where the browser allows it, so the user picks the folder and the file name
 * (the owner's request, 2026-10-03).
 *
 * - Chrome, Edge, Opera, Brave and the other Chromium browsers on Windows, macOS, Linux and ChromeOS let a
 *   website open that window (window.showSaveFilePicker, the File System Access API).
 * - Firefox, Safari and the browsers on phones and tablets do not let any website open it. There the file
 *   downloads the usual way: into the Downloads folder, or the browser asks where to save it when its own
 *   "Always ask where to save files" setting is on; an iPhone or iPad shows its Files sheet. The buttons work
 *   everywhere; only the folder window depends on the browser.
 *
 * A browser only opens the window straight after a click. So a file that takes a while to make (a PDF)
 * asks first (askWhereToSave), is made, and is then written (writeTo); a file that is ready at once uses
 * saveFile, which does both.
 */

// The file types the window offers, by extension; the window remembers the last folder per `id`
const TYPES = {
  txt: { description: 'Text file', accept: { 'text/plain': ['.txt'] } },
  pdf: { description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }
};
const PICKER_ID = 'tres-marias-files';

/** True when this browser can open the "Save as" window (and the page is not inside another site's frame). */
export const canAskWhereToSave = () => typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function' && window.self === window.top;

/**
 * Step 1, straight after the click: open the "Save as" window with `fileName` filled in.
 * Returns where to save: { fileName, handle } when the user picked a place; { fileName, handle: null } when
 * this browser has no such window (or it failed), so the file downloads the usual way; or null when the
 * user pressed Cancel, and nothing is saved.
 */
export async function askWhereToSave(fileName) {
  if (!canAskWhereToSave()) return { fileName, handle: null };
  const ext = String(fileName).split('.').pop().toLowerCase();
  try {
    const handle = await window.showSaveFilePicker({ suggestedName: fileName, id: PICKER_ID, ...(TYPES[ext] ? { types: [TYPES[ext]] } : {}) });
    return { fileName, handle };
  } catch (err) {
    if (err && err.name === 'AbortError') return null; // Cancel
    return { fileName, handle: null }; // e.g. blocked by the browser: download it the usual way instead
  }
}

/** Step 2: write `blob` where askWhereToSave said: into the picked file, or as a usual download. */
export async function writeTo(target, blob) {
  if (target.handle) {
    const writable = await target.handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  // A temporary link to the file, clicked to download it, then removed; the file is freed once the download started
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = target.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save a file that is ready now (e.g. a TXT export): ask where, then write it. Resolves to true when it was
 * saved or downloaded, false when the user pressed Cancel (say nothing then).
 */
export async function saveFile(fileName, blob) {
  const target = await askWhereToSave(fileName);
  if (!target) return false;
  await writeTo(target, blob);
  return true;
}

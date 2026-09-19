/**
 * Reservation references: RES-<year>-<month><day of the EVENT>-<number for that event date>.
 * e.g. the first reservation for an event on 20 Oct 2026 is "RES-2026-1020-01", the second "RES-2026-1020-02".
 *
 * Used by both the Customer Portal and the Admin Dashboard (through @tm/shared), so the format is the same everywhere.
 * The number continues after the highest one already used for that date (declined and cancelled reservations
 * included), so a reference is never given out twice. A reference never changes after it is created: if the
 * admin later moves the event to another date, it keeps its original reference so payments, messages,
 * documents and inventory check-outs stay linked to it.
 */
export function makeReservationRef(eventDate, existingRefs) {
  const [year, month, dayOfMonth] = eventDate.split('-'); // eventDate is "YYYY-MM-DD"
  const prefix = `RES-${year}-${month}${dayOfMonth}-`;
  const used = existingRefs.filter((ref) => ref.startsWith(prefix)).map((ref) => Number(ref.slice(prefix.length)) || 0);
  const next = used.length ? Math.max(...used) + 1 : 1;
  return `${prefix}${String(next).padStart(2, '0')}`;
}

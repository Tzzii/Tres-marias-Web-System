import { formatDate, peso } from '../utils/format.js';

const searchText = (values) =>
  values
    .filter((value) => value !== null && value !== undefined)
    .join(' ')
    .toLowerCase();

// Build searchable text once per data load. Format display fields only for visible matches.
export function buildPortalSearchIndex(
  { reservations, payments, customers, inventory, packages },
  { admin = false } = {}
) {
  const prefix = admin ? '' : '/portal';
  return [
    ...reservations.map((r) => ({
      key: `reservation-${r.ref}`,
      group: 'Reservations',
      search: searchText([r.ref, r.eventName, r.customerName, r.customerEmail, r.packageName, r.date, r.venue?.city]),
      record: r,
      to: `${prefix}/reservations/${encodeURIComponent(r.ref)}`
    })),
    ...payments.map((p) => ({
      key: `payment-${p.id}`,
      group: 'Payments',
      search: searchText([p.ref, p.customerName, p.eventName, p.receiptNo, p.referenceNo, p.amount, p.status]),
      record: p,
      to: admin ? `/payments?verify=${encodeURIComponent(p.id)}` : `/portal/payments?ref=${encodeURIComponent(p.ref)}`
    })),
    ...customers.map((c) => ({
      key: `customer-${c.id}`,
      group: 'Customers',
      search: searchText([c.name, c.email, c.mobile]),
      record: c,
      to: `/customers?open=${encodeURIComponent(c.id)}`
    })),
    ...inventory.map((i) => ({
      key: `equipment-${i.id}`,
      group: 'Equipment',
      search: searchText([i.name, i.category, i.id]),
      record: i,
      to: `/inventory?q=${encodeURIComponent(i.name)}`
    })),
    ...packages.map((p) => ({
      key: `package-${p.slug}`,
      group: 'Packages',
      search: searchText([p.name, p.description]),
      record: p,
      to: admin ? '/packages' : `/packages/${p.slug}`
    }))
  ];
}

function displayRecord(item) {
  const r = item.record;
  switch (item.group) {
    case 'Reservations':
      return { ...item, title: r.eventName, subtitle: `${r.ref} · ${r.customerName} · ${formatDate(r.date)}` };
    case 'Payments':
      return {
        ...item,
        title: `${peso(r.amount)} · ${r.eventName}`,
        subtitle: [r.ref, r.receiptNo || r.referenceNo, r.methodLabel, r.status].filter(Boolean).join(' · ')
      };
    case 'Customers':
      return { ...item, title: r.name, subtitle: r.email };
    case 'Equipment':
      return { ...item, title: r.name, subtitle: `${r.available} available · ${r.category}` };
    default:
      return { ...item, title: r.name, subtitle: r.description };
  }
}

export function searchPortalRecords(index, query, limit = 12) {
  const words = String(query || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const groups = new Map();
  let total = 0;
  if (!words.length) return { total, groups: [] };
  for (const item of index) {
    if (!words.every((word) => item.search.includes(word))) continue;
    total += 1;
    if (!groups.has(item.group)) groups.set(item.group, { name: item.group, total: 0, items: [] });
    const group = groups.get(item.group);
    group.total += 1;
    if (group.items.length < limit) group.items.push(displayRecord(item));
  }
  return { total, groups: [...groups.values()] };
}

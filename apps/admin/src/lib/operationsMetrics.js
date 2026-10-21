const manilaDate = (stamp) => {
  if (!stamp) return '';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
};

export function operationsMetrics({ reservations = [], payments = [], refunds = [] }, today) {
  const currentMonth = today.slice(0, 7);
  const previous = new Date(`${currentMonth}-01T12:00:00+08:00`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const priorMonth = previous.toISOString().slice(0, 7);
  const day = Number(today.slice(8));
  const inPeriod = (date, month) => date.startsWith(month) && Number(date.slice(8)) <= day;
  const collections = (month) =>
    payments
      .filter((p) => p.status === 'verified' && inPeriod(manilaDate(p.verifiedAt), month))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0) -
    refunds.filter((r) => inPeriod(r.sentOn || '', month)).reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const active = reservations.filter((r) =>
    ['approved', 'downpayment_paid', 'confirmed', 'completed'].includes(r.status)
  );
  return {
    net: collections(currentMonth),
    before: collections(priorMonth),
    bookingValue: active
      .filter((r) => r.date.startsWith(currentMonth))
      .reduce((sum, r) => sum + Number(r.total || 0), 0),
    outstanding: active
      .filter((r) => r.status !== 'completed')
      .reduce((sum, r) => sum + Math.max(0, Number(r.balance || 0)), 0)
  };
}

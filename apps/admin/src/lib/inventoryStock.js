const quantityOut = (item, ref) => (item.out.find((entry) => entry.ref === ref) || { qty: 0 }).qty;

export function stockQuantityLimit(action, item, values, field) {
  if (action === 'return') {
    const otherQuantity = Number(field === 'qty' ? values.damagedQty : values.qty) || 0;
    return Math.max(0, quantityOut(item, values.ref) - otherQuantity);
  }
  return action === 'repair' || action === 'dispose' ? item.damaged : item.available;
}

export function changeStockValues(values, field, value, action, item) {
  const next = { ...values, [field]: value };
  if (action === 'return' && field === 'ref') {
    next.qty = String(quantityOut(item, value));
    next.damagedQty = '0';
  }
  if (field === 'qty' || field === 'damagedQty') {
    const limit = stockQuantityLimit(action, item, next, field);
    if (value !== '' && Number(value) > limit) next[field] = String(limit);
  }
  return next;
}

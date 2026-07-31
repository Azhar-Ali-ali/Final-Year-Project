function normalizeDateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) {
    const normalized = new Date(value);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

function isDiscountActive({ discountPercent = 0, discountStartDate, discountEndDate, now = new Date() } = {}) {
  if (Number(discountPercent) <= 0) {
    return false;
  }

  const current = normalizeDateOnly(now);
  if (!current) {
    return false;
  }

  const start = normalizeDateOnly(discountStartDate);
  const end = normalizeDateOnly(discountEndDate);

  if (start && current < start) {
    return false;
  }

  if (end && current > end) {
    return false;
  }

  return true;
}

module.exports = {
  isDiscountActive
};

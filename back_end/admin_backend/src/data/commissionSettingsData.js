async function ensureCommissionTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.marketplace_commission_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10,
      currency VARCHAR(10) NOT NULL DEFAULT 'PKR',
      status VARCHAR(20) NOT NULL DEFAULT 'Active',
      apply_to_future_orders BOOLEAN NOT NULL DEFAULT TRUE,
      updated_by TEXT,
      updated_by_name TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.marketplace_commission_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      previous_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      new_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
      previous_currency VARCHAR(10),
      new_currency VARCHAR(10),
      status VARCHAR(20) NOT NULL DEFAULT 'Active',
      reason TEXT,
      updated_by TEXT,
      updated_by_name TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query("ALTER TABLE public.marketplace_commission_settings ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'PKR'");
  await db.query("ALTER TABLE public.marketplace_commission_history ADD COLUMN IF NOT EXISTS previous_currency VARCHAR(10)");
  await db.query("ALTER TABLE public.marketplace_commission_history ADD COLUMN IF NOT EXISTS new_currency VARCHAR(10)");

  const existing = await db.query(
    `SELECT id FROM public.marketplace_commission_settings LIMIT 1`
  );

  if (!existing.rows.length) {
    await db.query(
      `INSERT INTO public.marketplace_commission_settings (commission_rate, status, apply_to_future_orders, updated_at)
       VALUES ($1, $2, $3, NOW())`,
      [10.0, 'Active', true]
    );
  }
}

function normalizeCommissionRate(value) {
  const rate = Number(value);
  if (Number.isFinite(rate) && rate >= 0 && rate <= 100) {
    return Number(rate.toFixed(2));
  }
  return 10.0;
}

async function getCommissionSettings(db) {
  await ensureCommissionTables(db);
  const result = await db.query(
    `SELECT id, commission_rate, currency, status, apply_to_future_orders, updated_by, updated_by_name, updated_at
     FROM public.marketplace_commission_settings
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  const row = result.rows[0] || {
    commission_rate: 10.0,
    currency: 'PKR',
    status: 'Active',
    apply_to_future_orders: true,
    updated_by: null,
    updated_by_name: null,
    updated_at: null
  };

  return {
    id: row.id || null,
    commissionRate: Number(row.commission_rate || 10.0),
    currency: String(row.currency || 'PKR'),
    applyToFutureOrders: Boolean(row.apply_to_future_orders),
    updatedBy: row.updated_by || null,
    updatedByName: row.updated_by_name || null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

async function getCommissionHistory(db, limit = 10) {
  await ensureCommissionTables(db);
  const result = await db.query(
    `SELECT id, previous_rate, new_rate, previous_currency, new_currency, status, reason, updated_by, updated_by_name, created_at
     FROM public.marketplace_commission_history
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(parseInt(limit, 10) || 10, 100))]
  );

  return result.rows.map((row) => ({
    id: row.id,
    previousRate: Number(row.previous_rate || 0),
    newRate: Number(row.new_rate || 0),
    previousCurrency: row.previous_currency || null,
    newCurrency: row.new_currency || null,
    reason: row.reason || '',
    updatedBy: row.updated_by || null,
    updatedByName: row.updated_by_name || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  }));
}

async function updateCommissionSettings(db, payload = {}, updatedBy = null, updatedByName = null) {
  await ensureCommissionTables(db);

  const current = await getCommissionSettings(db);
  const commissionRate = normalizeCommissionRate(payload.commissionRate !== undefined ? payload.commissionRate : current.commissionRate);
  const currency = String(payload.currency || current.currency || 'PKR').trim() || 'PKR';
  const status = payload.status === 'Inactive' ? 'Inactive' : 'Active';
  const applyToFutureOrders = payload.applyToFutureOrders !== undefined ? Boolean(payload.applyToFutureOrders) : current.applyToFutureOrders;
  const reason = String(payload.reason || '').trim() || 'Marketplace commission update';

  await db.query(
    `UPDATE public.marketplace_commission_settings
     SET commission_rate = $1,
         currency = $2,
         status = $3,
         apply_to_future_orders = $4,
         updated_by = $5,
         updated_by_name = $6,
         updated_at = NOW()
     WHERE id = $7`,
    [commissionRate, currency, status, applyToFutureOrders, updatedBy || null, updatedByName || null, current.id]
  );

  if (current.commissionRate !== commissionRate || current.status !== status || current.applyToFutureOrders !== applyToFutureOrders || String(current.currency || '') !== String(currency || '')) {
    await db.query(
      `INSERT INTO public.marketplace_commission_history (
          previous_rate,
          new_rate,
          previous_currency,
          new_currency,
          status,
          reason,
          updated_by,
          updated_by_name,
          created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [current.commissionRate, commissionRate, current.currency || null, currency || null, status, reason, updatedBy || null, updatedByName || null]
    );
  }

  return getCommissionSettings(db);
}

module.exports = {
  getCommissionSettings,
  getCommissionHistory,
  updateCommissionSettings,
  ensureCommissionTables
};

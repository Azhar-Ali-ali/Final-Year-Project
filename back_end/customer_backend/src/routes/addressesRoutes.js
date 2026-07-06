const express = require('express');

const router = express.Router();

function getCustomerId(req) {
  const raw = req.auth?.session?.userId || req.headers['x-user-id'] || '';
  return String(raw || '').trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

async function resolveCustomerId(req, requestedId) {
  const sessionCustomerId = getCustomerId(req);
  if (isUuid(sessionCustomerId)) return sessionCustomerId;
  return null;
}

function mapAddressRow(row) {
  return {
    id: row.id,
    label: row.label,
    fullName: row.receiver_name,
    phoneNumber: row.phone,
    streetAddress: row.line1,
    apartmentSuite: row.line2,
    city: row.city,
    stateProvince: row.state,
    postalCode: row.postal_code,
    country: row.country,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function validateAddressPayload(payload) {
  const errors = [];

  if (!String(payload.fullName || '').trim()) errors.push('fullName is required');
  if (!String(payload.phoneNumber || '').trim()) errors.push('phoneNumber is required');
  if (!String(payload.streetAddress || '').trim()) errors.push('streetAddress is required');
  if (!String(payload.city || '').trim()) errors.push('city is required');
  if (!String(payload.stateProvince || '').trim()) errors.push('stateProvince is required');
  if (!String(payload.postalCode || '').trim()) errors.push('postalCode is required');
  if (!String(payload.country || '').trim()) errors.push('country is required');

  return errors;
}

router.get('/summary', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sql = `
      SELECT
        COUNT(*)::int AS "savedCount",
        COALESCE(MAX(city) FILTER (WHERE is_default = TRUE), '-') AS "defaultCity",
        CASE
          WHEN COUNT(*) = 0 THEN 'Add Address'
          WHEN COUNT(*) FILTER (WHERE is_default = TRUE) = 0 THEN 'Select Default'
          ELSE 'Ready'
        END AS "checkoutStatus"
      FROM public.user_addresses
      WHERE user_id = $1
    `;

    const result = await req.db.query(sql, [customerId]);
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch address summary', error: error.message });
  }
});

router.get('/', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const sql = `
      SELECT *
      FROM public.user_addresses
      WHERE user_id = $1
      ORDER BY is_default DESC, updated_at DESC, created_at DESC
    `;

    const result = await req.db.query(sql, [customerId]);
    return res.json({ success: true, data: result.rows.map(mapAddressRow) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch addresses', error: error.message });
  }
});

router.post('/', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const payload = req.body || {};
  const errors = validateAddressPayload(payload);

  if (errors.length) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await req.db.query('BEGIN');

    const isDefault = Boolean(payload.isDefault);
    if (isDefault) {
      await req.db.query('UPDATE public.user_addresses SET is_default = FALSE WHERE user_id = $1', [customerId]);
    }

    const hasExisting = await req.db.query(
      'SELECT COUNT(*)::int AS total FROM public.user_addresses WHERE user_id = $1',
      [customerId]
    );
    const shouldDefault = isDefault || Number(hasExisting.rows[0].total) === 0;

    const insertSql = `
      INSERT INTO public.user_addresses (
        user_id, label, receiver_name, phone, country, state, city, postal_code, line1, line2, is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const result = await req.db.query(insertSql, [
      customerId,
      String(payload.label || 'home').trim().toLowerCase() || 'home',
      String(payload.fullName).trim(),
      String(payload.phoneNumber).trim(),
      String(payload.country).trim(),
      String(payload.stateProvince).trim(),
      String(payload.city).trim(),
      String(payload.postalCode).trim(),
      String(payload.streetAddress).trim(),
      String(payload.apartmentSuite || '').trim() || null,
      shouldDefault
    ]);

    await req.db.query('COMMIT');
    return res.status(201).json({ success: true, message: 'Address added successfully', data: mapAddressRow(result.rows[0]) });
  } catch (error) {
    try { await req.db.query('ROLLBACK'); } catch (_) {}
    return res.status(500).json({ success: false, message: 'Failed to create address', error: error.message });
  }
});

router.put('/:addressId', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const addressId = String(req.params.addressId || '').trim();
  const payload = req.body || {};

  if (!addressId) {
    return res.status(400).json({ success: false, message: 'Invalid address id' });
  }

  const errors = validateAddressPayload(payload);
  if (errors.length) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await req.db.query('BEGIN');

    const currentResult = await req.db.query(
      'SELECT * FROM public.user_addresses WHERE user_id = $1 AND id = $2 LIMIT 1',
      [customerId, addressId]
    );

    if (!currentResult.rows.length) {
      await req.db.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    const isDefault = Boolean(payload.isDefault);
    if (isDefault) {
      await req.db.query('UPDATE public.user_addresses SET is_default = FALSE WHERE user_id = $1 AND id <> $2', [customerId, addressId]);
    }

    const updateSql = `
      UPDATE public.user_addresses
      SET
        label = $3,
        receiver_name = $4,
        phone = $5,
        country = $6,
        state = $7,
        city = $8,
        postal_code = $9,
        line1 = $10,
        line2 = $11,
        is_default = $12,
        updated_at = NOW()
      WHERE user_id = $1 AND id = $2
      RETURNING *
    `;

    const result = await req.db.query(updateSql, [
      customerId,
      addressId,
      String(payload.label || currentResult.rows[0].label || 'home').trim().toLowerCase() || 'home',
      String(payload.fullName).trim(),
      String(payload.phoneNumber).trim(),
      String(payload.country).trim(),
      String(payload.stateProvince).trim(),
      String(payload.city).trim(),
      String(payload.postalCode).trim(),
      String(payload.streetAddress).trim(),
      String(payload.apartmentSuite || '').trim() || null,
      isDefault
    ]);

    if (!isDefault) {
      const anyDefault = await req.db.query(
        'SELECT id FROM public.user_addresses WHERE user_id = $1 AND is_default = TRUE LIMIT 1',
        [customerId]
      );

      if (!anyDefault.rows.length) {
        await req.db.query(
          'UPDATE public.user_addresses SET is_default = TRUE WHERE id = $1',
          [addressId]
        );
        result.rows[0].is_default = true;
      }
    }

    await req.db.query('COMMIT');
    return res.json({ success: true, message: 'Address updated successfully', data: mapAddressRow(result.rows[0]) });
  } catch (error) {
    try { await req.db.query('ROLLBACK'); } catch (_) {}
    return res.status(500).json({ success: false, message: 'Failed to update address', error: error.message });
  }
});

router.patch('/:addressId/default', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const addressId = String(req.params.addressId || '').trim();

  if (!addressId) {
    return res.status(400).json({ success: false, message: 'Invalid address id' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await req.db.query('BEGIN');

    const exists = await req.db.query(
      'SELECT id FROM public.user_addresses WHERE user_id = $1 AND id = $2 LIMIT 1',
      [customerId, addressId]
    );

    if (!exists.rows.length) {
      await req.db.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    await req.db.query('UPDATE public.user_addresses SET is_default = FALSE WHERE user_id = $1', [customerId]);
    const result = await req.db.query(
      'UPDATE public.user_addresses SET is_default = TRUE, updated_at = NOW() WHERE user_id = $1 AND id = $2 RETURNING *',
      [customerId, addressId]
    );

    await req.db.query('COMMIT');
    return res.json({ success: true, message: 'Default address updated', data: mapAddressRow(result.rows[0]) });
  } catch (error) {
    try { await req.db.query('ROLLBACK'); } catch (_) {}
    return res.status(500).json({ success: false, message: 'Failed to set default address', error: error.message });
  }
});

router.delete('/:addressId', async (req, res) => {
  const requestedCustomerId = getCustomerId(req);
  const addressId = String(req.params.addressId || '').trim();

  if (!addressId) {
    return res.status(400).json({ success: false, message: 'Invalid address id' });
  }

  try {
    const customerId = await resolveCustomerId(req, requestedCustomerId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await req.db.query('BEGIN');

    const current = await req.db.query(
      'SELECT * FROM public.user_addresses WHERE user_id = $1 AND id = $2 LIMIT 1',
      [customerId, addressId]
    );

    if (!current.rows.length) {
      await req.db.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    const wasDefault = current.rows[0].is_default;

    await req.db.query('DELETE FROM public.user_addresses WHERE user_id = $1 AND id = $2', [customerId, addressId]);

    if (wasDefault) {
      const nextResult = await req.db.query(
        'SELECT id FROM public.user_addresses WHERE user_id = $1 ORDER BY updated_at DESC, created_at DESC LIMIT 1',
        [customerId]
      );

      if (nextResult.rows.length) {
        await req.db.query('UPDATE public.user_addresses SET is_default = TRUE WHERE id = $1', [nextResult.rows[0].id]);
      }
    }

    await req.db.query('COMMIT');
    return res.json({ success: true, message: 'Address deleted successfully' });
  } catch (error) {
    try { await req.db.query('ROLLBACK'); } catch (_) {}
    return res.status(500).json({ success: false, message: 'Failed to delete address', error: error.message });
  }
});

module.exports = router;

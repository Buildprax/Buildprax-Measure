/**
 * Shared PayPal Live/Sandbox API helpers for webhook + subscription sync.
 */
function paypalApiBase() {
  return process.env.PAYPAL_MODE === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

function formatPayPalReportingDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().replace(/\.\d{3}Z$/, '-0000');
}

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set');
  }
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`PayPal OAuth failed (${res.status}): ${body.error_description || body.message || 'unknown'}`);
  }
  return body.access_token;
}

async function fetchPayPalSubscription(accessToken, subscriptionId) {
  const res = await fetch(
    `${paypalApiBase()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, body };
  return { ok: true, body };
}

async function discoverRecentSubscriptionIds(accessToken, daysBack = 45) {
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const ids = new Set();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= 20) {
    const qs = new URLSearchParams({
      start_date: formatPayPalReportingDate(start),
      end_date: formatPayPalReportingDate(end),
      fields: 'transaction_info,payer_info',
      page_size: '100',
      page: String(page),
      transaction_status: 'S',
    });
    const res = await fetch(`${paypalApiBase()}/v1/reporting/transactions?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`PayPal transactions list failed (${res.status}): ${body.message || body.name || 'unknown'}`);
    }
    totalPages = Number(body.total_pages || 1);
    for (const row of body.transaction_details || []) {
      const info = row.transaction_info || {};
      const candidates = [info.paypal_reference_id, info.billing_agreement_id, info.transaction_subject];
      for (const c of candidates) {
        const t = String(c || '').trim();
        if (/^I-[A-Z0-9]+$/i.test(t)) ids.add(t.toUpperCase());
      }
    }
    page += 1;
  }
  return [...ids];
}

function readNextBillingTime(ppSub) {
  return (
    ppSub?.billing_info?.next_billing_time ||
    ppSub?.billing_info?.cycle_executions?.find((c) => c?.tenure_type === 'REGULAR')?.next_billing_time ||
    null
  );
}

function endOfUtcDay(date) {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 0);
  return d;
}

function parseIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

module.exports = {
  paypalApiBase,
  getPayPalAccessToken,
  fetchPayPalSubscription,
  discoverRecentSubscriptionIds,
  readNextBillingTime,
  endOfUtcDay,
  parseIsoDate,
};

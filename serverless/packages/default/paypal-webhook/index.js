/**
 * PayPal Webhook Handler for Automatic Subscription Renewals
 *
 * PayPal Developer → Webhooks must POST to (live):
 *   https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/paypal-webhook
 *
 * Subscribe at minimum: BILLING.SUBSCRIPTION.ACTIVATED, BILLING.SUBSCRIPTION.RENEWED,
 * PAYMENT.SALE.COMPLETED (recurring), BILLING.SUBSCRIPTION.CANCELLED.
 *
 * NOTE: Buildprax now uses account/subscription login entitlements.
 * License-key issuance is legacy and must not be used in customer messaging.
 */

const { Pool } = require('pg');

// Email configuration
const EMAIL_ENDPOINT = 'https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/send-email';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: process.env.PG_POOL_MAX ? Number(process.env.PG_POOL_MAX) : 1,
  idleTimeoutMillis: process.env.PG_IDLE_TIMEOUT_MS ? Number(process.env.PG_IDLE_TIMEOUT_MS) : 5000,
  connectionTimeoutMillis: process.env.PG_CONNECT_TIMEOUT_MS ? Number(process.env.PG_CONNECT_TIMEOUT_MS) : 2500,
  allowExitOnIdle: true,
});

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
}

function parseIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function readRenewalWindow(resource) {
  const nextBilling =
    resource?.billing_info?.next_billing_time ||
    resource?.billing_info?.cycle_executions?.find((c) => c?.tenure_type === 'REGULAR')?.next_billing_time ||
    resource?.billing_info?.next_billing_date ||
    resource?.current_period_end ||
    resource?.agreement_details?.next_billing_date ||
    null;
  const periodEnd = parseIsoDate(nextBilling);
  if (!periodEnd) return { periodStart: null, periodEnd: null, periodEndFromPayPal: false };

  const periodStartRaw =
    resource?.billing_info?.last_payment?.time ||
    resource?.billing_info?.last_payment?.amount?.time ||
    resource?.current_period_start ||
    resource?.create_time ||
    null;
  const periodStart = parseIsoDate(periodStartRaw) || null;
  return { periodStart, periodEnd, periodEndFromPayPal: true };
}

function addMonthsUtc(date, months) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function addYearsUtc(date, years) {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

function periodEndFromBillingCycle(baseDate, billingCycleCode) {
  const base = baseDate instanceof Date ? baseDate : new Date(baseDate);
  const code = String(billingCycleCode || 'monthly').toLowerCase();
  if (code === 'quarterly') return addMonthsUtc(base, 3);
  if (code === 'half_yearly' || code === 'half-yearly' || code === 'halfyearly') return addMonthsUtc(base, 6);
  if (code === 'yearly' || code === 'annual') return addYearsUtc(base, 1);
  return addMonthsUtc(base, 1);
}

function endOfUtcDay(date) {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 0);
  return d;
}

function pickPaymentTime(resource) {
  return (
    parseIsoDate(resource?.billing_info?.last_payment?.time) ||
    parseIsoDate(resource?.update_time) ||
    parseIsoDate(resource?.create_time) ||
    new Date()
  );
}

/**
 * When PayPal omits next_billing_time (common on PAYMENT.SALE.COMPLETED).
 * New period end = payment time + one billing cycle (matches PayPal "next payment due"),
 * NOT "existing DB period end + another cycle" (that double-extends).
 */
async function inferPeriodEndFromSubscription(client, subscriptionId, email, resource) {
  const r = await client.query(
    `select bc.code as billing_cycle
       from subscriptions s
       join subscription_plans sp on sp.id = s.plan_id
       join billing_cycles bc on bc.id = sp.billing_cycle_id
       left join app_users u on u.id = s.user_id
      where ($1::text is not null and lower(s.paypal_subscription_id::text) = lower($1::text))
         or ($2::text is not null and lower(u.email) = lower($2::text))
      order by s.updated_at desc
      limit 1`,
    [subscriptionId || null, email || null],
  );
  if (!r.rowCount) return null;
  const paymentTime = pickPaymentTime(resource);
  const periodEnd = periodEndFromBillingCycle(paymentTime, r.rows[0].billing_cycle);
  return endOfUtcDay(periodEnd);
}

function asText(value) {
  if (value == null) return '';
  return String(value).trim();
}

function collectValues(...values) {
  const out = [];
  for (const v of values) {
    const t = asText(v);
    if (t) out.push(t);
  }
  return out;
}

function pickBestSubscriptionId(webhookEvent) {
  const resource = webhookEvent?.resource || {};
  const raw = collectValues(
    resource?.billing_agreement_id,
    resource?.agreement_id,
    resource?.subscription_id,
    resource?.supplementary_data?.related_ids?.subscription_id,
    resource?.id,
    resource?.custom_id,
    resource?.invoice_id,
  );
  const iStyle = raw.find((v) => /^I-[A-Z0-9]+$/i.test(v));
  if (iStyle) return iStyle;
  return raw[0] || null;
}

function pickBestProviderEventId(webhookEvent) {
  const resource = webhookEvent?.resource || {};
  // PayPal's top-level event id (WH-…) is the stable idempotency key for retries.
  if (asText(webhookEvent?.id)) return asText(webhookEvent.id);
  return collectValues(
    resource?.id,
    resource?.sale_id,
    resource?.capture_id,
    resource?.supplementary_data?.related_ids?.order_id,
  )[0] || null;
}

function isTestWebhookEvent(providerEventId) {
  const id = asText(providerEventId).toUpperCase();
  return id.startsWith('WH-TEST') || id.startsWith('WH-LIVE-CHECK');
}

function isSubscriptionPaymentEvent(eventType, resource) {
  if (eventType === 'BILLING.SUBSCRIPTION.RENEWED' || eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') return true;
  if (eventType === 'BILLING.SUBSCRIPTION.PAYMENT.SUCCEEDED') return true;
  if (eventType === 'PAYMENT.SALE.COMPLETED' || eventType === 'PAYMENT.CAPTURE.COMPLETED') {
    return !!asText(
      resource?.billing_agreement_id ||
      resource?.agreement_id ||
      resource?.subscription_id ||
      resource?.supplementary_data?.related_ids?.subscription_id,
    );
  }
  return false;
}

function shouldSendSubscriptionEmail(eventType) {
  return (
    eventType === 'BILLING.SUBSCRIPTION.ACTIVATED' ||
    eventType === 'BILLING.SUBSCRIPTION.RENEWED' ||
    eventType === 'BILLING.SUBSCRIPTION.PAYMENT.SUCCEEDED' ||
    eventType === 'PAYMENT.SALE.COMPLETED' ||
    eventType === 'PAYMENT.CAPTURE.COMPLETED'
  );
}

async function getCurrentPeriodEnd(client, subscriptionId, email) {
  const r = await client.query(
    `select s.current_period_end
       from subscriptions s
       left join app_users u on u.id = s.user_id
      where ($1::text is not null and lower(s.paypal_subscription_id::text) = lower($1::text))
         or ($2::text is not null and lower(u.email) = lower($2::text))
      order by s.updated_at desc
      limit 1`,
    [subscriptionId || null, email || null],
  );
  if (!r.rowCount) return null;
  return parseIsoDate(r.rows[0].current_period_end);
}

/**
 * PayPal "next payment due" wins when present. Inferred dates must not shorten access
 * or stack on top of an already-future period end.
 */
function resolvePeriodEnd({ periodEnd, periodEndFromPayPal, existingPeriodEnd }) {
  let resolved = endOfUtcDay(periodEnd);
  if (periodEndFromPayPal) return resolved;
  if (existingPeriodEnd && existingPeriodEnd > resolved) {
    console.log(
      'Keeping existing period_end; inferred date would shorten access:',
      existingPeriodEnd.toISOString(),
      '>',
      resolved.toISOString(),
    );
    return endOfUtcDay(existingPeriodEnd);
  }
  return resolved;
}

async function markSubscriptionCancelled(client, subscriptionId, email) {
  const subCols = await tableColumns(client, 'subscriptions');
  if (!subCols.has('status')) return 0;
  let updated = 0;
  if (subscriptionId && subCols.has('paypal_subscription_id')) {
    const r = await client.query(
      `update subscriptions set status = 'cancelled', updated_at = now()
        where lower(paypal_subscription_id::text) = lower($1::text)`,
      [subscriptionId],
    );
    updated = r.rowCount || 0;
  }
  if (updated === 0 && email) {
    const r = await client.query(
      `update subscriptions s set status = 'cancelled', updated_at = now()
        from app_users u where s.user_id = u.id and lower(u.email) = lower($1)`,
      [email],
    );
    updated = r.rowCount || 0;
  }
  return updated;
}

async function tableColumns(client, tableName) {
  const r = await client.query(
    `select lower(column_name) as c
       from information_schema.columns
      where table_schema = 'public' and table_name = $1`,
    [String(tableName || '').toLowerCase()],
  );
  return new Set((r.rows || []).map((row) => String(row.c || '').toLowerCase()).filter(Boolean));
}

function pickColumn(cols, names) {
  for (const name of names) {
    if (cols.has(String(name).toLowerCase())) return name;
  }
  return null;
}

async function resolveUserIdByEmail(client, email) {
  const candidates = [
    { table: 'app_users', idCols: ['id', 'user_id'] },
    { table: 'users', idCols: ['id', 'user_id'] },
  ];
  for (const c of candidates) {
    const cols = await tableColumns(client, c.table);
    if (!cols.size || !cols.has('email')) continue;
    const idCol = pickColumn(cols, c.idCols);
    if (!idCol) continue;
    const r = await client.query(`select ${idCol} as id from ${c.table} where lower(email) = lower($1) limit 1`, [email]);
    if (r.rowCount) return r.rows[0].id;
  }
  return null;
}

async function resolveEmailBySubscriptionId(subscriptionId) {
  if (!subscriptionId) return null;
  const r = await pool.query(
    `select u.email
       from subscriptions s
       join app_users u on u.id = s.user_id
      where lower(s.paypal_subscription_id::text) = lower($1::text)
      order by s.updated_at desc
      limit 1`,
    [subscriptionId],
  );
  return r.rowCount ? r.rows[0].email : null;
}

async function resolvePlanIdByPayPalPlanId(client, paypalPlanId) {
  if (!paypalPlanId) return null;
  const r = await client.query(
    `select id
       from subscription_plans
      where lower(paypal_plan_id::text) = lower($1::text)
      limit 1`,
    [paypalPlanId],
  );
  return r.rowCount ? r.rows[0].id : null;
}

async function getSubscriptionRowId(client, subscriptionId, email) {
  if (subscriptionId) {
    const r = await client.query(
      `select id
         from subscriptions
        where lower(paypal_subscription_id::text) = lower($1::text)
        order by updated_at desc
        limit 1`,
      [subscriptionId],
    );
    if (r.rowCount) return r.rows[0].id;
  }
  if (!email) return null;
  const r = await client.query(
    `select s.id
       from subscriptions s
       join app_users u on u.id = s.user_id
      where lower(u.email) = lower($1)
      order by (case when lower(coalesce(s.status::text, '')) = 'active' then 0 else 1 end), s.updated_at desc
      limit 1`,
    [email],
  );
  return r.rowCount ? r.rows[0].id : null;
}

async function getProcessedEvent(client, provider, providerEventId) {
  if (!providerEventId) return null;
  const r = await client.query(
    `select id, processed, subscription_id
       from billing_events
      where provider = $1 and provider_event_id = $2
      order by created_at desc
      limit 1`,
    [provider, providerEventId],
  );
  return r.rowCount ? r.rows[0] : null;
}

async function insertBillingEvent(client, opts) {
  const { provider, eventType, providerEventId, subscriptionRowId, payload } = opts;
  const r = await client.query(
    `insert into billing_events (provider, event_type, provider_event_id, subscription_id, payload, processed)
     values ($1, $2, $3, $4::uuid, $5::jsonb, false)
     returning id`,
    [provider, eventType, providerEventId || null, subscriptionRowId || null, JSON.stringify(payload || {})],
  );
  return r.rows[0].id;
}

async function markBillingEventProcessed(client, billingEventId, subscriptionRowId) {
  await client.query(
    `update billing_events
        set processed = true,
            processed_at = now(),
            subscription_id = coalesce($2, subscription_id)
      where id = $1`,
    [billingEventId, subscriptionRowId || null],
  );
}

async function updateSubscriptionEntitlement(client, opts) {
  const { subscriptionId, email, periodStart, periodEnd, planId } = opts;
  const subCols = await tableColumns(client, 'subscriptions');
  if (!subCols.size) throw new Error('subscriptions table missing');

  const setParts = [];
  const values = [];
  const pushSet = (col, val) => {
    values.push(val);
    setParts.push(`${col} = $${values.length}`);
  };

  if (subCols.has('status')) pushSet('status', 'active');
  if (subCols.has('paypal_subscription_id') && subscriptionId) pushSet('paypal_subscription_id', subscriptionId);
  if (subCols.has('current_period_start') && periodStart) pushSet('current_period_start', periodStart.toISOString());
  if (subCols.has('current_period_end') && periodEnd) pushSet('current_period_end', periodEnd.toISOString());
  if (subCols.has('updated_at')) pushSet('updated_at', new Date().toISOString());
  if (!setParts.length) throw new Error('No writable entitlement columns in subscriptions');

  let updated = 0;

  // Primary: update by PayPal subscription ID across likely schema variants.
  if (subscriptionId) {
    const subscriptionIdCols = [
      'paypal_subscription_id',
      'provider_subscription_id',
      'external_subscription_id',
      'subscription_id',
      'paypal_id',
    ].filter((c) => subCols.has(c));

    for (const idCol of subscriptionIdCols) {
      const whereIdx = values.push(subscriptionId);
      const sql = `update subscriptions set ${setParts.join(', ')} where lower(${idCol}::text) = lower($${whereIdx}::text)`;
      const r = await client.query(sql, values);
      updated += r.rowCount || 0;
      if (updated > 0) break;
    }
  }

  // Fallback A: update by email if subscriptions table stores payer/subscriber email directly.
  if (updated === 0 && email) {
    const emailCol = pickColumn(subCols, [
      'email',
      'payer_email',
      'subscriber_email',
      'paypal_email',
      'customer_email',
    ]);
    if (emailCol) {
      const idxEmail = values.push(email);
      const sql = `update subscriptions set ${setParts.join(', ')} where lower(${emailCol}::text) = lower($${idxEmail}::text)`;
      const r = await client.query(sql, values);
      updated += r.rowCount || 0;
    }
  }

  // Fallback B removed intentionally: fragile dynamic SQL path could abort the transaction.
  // We now rely on:
  // 1) direct update by PayPal subscription id, and
  // 2) create-on-miss using (email + PayPal plan id).

  if (updated === 0 && email) {
    const userId = await resolveUserIdByEmail(client, email);
    const resolvedPlanId = planId || null;
    if (userId && resolvedPlanId) {
      const insertCols = ['user_id', 'plan_id', 'status'];
      const insertVals = [userId, resolvedPlanId, 'active'];
      if (subCols.has('paypal_subscription_id') && subscriptionId) {
        insertCols.push('paypal_subscription_id');
        insertVals.push(subscriptionId);
      }
      if (subCols.has('started_at')) {
        insertCols.push('started_at');
        insertVals.push((periodStart || new Date()).toISOString());
      }
      if (subCols.has('current_period_end') && periodEnd) {
        insertCols.push('current_period_end');
        insertVals.push(periodEnd.toISOString());
      }
      if (subCols.has('created_at')) {
        insertCols.push('created_at');
        insertVals.push(new Date().toISOString());
      }
      if (subCols.has('updated_at')) {
        insertCols.push('updated_at');
        insertVals.push(new Date().toISOString());
      }

      const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `insert into subscriptions (${insertCols.join(', ')}) values (${placeholders})`;
      await client.query(sql, insertVals);
      updated = 1;
    }
  }

  if (updated === 0) {
    throw new Error(`No matching subscription row found for renewal (subscriptionId=${subscriptionId || 'n/a'}, email=${email || 'n/a'})`);
  }

  const subscriptionRowId = await getSubscriptionRowId(client, subscriptionId, email);
  return { updatedRows: updated, subscriptionRowId };
}

/** Customer numbers are assigned once in app_users (BMP00100, BMP000101, …). Never invent new ones. */
async function getCustomerNumberFromDb(email, client) {
  if (!email) return '';
  const db = client || pool;
  const r = await db.query(
    `select customer_number from app_users where lower(email) = lower($1) limit 1`,
    [email],
  );
  return r.rowCount ? String(r.rows[0].customer_number || '').trim() : '';
}

// Determine subscription type from PayPal plan ID
function getSubscriptionTypeFromPlanId(planId) {
  // PayPal Plan IDs (Buildprax packages x cycles)
  const planMap = {
    // Quartz
    'P-3J073398P3559135BNHJ45UI': 'monthly',
    'P-30K921908L429603BNHJ5ACY': 'quarterly',
    'P-94J443381C949051BNHJ5BMQ': 'half-yearly',
    'P-4MN478353Y062360ANHJ5DBQ': 'yearly',
    // Emerald
    'P-1S501420WG286542LNHJ5G3A': 'monthly',
    'P-926425524K585832GNHJ5HUI': 'quarterly',
    'P-8HH73921XA896824NNHJ5I2Y': 'half-yearly',
    'P-3R8372600K076935FNHJ5KNA': 'yearly',
    // Sapphire
    'P-8H696013XT563322HNHJ5MTI': 'monthly',
    'P-8RR61939JV344163BNHJ5O2A': 'quarterly',
    'P-62437076NY240873UNHJ5REY': 'half-yearly',
    'P-1RB20550BH271030CNHJ5TEQ': 'yearly',
    // Diamond
    'P-14M01620TM4779401NHJ5UXY': 'monthly',
    'P-7MN435228A979822VNHJ5VRQ': 'quarterly',
    'P-45K182315A961464XNHJ5WMY': 'half-yearly',
    'P-93K3717766896443TNHJ5XPY': 'yearly',
  };
  
  return planMap[planId] || 'monthly'; // Default to monthly if not found
}

// Send subscription email (account sign-in model, no license keys)
async function sendSubscriptionEmail(email, firstName, customerNumber, subscriptionType, action) {
  const renewalPeriod = subscriptionType === 'monthly' ? 'month' : 
                        subscriptionType === 'quarterly' ? '3 months' : 
                        subscriptionType === 'half-yearly' || subscriptionType === 'halfyearly' ? '6 months' : 
                        'year';
  
  const emailData = {
    action: action === 'license_purchase' ? 'license_purchase' : 'subscription_renewed',
    firstName: firstName || '',
    email: email,
    customerNumber: customerNumber,
    subscriptionType: subscriptionType,
    renewalPeriod: renewalPeriod
  };
  
  try {
    const response = await fetch(EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData)
    });
    
    if (!response.ok) {
      console.error('Failed to send renewal email:', response.status, response.statusText);
      return false;
    }
    
    console.log('Renewal email sent successfully to:', email);
    return true;
  } catch (error) {
    console.error('Error sending renewal email:', error);
    return false;
  }
}

async function main(args) {
  console.log('PayPal webhook received:', JSON.stringify(args, null, 2));
  
  try {
    // Parse webhook event
    const webhookEvent = args.http?.body ? JSON.parse(args.http.body) : args;
    
    // Verify webhook signature (IMPORTANT for security)
    // TODO: Implement PayPal webhook signature verification
    // const isValid = verifyPayPalWebhookSignature(webhookEvent);
    // if (!isValid) {
    //   return { statusCode: 401, body: { error: 'Invalid webhook signature' } };
    // }
    
    const eventType = webhookEvent.event_type;
    console.log('Webhook event type:', eventType);
    const provider = 'paypal';
    const providerEventId = pickBestProviderEventId(webhookEvent);
    const subscriptionId = pickBestSubscriptionId(webhookEvent);
    const resource = webhookEvent.resource || {};

    if (!providerEventId) {
      return jsonResponse(400, { ok: false, error: 'Missing PayPal event id for idempotency' });
    }

    if (isTestWebhookEvent(providerEventId) && process.env.ALLOW_TEST_WEBHOOKS !== 'true') {
      console.warn('Rejected test webhook event in production:', providerEventId);
      return jsonResponse(200, { ok: true, message: 'Test webhook ignored', providerEventId });
    }

    if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
      let email =
        resource?.subscriber?.email_address ||
        resource?.payer?.email_address ||
        null;
      if (!email && subscriptionId) email = await resolveEmailBySubscriptionId(subscriptionId);
      const client = await pool.connect();
      try {
        const existingEvent = await getProcessedEvent(client, provider, providerEventId);
        if (existingEvent?.processed) {
          return jsonResponse(200, { success: true, message: 'Webhook already processed', eventType, providerEventId });
        }
        await client.query('begin');
        const subRowId = await getSubscriptionRowId(client, subscriptionId, email);
        const billingEventId = await insertBillingEvent(client, {
          provider,
          eventType,
          providerEventId,
          subscriptionRowId: subRowId,
          payload: webhookEvent,
        });
        const updated = await markSubscriptionCancelled(client, subscriptionId, email);
        await markBillingEventProcessed(client, billingEventId, subRowId);
        await client.query('commit');
        return jsonResponse(200, {
          success: true,
          message: 'Subscription marked cancelled',
          eventType,
          subscriptionId,
          email,
          subscriptionsUpdated: updated,
        });
      } catch (e) {
        await client.query('rollback').catch(() => {});
        return jsonResponse(500, { success: false, error: e.message, eventType, providerEventId });
      } finally {
        client.release();
      }
    }

    const isRenewalLikeEvent =
      eventType === 'BILLING.SUBSCRIPTION.RENEWED' ||
      eventType === 'BILLING.SUBSCRIPTION.UPDATED' ||
      eventType === 'BILLING.SUBSCRIPTION.RE-ACTIVATED' ||
      eventType === 'BILLING.SUBSCRIPTION.PAYMENT.SUCCEEDED' ||
      eventType === 'PAYMENT.SALE.COMPLETED' ||
      eventType === 'PAYMENT.CAPTURE.COMPLETED' ||
      eventType === 'BILLING.SUBSCRIPTION.ACTIVATED';

    if (isRenewalLikeEvent && !isSubscriptionPaymentEvent(eventType, resource)) {
      console.log('Ignoring non-subscription payment event:', eventType);
      return jsonResponse(200, { success: true, message: 'Non-subscription payment ignored', eventType });
    }

    if (isRenewalLikeEvent) {
      const subscriber = resource?.subscriber;
      let email =
        subscriber?.email_address ||
        resource?.payer?.email_address ||
        resource?.payer?.payer_info?.email ||
        resource?.payer_email ||
        null;
      const firstName =
        subscriber?.name?.given_name ||
        resource?.payer?.name?.given_name ||
        resource?.payer?.payer_info?.first_name ||
        '';
      const planId = resource.plan_id;
      
      if (!email && subscriptionId) {
        email = await resolveEmailBySubscriptionId(subscriptionId);
      }

      if (!subscriptionId && !email) {
        console.error('No subscription identifier or email found in renewal/payment event');
        return {
          ...jsonResponse(400, { error: 'Missing subscription identifier and email in webhook event' })
        };
      }
      
      console.log('Processing renewal-like event:', {
        eventType,
        subscriptionId,
        email,
        planId
      });
      
      // Determine subscription type from plan ID
      const subscriptionType = getSubscriptionTypeFromPlanId(planId);
      
      const customerNumber = await getCustomerNumberFromDb(email);
      const isFirstActivation = eventType === 'BILLING.SUBSCRIPTION.ACTIVATED';

      console.log('Processing renewal-like event:', {
        email,
        customerNumber: customerNumber || '(none in app_users)',
        subscriptionType,
        isFirstActivation,
      });

      let { periodStart, periodEnd, periodEndFromPayPal } = readRenewalWindow(resource);
      const client = await pool.connect();
      let updatedRows = 0;
      let subscriptionRowId = null;
      let billingEventId = null;
      try {
        const existingEvent = await getProcessedEvent(client, provider, providerEventId);
        if (existingEvent?.processed) {
          return {
            ...jsonResponse(200, {
              success: true,
              message: 'Webhook already processed',
              eventType,
              providerEventId,
              subscriptionId,
            })
          };
        }

        await client.query('begin');
        const preSubscriptionRowId = await getSubscriptionRowId(client, subscriptionId, email);
        if (!preSubscriptionRowId && !isFirstActivation) {
          // Keep renewals resilient: if activation was missed, downstream upsert path can still
          // recover by matching email + PayPal plan and create a missing subscription row.
          console.warn(
            'No pre-existing subscription row for renewal-like event; continuing with recovery upsert path',
            { subscriptionId: subscriptionId || null, email: email || null, eventType },
          );
        }
        const existingPeriodEnd = await getCurrentPeriodEnd(client, subscriptionId, email);
        if (!periodEnd) {
          periodEnd = await inferPeriodEndFromSubscription(client, subscriptionId, email, resource);
          if (periodEnd) {
            console.log('Inferred periodEnd from payment time + billing cycle:', periodEnd.toISOString());
          }
        }
        if (!periodEnd) {
          throw new Error('Could not determine renewal period end from PayPal payload or subscription billing cycle');
        }
        periodEnd = resolvePeriodEnd({ periodEnd, periodEndFromPayPal, existingPeriodEnd });
        billingEventId = await insertBillingEvent(client, {
          provider,
          eventType,
          providerEventId,
          subscriptionRowId: preSubscriptionRowId,
          payload: webhookEvent,
        });
        const resolvedPlanId = await resolvePlanIdByPayPalPlanId(client, planId);
        const entitlementResult = await updateSubscriptionEntitlement(client, {
          subscriptionId,
          email,
          periodStart,
          periodEnd,
          planId: resolvedPlanId,
        });
        updatedRows = entitlementResult.updatedRows;
        subscriptionRowId = entitlementResult.subscriptionRowId || await getSubscriptionRowId(client, subscriptionId, email);
        await markBillingEventProcessed(client, billingEventId, subscriptionRowId);
        await client.query('commit');
      } catch (dbErr) {
        await client.query('rollback').catch(() => {});
        console.error('Entitlement DB update failed:', dbErr);
        return {
          ...jsonResponse(500, {
            success: false,
            error: 'Failed to update subscription entitlement in database',
            subscriptionId,
            email,
            providerEventId
          })
        };
      } finally {
        client.release();
      }

      const emailAction =
        isFirstActivation ? 'license_purchase' : 'subscription_renewed';
      const emailSent =
        email && shouldSendSubscriptionEmail(eventType)
          ? await sendSubscriptionEmail(email, firstName, customerNumber, subscriptionType, emailAction)
          : false;
      
      if (emailSent) {
        return {
          ...jsonResponse(200, {
            success: true,
            message: 'Subscription/payment processed and entitlement updated',
            subscriptionId,
            email,
            customerNumber,
            entitlementUpdatedRows: updatedRows,
            renewalPeriodEnd: periodEnd ? periodEnd.toISOString() : null,
            renewalPeriodStart: periodStart ? periodStart.toISOString() : null,
            renewalEmailSent: true
          })
        };
      } else {
        return {
          ...jsonResponse(200, {
            success: true,
            message: email ? 'Entitlement updated, but renewal email failed to send' : 'Entitlement updated (no payer email in webhook payload)',
            subscriptionId,
            email,
            entitlementUpdatedRows: updatedRows,
            renewalPeriodEnd: periodEnd ? periodEnd.toISOString() : null,
            renewalPeriodStart: periodStart ? periodStart.toISOString() : null,
            renewalEmailSent: false
          })
        };
      }
    }
    
    // Log all non-renewal events as processed for complete webhook audit trail.
    {
      const client = await pool.connect();
      try {
        const existingEvent = await getProcessedEvent(client, provider, providerEventId);
        if (existingEvent?.processed) {
          return {
            ...jsonResponse(200, {
              success: true,
              message: 'Webhook already processed',
              eventType,
              providerEventId,
              subscriptionId,
            })
          };
        }
        await client.query('begin');
        const resource = webhookEvent.resource || {};
        let email =
          resource?.subscriber?.email_address ||
          resource?.payer?.email_address ||
          resource?.payer?.payer_info?.email ||
          resource?.payer_email ||
          null;
        if (!email && subscriptionId) {
          email = await resolveEmailBySubscriptionId(subscriptionId);
        }
        const subRowId = await getSubscriptionRowId(client, subscriptionId, email);
        const billingEventId = await insertBillingEvent(client, {
          provider,
          eventType,
          providerEventId,
          subscriptionRowId: subRowId,
          payload: webhookEvent,
        });
        await markBillingEventProcessed(client, billingEventId, subRowId);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback').catch(() => {});
        console.error('Non-renewal billing event log failed:', e);
        return {
          ...jsonResponse(500, { success: false, error: 'Failed to log webhook event', eventType, providerEventId })
        };
      } finally {
        client.release();
      }
    }

    return {
      ...jsonResponse(200, { success: true, message: 'Event logged', eventType, providerEventId, subscriptionId })
    };
    
  } catch (error) {
    console.error('Error processing PayPal webhook:', error);
    return {
      ...jsonResponse(500, { error: 'Internal server error', message: error.message })
    };
  }
}

module.exports.main = main;

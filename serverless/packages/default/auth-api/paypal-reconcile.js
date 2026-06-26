/**
 * PayPal subscription reconcile + checkout activation (auth-api).
 * Safety net when webhooks are delayed or checkout activation must be immediate.
 */

function paypalApiBase() {
  return process.env.PAYPAL_MODE === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com'
}

function formatPayPalReportingDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function parseIsoDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d : null
}

function endOfUtcDay(date) {
  const d = new Date(date)
  d.setUTCHours(23, 59, 59, 0)
  return d
}

function addMonthsUtc(date, months) {
  const d = new Date(date)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d
}

function addYearsUtc(date, years) {
  const d = new Date(date)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d
}

function periodEndFromBillingCycle(baseDate, billingCycleCode) {
  const base = baseDate instanceof Date ? baseDate : new Date(baseDate)
  const code = String(billingCycleCode || 'monthly').toLowerCase()
  if (code === 'quarterly') return addMonthsUtc(base, 3)
  if (code === 'half_yearly' || code === 'half-yearly' || code === 'halfyearly') return addMonthsUtc(base, 6)
  if (code === 'yearly' || code === 'annual') return addYearsUtc(base, 1)
  return addMonthsUtc(base, 1)
}

export async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_CLIENT_SECRET
  if (!clientId || !secret) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set')
  }
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64')
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`PayPal OAuth failed (${res.status}): ${body.error_description || body.message || 'unknown'}`)
  }
  return body.access_token
}

export async function fetchPayPalSubscription(accessToken, subscriptionId) {
  const res = await fetch(
    `${paypalApiBase()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, status: res.status, body }
  return { ok: true, body }
}

function readNextBillingTime(ppSub) {
  return (
    ppSub?.billing_info?.next_billing_time ||
    ppSub?.billing_info?.cycle_executions?.find((c) => c?.tenure_type === 'REGULAR')?.next_billing_time ||
    null
  )
}

async function resolvePlanIdByPayPalPlanId(client, paypalPlanId) {
  if (!paypalPlanId) return null
  const r = await client.query(
    `select id from subscription_plans where lower(paypal_plan_id::text) = lower($1::text) limit 1`,
    [paypalPlanId],
  )
  return r.rowCount ? r.rows[0].id : null
}

async function assignCustomerNumberIfMissing(client, userId) {
  const r = await client.query(`select customer_number from app_users where id = $1`, [userId])
  if (r.rowCount && r.rows[0].customer_number) return r.rows[0].customer_number
  const next = await client.query(
    `select coalesce(max(cast(substring(customer_number from 4) as int)), 100) + 1 as n
       from app_users where customer_number ~ '^BMP[0-9]+$'`,
  )
  const customerNumber = `BMP${String(next.rows[0].n).padStart(6, '0')}`
  await client.query(
    `update app_users set customer_number = $2, updated_at = now() where id = $1 and customer_number is null`,
    [userId, customerNumber],
  )
  return customerNumber
}

async function releasePaypalIdFromOtherUsers(client, paypalId, email) {
  if (!paypalId || !email) return
  await client.query(
    `update subscriptions s
        set paypal_subscription_id = concat('released-', s.paypal_subscription_id, '-', floor(extract(epoch from now()))::bigint),
            updated_at = now()
      from app_users u
     where s.user_id = u.id
       and lower(s.paypal_subscription_id::text) = lower($1::text)
       and lower(u.email) <> lower($2::text)`,
    [paypalId, email],
  )
}

async function fetchTransactionPage(accessToken, start, end, page) {
  const qs = new URLSearchParams({
    start_date: formatPayPalReportingDate(start),
    end_date: formatPayPalReportingDate(end),
    fields: 'transaction_info,payer_info',
    page_size: '100',
    page: String(page),
    transaction_status: 'S',
  })
  const res = await fetch(`${paypalApiBase()}/v1/reporting/transactions?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`PayPal transactions list failed (${res.status})`)
  }
  return body
}

function collectSubscriptionIdsForEmail(body, email, ids) {
  const target = String(email || '').trim().toLowerCase()
  if (!target) return
  for (const row of body.transaction_details || []) {
    const payerEmail = String(row.payer_info?.email_address || '').trim().toLowerCase()
    if (payerEmail !== target) continue
    const info = row.transaction_info || {}
    for (const c of [info.paypal_reference_id, info.billing_agreement_id]) {
      const t = String(c || '').trim()
      if (/^I-[A-Z0-9]+$/i.test(t)) ids.add(t.toUpperCase())
    }
  }
}

export async function discoverSubscriptionIdsForEmail(accessToken, email, daysBack = 14) {
  const end = new Date()
  const overallStart = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000)
  const ids = new Set()
  const maxRangeMs = 31 * 24 * 60 * 60 * 1000
  let windowStart = new Date(overallStart)
  while (windowStart < end) {
    const windowEnd = new Date(Math.min(windowStart.getTime() + maxRangeMs, end.getTime()))
    let page = 1
    let totalPages = 1
    while (page <= totalPages && page <= 10) {
      const body = await fetchTransactionPage(accessToken, windowStart, windowEnd, page)
      totalPages = Number(body.total_pages || 1)
      collectSubscriptionIdsForEmail(body, email, ids)
      page += 1
    }
    windowStart = new Date(windowEnd.getTime() + 1000)
  }
  return [...ids]
}

/** Upsert subscription from live PayPal subscription object. */
export async function upsertFromPayPalSubscription(client, ppSub, source = 'api') {
  const paypalId = String(ppSub?.id || '').trim()
  const ppStatus = String(ppSub?.status || '').toUpperCase()
  const payerEmail = String(ppSub?.subscriber?.email_address || '').trim().toLowerCase()
  const paypalPlanId = ppSub?.plan_id || null

  if (!paypalId) return { action: 'skipped_no_id', source }
  if (!payerEmail) return { paypalId, action: 'skipped_no_email', source }

  const userRes = await client.query(
    `select id, email from app_users where lower(email) = lower($1) limit 1`,
    [payerEmail],
  )
  if (!userRes.rowCount) {
    return { paypalId, email: payerEmail, action: 'skipped_no_app_user', source }
  }
  const userId = userRes.rows[0].id

  const owned = await client.query(
    `select s.id, s.plan_id, s.current_period_end
       from subscriptions s
      where lower(s.paypal_subscription_id::text) = lower($1::text)
      order by s.updated_at desc limit 1`,
    [paypalId],
  )

  const planIdFromPayPal = await resolvePlanIdByPayPalPlanId(client, paypalPlanId)
  const existing = owned.rowCount
    ? { rowCount: 1, rows: owned.rows }
    : await client.query(
        `select id, plan_id, current_period_end from subscriptions where user_id = $1 order by updated_at desc limit 1`,
        [userId],
      )

  const planId = planIdFromPayPal || (existing.rowCount ? existing.rows[0].plan_id : null)
  if (!planId) {
    return { paypalId, email: payerEmail, action: 'skipped_unknown_plan', paypalPlanId, source }
  }

  if (ppStatus === 'CANCELLED' || ppStatus === 'SUSPENDED' || ppStatus === 'EXPIRED') {
    if (existing.rowCount) {
      await client.query(
        `update subscriptions set status = 'cancelled', updated_at = now() where id = $1`,
        [existing.rows[0].id],
      )
    }
    return { paypalId, email: payerEmail, action: 'marked_cancelled', paypalStatus: ppStatus, source }
  }

  const nextBilling = readNextBillingTime(ppSub)
  let periodEnd = nextBilling ? endOfUtcDay(parseIsoDate(nextBilling)) : null
  if (!periodEnd) {
    const bcRes = await client.query(
      `select bc.code as billing_cycle from subscription_plans sp
       join billing_cycles bc on bc.id = sp.billing_cycle_id where sp.id = $1`,
      [planId],
    )
    if (bcRes.rowCount) {
      periodEnd = endOfUtcDay(periodEndFromBillingCycle(new Date(), bcRes.rows[0].billing_cycle))
    }
  }
  if (!periodEnd) {
    return { paypalId, email: payerEmail, action: 'skipped_no_period_end', source }
  }

  await assignCustomerNumberIfMissing(client, userId)
  await client.query(
    `update app_users set email_verified = true, updated_at = now()
      where id = $1 and coalesce(email_verified, false) = false`,
    [userId],
  )
  if (!owned.rowCount) {
    await releasePaypalIdFromOtherUsers(client, paypalId, payerEmail)
  }

  let subscriptionRowId
  let action
  if (existing.rowCount) {
    subscriptionRowId = existing.rows[0].id
    await client.query(
      `update subscriptions
          set plan_id = $2, paypal_subscription_id = $3, status = 'active',
              current_period_end = $4::timestamptz, updated_at = now()
        where id = $1`,
      [subscriptionRowId, planId, paypalId, periodEnd.toISOString()],
    )
    action = owned.rowCount ? 'updated' : 'linked'
  } else {
    const ins = await client.query(
      `insert into subscriptions (user_id, plan_id, paypal_subscription_id, status, started_at, current_period_end, created_at, updated_at)
       values ($1, $2, $3, 'active', now(), $4::timestamptz, now(), now())
       returning id`,
      [userId, planId, paypalId, periodEnd.toISOString()],
    )
    subscriptionRowId = ins.rows[0].id
    action = 'created'
  }

  return {
    paypalId,
    email: payerEmail,
    action,
    subscriptionRowId,
    periodEnd: periodEnd.toISOString(),
    source,
  }
}

export async function activatePayPalSubscriptionForEmail(pool, { subscriptionId, email }) {
  const token = await getPayPalAccessToken()
  const fetched = await fetchPayPalSubscription(token, subscriptionId)
  if (!fetched.ok) {
    throw new Error(`PayPal subscription ${subscriptionId} not found (${fetched.status})`)
  }
  const pp = fetched.body
  const subscriberEmail = String(pp?.subscriber?.email_address || email || '').trim().toLowerCase()
  if (email && subscriberEmail && subscriberEmail !== String(email).trim().toLowerCase()) {
    console.warn('PayPal subscriber email differs from checkout email:', subscriberEmail, email)
  }
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await upsertFromPayPalSubscription(client, pp, 'checkout_activate')
    await client.query('commit')
    return result
  } catch (e) {
    await client.query('rollback').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function reconcilePayPalSubscriptionsForEmail(pool, email, daysBack = 14) {
  if (!email) return { reconciled: false, reason: 'no_email' }
  if (!process.env.PAYPAL_CLIENT_SECRET) {
    return { reconciled: false, reason: 'paypal_not_configured' }
  }
  const token = await getPayPalAccessToken()
  const ids = await discoverSubscriptionIdsForEmail(token, email, daysBack)
  if (!ids.length) return { reconciled: false, reason: 'no_paypal_profiles_found', email }

  const results = []
  const client = await pool.connect()
  try {
    for (const id of ids) {
      const fetched = await fetchPayPalSubscription(token, id)
      if (!fetched.ok) continue
      const st = String(fetched.body?.status || '').toUpperCase()
      if (st !== 'ACTIVE' && st !== 'APPROVED') continue
      await client.query('begin')
      try {
        const r = await upsertFromPayPalSubscription(client, fetched.body, 'login_reconcile')
        await client.query('commit')
        results.push(r)
      } catch (e) {
        await client.query('rollback').catch(() => {})
        results.push({ paypalId: id, action: 'error', error: e.message })
      }
    }
  } finally {
    client.release()
  }
  const activated = results.some((r) => ['created', 'updated', 'linked', 'refreshed'].includes(r.action))
  return { reconciled: activated, email, results }
}

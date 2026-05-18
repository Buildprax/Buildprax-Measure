// DigitalOcean App Platform Functions - Node.js (HTTP Trigger)
// Plain-text transactional email sender for Buildprax website flows.

const https = require('https')
const crypto = require('crypto')
const { Pool } = require('pg')

let pool = null

function getDbPool() {
  if (pool) return pool
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    max: 1,
  })
  return pool
}

async function getCustomerNumberFromDb(email) {
  if (!email) return ''
  const db = getDbPool()
  const r = await db.query(
    `select customer_number from app_users where lower(email) = lower($1) limit 1`,
    [email],
  )
  return r.rowCount ? String(r.rows[0].customer_number || '').trim() : ''
}

function sendEmail(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload)
    const req = https.request(
      {
        hostname: 'api.sendgrid.com',
        path: '/v3/mail/send',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ statusCode: res.statusCode, body })
          else reject(new Error(`SendGrid error ${res.statusCode}: ${body}`))
        })
      },
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function parseRequestData(args) {
  if (args?.http?.body) return JSON.parse(args.http.body)
  if (!args?.body) return args || {}
  return typeof args.body === 'string' ? JSON.parse(args.body) : args.body
}

async function ensureEmailQueueTable() {
  const db = getDbPool()
  await db.query(`create extension if not exists "uuid-ossp";`)
  await db.query(`
    create table if not exists email_delivery_queue (
      id uuid primary key default uuid_generate_v4(),
      action text not null,
      email text not null,
      first_name text,
      payload jsonb not null default '{}'::jsonb,
      send_at timestamptz not null,
      created_at timestamptz not null default now(),
      sent_at timestamptz,
      status text not null default 'pending',
      error_message text
    );
    create index if not exists idx_email_delivery_queue_pending on email_delivery_queue(status, send_at);
  `)
}

async function enqueueEmailDelivery({ action, email, firstName, payload, sendAt }) {
  const db = getDbPool()
  await ensureEmailQueueTable()
  await db.query(
    `insert into email_delivery_queue (action, email, first_name, payload, send_at, status)
     values ($1,$2,$3,$4::jsonb,$5,'pending')`,
    [action, email, firstName || null, JSON.stringify(payload || {}), sendAt.toISOString()],
  )
}

function buildWelcomeText(firstName, platform) {
  const name = firstName || 'there'
  return `Hello ${name},

Thank you very much for downloading Buildprax Measure Pro.

To help you get started smoothly, please open the app after installation and follow these steps:

1) On the sign-in screen, enter your email address and create your password.
2) Confirm your email address from the verification email.
3) Return to the app and sign in with your email and newly created password.
4) Start a new project and complete the project fields as prompted.
5) Load your drawings.
6) If you load a PDF drawing, first set the scale.
7) If you load a DXF drawing, the drawing measurements are recognized automatically.
8) Click Add to create your Measurement Items (MI), then start measuring.

If you need any help at all, you are very welcome to email me directly, or book a live demo with me on Teams.

Welcome to Buildprax. I trust that Buildprax Measure Pro will support you well in your daily workflow and help you work faster and more confidently on your projects.

Regards,

Charle Viljoen
support@buildprax.com`
}

function buildWelcomeHtml(firstName) {
  const name = firstName || 'there'
  return `<div style="font-family: Aptos, Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #111;">
<p>Hello ${name},</p>
<p>Thank you very much for downloading Buildprax Measure Pro.</p>
<p>To help you get started smoothly, please open the app after installation and follow these steps:</p>
<ol>
  <li>On the sign-in screen, enter your email address and create your password.</li>
  <li>Confirm your email address from the verification email.</li>
  <li>Return to the app and sign in with your email and newly created password.</li>
  <li>Start a new project and complete the project fields as prompted.</li>
  <li>Load your drawings.</li>
  <li>If you load a PDF drawing, first set the scale.</li>
  <li>If you load a DXF drawing, the drawing measurements are recognized automatically.</li>
  <li>Click Add to create your Measurement Items (MI), then start measuring.</li>
</ol>
<p>If you need any help at all, you are very welcome to email me directly, or book a live demo with me on Teams.</p>
<p>Welcome to Buildprax. I trust that Buildprax Measure Pro will support you well in your daily workflow and help you work faster and more confidently on your projects.</p>
<p>Regards,</p>
<p>Charle Viljoen<br>
support@buildprax.com</p>
</div>`
}

function buildVideoFollowupText(firstName) {
  const name = firstName || 'there'
  return `Hello ${name},

Thanks again for downloading Buildprax Measure Pro. To help you get started, I have created a set of short videos.
Click here: https://www.youtube.com/@Buildprax

These videos cover setup, measuring workflows, and practical tips to help you work faster.

You are also welcome to join the Buildprax Community Forum:
https://forum.buildprax.com

On the forum, you can join a network of other professionals like you, post bugs, suggestions or comments about Buildprax, and visit the Marketplace where you can find available job vacancies, post vacancies, and promote your products or services.

If you would like, you can book a live demo with me by using the link on the website, or send me a private email and I will assist directly.

Regards,

Charle Viljoen
support@buildprax.com`
}

function buildVideoFollowupHtml(firstName) {
  const name = firstName || 'there'
  return `<div style="font-family: Aptos, Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #111;">
<p>Hello ${name},</p>
<p>Thanks again for downloading Buildprax Measure Pro. To help you get started, I have created a set of short videos.<br>
<a href="https://www.youtube.com/@Buildprax">Click Here</a></p>
<p>These videos cover setup, measuring workflows, and practical tips to help you work faster.</p>
<p>You are also welcome to join the Buildprax Community Forum:<br>
<a href="https://forum.buildprax.com">https://forum.buildprax.com</a></p>
<p>On the forum, you can join a network of other professionals like you, post bugs, suggestions or comments about Buildprax, and visit the Marketplace where you can find available job vacancies, post vacancies, and promote your products or services.</p>
<p>If you would like, you can book a live demo with me by using the link on the website, or send me a private email and I will assist directly.</p>
<p>Regards,</p>
<p>Charle Viljoen<br>
support@buildprax.com</p>
</div>`
}

function buildTrialSurveyText(firstName) {
  const name = firstName || 'there'
  return `Hello ${name},

I noticed that your trial period has ended, and I am sorry to see you leave.

If you have 2 minutes, I would really appreciate your feedback.
I use your feedback to improve Buildprax, fix pain points, and make the product more useful for professionals like you.

Please start the 2-minute survey (link included in this email).

There is absolutely no obligation, but your input will be highly appreciated.

Thank you again for trying Buildprax.

You are still very welcome to visit the Buildprax Community Forum to connect with other professionals, explore opportunities in the Marketplace, view available job vacancies, post vacancies, and promote your products or services:
https://forum.buildprax.com

Regards,

Charle Viljoen
support@buildprax.com`
}

function buildTrialSurveyHtml(firstName) {
  const name = firstName || 'there'
  const surveyUrl = 'https://forms.microsoft.com/Pages/ResponsePage.aspx?id=waZa79JbU06bVBlTCgssG_GwmQ3i7kRDpTBQpQR3DmFUOUZIMk5HTzdaWElNM01YU0JaMEM5QlM2OC4u'
  return `<div style="font-family: Aptos, Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #111;">
<p>Hello ${name},</p>
<p>I noticed that your trial period has ended, and I am sorry to see you leave.</p>
<p>If you have 2 minutes, I would really appreciate your feedback.<br>
I use your feedback to improve Buildprax, fix pain points, and make the product more useful for professionals like you.</p>
<p><a href="${surveyUrl}">Please start the 2-minute survey</a></p>
<p>There is absolutely no obligation, but your input will be highly appreciated.</p>
<p>Thank you again for trying Buildprax.</p>
<p>You are still very welcome to visit the Buildprax Community Forum to connect with other professionals, explore opportunities in the Marketplace, view available job vacancies, post vacancies, and promote your products or services:<br>
<a href="https://forum.buildprax.com">https://forum.buildprax.com</a></p>
<p>Regards,</p>
<p>Charle Viljoen<br>
support@buildprax.com</p>
</div>`
}

function buildSubscriptionActiveText(firstName, customerNumber) {
  const name = firstName || 'there'
  const customerLine = customerNumber ? `Customer number: ${customerNumber}\n` : ''
  return `Hello ${name},

Thank you very much for your payment.
Your subscription is now active, and I am very pleased to welcome you as a paid Buildprax user.
${customerLine}
What to do next:
1) Open Buildprax Measure Pro
2) Sign in with your account email
3) If needed, use Forgot Password
4) Confirm Buildprax to be used on this device (each license can be used on one device only)
5) Access loads automatically from your account

You are also very welcome to join the Buildprax Community Forum to connect with other professionals, explore Marketplace opportunities, view available job vacancies, post vacancies, and promote your products or services:
https://forum.buildprax.com

Thank you for your support.

Regards,

Charle Viljoen
support@buildprax.com`
}

function buildSubscriptionActiveHtml(firstName, customerNumber) {
  const name = firstName || 'there'
  return `<div style="font-family: Aptos, Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #111;">
<p>Hello ${name},</p>
<p>Thank you very much for your payment.<br>
Your subscription is now active, and I am very pleased to welcome you as a paid Buildprax user.</p>
${customerNumber ? `<p>Customer number: ${customerNumber}</p>` : ''}
<p>What to do next:</p>
<ol>
  <li>Open Buildprax Measure Pro</li>
  <li>Sign in with your account email</li>
  <li>If needed, use Forgot Password</li>
  <li>Confirm Buildprax to be used on this device (each license can be used on one device only)</li>
  <li>Access loads automatically from your account</li>
</ol>
<p>You are also very welcome to join the Buildprax Community Forum to connect with other professionals, explore Marketplace opportunities, view available job vacancies, post vacancies, and promote your products or services:<br>
<a href="https://forum.buildprax.com">https://forum.buildprax.com</a></p>
<p>Thank you for your support.</p>
<p>Regards,</p>
<p>Charle Viljoen<br>
support@buildprax.com</p>
</div>`
}

function buildPaymentReceivedText(firstName) {
  const name = firstName || 'there'
  return `Hello ${name},

Thank you very much for your payment.
I have updated your subscription status, and your account remains active.

Please make sure you are using the latest version of Buildprax Measure Pro:
https://buildprax.com

If you need any assistance, you are always welcome to contact me directly.

Thank you for your continued support.

Regards,

Charle Viljoen
support@buildprax.com`
}

function buildPaymentReceivedHtml(firstName) {
  const name = firstName || 'there'
  return `<div style="font-family: Aptos, Calibri, Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #111;">
<p>Hello ${name},</p>
<p>Thank you very much for your payment.<br>
I have updated your subscription status, and your account remains active.</p>
<p>Please make sure you are using the latest version of Buildprax Measure Pro:<br>
<a href="https://buildprax.com">https://buildprax.com</a></p>
<p>If you need any assistance, you are always welcome to contact me directly.</p>
<p>Thank you for your continued support.</p>
<p>Regards,</p>
<p>Charle Viljoen<br>
support@buildprax.com</p>
</div>`
}

function buildSupportAuditText(requestData) {
  return `EMAIL FLOW AUDIT
================
Action: ${requestData.action || ''}
Name: ${requestData.firstName || ''} ${requestData.lastName || ''}
Email: ${requestData.email || ''}
Platform: ${requestData.platform || ''}
Company: ${requestData.company || ''}
Phone: ${requestData.phone || ''}
City: ${requestData.city || ''}
Country: ${requestData.country || ''}
Customer number: ${requestData.customerNumber || ''}
Subscription type: ${requestData.subscriptionType || ''}
Payment ID: ${requestData.paymentId || ''}
Amount: ${requestData.amount || ''}`
}

function buildActionEmail(action, requestData) {
  const firstName = requestData.firstName || ''
  const platform = requestData.platform || ''
  const customerNumber = requestData.customerNumber || ''
  if (action === 'license_purchase') {
    return {
      subject: 'Buildprax subscription is active',
      text: buildSubscriptionActiveText(firstName, customerNumber),
      html: buildSubscriptionActiveHtml(firstName, customerNumber),
    }
  }
  if (action === 'subscription_renewed') {
    return {
      subject: 'Buildprax payment received',
      text: buildPaymentReceivedText(firstName),
      html: buildPaymentReceivedHtml(firstName),
    }
  }
  if (action === 'getting_started_videos') {
    return {
      subject: 'Buildprax getting-started videos',
      text: buildVideoFollowupText(firstName),
      html: buildVideoFollowupHtml(firstName),
    }
  }
  if (action === 'trial_expired_survey') {
    return {
      subject: 'Buildprax quick trial survey',
      text: buildTrialSurveyText(firstName),
      html: buildTrialSurveyHtml(firstName),
    }
  }
  return {
    subject: 'Welcome to Buildprax Measure Pro',
    text: buildWelcomeText(firstName, platform),
    html: buildWelcomeHtml(firstName),
  }
}

async function sendPlainText(apiKey, fromEmail, to, subject, text) {
  const payload = {
    personalizations: [{ to: [{ email: to }], subject }],
    from: { email: fromEmail },
    content: [{ type: 'text/plain', value: text }],
    tracking_settings: {
      click_tracking: { enable: false, enable_text: false },
      open_tracking: { enable: false },
    },
  }
  return sendEmail(apiKey, payload)
}

async function sendTextAndOptionalHtml(apiKey, fromEmail, to, emailContent, options = {}) {
  const payload = {
    personalizations: [{ to: [{ email: to }], subject: emailContent.subject }],
    from: { email: fromEmail },
    content: emailContent.html
      ? [
          { type: 'text/plain', value: emailContent.text },
          { type: 'text/html', value: emailContent.html },
        ]
      : [{ type: 'text/plain', value: emailContent.text }],
    tracking_settings: {
      click_tracking: { enable: false, enable_text: false },
      open_tracking: { enable: false },
    },
  }
  if (options.sendAtEpochSeconds) {
    payload.send_at = Number(options.sendAtEpochSeconds)
  }
  return sendEmail(apiKey, payload)
}

async function main(args) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    if (args.http?.method === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' }

    const apiKey = process.env.SENDGRID_API_KEY
    const fromEmail = process.env.FROM_EMAIL || 'support@buildprax.com'
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@buildprax.com'
    if (!apiKey) return { statusCode: 500, headers: corsHeaders, body: { ok: false, error: 'Missing SENDGRID_API_KEY' } }

    const requestData = parseRequestData(args)
    let { action = 'trial_registration', email = '', customerNumber = '' } = requestData
    // Avoid spamming support copies during scheduled/background sends.
    const sendSupportAudit = requestData.sendSupportAudit !== false
    if (!email) return { statusCode: 400, headers: corsHeaders, body: { ok: false, error: 'Missing email' } }

    if (!customerNumber && (action === 'license_purchase' || action === 'subscription_renewed')) {
      customerNumber = await getCustomerNumberFromDb(email)
      requestData.customerNumber = customerNumber
    }

    const primary = buildActionEmail(action, requestData)
    await sendTextAndOptionalHtml(apiKey, fromEmail, email, primary)

    // Queue help-video follow-up for new trial registrations (5 minutes delay).
    if (action === 'trial_registration') {
      const delayedAt = new Date(Date.now() + 5 * 60 * 1000)
      await enqueueEmailDelivery({
        action: 'getting_started_videos',
        email,
        firstName: requestData.firstName || '',
        payload: { platform: requestData.platform || '' },
        sendAt: delayedAt,
      })
    }

    // Optionally send an audit copy to support so message quality can be checked.
    if (sendSupportAudit) {
      const supportSubject = `Buildprax email audit: ${action}`
      const supportText = buildSupportAuditText(requestData)
      await sendPlainText(apiKey, fromEmail, supportEmail, supportSubject, supportText)
    }

    return { statusCode: 200, headers: corsHeaders, body: { ok: true, message: 'Emails sent' } }
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: { ok: false, error: err?.message || 'Send failed', details: String(err) },
    }
  }
}

module.exports.main = main

# SendGrid Function Update Instructions

## Update Your DigitalOcean Function Code

Go to DigitalOcean → Functions → buildprax-email → send-email → Edit Code

Replace ALL the code with this:

```javascript
// DigitalOcean Functions (Node 14, Web Function)
// Required environment variables:
// - SENDGRID_API_KEY
// - FROM_EMAIL (support@buildprax.com)
// - SUPPORT_EMAIL (support@buildprax.com)

const https = require('https');

function sendSendgridMail(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'api.sendgrid.com',
      path: '/v3/mail/send',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      if (res.statusCode === 202) resolve();
      else {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => reject(new Error(`SendGrid ${res.statusCode}: ${body}`)));
      }
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function buildWelcomeHtml(firstName) {
  const name = firstName || 'there';
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #10b981;">Welcome to BUILDPRAX MEASURE PRO, ${name}!</h2>
    <p>Thank you for downloading our software. We're excited to help you streamline your construction measurement workflow.</p>
    <h3 style="color: #1e3a8a; margin-top: 30px;">Getting Started:</h3>
    <ol>
      <li><b>Installation:</b> Locate the downloaded .dmg file, double-click to open it, then drag "BUILDPRAX MEASURE PRO" to your Applications folder.</li>
      <li><b>Create Project:</b> Click "New Project" to create your first project.</li>
      <li><b>Upload Drawing:</b> Use "Upload Drawing" to add a PDF drawing.</li>
      <li><b>Set Scale:</b> Click "Set Scale" and measure a known distance on the drawing.</li>
      <li><b>Start Measuring:</b> Use Length, Area, or Count tools to measure.</li>
      <li><b>Export:</b> Export your measurements to Excel when ready.</li>
    </ol>
    <h3 style="color: #1e3a8a; margin-top: 30px;">Your 14-Day Trial:</h3>
    <ul>
      <li>Full access to all features for 14 days</li>
      <li>No credit card required</li>
      <li>After 14 days, upgrade to Pro for $5/year (Launch Special - normally $299/year)</li>
    </ul>
    <h3 style="color: #1e3a8a; margin-top: 30px;">Need Help?</h3>
    <p>Email us at <a href="mailto:support@buildprax.com">support@buildprax.com</a> - We're here to help you succeed!</p>
    <p style="margin-top: 30px;">We're excited to see what you'll build with BUILDPRAX MEASURE PRO!</p>
    <p>Best regards,<br>The BUILDPRAX Team<br><a href="mailto:support@buildprax.com">support@buildprax.com</a></p>
  </div>`;
}

function buildLicenseKeyHtml(licenseKey, amount) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #10b981;">Your BUILDPRAX MEASURE PRO License Key</h2>
    <p>Thank you for purchasing BUILDPRAX MEASURE PRO!</p>
    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 30px 0; text-align: center;">
      <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Your License Key:</p>
      <p style="margin: 0; font-size: 24px; font-weight: bold; color: #1e3a8a; letter-spacing: 2px; font-family: monospace;">${licenseKey}</p>
    </div>
    <h3 style="color: #1e3a8a; margin-top: 30px;">How to Activate:</h3>
    <ol>
      <li>Open BUILDPRAX MEASURE PRO</li>
      <li>If prompted, click "Enter License Key"</li>
      <li>Paste your license key: <strong>${licenseKey}</strong></li>
      <li>Click "Activate"</li>
    </ol>
    <h3 style="color: #1e3a8a; margin-top: 30px;">What You Get:</h3>
    <ul>
      <li>Unlimited access to all features</li>
      <li>Unlimited projects</li>
      <li>Priority support</li>
      <li>Future updates included</li>
      <li>Commercial use license</li>
    </ul>
    <p style="margin-top: 30px;">Need help? Email us at <a href="mailto:support@buildprax.com">support@buildprax.com</a></p>
    <p style="margin-top: 20px;">Thank you for supporting BUILDPRAX!</p>
    <p>Best regards,<br>The BUILDPRAX Team<br><a href="mailto:support@buildprax.com">support@buildprax.com</a></p>
  </div>`;
}

function buildSupportHtml(action, firstName, lastName, email, company, phone, addressLine1, city, country, source, licenseKey, paymentId, amount) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #1e3a8a;">New ${action === 'license_purchase' ? 'License Purchase' : 'Trial Registration'}</h2>
    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${firstName || ''} ${lastName || ''}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${email}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Company:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${company || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${phone || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Address:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${addressLine1 || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>City:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${city || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Country:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${country || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Source:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${source || 'N/A'}</td></tr>
      ${action === 'license_purchase' ? `
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>License Key:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee; font-family: monospace; font-weight: bold;">${licenseKey || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Payment ID:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${paymentId || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Amount:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">$${amount || '0.00'}</td></tr>
      ` : ''}
    </table>
  </div>`;
}

async function sendEmails({
  apiKey, fromEmail, supportEmail,
  action, firstName, lastName, email, company, phone, addressLine1, city, country, source, licenseKey, paymentId, amount
}) {
  let customerEmail, customerSubject, customerHtml;
  
  if (action === 'license_purchase') {
    customerSubject = 'Your BUILDPRAX MEASURE PRO License Key';
    customerHtml = buildLicenseKeyHtml(licenseKey || '', amount || '5.00');
  } else {
    customerSubject = 'Welcome to BUILDPRAX MEASURE PRO!';
    customerHtml = buildWelcomeHtml(firstName);
  }

  customerEmail = {
    personalizations: [{ to: [{ email: email }] }],
    from: { email: fromEmail, name: 'BUILDPRAX Support' },
    subject: customerSubject,
    content: [{ type: 'text/html', value: customerHtml }],
  };

  const notify = {
    personalizations: [{ to: [{ email: supportEmail }] }],
    from: { email: fromEmail, name: 'BUILDPRAX Website' },
    subject: action === 'license_purchase' ? 'New License Purchase' : 'New Trial Registration',
    content: [{ type: 'text/html', value: buildSupportHtml(action, firstName, lastName, email, company, phone, addressLine1, city, country, source, licenseKey, paymentId, amount) }],
  };

  await Promise.all([
    sendSendgridMail(apiKey, customerEmail),
    sendSendgridMail(apiKey, notify)
  ]);
}

async function main(args) {
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'support@buildprax.com';
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@buildprax.com';

    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Missing SENDGRID_API_KEY' }
      };
    }

    const {
      action = 'trial_registration',
      firstName = '',
      lastName = '',
      email = '',
      company = '',
      phone = '',
      addressLine1 = '',
      city = '',
      country = '',
      source = '',
      licenseKey = '',
      paymentId = '',
      amount = ''
    } = args || {};

    if (!email) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Missing email' }
      };
    }

    await sendEmails({
      apiKey, fromEmail, supportEmail,
      action, firstName, lastName, email, company, phone, addressLine1, city, country, source, licenseKey, paymentId, amount
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true }
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: e.message }
    };
  }
}

exports.main = main;
```

## After Updating:

1. Click "Save" in the function editor
2. Click "Deploy" or "Redeploy"
3. Test the registration form - you should receive all form fields in the support email!


// DigitalOcean App Platform Functions - Node.js (HTTP Trigger)
// Expects JSON body with: action, firstName, lastName, email, company, phone
// Environment variables: SENDGRID_API_KEY, FROM_EMAIL, SUPPORT_EMAIL, WELCOME_TEMPLATE_ID (optional)

import sgMail from '@sendgrid/mail';

export async function main(args) {
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'support@buildprax.com';
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@buildprax.com';
    const welcomeTemplateId = process.env.WELCOME_TEMPLATE_ID || '';

    if (!apiKey) {
      return { statusCode: 500, body: { ok: false, error: 'Missing SENDGRID_API_KEY' } };
    }

    sgMail.setApiKey(apiKey);

    const {
      action = 'trial_registration',
      firstName = '',
      lastName = '',
      email = '',
      company = '',
      phone = ''
    } = args || {};

    if (!email) {
      return { statusCode: 400, body: { ok: false, error: 'Missing email' } };
    }

    // Send welcome email to user
    const toUser = {
      to: email,
      from: fromEmail,
      subject: 'Welcome to BUILDPRAX MEASURE PRO!',
      text: `Hello ${firstName || ''},\n\nWelcome to BUILDPRAX MEASURE PRO!\n\nYour 14-Day Trial:\n- You have full access to all features for 14 days\n- No credit card required\n- After 14 days, upgrade to Pro for $100/year (special launch price until end of February)\n- Price will be $150/year starting March 1st\n\nUpgrade to Pro:\n- Unlock unlimited features\n- Priority support\n- Future updates included\n- Visit: https://buildprax.com/#pricing\n\nNeed help? support@buildprax.com\n\n— BUILDPRAX Team`,
      html: getWelcomeHtml(firstName),
    };

    if (welcomeTemplateId) {
      toUser.templateId = welcomeTemplateId;
      toUser.dynamic_template_data = { to_name: firstName || 'there' };
      // If templateId used, SendGrid uses template content, html/text may be ignored
    }

    // Send notification to support
    const toSupport = {
      to: supportEmail,
      from: fromEmail,
      subject: action === 'license_purchase' ? 'New License Purchase' : 'New Trial Registration',
      text: `Action: ${action}\nName: ${firstName} ${lastName}\nEmail: ${email}\nCompany: ${company}\nPhone: ${phone}`,
      html: `<p><b>Action:</b> ${action}</p><p><b>Name:</b> ${firstName} ${lastName}</p><p><b>Email:</b> ${email}</p><p><b>Company:</b> ${company}</p><p><b>Phone:</b> ${phone}</p>`
    };

    await Promise.all([
      sgMail.send(toUser),
      sgMail.send(toSupport)
    ]);

    return { statusCode: 200, body: { ok: true } };
  } catch (err) {
    return { statusCode: 500, body: { ok: false, error: err?.message || 'Send failed' } };
  }
}

function getWelcomeHtml(firstName) {
  const name = firstName || 'there';
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #10b981;">Welcome to BUILDPRAX MEASURE PRO, ${name}!</h2>
    <p>Thank you for downloading our software. We're excited to help you streamline your construction measurement workflow.</p>
    <h3 style="color: #1e3a8a; margin-top: 30px;">Your 14-Day Trial:</h3>
    <ul>
      <li>You have full access to all features for 14 days</li>
      <li>No credit card required</li>
      <li>After 14 days, upgrade to Pro for <strong>$100/year</strong> (special launch price until end of February)</li>
      <li>Price will be <strong>$150/year</strong> starting March 1st</li>
    </ul>
    <h3 style="color: #1e3a8a; margin-top: 30px;">Upgrade to Pro:</h3>
    <ul>
      <li>Unlock unlimited features</li>
      <li>Priority support</li>
      <li>Future updates included</li>
      <li>Visit: <a href="https://buildprax.com/#pricing">https://buildprax.com/#pricing</a></li>
    </ul>
    <h3 style="color: #1e3a8a; margin-top: 30px;">Need Help?</h3>
    <ul>
      <li>Email: <a href="mailto:support@buildprax.com">support@buildprax.com</a></li>
    </ul>
    <p style="margin-top: 30px;">— The BUILDPRAX Team</p>
  </div>`;
}

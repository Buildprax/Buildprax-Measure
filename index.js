// DigitalOcean App Platform Functions - Node.js (HTTP Trigger)
// Expects JSON body with: action, firstName, lastName, email, company, phone, platform, addressLine1, city, country, source
// Environment variables: SENDGRID_API_KEY, FROM_EMAIL, SUPPORT_EMAIL, WELCOME_TEMPLATE_ID (optional)

import sgMail from '@sendgrid/mail';

export async function main(args) {
  console.log('Email function called with args:', JSON.stringify(args, null, 2));
  
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'support@buildprax.com';
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@buildprax.com';
    const welcomeTemplateId = process.env.WELCOME_TEMPLATE_ID || '';

    console.log('Environment check:', {
      hasApiKey: !!apiKey,
      fromEmail,
      supportEmail
    });

    if (!apiKey) {
      console.error('Missing SENDGRID_API_KEY');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Missing SENDGRID_API_KEY' }
      };
    }

    sgMail.setApiKey(apiKey);

    // DigitalOcean Functions may pass data in args.body for HTTP requests, or directly in args
    // Also check for http.body if it's an HTTP trigger
    const requestData = args.http?.body ? JSON.parse(args.http.body) : (args.body ? (typeof args.body === 'string' ? JSON.parse(args.body) : args.body) : args || {});
    
    console.log('Parsed request data:', JSON.stringify(requestData, null, 2));
    
    const {
      action = 'trial_registration',
      firstName = '',
      lastName = '',
      email = '',
      company = '',
      phone = '',
      platform = '',
      addressLine1 = '',
      city = '',
      country = '',
      source = '',
      licenseKey = '',
      paymentId = '',
      amount = ''
    } = requestData;

    if (!email) {
      console.error('Missing email in request');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Missing email' }
      };
    }
    
    console.log('Sending emails to:', { user: email, support: supportEmail });

    // Send welcome email to user
    const toUser = {
      to: email,
      from: fromEmail,
      subject: 'Welcome to BUILDPRAX MEASURE PRO!',
      text: `Hello ${firstName || ''},\n\nWelcome to BUILDPRAX MEASURE PRO!\n\nGetting started:\n1) Install the app (drag to Applications)\n2) Create a new project\n3) Upload a PDF and set scale\n4) Measure and export to Excel\n\nNeed help? support@buildprax.com\n\n— BUILDPRAX Team`,
      html: getWelcomeHtml(firstName),
    };

    if (welcomeTemplateId) {
      toUser.templateId = welcomeTemplateId;
      toUser.dynamic_template_data = { to_name: firstName || 'there' };
      // If templateId used, SendGrid uses template content, html/text may be ignored
    }

    // Send notification to support with ALL form fields
    const supportSubject = action === 'license_purchase' ? 'New License Purchase' : 'New Trial Registration';
    const supportText = `Action: ${action}
Name: ${firstName} ${lastName}
Email: ${email}
Platform: ${platform || 'Not specified'}
Company: ${company || 'Not provided'}
Phone: ${phone || 'Not provided'}
Address: ${addressLine1 || 'Not provided'}
City: ${city || 'Not provided'}
Country: ${country || 'Not provided'}
Source: ${source || 'Not provided'}
${licenseKey ? `License Key: ${licenseKey}` : ''}
${paymentId ? `Payment ID: ${paymentId}` : ''}
${amount ? `Amount: ${amount}` : ''}`;

    const supportHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #10b981;">${supportSubject}</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Action:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${action}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Name:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${firstName} ${lastName}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Email:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${email}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Platform:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${platform || 'Not specified'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Company:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${company || 'Not provided'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Phone:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${phone || 'Not provided'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Address:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${addressLine1 || 'Not provided'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>City:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${city || 'Not provided'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Country:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${country || 'Not provided'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Source:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${source || 'Not provided'}</td></tr>
          ${licenseKey ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>License Key:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${licenseKey}</td></tr>` : ''}
          ${paymentId ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Payment ID:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${paymentId}</td></tr>` : ''}
          ${amount ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Amount:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${amount}</td></tr>` : ''}
        </table>
      </div>`;

    const toSupport = {
      to: supportEmail,
      from: fromEmail,
      subject: supportSubject,
      text: supportText,
      html: supportHtml
    };

    console.log('Sending emails via SendGrid...');
    await Promise.all([
      sgMail.send(toUser),
      sgMail.send(toSupport)
    ]);
    
    console.log('✅ Emails sent successfully');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: { ok: true, message: 'Emails sent successfully' }
    };
  } catch (err) {
    console.error('❌ Error sending emails:', err);
    console.error('Error stack:', err.stack);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: { ok: false, error: err?.message || 'Send failed', details: err.toString() }
    };
  }
}

function getWelcomeHtml(firstName) {
  const name = firstName || 'there';
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #10b981;">Welcome to BUILDPRAX MEASURE PRO, ${name}!</h2>
    <p>Thank you for downloading our software. We're excited to help you streamline your construction measurement workflow.</p>
    <h3 style="color: #1e3a8a; margin-top: 30px;">Getting Started:</h3>
    <ol>
      <li>Install the app (drag to Applications on macOS)</li>
      <li>Create your first project</li>
      <li>Upload a PDF, set scale using a known distance</li>
      <li>Measure (Length, Area, Count) and export to Excel</li>
    </ol>
    <h3 style="color: #1e3a8a; margin-top: 30px;">Need Help?</h3>
    <ul>
      <li><a href="https://buildprax.com/installation-guide.html">Installation Guide</a></li>
      <li>Email: <a href="mailto:support@buildprax.com">support@buildprax.com</a></li>
    </ul>
    <p style="margin-top: 30px;">— The BUILDPRAX Team</p>
  </div>`;
}

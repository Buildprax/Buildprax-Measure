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

    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (args.http?.method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: corsHeaders,
        body: ''
      };
    }

    console.log('Environment check:', {
      hasApiKey: !!apiKey,
      fromEmail,
      supportEmail
    });

    if (!apiKey) {
      console.error('Missing SENDGRID_API_KEY');
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: { ok: false, error: 'Missing SENDGRID_API_KEY' }
      };
    }

    sgMail.setApiKey(apiKey);

    // DigitalOcean Functions may pass data in args.body for HTTP requests, or directly in args
    // Also check for http.body if it's an HTTP trigger
    const requestData = args.http?.body ? JSON.parse(args.http.body) : (args.body ? (typeof args.body === 'string' ? JSON.parse(args.body) : args.body) : args || {});
    
    console.log('Parsed request data:', JSON.stringify(requestData, null, 2));
    
    const headers = args.http?.headers || {};
    const userAgentHeader = headers['user-agent'] || headers['User-Agent'] || '';
    const chPlatformHeader = headers['sec-ch-ua-platform'] || headers['Sec-CH-UA-Platform'] || '';

    let {
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

    if (!platform) {
      const platformHint = `${chPlatformHeader} ${userAgentHeader}`.toLowerCase();
      if (platformHint.includes('windows')) {
        platform = 'Windows';
      } else if (platformHint.includes('mac')) {
        platform = 'macOS';
      }
    }

    if (!email) {
      console.error('Missing email in request');
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: { ok: false, error: 'Missing email' }
      };
    }
    
    console.log('Sending emails to:', { user: email, support: supportEmail });
    console.log('Platform received:', platform);
    console.log('Platform type:', typeof platform);

    // Send welcome email to user
    // Determine platform-specific installation instructions
    const platformLower = (platform || '').toLowerCase();
    const isMac = platformLower.includes('mac') || platformLower === 'macos';
    const isWindows = platformLower.includes('windows') || platformLower === 'windows';
    
    console.log('Platform detection:', { platformLower, isMac, isWindows });
    
    // CRITICAL: NEVER use template - it contains quarantine language
    // Always use our safe, approved email content
    const toUser = {
      to: email,
      from: fromEmail,
      subject: 'Welcome to BUILDPRAX MEASURE PRO!',
      text: getWelcomeText(firstName, isMac, isWindows),
      html: getWelcomeHtml(firstName, isMac, isWindows),
    };
    
    // DO NOT set templateId - we want to use our safe content, not the template
    // If welcomeTemplateId exists, log a warning but DO NOT use it
    if (welcomeTemplateId) {
      console.warn('⚠️ WELCOME_TEMPLATE_ID environment variable is set but will be IGNORED');
      console.warn('⚠️ Using safe email content instead to avoid quarantine language');
      console.warn('⚠️ To fix: Remove WELCOME_TEMPLATE_ID from DigitalOcean environment variables');
    }

    // Send notification to support with ALL form fields
    const supportSubject = action === 'license_purchase' ? 'New License Purchase' : 'New Trial Registration';
    
    // Ensure platform is clearly shown
    const platformDisplay = platform || 'NOT SPECIFIED - CHECK FORM';
    console.log('Platform for support email:', platformDisplay);
    
    const supportText = `Action: ${action}
Name: ${firstName} ${lastName}
Email: ${email}
═══════════════════════════════════════
PLATFORM: ${platformDisplay} ⚠️ IMPORTANT
═══════════════════════════════════════
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
          <tr style="background-color: #fef3c7; border: 2px solid #f59e0b;">
            <td style="padding: 12px; border-bottom: 2px solid #f59e0b;"><b style="color: #92400e; font-size: 16px;">⚠️ PLATFORM:</b></td>
            <td style="padding: 12px; border-bottom: 2px solid #f59e0b;"><strong style="color: #065F46; font-size: 18px; text-transform: uppercase;">${platformDisplay}</strong></td>
          </tr>
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

    console.log('=== EMAIL CONTENT DEBUG ===');
    console.log('Welcome email subject:', toUser.subject);
    console.log('Welcome email text preview:', toUser.text.substring(0, 200));
    console.log('Welcome email has templateId?', !!toUser.templateId);
    console.log('Support email platform:', platformDisplay);
    console.log('Support email HTML contains platform?', supportHtml.includes(platformDisplay));
    console.log('===========================');
    
    console.log('Sending emails via SendGrid...');
    console.log('toUser object:', JSON.stringify(toUser, null, 2));
    console.log('toSupport platform field:', platformDisplay);
    
    await Promise.all([
      sgMail.send(toUser),
      sgMail.send(toSupport)
    ]);
    
    console.log('✅ Emails sent successfully');
    console.log('Platform that was sent:', platformDisplay);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: { ok: true, message: 'Emails sent successfully' }
    };
  } catch (err) {
    console.error('❌ Error sending emails:', err);
    console.error('Error stack:', err.stack);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: { ok: false, error: err?.message || 'Send failed', details: err.toString() }
    };
  }
}

function getWelcomeText(firstName, isMac, isWindows) {
  const name = firstName || 'there';
  let installInstructions = '';
  
  if (isMac) {
    installInstructions = `1) Open the downloaded .dmg file\n2) Drag BUILDPRAX MEASURE PRO to your Applications folder\n3) Open the app from Applications (it's fully approved and notarized by Apple - completely safe!)\n4) Create your first project`;
  } else if (isWindows) {
    installInstructions = `1) Open the Microsoft Store link\n2) Click "Get" or "Install" to download\n3) Launch the app from the Start menu\n4) Create your first project`;
  } else {
    installInstructions = `1) Install the app\n2) Create your first project`;
  }
  
  return `Hello ${name},

Thank you for downloading the free trial of BUILDPRAX MEASURE PRO.
Please test it and let us know if you need any changes or help.

BUILDPRAX MEASURE PRO is 100% legitimate and approved for both Windows and macOS. We only keep your information for support, and your drawings stay on your own computer — nothing is uploaded to the cloud. Your clients' intellectual property remains safe.

Getting Started:
${installInstructions}
5) Upload a PDF and set scale using a known distance
6) Measure (Length, Area, Count) and export to Excel

Thank you again for trying BUILDPRAX MEASURE PRO.

Need Help?
- Installation Guide: https://buildprax.com/installation-guide.html
- Email Support: support@buildprax.com

— The BUILDPRAX Team`;
}

function getWelcomeHtml(firstName, isMac, isWindows) {
  const name = firstName || 'there';
  let installSteps = '';
  
  if (isMac) {
    installSteps = `
      <li><strong>Open the downloaded .dmg file</strong></li>
      <li><strong>Drag BUILDPRAX MEASURE PRO to your Applications folder</strong></li>
      <li><strong>Open the app from Applications</strong> - It's fully approved and notarized by Apple, completely safe to use!</li>
      <li><strong>Create your first project</strong></li>`;
  } else if (isWindows) {
    installSteps = `
      <li><strong>Open the Microsoft Store link</strong></li>
      <li><strong>Click "Get" or "Install"</strong> to download</li>
      <li><strong>Launch the app</strong> from the Start menu</li>
      <li><strong>Create your first project</strong></li>`;
  } else {
    installSteps = `
      <li><strong>Install the app</strong></li>
      <li><strong>Create your first project</strong></li>`;
  }
  
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #10b981;">Thank you for downloading BUILDPRAX MEASURE PRO, ${name}!</h2>
    <p>Please test the free trial and let us know if you need any changes or help.</p>
    
    <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; color: #065F46; font-weight: 600;">✅ <strong>Your download is ready.</strong> BUILDPRAX MEASURE PRO is 100% legitimate and approved for Windows and macOS.</p>
    </div>
    
    <h3 style="color: #1e3a8a; margin-top: 30px;">Getting Started:</h3>
    <ol style="line-height: 1.8;">
      ${installSteps}
      <li><strong>Upload a PDF</strong> and set scale using a known distance</li>
      <li><strong>Measure</strong> (Length, Area, Count) and export to Excel</li>
    </ol>
    
    <p style="margin-top: 20px; color: #475569; font-size: 14px;">
      We only keep your information for support, and all drawings stay on your own hard drive — nothing is uploaded to the cloud. Your clients' intellectual property remains safe.
    </p>
    
    <h3 style="color: #1e3a8a; margin-top: 30px;">Need Help?</h3>
    <ul style="line-height: 1.8;">
      <li><a href="https://buildprax.com/installation-guide.html" style="color: #065F46;">Installation Guide</a></li>
      <li>Email: <a href="mailto:support@buildprax.com" style="color: #065F46;">support@buildprax.com</a></li>
    </ul>
    <p style="margin-top: 30px;">— The BUILDPRAX Team</p>
  </div>`;
}

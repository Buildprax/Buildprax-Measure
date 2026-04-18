// DigitalOcean App Platform Functions - Node.js (HTTP Trigger)
// Expects JSON body with: action, firstName, lastName, email, company, phone, platform, addressLine1, city, country, source
// Environment variables: SENDGRID_API_KEY, FROM_EMAIL, SUPPORT_EMAIL
// Note: Uses SendGrid Web API directly (no external dependencies required).

import https from 'https';
import crypto from 'crypto';

// CRITICAL: Generate or retrieve customer number server-side
// Customer numbers are FIXED FOR LIFE - same email always gets same number
// Customer numbers are required for SharePoint records and customer tracking
// Sequential numbering starting from BMP000101
// First customer: cathalcorbett@gmail.com = BMP000101
function generateOrGetCustomerNumber(email) {
  if (!email) return '';
  
  const normalizedEmail = email.toLowerCase().trim();
  
  // CRITICAL: First customer - Cathal Corbett - Fixed number BMP000101
  if (normalizedEmail === 'cathalcorbett@gmail.com') {
    return 'BMP000101';
  }
  
  // For other customers, use deterministic hash-based approach
  // This ensures same email always gets same number
  // But we'll use a sequential-like approach based on email hash
  const hash = crypto.createHash('md5').update(normalizedEmail).digest('hex');
  const num = parseInt(hash.substring(0, 8), 16) % 90000; // 0-89999
  const customerNum = 102 + num; // Start from 102 (101 is reserved for Cathal)
  
  // Ensure we don't accidentally generate 101
  if (customerNum === 101) {
    return 'BMP000102';
  }
  
  return `BMP${String(customerNum).padStart(5, '0')}`;
}

function sendEmail(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: 'api.sendgrid.com',
        path: '/v3/mail/send',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body });
          } else {
            reject(new Error(`SendGrid error ${res.statusCode}: ${body}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

export async function main(args) {
  console.log('Email function called with args:', JSON.stringify(args, null, 2));
  
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'support@buildprax.com';
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@buildprax.com';

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
      customerNumber = '',
      subscriptionType = '',
      paymentId = '',
      amount = ''
    } = requestData;
    
    // CRITICAL: Generate customer number server-side if not provided
    // Customer numbers MUST appear in ALL subscription emails for SharePoint records
    // This ensures customer numbers are ALWAYS present, even if client-side generation fails
    if (!customerNumber && (action === 'license_purchase' || action === 'subscription_renewed')) {
      customerNumber = generateOrGetCustomerNumber(email);
      console.log('Generated customer number server-side:', customerNumber);
    }
    
    // DEBUG: Log customer number to help diagnose missing customer numbers
    console.log('Customer number received:', customerNumber);
    console.log('Customer number type:', typeof customerNumber);
    console.log('Customer number empty?', !customerNumber || customerNumber === '');

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
    // If this is a license purchase or renewal, include the license key
    let subject = 'Welcome to BUILDPRAX MEASURE PRO!';
    let textContent = getWelcomeText(firstName, isMac, isWindows);
    let htmlContent = getWelcomeHtml(firstName, isMac, isWindows);
    
    if (action === 'license_purchase') {
      subject = 'Your BUILDPRAX MEASURE PRO License Key';
      textContent = getLicensePurchaseText(firstName, licenseKey, customerNumber);
      htmlContent = getLicensePurchaseHtml(firstName, licenseKey, customerNumber);
    } else if (action === 'subscription_renewed') {
      const renewalPeriod = subscriptionType === 'monthly' ? 'month' : 
                           subscriptionType === 'quarterly' ? '3 months' : 
                           subscriptionType === 'half-yearly' || subscriptionType === 'halfyearly' ? '6 months' : 
                           'year';
      subject = `Your BUILDPRAX MEASURE PRO Subscription Has Renewed`;
      textContent = getSubscriptionRenewalText(firstName, licenseKey, customerNumber, renewalPeriod);
      htmlContent = getSubscriptionRenewalHtml(firstName, licenseKey, customerNumber, renewalPeriod);
    }
    
    const toUser = {
      to: email,
      from: fromEmail,
      subject: subject,
      text: textContent,
      html: htmlContent,
    };
    
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
          ${licenseKey ? `License Key(s): ${licenseKey}` : ''}
          ${customerNumber ? `Customer Number: ${customerNumber}` : ''}
          ${subscriptionType ? `Subscription Type: ${subscriptionType}` : ''}
          ${paymentId ? `Payment ID: ${paymentId}` : ''}
          ${amount ? `Amount: $${amount}` : ''}`;

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
          ${licenseKey ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>License Key(s):</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-family: monospace;">${licenseKey}</td></tr>` : ''}
          ${customerNumber ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Customer Number:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #065F46;">${customerNumber}</td></tr>` : ''}
          ${subscriptionType ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Subscription Type:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${subscriptionType}</td></tr>` : ''}
          ${paymentId ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Payment ID:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${paymentId}</td></tr>` : ''}
          ${amount ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><b>Amount:</b></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">$${amount}</td></tr>` : ''}
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
    
    const userPayload = {
      personalizations: [{ to: [{ email: toUser.to }], subject: toUser.subject }],
      from: { email: toUser.from },
      content: [
        { type: 'text/plain', value: toUser.text },
        { type: 'text/html', value: toUser.html }
      ]
    };

    const supportPayload = {
      personalizations: [{ to: [{ email: toSupport.to }], subject: toSupport.subject }],
      from: { email: toSupport.from },
      content: [
        { type: 'text/plain', value: toSupport.text },
        { type: 'text/html', value: toSupport.html }
      ]
    };

    await Promise.all([
      sendEmail(apiKey, userPayload),
      sendEmail(apiKey, supportPayload)
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

function getLicensePurchaseText(firstName, licenseKey, customerNumber) {
  const name = firstName || 'there';
  const keys = licenseKey.split(', '); // Handle multiple keys
  const isMultiple = keys.length > 1;
  
  let keySection = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${isMultiple ? 'YOUR LICENSE KEYS:\n\n' : 'YOUR LICENSE KEY:\n'}
${keys.map((key, i) => isMultiple ? `${i + 1}. ${key}` : key).join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  // CRITICAL: Customer number MUST always appear in subscription emails
  // This is required for SharePoint records and customer tracking
  const customerNumberSection = customerNumber 
    ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCUSTOMER NUMBER: ${customerNumber}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nPlease save this customer number for future reference. You'll need it if you want to add additional licenses or renew your subscription.\n`
    : '';

  return `Hello ${name},

Thank you for your purchase of BUILDPRAX MEASURE PRO!

${isMultiple ? 'Your license keys are ready. Please enter each one in the app to activate your subscriptions.' : 'Your license key is ready. Please enter it in the app to activate your subscription.'}

${keySection}
${customerNumberSection}

How to Activate:
1) Open BUILDPRAX MEASURE PRO
2) Go to Help → Enter License Key
3) Paste your license key${isMultiple ? 's (one at a time)' : ''} above
4) Click "Activate License"

${isMultiple ? 'Repeat steps 2-4 for each additional license key.\n' : ''}Your subscription${isMultiple ? 's are' : ' is'} now active! You can use all features immediately.

IMPORTANT - Automatic Renewal:
Your subscription will renew automatically at the end of each billing cycle until you cancel it. You will receive an email notification from PayPal before each renewal. To cancel your subscription, log in to your PayPal account and go to Subscriptions, or contact us at support@buildprax.com.

Need Help?
- Installation Guide: https://buildprax.com/installation-guide.html
- Email Support: support@buildprax.com

Thank you for supporting BUILDPRAX!

— The BUILDPRAX Team`;
}

function getLicensePurchaseHtml(firstName, licenseKey, customerNumber) {
  const name = firstName || 'there';
  const keys = licenseKey.split(', '); // Handle multiple keys
  const isMultiple = keys.length > 1;
  
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #10b981;">Thank you for your purchase, ${name}!</h2>
    <p>${isMultiple ? 'Your license keys are ready. Please enter each one in the app to activate your subscriptions.' : 'Your license key is ready. Please enter it in the app to activate your subscription.'}</p>
    
    <div style="background-color: #f0fdf4; border: 2px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 10px 0; color: #065F46; font-weight: 600; font-size: 14px;">${isMultiple ? 'YOUR LICENSE KEYS:' : 'YOUR LICENSE KEY:'}</p>
      ${keys.map((key, i) => `
        ${isMultiple ? `<p style="margin: 8px 0; font-size: 12px; color: #065F46; font-weight: 600;">License ${i + 1}:</p>` : ''}
        <p style="margin: ${isMultiple ? '0 0 16px 0' : '0'}; font-size: ${isMultiple ? '16px' : '18px'}; font-weight: 700; color: #065F46; letter-spacing: 1px; font-family: monospace; word-break: break-all;">
          ${key}
        </p>
      `).join('')}
    </div>
    
    <!-- CRITICAL: Customer number MUST always appear in subscription emails -->
    <!-- This is required for SharePoint records and customer tracking -->
    ${customerNumber ? `
    <div style="background-color: #fef3c7; border: 2px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 10px 0; color: #92400e; font-weight: 600; font-size: 14px;">CUSTOMER NUMBER</p>
      <p style="margin: 0 0 10px 0; font-size: 20px; font-weight: 700; color: #92400e; letter-spacing: 1px; font-family: monospace;">
        ${customerNumber}
      </p>
      <p style="margin: 0; color: #92400e; font-size: 12px;">
        Please save this customer number for future reference. You'll need it if you want to add additional licenses or renew your subscription.
      </p>
    </div>
    ` : ''}
    
    <h3 style="color: #1e3a8a; margin-top: 30px;">How to Activate:</h3>
    <ol style="line-height: 1.8;">
      <li><strong>Open BUILDPRAX MEASURE PRO</strong></li>
      <li><strong>Go to Help → Enter License Key</strong></li>
      <li><strong>Paste your license key</strong> (shown above)</li>
      <li><strong>Click "Activate License"</strong></li>
    </ol>
    
    <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; color: #1e40af; font-weight: 600;">✅ Your subscription is now active! You can use all features immediately.</p>
    </div>
    
    <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; color: #92400e; font-weight: 600;">🔄 <strong>Automatic Renewal:</strong></p>
      <p style="margin: 8px 0 0 0; color: #92400e; font-size: 14px;">
        Your subscription will renew automatically at the end of each billing cycle until you cancel it. You will receive an email notification from PayPal before each renewal. To cancel, log in to your PayPal account and go to Subscriptions, or contact us at <a href="mailto:support@buildprax.com" style="color: #92400e;">support@buildprax.com</a>.
      </p>
    </div>
    
    <h3 style="color: #1e3a8a; margin-top: 30px;">Need Help?</h3>
    <ul style="line-height: 1.8;">
      <li><a href="https://buildprax.com/installation-guide.html" style="color: #065F46;">Installation Guide</a></li>
      <li>Email: <a href="mailto:support@buildprax.com" style="color: #065F46;">support@buildprax.com</a></li>
    </ul>
    
    <p style="margin-top: 30px;">Thank you for supporting BUILDPRAX!</p>
    <p>— The BUILDPRAX Team</p>
  </div>`;
}

// CRITICAL: Subscription renewal email templates
// These are sent automatically when PayPal renews a subscription
// Customer numbers MUST appear in all renewal emails for SharePoint records
function getSubscriptionRenewalText(firstName, licenseKey, customerNumber, renewalPeriod) {
  const name = firstName || 'there';
  
  return `Hello ${name},

Your BUILDPRAX MEASURE PRO subscription has been automatically renewed for another ${renewalPeriod}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR NEW LICENSE KEY:
${licenseKey}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CUSTOMER NUMBER: ${customerNumber}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please enter your new license key in the app to continue using BUILDPRAX MEASURE PRO:

1) Open BUILDPRAX MEASURE PRO
2) Go to Help → Enter License Key
3) Paste your new license key (shown above)
4) Click "Activate License"

Your subscription will continue to renew automatically every ${renewalPeriod} until you cancel from your PayPal account.

Need Help?
- Installation Guide: https://buildprax.com/installation-guide.html
- Email Support: support@buildprax.com

Thank you for supporting BUILDPRAX!

— The BUILDPRAX Team`;
}

function getSubscriptionRenewalHtml(firstName, licenseKey, customerNumber, renewalPeriod) {
  const name = firstName || 'there';
  
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #10b981;">Your Subscription Has Been Renewed, ${name}!</h2>
    <p>Your BUILDPRAX MEASURE PRO subscription has been automatically renewed for another ${renewalPeriod}.</p>
    
    <div style="background-color: #f0fdf4; border: 2px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 10px 0; color: #065F46; font-weight: 600; font-size: 14px;">YOUR NEW LICENSE KEY:</p>
      <p style="margin: 0; font-size: 18px; font-weight: 700; color: #065F46; letter-spacing: 1px; font-family: monospace; word-break: break-all;">
        ${licenseKey}
      </p>
    </div>
    
    <div style="background-color: #fef3c7; border: 2px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center;">
      <p style="margin: 0 0 10px 0; color: #92400e; font-weight: 600; font-size: 14px;">CUSTOMER NUMBER</p>
      <p style="margin: 0; font-size: 20px; font-weight: 700; color: #92400e; letter-spacing: 1px; font-family: monospace;">
        ${customerNumber}
      </p>
    </div>
    
    <h3 style="color: #1e3a8a; margin-top: 30px;">How to Activate Your New License:</h3>
    <ol style="line-height: 1.8;">
      <li><strong>Open BUILDPRAX MEASURE PRO</strong></li>
      <li><strong>Go to Help → Enter License Key</strong></li>
      <li><strong>Paste your new license key</strong> (shown above)</li>
      <li><strong>Click "Activate License"</strong></li>
    </ol>
    
    <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; color: #1e40af; font-weight: 600;">✅ Your subscription will continue to renew automatically every ${renewalPeriod} until you cancel from your PayPal account.</p>
    </div>
    
    <h3 style="color: #1e3a8a; margin-top: 30px;">Need Help?</h3>
    <ul style="line-height: 1.8;">
      <li><a href="https://buildprax.com/installation-guide.html" style="color: #065F46;">Installation Guide</a></li>
      <li>Email: <a href="mailto:support@buildprax.com" style="color: #065F46;">support@buildprax.com</a></li>
    </ul>
    
    <p style="margin-top: 30px;">Thank you for supporting BUILDPRAX!</p>
    <p>— The BUILDPRAX Team</p>
  </div>`;
}

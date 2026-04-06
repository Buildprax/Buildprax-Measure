/**
 * PayPal Webhook Handler for Automatic Subscription Renewals
 * 
 * CRITICAL: This handles automatic license key generation when subscriptions renew
 * NO MANUAL INTERVENTION REQUIRED - Everything is automatic 24/7
 * 
 * Webhook Events Handled:
 * - BILLING.SUBSCRIPTION.RENEWED: Generate new license key and send email
 * - BILLING.SUBSCRIPTION.CANCELLED: Log cancellation (no action needed)
 * - BILLING.SUBSCRIPTION.SUSPENDED: Log suspension (no action needed)
 */

const sgMail = require('@sendgrid/mail');

// Email configuration
const EMAIL_ENDPOINT = 'https://faas-syd1-c274eac6.doserverless.co/api/v1/web/fn-2ec741fb-b50c-4391-994a-0fd583e5fd49/default/send-email';

// CRITICAL: Generate or retrieve customer number server-side
// Customer numbers are FIXED FOR LIFE - same email always gets same number
// Sequential numbering starting from BMP000101
// First customer: cathalcorbett@gmail.com = BMP000101
function generateOrGetCustomerNumber(email) {
  if (!email) return '';
  
  const crypto = require('crypto');
  const normalizedEmail = email.toLowerCase().trim();
  
  // CRITICAL: First customer - Cathal Corbett - Fixed number BMP000101
  if (normalizedEmail === 'cathalcorbett@gmail.com') {
    return 'BMP000101';
  }
  
  // For other customers, use deterministic hash-based approach
  // This ensures same email always gets same number
  const hash = crypto.createHash('md5').update(normalizedEmail).digest('hex');
  const num = parseInt(hash.substring(0, 8), 16) % 90000; // 0-89999
  const customerNum = 102 + num; // Start from 102 (101 is reserved for Cathal)
  
  // Ensure we don't accidentally generate 101
  if (customerNum === 101) {
    return 'BMP000102';
  }
  
  return `BMP${String(customerNum).padStart(5, '0')}`;
}

// Generate license key based on subscription type
function generateLicenseKey(subscriptionType) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomString = '';
  for (let i = 0; i < 6; i++) {
    randomString += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  let prefix = 'BUILDPRAX-';
  switch(subscriptionType.toLowerCase()) {
    case 'monthly':
      prefix += 'MON-';
      break;
    case 'quarterly':
      prefix += 'QTR-';
      break;
    case 'half-yearly':
    case 'halfyearly':
      prefix += 'HLF-';
      break;
    case 'yearly':
    case 'annual':
      prefix += new Date().getFullYear() + '-';
      break;
    default:
      prefix += 'MON-'; // Default to monthly
  }
  
  const part1 = randomString;
  const part2 = chars.charAt(Math.floor(Math.random() * chars.length)) + 
                chars.charAt(Math.floor(Math.random() * chars.length)) +
                chars.charAt(Math.floor(Math.random() * chars.length)) +
                chars.charAt(Math.floor(Math.random() * chars.length)) +
                chars.charAt(Math.floor(Math.random() * chars.length)) +
                chars.charAt(Math.floor(Math.random() * chars.length));
  
  return `${prefix}${part1}-${part2}`;
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

// Send renewal email with new license key
async function sendRenewalEmail(email, firstName, licenseKey, customerNumber, subscriptionType) {
  const renewalPeriod = subscriptionType === 'monthly' ? 'month' : 
                        subscriptionType === 'quarterly' ? '3 months' : 
                        subscriptionType === 'half-yearly' || subscriptionType === 'halfyearly' ? '6 months' : 
                        'year';
  
  const emailData = {
    action: 'subscription_renewed',
    firstName: firstName || '',
    email: email,
    licenseKey: licenseKey,
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

export async function main(args) {
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
    
    // Handle subscription renewal
    if (eventType === 'BILLING.SUBSCRIPTION.RENEWED') {
      const resource = webhookEvent.resource;
      const subscriptionId = resource.id;
      const subscriber = resource.subscriber;
      const email = subscriber?.email_address;
      const firstName = subscriber?.name?.given_name || '';
      const planId = resource.plan_id;
      
      if (!email) {
        console.error('No email found in subscription renewal event');
        return {
          statusCode: 400,
          body: { error: 'Missing email in webhook event' }
        };
      }
      
      console.log('Processing subscription renewal:', {
        subscriptionId,
        email,
        planId
      });
      
      // Determine subscription type from plan ID
      const subscriptionType = getSubscriptionTypeFromPlanId(planId);
      
      // Generate customer number (server-side, always consistent)
      const customerNumber = generateOrGetCustomerNumber(email);
      
      // Generate new license key
      const newLicenseKey = generateLicenseKey(subscriptionType);
      
      console.log('Generated renewal license:', {
        email,
        customerNumber,
        subscriptionType,
        licenseKey: newLicenseKey
      });
      
      // Send renewal email with new license key
      const emailSent = await sendRenewalEmail(email, firstName, newLicenseKey, customerNumber, subscriptionType);
      
      if (emailSent) {
        return {
          statusCode: 200,
          body: {
            success: true,
            message: 'Subscription renewed, new license key sent',
            subscriptionId,
            email,
            customerNumber,
            licenseKey: newLicenseKey
          }
        };
      } else {
        return {
          statusCode: 500,
          body: {
            success: false,
            error: 'Failed to send renewal email',
            subscriptionId,
            email
          }
        };
      }
    }
    
    // Handle other subscription events (log only, no action needed)
    if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || 
        eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
      console.log('Subscription event (no action needed):', eventType);
      return {
        statusCode: 200,
        body: { success: true, message: 'Event logged', eventType }
      };
    }
    
    // Unknown event type
    console.log('Unknown webhook event type:', eventType);
    return {
      statusCode: 200,
      body: { success: true, message: 'Event received but not processed', eventType }
    };
    
  } catch (error) {
    console.error('Error processing PayPal webhook:', error);
    return {
      statusCode: 500,
      body: { error: 'Internal server error', message: error.message }
    };
  }
}

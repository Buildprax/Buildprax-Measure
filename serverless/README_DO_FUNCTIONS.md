DigitalOcean App Platform Functions - SendGrid Email Endpoint

This function sends welcome emails to users and a notification to support@buildprax.com using SendGrid.

Structure
- website/serverless/package.json
- website/serverless/send-email/index.js (exports async function main(args))

Deploy (DigitalOcean App Platform)
1) Push this repo to GitHub.
2) In DigitalOcean → Apps → Edit → Add Component → Functions.
   - Source: This repo
   - Directory: website/serverless
   - Function runtime: Node.js (latest LTS)
   - Routes: map to /api/* (App Platform auto-exposes functions as HTTP endpoints). If asked for a specific route, set Path: /api/send-email pointing to send-email.
3) Environment Variables (add to the Functions component):
   - SENDGRID_API_KEY = SG.xxxxx (your key)
   - FROM_EMAIL = support@buildprax.com
   - SUPPORT_EMAIL = support@buildprax.com
   - WELCOME_TEMPLATE_ID = (optional, if you created a SendGrid Dynamic Template)
4) Save & Deploy.

Test
- POST https://YOUR_APP_DOMAIN/api/send-email with JSON body:
  {
    "action": "trial_registration",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "company": "Acme",
    "phone": "+1 555 555 5555"
  }
- You should receive: 200 { ok: true }

Wire the website
Update website/script.js registration submit handler to POST to /api/send-email, then start the download on success.

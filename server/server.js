const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

// Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// License storage
const LICENSE_FILE = path.join(__dirname, 'licenses.json');
function loadLicenses() {
  try {
    if (fs.existsSync(LICENSE_FILE)) {
      return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
    }
  } catch (e) { console.error('License load error:', e.message); }
  return {};
}
function saveLicenses(licenses) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(licenses, null, 2));
}

// Plan definitions
const PLANS = {
  starter: { name: 'Starter', price: 4900, currency: 'usd', desc: 'Personal lifetime license' },
  professional: { name: 'Professional', price: 9900, currency: 'usd', desc: 'Power user lifetime license' },
  enterprise: { name: 'Enterprise', price: 100000, currency: 'usd', desc: 'Team license up to 10 seats' }
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..'))); // Serve whole project

// Stripe webhook (raw body needed)
app.post('/api/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details.email;
    const planKey = session.metadata.plan_key;
    const plan = PLANS[planKey];
    const name = session.metadata.customer_name || 'Valued Customer';

    if (plan && email) {
      const licenseKey = generateLicenseKey(email, plan.price);
      const license = {
        key: licenseKey,
        plan: plan.name,
        price: plan.price / 100,
        email: email,
        name: name,
        date: Date.now(),
        sessionId: session.id,
        verified: true
      };
      const licenses = loadLicenses();
      licenses[licenseKey] = license;
      licenses[email] = licenses[email] || [];
      licenses[email].push(license);
      saveLicenses(licenses);
      console.log('License generated:', licenseKey, 'for', email, plan.name);
    }
  }

  res.json({ received: true });
});

// Create Stripe Checkout Session
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { plan_key, customer_name, customer_email } = req.body;
    const plan = PLANS[plan_key];
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: plan.currency,
          product_data: {
            name: 'Nova ' + plan.name,
            description: plan.desc,
          },
          unit_amount: plan.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: BASE_URL + '/api/purchase-success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: BASE_URL + '/api/purchase-cancelled',
      customer_email: customer_email || undefined,
      metadata: {
        plan_key: plan_key,
        customer_name: customer_name || '',
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Purchase success (redirect target after Stripe checkout)
app.get('/api/purchase-success', async (req, res) => {
  const sessionId = req.query.session_id;
  let license = null;

  if (sessionId) {
    const licenses = loadLicenses();
    // Find license by session ID
    for (const key of Object.keys(licenses)) {
      if (licenses[key].sessionId === sessionId) {
        license = licenses[key];
        break;
      }
    }
    // If webhook hasn't processed yet, fetch from Stripe
    if (!license) {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const email = session.customer_details.email;
        const planKey = session.metadata.plan_key;
        const plan = PLANS[planKey];
        const name = session.metadata.customer_name || 'Valued Customer';

        if (plan && email && session.payment_status === 'paid') {
          const licenseKey = generateLicenseKey(email, plan.price);
          license = {
            key: licenseKey, plan: plan.name, price: plan.price / 100,
            email, name, date: Date.now(), sessionId, verified: true
          };
          const allLicenses = loadLicenses();
          allLicenses[licenseKey] = license;
          saveLicenses(allLicenses);
        }
      } catch (e) { console.error('Session retrieve error:', e.message); }
    }
  }

  if (license) {
    res.send(renderSuccessPage(license));
  } else {
    res.redirect(BASE_URL + '/nova/landing/?purchase=pending');
  }
});

// Purchase cancelled
app.get('/api/purchase-cancelled', (req, res) => {
  res.send(renderCancelledPage());
});

// Verify license
app.get('/api/verify-license', (req, res) => {
  const key = req.query.key;
  const licenses = loadLicenses();
  if (key && licenses[key]) {
    res.json({ valid: true, license: licenses[key] });
  } else {
    res.json({ valid: false });
  }
});


// Email waitlist
const WAITLIST_FILE = path.join(__dirname, 'waitlist.json');
function loadWaitlist() {
  try {
    if (fs.existsSync(WAITLIST_FILE)) {
      return JSON.parse(fs.readFileSync(WAITLIST_FILE, 'utf8'));
    }
  } catch(e) {}
  return [];
}

app.post('/api/waitlist', express.json(), (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  const list = loadWaitlist();
  if (list.some(e => e.email === email)) {
    return res.json({ status: 'already_registered' });
  }
  list.push({ email, date: Date.now() });
  fs.writeFileSync(WAITLIST_FILE, JSON.stringify(list, null, 2));
  console.log('Waitlist signup:', email);
  res.json({ status: 'registered' });
});

app.get('/api/waitlist-count', (req, res) => {
  const list = loadWaitlist();
  res.json({ count: list.length });
});
// Get licenses by email
app.get('/api/licenses', (req, res) => {
  const email = req.query.email;
  if (!email) return res.json({ licenses: [] });
  const licenses = loadLicenses();
  const results = Object.values(licenses).filter(l => l.email === email);
  res.json({ licenses: results });
});

function generateLicenseKey(email, priceCents) {
  const price = priceCents / 100;
  const prefix = price >= 1000 ? 'ENT' : price >= 99 ? 'PRO' : 'STD';
  const timestamp = Date.now().toString(36).toUpperCase();
  const emailHash = simpleHash(email).slice(0, 8).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const checksum = simpleHash(prefix + timestamp + emailHash).slice(0, 4).toUpperCase();
  return [prefix, timestamp.slice(0, 4), emailHash, random, checksum].join('-');
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function renderSuccessPage(license) {
  return `
<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Purchase Successful — Nova</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{font-size:16px}
  body{font-family:'Inter',-apple-system,sans-serif;background:#07070c;color:#e4e4ed;line-height:1.6;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .container{max-width:560px;width:100%;padding:40px 24px}
  .card{background:#101018;border:1px solid #1e1e2e;border-radius:14px;padding:48px 40px;text-align:center}
  .check{width:64px;height:64px;border-radius:50%;background:rgba(91,191,122,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px}
  h1{font-size:28px;font-weight:700;margin-bottom:8px}
  .sub{color:#9393b0;font-size:15px;margin-bottom:24px}
  .license-box{background:#0c0c18;border:1px dashed #c8a45c;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:left}
  .license-box .label{font-size:11px;color:#63637d;font-weight:500;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px}
  .license-box .key{font-family:'Courier New',monospace;font-size:14px;color:#c8a45c;word-break:break-all}
  .license-box .row{margin-bottom:10px}
  .license-box .row:last-child{margin-bottom:0}
  .license-box .val{font-size:14px;color:#e4e4ed}
  .btn{display:inline-block;padding:14px 32px;background:#c8a45c;color:#07070c;border-radius:8px;font-weight:600;font-size:15px;text-decoration:none;transition:all 0.2s;margin-top:24px}
  .btn:hover{background:#dbb96a;transform:translateY(-2px)}
  .btn-secondary{display:inline-block;margin-top:12px;padding:10px 24px;border:1px solid #2a2a3e;border-radius:8px;color:#e4e4ed;font-size:13px;font-weight:500;text-decoration:none;transition:all 0.2s}
  .btn-secondary:hover{border-color:#c8a45c}
  .note{font-size:12px;color:#63637d;margin-top:16px}
</style>
</head><body>
<div class="container"><div class="card">
<div class="check">&#10004;</div>
<h1>Purchase Successful!</h1>
<p class="sub">Thank you, ${license.name}. Your Nova license is ready.</p>
<div class="license-box">
  <div class="row"><div class="label">License Key</div><div class="key">${license.key}</div></div>
  <div class="row" style="margin-top:12px"><div class="label">Plan</div><div class="val">${license.plan}</div></div>
  <div class="row"><div class="label">Email</div><div class="val">${license.email}</div></div>
  <div class="row"><div class="label">Date</div><div class="val">${new Date(license.date).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div></div>
</div>
<a class="btn" href="/nova/index.html">Open Nova App</a>
<a class="btn-secondary" href="/">Back to Home</a>
<p class="note">A confirmation has been sent to your email. Save your license key — you'll need it for support.</p>
</div></div>
<script>
  // Store license in localStorage for the app
  var db = JSON.parse(localStorage.getItem('nova-licenses') || '{}');
  db['${license.key}'] = ${JSON.stringify(license)};
  localStorage.setItem('nova-licenses', JSON.stringify(db));
  localStorage.setItem('nova-active-license', '${license.key}');
</script>
</body></html>`;
}

function renderCancelledPage() {
  return `
<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Purchase Cancelled — Nova</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{font-size:16px}
  body{font-family:'Inter',-apple-system,sans-serif;background:#07070c;color:#e4e4ed;line-height:1.6;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .container{max-width:480px;width:100%;padding:40px 24px}
  .card{background:#101018;border:1px solid #1e1e2e;border-radius:14px;padding:48px 40px;text-align:center}
  h1{font-size:24px;font-weight:700;margin-bottom:12px}
  p{color:#9393b0;font-size:15px;margin-bottom:24px;line-height:1.7}
  .btn{display:inline-block;padding:12px 28px;background:#c8a45c;color:#07070c;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;transition:all 0.2s}
  .btn:hover{background:#dbb96a}
  .btn-secondary{display:inline-block;margin-top:12px;margin-left:8px;padding:12px 28px;border:1px solid #2a2a3e;border-radius:8px;color:#e4e4ed;font-size:14px;font-weight:500;text-decoration:none;transition:all 0.2s}
  .btn-secondary:hover{border-color:#c8a45c}
</style>
</head><body>
<div class="container"><div class="card">
<h1>Purchase Cancelled</h1>
<p>No problem. Your payment was not processed. When you're ready, you can try again anytime.</p>
<a class="btn" href="/nova/landing/index.html#pricing">Try Again</a>
<a class="btn-secondary" href="/">Back to Home</a>
</div></div>
</body></html>`;
}

app.listen(PORT, () => {
  console.log('Nova Server running on http://localhost:' + PORT);
  console.log('Landing page: http://localhost:' + PORT + '/nova/landing/');
  console.log('App: http://localhost:' + PORT + '/nova/index.html');
  console.log('Stripe mode:', process.env.STRIPE_SECRET_KEY ? (process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'TEST' : 'LIVE') : 'NOT CONFIGURED');
});



# Nova ¡ª Deployment Guide

Get Nova online in 10 minutes.

## One-Click Deploy (Render)

1. Push the project to a GitHub repository:
   `
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/nova.git
   git push -u origin main
   `

2. Go to https://render.com and sign up / log in

3. Click \"New +\" > \"Blueprint\" > Connect your GitHub repo

4. Render reads \ender.yaml\ and sets up everything automatically

5. Add your Stripe keys as environment variables in Render dashboard:
   - \STRIPE_SECRET_KEY\ ¡ª from https://dashboard.stripe.com/apikeys
   - \STRIPE_WEBHOOK_SECRET\ ¡ª from Stripe webhook settings

6. Your site is live at \https://nova.onrender.com\

## Setting Up Stripe Payments

1. Create a Stripe account: https://dashboard.stripe.com/register

2. Get your API keys:
   - Go to https://dashboard.stripe.com/apikeys
   - Copy \"Secret key\" (starts with \sk_live_\ or \sk_test_\)

3. Set up webhook (for reliable license delivery):
   - Go to https://dashboard.stripe.com/webhooks
   - Add endpoint: \https://YOUR-DOMAIN/api/webhook\
   - Select event: \checkout.session.completed\
   - Copy the \"Signing secret\" (\whsec_\...\)

4. Add both keys as environment variables on Render

## Alternative: Self-Hosted

### Using Docker:
`ash
docker build -t nova .
docker run -p 3001:3001 \
  -e STRIPE_SECRET_KEY=sk_live_... \
  -e STRIPE_WEBHOOK_SECRET=whsec_... \
  -e BASE_URL=https://yourdomain.com \
  nova
`

### Using Node directly:
`ash
cd server
npm install
STRIPE_SECRET_KEY=sk_test_... \
STRIPE_WEBHOOK_SECRET=whsec_... \
BASE_URL=http://localhost:3001 \
node server.js
`

## After Deployment

1. **Set your domain**: Replace \BASE_URL\ in env vars with your actual domain

2. **Update landing page links**: The social sharing buttons and checkout flow use relative paths and work automatically

3. **Monitor sales**: Check Stripe dashboard for payments

4. **Collect emails**: The waitlist stores emails in \server/waitlist.json\

## Launch Checklist

- [ ] Create Stripe account
- [ ] Add Stripe API keys to Render
- [ ] Set up Stripe webhook
- [ ] Point domain to Render
- [ ] Update BASE_URL
- [ ] Test purchase flow with a real card
- [ ] Post on ProductHunt (copy in LAUNCH-KIT.md)
- [ ] Post on Hacker News (copy in LAUNCH-KIT.md)
- [ ] Tweet about launch (copy in LAUNCH-KIT.md)
- [ ] Email waitlist subscribers

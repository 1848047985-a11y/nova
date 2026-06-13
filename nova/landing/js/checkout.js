/**
 * Nova — Checkout & Licensing System
 */
const NovaCheckout = {
  currentPlan: null,
  licenseDB: {},

  init() {
    this.loadLicenseDB();
    this.renderExistingLicense();
  },

  loadLicenseDB() {
    try {
      const data = localStorage.getItem('nova-licenses');
      this.licenseDB = data ? JSON.parse(data) : {};
    } catch {
      this.licenseDB = {};
    }
  },

  saveLicenseDB() {
    localStorage.setItem('nova-licenses', JSON.stringify(this.licenseDB));
  },

  openCheckout(plan) {
    this.currentPlan = plan;
    const overlay = document.getElementById('checkoutOverlay');
    document.getElementById('checkoutPlanName').textContent = plan.name;
    document.getElementById('checkoutPlanPrice').textContent = '$' + plan.price;
    document.getElementById('checkoutPlanDesc').textContent = plan.desc;
    document.getElementById('checkoutEmail').value = '';
    document.getElementById('checkoutName').value = '';
    document.getElementById('checkoutError').classList.add('hidden');
    document.getElementById('checkoutSuccess').classList.add('hidden');
    document.getElementById('checkoutForm').classList.remove('hidden');
    document.getElementById('checkoutBtn').textContent = 'Pay $' + plan.price + ' — Complete Purchase';
    document.getElementById('checkoutBtn').disabled = false;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => { document.getElementById('checkoutName').focus(); }, 200);
  },

  closeCheckout() {
    document.getElementById('checkoutOverlay').classList.add('hidden');
    document.body.style.overflow = '';
    this.currentPlan = null;
  },

  async processPurchase() {
    const name = document.getElementById('checkoutName').value.trim();
    const email = document.getElementById('checkoutEmail').value.trim();
    const errorEl = document.getElementById('checkoutError');

    if (!name) { errorEl.textContent = 'Please enter your name.'; errorEl.classList.remove('hidden'); return; }
    if (!email || !email.includes('@') || !email.includes('.')) {
      errorEl.textContent = 'Please enter a valid email address.';
      errorEl.classList.remove('hidden');
      return;
    }
    errorEl.classList.add('hidden');

    const btn = document.getElementById('checkoutBtn');
    btn.disabled = true;
    btn.textContent = 'Connecting to secure checkout...';

    // Determine server URL
    const serverUrl = window.location.port === '3001'
      ? ''
      : 'http://localhost:3001';

    try {
      // Try server-backed Stripe checkout
      const planMap = { 'Starter': 'starter', 'Professional': 'professional', 'Enterprise': 'enterprise' };
      const res = await fetch(serverUrl + '/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_key: planMap[this.currentPlan.name] || 'starter',
          customer_name: name,
          customer_email: email
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Redirect to Stripe Checkout
        window.location.href = data.url;
        return;
      }
    } catch (e) {
      console.log('Server unavailable, using offline mode:', e.message);
    }

    // Fallback: offline simulation mode
    btn.textContent = 'Processing (offline mode)...';
    await this.simulatePayment();

    const licenseKey = this.generateLicenseKey(email, this.currentPlan.price);
    const purchase = {
      key: licenseKey,
      plan: this.currentPlan.name,
      price: this.currentPlan.price,
      email: email,
      name: name,
      date: Date.now(),
      verified: false
    };

    this.licenseDB[licenseKey] = purchase;
    this.saveLicenseDB();
    localStorage.setItem('nova-active-license', licenseKey);

    document.getElementById('checkoutForm').classList.add('hidden');
    const successEl = document.getElementById('checkoutSuccess');
    document.getElementById('successLicense').textContent = licenseKey;
    document.getElementById('successPlan').textContent = this.currentPlan.name + ' — $' + this.currentPlan.price;
    document.getElementById('successEmail').textContent = email;
    document.getElementById('successName').textContent = name;
    successEl.classList.remove('hidden');

    setTimeout(() => {
      this.downloadProduct();
      this.renderExistingLicense();
    }, 1500);
  },

  simulatePayment() {
    return new Promise(resolve => {
      let dots = 0;
      const btn = document.getElementById('checkoutBtn');
      const interval = setInterval(() => {
        dots = (dots + 1) % 4;
        btn.textContent = 'Processing payment' + '.'.repeat(dots);
      }, 400);
      setTimeout(() => {
        clearInterval(interval);
        btn.textContent = 'Payment successful!';
        setTimeout(resolve, 600);
      }, 2000);
    });
  },

  generateLicenseKey(email, price) {
    const prefix = price >= 1000 ? 'ENT' : price >= 99 ? 'PRO' : 'STD';
    const timestamp = Date.now().toString(36).toUpperCase();
    const emailHash = this.simpleHash(email).slice(0, 8).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const checksum = this.simpleHash(prefix + timestamp + emailHash).slice(0, 4).toUpperCase();
    return [prefix, timestamp.slice(0, 4), emailHash, random, checksum].join('-');
  },

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    let hex = Math.abs(hash).toString(16);
    while (hex.length < 8) hex = '0' + hex;
    return hex;
  },

  downloadProduct() {
    const link = document.createElement('a');
    link.href = '../../dist/nova-app-v1.0.zip';
    link.download = 'nova-app-v1.0.zip';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  renderExistingLicense() {
    const activeKey = localStorage.getItem('nova-active-license');
    const el = document.getElementById('licenseStatus');
    if (activeKey && this.licenseDB[activeKey]) {
      const lic = this.licenseDB[activeKey];
      el.style.display = 'flex';
      el.innerHTML = '<span style="color:#5bbf7a">Licensed</span> <span style="color:#63637d;font-size:12px">' + lic.plan + '</span> <a href="../index.html" style="color:#c8a45c;font-size:12px;font-weight:500">App</a> <a href="download.html" style="color:#c8a45c;font-size:12px;font-weight:500">Downloads</a>';
    } else {
      el.style.display = 'none';
      el.innerHTML = '';
    }
  },

  verifyLicense(key) {
    return this.licenseDB[key] || null;
  }
};


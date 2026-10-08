// MOVA — serveur de la boutique (Node 20+, sans framework).
// Démarrage : npm start  →  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- Configuration (.env facultatif) ---------------------------------------
(function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const { hashPassword, verifyPassword, token, id, readableCode, verifyTotp, safeEqual } = require('./lib/security');
const { priceCart, variantKey, findPromo, round2 } = require('./lib/pricing');
const { computeStats, insights, PAID } = require('./lib/analytics');
const assistant = require('./lib/assistant');
const knowledge = require('./lib/knowledge');
const { seed, DB_PATH } = require('./data/seed');

const PORT = Number(process.env.PORT || 3000);
let BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const BASE_CONFIGURED = !!process.env.BASE_URL;
const ON_VERCEL = !!process.env.VERCEL;
const PUBLIC = path.join(__dirname, 'public');
const UPLOADS = path.join(PUBLIC, 'uploads');
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const IS_PROD = process.env.NODE_ENV === 'production';
if (IS_PROD && /^sk_test_/.test(STRIPE_KEY)) console.warn('[stripe] Clé de TEST utilisée en production.');

// --- Base de données (fichier JSON, écriture atomique) ---------------------
// Sur Vercel, seul /tmp est inscriptible (et temporaire) : la base y est recréée au démarrage d'une instance.
const DBFILE = ON_VERCEL ? '/tmp/mova-db.json' : DB_PATH;
let db;
if (!fs.existsSync(DBFILE)) { db = seed(); fs.writeFileSync(DBFILE, JSON.stringify(db)); }
else db = JSON.parse(fs.readFileSync(DBFILE, 'utf8'));
if (process.env.ADMIN_PASSWORD) { db.admin.passwordHash = hashPassword(process.env.ADMIN_PASSWORD); db.admin.demoPassword = false; }

let saveTimer = null;
function save() {
  if (ON_VERCEL) { fs.writeFileSync(DBFILE, JSON.stringify(db)); return; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DBFILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DBFILE);
  }, 150);
}
function audit(actor, action, detail) { db.audit.push({ at: new Date().toISOString(), actor, action, detail }); if (db.audit.length > 5000) db.audit.shift(); }

// --- E-mails (boîte d'envoi locale ; envoi réel via Brevo si BREVO_API_KEY) --
async function sendEmail({ to, subject, html, kind, marketing = false }) {
  const entry = { id: id('mail'), at: new Date().toISOString(), to, subject, html, kind, marketing, status: 'simulé' };
  db.outbox.push(entry);
  if (db.outbox.length > 1000) db.outbox.shift();
  save();
  if (process.env.BREVO_API_KEY && process.env.MAIL_FROM) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ sender: { email: process.env.MAIL_FROM, name: 'MOVA' }, to: [{ email: to }], subject, htmlContent: html }) });
      entry.status = r.ok ? 'envoyé' : `erreur ${r.status}`;
    } catch (e) { entry.status = 'erreur réseau'; }
    save();
  }
}
const mailLayout = (title, body) => `<div style="background:#FBF7EF;padding:32px;font-family:Inter,Arial,sans-serif;color:#2A1A12"><div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:32px"><p style="letter-spacing:.3em;font-weight:700;color:#4A2A1C;margin:0 0 24px">MOVA</p><h1 style="font-size:22px;margin:0 0 16px">${title}</h1>${body}<p style="color:#7A716A;font-size:12px;margin-top:32px">MOVA · Ton rythme. Ton style.</p></div></div>`;
const unsubscribe = email => `<p style="font-size:12px;color:#7A716A">Tu ne veux plus recevoir nos e-mails ? <a href="${BASE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&sig=${sign(email)}">Se désinscrire en un clic</a>.</p>`;
const SIGN_KEY = process.env.SESSION_SECRET || (db.meta.signKey ||= token(24));
function sign(v) { return crypto.createHmac('sha256', SIGN_KEY).update(String(v)).digest('base64url').slice(0, 22); }
const euros = n => `${Number(n).toFixed(2).replace('.', ',')} €`;

// --- Utilitaires HTTP --------------------------------------------------------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
const CSP = ["default-src 'self'", "script-src 'self' https://unpkg.com https://cdnjs.cloudflare.com", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://cdnjs.cloudflare.com", "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob: https://images.unsplash.com https://*.tile.openstreetmap.org https://unpkg.com https://cdnjs.cloudflare.com", "media-src 'self' blob:", "connect-src 'self'", "frame-ancestors 'none'", "form-action 'self' https://checkout.stripe.com", "base-uri 'self'"].join('; ');

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'content-type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}
const fail = (res, status, error, extra = {}) => send(res, status, { error, ...extra });

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function cookie(name, value, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${BASE_URL.startsWith('https') ? '; Secure' : ''}`;
}

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Requête trop volumineuse'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Limitation des tentatives (connexion, inscription newsletter, chatbot).
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
}
const ipOf = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const validEmail = e => typeof e === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e.trim());
const clean = (s, max = 200) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, max);

// --- Sessions -----------------------------------------------------------------
function createSession(kind, subjectId, days = 30) {
  const t = token(32);
  db.sessions.push({ token: crypto.createHash('sha256').update(t).digest('hex'), kind, subjectId, expiresAt: Date.now() + days * 864e5 });
  db.sessions = db.sessions.filter(s => s.expiresAt > Date.now());
  save();
  return t;
}
function sessionFor(req, kind) {
  const raw = parseCookies(req)[`mova_${kind}`];
  if (!raw) return null;
  const h = crypto.createHash('sha256').update(raw).digest('hex');
  return db.sessions.find(s => s.token === h && s.kind === kind && s.expiresAt > Date.now()) || null;
}
function destroySession(req, kind) {
  const raw = parseCookies(req)[`mova_${kind}`];
  if (!raw) return;
  const h = crypto.createHash('sha256').update(raw).digest('hex');
  db.sessions = db.sessions.filter(s => s.token !== h); save();
}
const currentUser = req => { const s = sessionFor(req, 'user'); return s ? db.users.find(u => u.id === s.subjectId) || null : null; };

// --- Vues publiques -------------------------------------------------------------
function publicProduct(p) {
  const { stock, ...rest } = p;
  const availability = {};
  for (const [k, v] of Object.entries(stock)) availability[k] = v <= 0 ? 0 : v <= (p.lowStockThreshold || 3) ? v : 99; // on n'expose pas le stock exact au-delà du seuil
  return { ...rest, availability };
}
function publicUser(u) {
  return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone || '', birthDate: u.birthDate || '', addresses: u.addresses, favorites: u.favorites,
    sizeProfile: u.sizeProfile, morphology: u.morphology, interests: u.interests, consents: { newsletter: !!u.consents?.newsletter, sms: !!u.consents?.sms },
    club: { member: !!u.club?.member }, createdAt: u.createdAt, demo: !!u.demo };
}
function publicOrder(o) {
  return { id: o.id, number: o.number, status: o.status, createdAt: o.createdAt, paidAt: o.paidAt, lines: o.lines, subtotal: o.subtotal, ensemble: o.ensemble, promo: o.promo, promoDiscount: o.promoDiscount,
    shipping: o.shipping, shippingMethod: o.shippingMethod, total: o.total, address: o.address, tracking: o.tracking, refunds: o.refunds || [], returnRequest: o.returnRequest, email: o.email,
    payment: { provider: o.payment?.provider, method: o.payment?.method }, estimatedDelivery: o.estimatedDelivery, demo: !!o.demo };
}

// --- MOVA Club -------------------------------------------------------------------
function loyalty(user, { notify = true } = {}) {
  const cfg = db.settings.club;
  const orders = db.orders.filter(o => o.userId === user.id && ['paid', 'shipped', 'delivered', 'partially_refunded'].includes(o.status));
  const delay = cfg.countDelayDays * 864e5;
  const validated = orders.filter(o => Date.now() - new Date(o.paidAt) >= delay);
  const pending = orders.filter(o => Date.now() - new Date(o.paidAt) < delay);
  user.club ||= { member: false, sessions: [], rewards: [], qrToken: token(12) };
  user.club.qrToken ||= token(12);
  const rewards = user.club.rewards;
  let changed = false;
  if (user.club.member) {
    const earned = Math.floor(validated.length / cfg.purchasesForReward);
    const have = rewards.filter(r => r.type === 'achats').length;
    for (let i = have; i < earned; i++) {
      const expires = new Date(); expires.setMonth(expires.getMonth() + cfg.rewardValidityMonths);
      const r = { id: id('rwd'), type: 'achats', label: `-${cfg.rewardPercent} % sur une séance en studio partenaire`, code: readableCode('CLUB'), createdAt: new Date().toISOString(), expiresAt: expires.toISOString(), status: 'disponible' };
      rewards.push(r); changed = true;
      if (notify) sendEmail({ to: user.email, kind: 'fidelite', subject: 'Ta récompense MOVA Club est débloquée', html: mailLayout('Bravo, 5 achats MOVA !', `<p>Tu as débloqué <b>${r.label}</b>.</p><p style="font-size:24px;letter-spacing:.15em"><b>${r.code}</b></p><p>Valable jusqu’au ${new Date(r.expiresAt).toLocaleDateString('fr-FR')}, une seule fois, dans un studio partenaire participant. Ton QR code est dans ton espace fidélité.</p>`) });
    }
    for (const tier of cfg.sessionTiers) {
      if (user.club.sessions.length >= tier.sessions && !rewards.some(r => r.type === 'seances' && r.tier === tier.sessions)) {
        const r = { id: id('rwd'), type: 'seances', tier: tier.sessions, label: tier.reward, code: readableCode('CADEAU'), createdAt: new Date().toISOString(), expiresAt: null, status: 'disponible' };
        rewards.push(r); changed = true;
        if (notify) sendEmail({ to: user.email, kind: 'fidelite', subject: `${tier.sessions} séances : ton cadeau MOVA t’attend`, html: mailLayout(`${tier.sessions} séances validées !`, `<p>Tu as gagné : <b>${tier.reward}</b>. Code : <b>${r.code}</b>. Il sera ajouté gratuitement à ta prochaine commande, ou remis par ton studio partenaire.</p>`) });
      }
    }
    for (const r of rewards) if (r.status === 'disponible' && r.expiresAt && new Date(r.expiresAt) < new Date()) { r.status = 'expirée'; changed = true; }
  }
  if (changed) save();
  const nextTier = cfg.sessionTiers.find(t => user.club.sessions.length < t.sessions) || null;
  return {
    member: !!user.club.member, joinedAt: user.club.joinedAt, totalOrders: orders.length,
    purchases: { validated: validated.length, progress: validated.length % cfg.purchasesForReward, target: cfg.purchasesForReward, countDelayDays: cfg.countDelayDays,
      list: orders.map(o => ({ number: o.number, paidAt: o.paidAt, counted: Date.now() - new Date(o.paidAt) >= delay, countsOn: new Date(new Date(o.paidAt).getTime() + delay).toISOString() })) },
    sessions: { count: user.club.sessions.length, nextTier, tiers: cfg.sessionTiers,
      history: user.club.sessions.slice().reverse().map(s => ({ at: s.at, partner: db.partners.find(p => p.id === s.partnerId)?.name || 'Studio' })) },
    rewards: rewards.slice().reverse().map(r => ({ ...r, partner: r.partnerId ? db.partners.find(p => p.id === r.partnerId)?.name : undefined })),
    qrToken: user.club.member ? `MOVACLUB:${user.club.qrToken}` : null,
    rewardPercent: cfg.rewardPercent
  };
}

// --- Commandes -----------------------------------------------------------------
function adjustStock(lines, sign) {
  for (const l of lines) {
    const p = db.products.find(p => p.id === l.productId);
    if (!p) continue;
    const before = p.stock[l.key] ?? 0;
    p.stock[l.key] = Math.max(0, before + sign * l.qty);
    if (sign > 0 && before === 0 && p.stock[l.key] > 0) notifyRestock(p, l.key);
  }
}
function notifyRestock(p, key) {
  for (const a of db.restockAlerts.filter(a => a.productId === p.id && a.key === key && !a.sentAt)) {
    a.sentAt = new Date().toISOString();
    const [color, size] = key.split('|');
    sendEmail({ to: a.email, kind: 'reassort', subject: `${p.name} est de retour en stock`, html: mailLayout('C’est de retour !', `<p>${p.name} — ${db.colors.find(c => c.id === color)?.name}, taille ${size} — est à nouveau disponible.</p><p><a href="${BASE_URL}/#/produit/${p.id}?color=${color}">Voir le produit</a></p>`) });
  }
}

function estimatedDelivery(methodId) {
  const m = db.settings.shipping.methods.find(m => m.id === methodId) || db.settings.shipping.methods[0];
  const addBusiness = (d, n) => { const x = new Date(d); let k = 0; while (k < n) { x.setDate(x.getDate() + 1); if (x.getDay() !== 0 && x.getDay() !== 6) k++; } return x; };
  const start = new Date(); if (start.getHours() >= 13) start.setDate(start.getDate() + 1);
  return { from: addBusiness(start, m.days[0]).toISOString(), to: addBusiness(start, m.days[1]).toISOString() };
}

function markPaid(order, payment) {
  if (order.status !== 'pending_payment' && order.status !== 'expired') return order;
  if (order.status === 'expired') adjustStock(order.lines, -1); // paiement arrivé après expiration : on reprend le stock
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  order.payment = { ...order.payment, ...payment };
  delete order.reservedUntil;
  if (order.promo) { const p = findPromo(db, order.promo.code); if (p) p.uses = (p.uses || 0) + 1; }
  // Récompenses « séances » utilisées comme cadeau dans la commande.
  if (order.giftRewardId && order.userId) {
    const u = db.users.find(u => u.id === order.userId);
    const r = u?.club.rewards.find(r => r.id === order.giftRewardId);
    if (r && r.status === 'disponible') { r.status = 'utilisée'; r.usedAt = order.paidAt; r.usedIn = order.number; }
  }
  db.carts = db.carts.filter(c => !(c.email && c.email === order.email && c.status !== 'recovered'));
  audit('système', 'commande payée', `${order.number} — ${euros(order.total)} (${payment.provider})`);
  save();
  const rows = order.lines.map(l => `<tr><td>${l.name}<br><small>${db.colors.find(c => c.id === l.color)?.name} · ${l.size}${l.cut ? ' · ' + (db.cuts.find(c => c.id === l.cut)?.name || '') : ''}</small></td><td align="right">${l.qty} × ${euros(l.unitPrice)}</td></tr>`).join('');
  sendEmail({ to: order.email, kind: 'confirmation', subject: `Commande ${order.number} confirmée`, html: mailLayout(`Merci ! Ta commande ${order.number} est confirmée`,
    `<table width="100%" style="font-size:14px">${rows}${order.ensemble?.amount ? `<tr><td>Remise ensemble</td><td align="right">-${euros(order.ensemble.amount)}</td></tr>` : ''}${order.promoDiscount ? `<tr><td>Code ${order.promo.code}</td><td align="right">-${euros(order.promoDiscount)}</td></tr>` : ''}<tr><td>Livraison</td><td align="right">${order.shipping ? euros(order.shipping) : 'Offerte'}</td></tr><tr><td><b>Total payé</b></td><td align="right"><b>${euros(order.total)}</b></td></tr></table><p>Livraison estimée entre le ${new Date(order.estimatedDelivery.from).toLocaleDateString('fr-FR')} et le ${new Date(order.estimatedDelivery.to).toLocaleDateString('fr-FR')}.</p><p><a href="${BASE_URL}/#/confirmation/${order.id}?t=${order.accessToken}">Suivre ma commande</a></p>`) });
  return order;
}

// Libère le stock des commandes non payées après 15 minutes.
setInterval(() => {
  let changed = false;
  for (const o of db.orders) if (o.status === 'pending_payment' && o.reservedUntil && o.reservedUntil < Date.now()) { o.status = 'expired'; adjustStock(o.lines, +1); changed = true; }
  if (changed) save();
}, 60 * 1000).unref();

// --- Stripe (API REST, sans SDK) ---------------------------------------------
function formEncode(obj, prefix = '') {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') parts.push(formEncode(v, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return parts.filter(Boolean).join('&');
}
async function stripe(method, pathName, params) {
  const r = await fetch(`https://api.stripe.com/v1/${pathName}`, { method, headers: { authorization: `Bearer ${STRIPE_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body: params ? formEncode(params) : undefined });
  const json = await r.json();
  if (!r.ok) throw Object.assign(new Error(json.error?.message || 'Erreur Stripe'), { status: 502 });
  return json;
}
function verifyStripeSignature(raw, header) {
  if (!STRIPE_WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(`${parts.t}.${raw}`).digest('hex');
  return safeEqual(expected, parts.v1);
}

// --- Routeur -------------------------------------------------------------------
const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, opts });

function requireUser(ctx) { if (!ctx.user) throw Object.assign(new Error('Connecte-toi pour continuer.'), { status: 401 }); return ctx.user; }
function requireAdmin(ctx) { const s = sessionFor(ctx.req, 'admin'); if (!s) throw Object.assign(new Error('Accès réservé.'), { status: 401 }); return s; }
function requirePartner(ctx) {
  const s = sessionFor(ctx.req, 'partner');
  const acc = s && db.partnerAccounts.find(a => a.id === s.subjectId);
  const partner = acc && db.partners.find(p => p.id === acc.partnerId && p.status === 'actif');
  if (!partner) throw Object.assign(new Error('Accès réservé aux studios partenaires.'), { status: 401 });
  return partner;
}

// ===== Catalogue =====
route('GET', '/api/catalog', () => ({
  settings: { ensemblePrice: db.settings.ensemblePrice, ensembleSameColor: db.settings.ensembleSameColor, welcome: db.settings.welcome, shipping: db.settings.shipping, returnDays: db.settings.returnDays,
    club: { purchasesForReward: db.settings.club.purchasesForReward, rewardPercent: db.settings.club.rewardPercent, sessionTiers: db.settings.club.sessionTiers, countDelayDays: db.settings.club.countDelayDays } },
  colors: db.colors, cuts: db.cuts, lengths: db.lengths, categories: db.categories, bundles: db.bundles, sizeGuide: db.sizeGuide,
  products: db.products.filter(p => p.status === 'published').map(publicProduct),
  stripe: !!STRIPE_KEY, ai: assistant.aiEnabled()
}));
route('GET', '/api/reviews/:productId', ({ params }) => db.reviews.filter(r => r.productId === params.productId && r.status === 'published').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30)
  .map(({ userId, orderId, ...r }) => r));
route('POST', '/api/reviews', ({ body, ...ctx }) => {
  const user = requireUser(ctx);
  const product = db.products.find(p => p.id === body.productId);
  if (!product) throw Object.assign(new Error('Produit inconnu.'), { status: 404 });
  const order = db.orders.find(o => o.userId === user.id && ['delivered', 'shipped', 'paid'].includes(o.status) && o.lines.some(l => l.productId === product.id));
  if (!order) throw Object.assign(new Error('Seules les clientes ayant acheté ce produit peuvent laisser un avis.'), { status: 403 });
  if (db.reviews.some(r => r.userId === user.id && r.productId === product.id)) throw Object.assign(new Error('Tu as déjà laissé un avis sur ce produit.'), { status: 409 });
  const rating = Math.max(1, Math.min(5, parseInt(body.rating, 10) || 5));
  db.reviews.push({ id: id('rev'), productId: product.id, orderId: order.id, userId: user.id, author: `${user.firstName} ${user.lastName.charAt(0)}.`, rating, title: clean(body.title, 80), body: clean(body.body, 1500),
    size: order.lines.find(l => l.productId === product.id).size, fit: ['petit', 'normal', 'grand'].includes(body.fit) ? body.fit : 'normal', status: 'pending', verified: true, createdAt: new Date().toISOString() });
  save();
  return { ok: true, message: 'Merci ! Ton avis sera publié après modération.' };
});
route('GET', '/api/search', ({ url }) => {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return { products: [], categories: [], colors: [] };
  const n = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const nq = n(q);
  // Tolérance aux fautes courantes : distance d'édition sur chaque mot.
  const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
  const match = text => { const t = n(text); if (t.includes(nq)) return true; return nq.split(/\s+/).every(w => w.length < 4 ? t.includes(w) : t.split(/[\s'-]+/).some(tw => lev(w, tw.slice(0, w.length + 1)) <= 1 || tw.startsWith(w))); };
  return {
    products: db.products.filter(p => p.status === 'published' && match([p.name, p.category, p.fit, ...p.tags].join(' '))).slice(0, 6).map(p => ({ id: p.id, name: p.name, price: p.price, color: p.colors[0], type: p.type })),
    categories: db.categories.filter(c => match(c.name)).slice(0, 4),
    colors: db.colors.filter(c => match(c.name)).slice(0, 3)
  };
});
route('POST', '/api/restock-alerts', ({ body, req }) => {
  if (limited('restock:' + ipOf(req), 20, 36e5)) throw Object.assign(new Error('Trop de demandes.'), { status: 429 });
  if (!validEmail(body.email)) throw Object.assign(new Error('Adresse e-mail invalide.'), { status: 400 });
  const p = db.products.find(p => p.id === body.productId);
  if (!p || !(body.key in p.stock)) throw Object.assign(new Error('Variante inconnue.'), { status: 404 });
  if (!db.restockAlerts.some(a => a.productId === p.id && a.key === body.key && a.email === body.email.toLowerCase() && !a.sentAt))
    db.restockAlerts.push({ id: id('alr'), productId: p.id, key: body.key, email: body.email.toLowerCase().trim(), createdAt: new Date().toISOString() });
  save();
  return { ok: true, message: 'C’est noté ! On t’écrit dès le retour en stock.' };
});

// ===== Panier =====
route('POST', '/api/cart/price', ({ body, user }) => {
  const priced = priceCart(db, { items: body.items, promoCode: body.promoCode, email: body.email || user?.email, shippingMethod: body.shippingMethod });
  return priced;
});
route('POST', '/api/cart/sync', ({ body, user }) => {
  // Sauvegarde du panier d'une cliente identifiée (relances de panier abandonné, avec consentement).
  const email = user?.email || (validEmail(body.email) ? body.email.toLowerCase() : null);
  if (!email) return { ok: true };
  const items = (body.items || []).slice(0, 30);
  let cart = db.carts.find(c => c.email === email && c.status !== 'recovered' && !c.demo);
  if (!items.length) { if (cart) db.carts = db.carts.filter(c => c !== cart); save(); return { ok: true }; }
  const value = priceCart(db, { items }).total;
  if (!cart) { cart = { id: id('cart'), email, userId: user?.id || null, reminders: 0 }; db.carts.push(cart); }
  Object.assign(cart, { items, value, updatedAt: new Date().toISOString(), status: 'active', device: /Mobi/i.test(body.ua || '') ? 'mobile' : 'desktop' });
  save();
  return { ok: true };
});

// ===== Newsletter et pop-up -5 % =====
route('POST', '/api/newsletter', async ({ body, req, user }) => {
  if (limited('nl:' + ipOf(req), 8, 36e5)) throw Object.assign(new Error('Trop de tentatives, réessaie plus tard.'), { status: 429 });
  const email = String(body.email || '').trim().toLowerCase();
  if (!validEmail(email)) throw Object.assign(new Error('Adresse e-mail invalide.'), { status: 400 });
  if (!body.consent) throw Object.assign(new Error('Coche la case pour recevoir ton code et nos actualités.'), { status: 400 });
  const w = db.settings.welcome;
  let entry = db.newsletter.find(n => n.email === email);
  if (entry && entry.welcomeCode) {
    entry.unsubscribed = false; save();
    return { ok: true, already: true, message: 'Tu es déjà inscrite : ton code de bienvenue t’a été envoyé lors de ta première inscription.' };
  }
  const hasOrdered = db.orders.some(o => o.email === email && PAID.includes(o.status));
  const code = hasOrdered ? null : readableCode('BIENVENUE');
  if (code) db.promoCodes.push({ code, label: `Bienvenue -${w.percent} %`, type: 'percent', value: w.percent, active: true, uses: 0, maxUses: 1, firstOrderOnly: true, email, expiresAt: new Date(Date.now() + w.validityDays * 864e5).toISOString(), createdAt: new Date().toISOString() });
  entry = { email, createdAt: new Date().toISOString(), source: clean(body.source, 40) || 'popup_bienvenue', consent: true, consentText: `J’accepte de recevoir les actualités et offres MOVA par e-mail.`, confirmed: false, confirmToken: token(16), welcomeCode: code, unsubscribed: false };
  db.newsletter.push(entry);
  if (user && !user.consents.newsletter) user.consents.newsletter = { at: entry.createdAt, source: entry.source, text: entry.consentText };
  save();
  await sendEmail({ to: email, kind: 'bienvenue', marketing: true, subject: code ? `Bienvenue chez MOVA : ton code -${w.percent} %` : 'Bienvenue chez MOVA', html: mailLayout('Bienvenue dans la communauté MOVA',
    `<p>Confirme ton inscription : <a href="${BASE_URL}/api/newsletter/confirm?t=${entry.confirmToken}">je confirme</a>.</p>${code ? `<p>Ton code de bienvenue, valable ${w.validityDays} jours sur ta première commande :</p><p style="font-size:24px;letter-spacing:.15em"><b>${code}</b></p>` : ''}<p>MOVA, c’est une tenue pour tous tes plans : du studio au café, sans te changer. Découvre la <a href="${BASE_URL}/#/collection/hiver">collection hiver</a> et ses 8 coloris.</p>${unsubscribe(email)}`) });
  return { ok: true, code, percent: w.percent, validityDays: w.validityDays };
});
route('GET', '/api/newsletter/confirm', ({ url, res }) => {
  const e = db.newsletter.find(n => n.confirmToken && n.confirmToken === url.searchParams.get('t'));
  if (e) { e.confirmed = true; e.confirmedAt = new Date().toISOString(); save(); }
  res.writeHead(302, { location: '/#/?newsletter=confirmee' }); res.end();
});
route('GET', '/api/newsletter/unsubscribe', ({ url, res }) => {
  const email = (url.searchParams.get('email') || '').toLowerCase();
  if (sign(email) === url.searchParams.get('sig')) {
    for (const n of db.newsletter.filter(n => n.email === email)) { n.unsubscribed = true; n.unsubscribedAt = new Date().toISOString(); }
    const u = db.users.find(u => u.email === email); if (u) u.consents.newsletter = null;
    audit('cliente', 'désinscription newsletter', email); save();
  }
  res.writeHead(302, { location: '/#/?newsletter=desinscrite' }); res.end();
});

// ===== Comptes clientes =====
route('POST', '/api/auth/register', ({ body, req, res }) => {
  if (limited('reg:' + ipOf(req), 10, 36e5)) throw Object.assign(new Error('Trop de tentatives.'), { status: 429 });
  const email = String(body.email || '').trim().toLowerCase();
  if (!validEmail(email)) throw Object.assign(new Error('Adresse e-mail invalide.'), { status: 400 });
  if (String(body.password || '').length < 10) throw Object.assign(new Error('Le mot de passe doit contenir au moins 10 caractères.'), { status: 400 });
  if (!clean(body.firstName) || !clean(body.lastName)) throw Object.assign(new Error('Prénom et nom obligatoires.'), { status: 400 });
  if (db.users.some(u => u.email === email)) throw Object.assign(new Error('Un compte existe déjà avec cet e-mail.'), { status: 409 });
  const now = new Date().toISOString();
  const user = { id: id('usr'), email, firstName: clean(body.firstName, 60), lastName: clean(body.lastName, 60), passwordHash: hashPassword(body.password), createdAt: now, emailVerified: false,
    addresses: [], favorites: Array.isArray(body.favorites) ? body.favorites.filter(f => db.products.some(p => p.id === f)).slice(0, 100) : [],
    sizeProfile: {}, morphology: null, interests: [], consents: { newsletter: body.newsletter ? { at: now, source: 'inscription', text: 'J’accepte de recevoir les actualités MOVA par e-mail.' } : null, sms: null },
    club: { member: !!body.joinClub, joinedAt: body.joinClub ? now : null, qrToken: token(12), sessions: [], rewards: [], rulesAcceptedAt: body.joinClub ? now : null }, supportNotes: [] };
  db.users.push(user);
  // Rattache les commandes passées en invitée avec le même e-mail sous 30 jours.
  for (const o of db.orders) if (!o.userId && o.email === email && Date.now() - new Date(o.createdAt) < 30 * 864e5) o.userId = user.id;
  save();
  sendEmail({ to: email, kind: 'compte', subject: 'Bienvenue sur ton compte MOVA', html: mailLayout(`Bienvenue ${user.firstName} !`, `<p>Ton compte MOVA est créé.${user.club.member ? ' Tu fais maintenant partie du MOVA Club : chaque commande te rapproche de ta récompense studio.' : ''}</p>`) });
  res.setHeader('set-cookie', cookie('mova_user', createSession('user', user.id), 30 * 86400));
  return { user: publicUser(user) };
});
route('POST', '/api/auth/login', ({ body, req, res }) => {
  const email = String(body.email || '').trim().toLowerCase();
  if (limited('login:' + email, 5, 15 * 60e3) || limited('loginip:' + ipOf(req), 30, 15 * 60e3)) throw Object.assign(new Error('Trop de tentatives. Réessaie dans 15 minutes.'), { status: 429 });
  const user = db.users.find(u => u.email === email);
  if (!user || !verifyPassword(body.password || '', user.passwordHash)) throw Object.assign(new Error('E-mail ou mot de passe incorrect.'), { status: 401 });
  res.setHeader('set-cookie', cookie('mova_user', createSession('user', user.id), 30 * 86400));
  return { user: publicUser(user) };
});
route('POST', '/api/auth/logout', ({ req, res }) => { destroySession(req, 'user'); res.setHeader('set-cookie', cookie('mova_user', '', 0)); return { ok: true }; });
route('GET', '/api/me', ({ user }) => ({ user: user ? publicUser(user) : null }));
route('PUT', '/api/me', ({ body, ...ctx }) => {
  const u = requireUser(ctx);
  if (body.firstName !== undefined) u.firstName = clean(body.firstName, 60) || u.firstName;
  if (body.lastName !== undefined) u.lastName = clean(body.lastName, 60) || u.lastName;
  if (body.phone !== undefined) u.phone = clean(body.phone, 20);
  if (body.birthDate !== undefined) u.birthDate = /^\d{4}-\d{2}-\d{2}$/.test(body.birthDate) ? body.birthDate : '';
  if (Array.isArray(body.addresses)) u.addresses = body.addresses.slice(0, 6).map((a, i) => ({ id: a.id || `adr_${i + 1}`, label: clean(a.label, 30), firstName: clean(a.firstName, 60), lastName: clean(a.lastName, 60), line1: clean(a.line1, 120), line2: clean(a.line2, 120), zip: clean(a.zip, 10), city: clean(a.city, 60), country: 'FR', phone: clean(a.phone, 20), default: !!a.default }));
  if (Array.isArray(body.favorites)) u.favorites = [...new Set(body.favorites.filter(f => db.products.some(p => p.id === f) || db.bundles.some(b => b.id === f)))].slice(0, 200);
  if (body.sizeProfile) u.sizeProfile = { top: clean(body.sizeProfile.top, 4), bottom: clean(body.sizeProfile.bottom, 4), fit: clean(body.sizeProfile.fit, 12), length: clean(body.sizeProfile.length, 12) };
  if (body.morphology !== undefined) u.morphology = body.morphology ? Object.fromEntries(Object.entries(body.morphology).filter(([k]) => ['height', 'weight', 'bust', 'waist', 'hips', 'inseam', 'shape'].includes(k)).map(([k, v]) => [k, k === 'shape' ? clean(v, 20) : Number(v) || null])) : null;
  if (Array.isArray(body.interests)) u.interests = body.interests.filter(i => ['pilates', 'padel', 'fitness', 'ville'].includes(i));
  if (body.consents) {
    const now = new Date().toISOString();
    if ('newsletter' in body.consents) u.consents.newsletter = body.consents.newsletter ? (u.consents.newsletter || { at: now, source: 'compte', text: 'J’accepte de recevoir les actualités MOVA par e-mail.' }) : null;
    if ('sms' in body.consents) u.consents.sms = body.consents.sms ? (u.consents.sms || { at: now, source: 'compte' }) : null;
  }
  if (body.password) {
    if (!verifyPassword(body.currentPassword || '', u.passwordHash)) throw Object.assign(new Error('Mot de passe actuel incorrect.'), { status: 400 });
    if (String(body.password).length < 10) throw Object.assign(new Error('Le nouveau mot de passe doit contenir au moins 10 caractères.'), { status: 400 });
    u.passwordHash = hashPassword(body.password);
  }
  save();
  return { user: publicUser(u) };
});
route('DELETE', '/api/me', ({ body, req, res, ...ctx }) => {
  const u = requireUser({ ...ctx, req });
  if (!verifyPassword(body.password || '', u.passwordHash)) throw Object.assign(new Error('Mot de passe incorrect.'), { status: 400 });
  // Anonymisation : les factures restent (obligation comptable de 10 ans), le profil disparaît.
  for (const o of db.orders.filter(o => o.userId === u.id)) { o.userId = null; o.anonymised = true; }
  db.users = db.users.filter(x => x.id !== u.id);
  db.newsletter = db.newsletter.filter(n => n.email !== u.email);
  db.carts = db.carts.filter(c => c.email !== u.email);
  db.sessions = db.sessions.filter(s => !(s.kind === 'user' && s.subjectId === u.id));
  audit('cliente', 'suppression de compte', u.id); save();
  res.setHeader('set-cookie', cookie('mova_user', '', 0));
  return { ok: true };
});
route('GET', '/api/me/export', ({ ...ctx }) => {
  const u = requireUser(ctx);
  const { passwordHash, ...profile } = u;
  return { exportedAt: new Date().toISOString(), profile, orders: db.orders.filter(o => o.userId === u.id).map(publicOrder), newsletter: db.newsletter.filter(n => n.email === u.email).map(({ confirmToken, ...n }) => n) };
});
route('GET', '/api/me/orders', ctx => db.orders.filter(o => o.userId === requireUser(ctx).id && o.status !== 'expired').slice().reverse().map(publicOrder));
route('POST', '/api/me/orders/:id/return', ({ params, body, ...ctx }) => {
  const u = requireUser(ctx);
  const o = db.orders.find(o => o.id === params.id && o.userId === u.id);
  if (!o) throw Object.assign(new Error('Commande introuvable.'), { status: 404 });
  if (!['delivered', 'shipped'].includes(o.status)) throw Object.assign(new Error('Cette commande ne peut pas encore être retournée.'), { status: 400 });
  if (Date.now() - new Date(o.paidAt) > (db.settings.returnDays + 7) * 864e5) throw Object.assign(new Error(`Le délai de retour de ${db.settings.returnDays} jours est dépassé.`), { status: 400 });
  if (o.returnRequest) throw Object.assign(new Error('Une demande de retour existe déjà.'), { status: 409 });
  const keys = Array.isArray(body.lines) && body.lines.length ? body.lines : o.lines.map(l => l.key + '#' + l.productId);
  o.returnRequest = { at: new Date().toISOString(), lines: keys.slice(0, 30), reason: clean(body.reason, 300), status: 'demandée', label: `RET-${o.number}-${Date.now().toString(36).toUpperCase()}` };
  audit('cliente', 'demande de retour', o.number); save();
  sendEmail({ to: o.email, kind: 'retour', subject: `Retour de la commande ${o.number}`, html: mailLayout('Ta demande de retour est enregistrée', `<p>Référence : <b>${o.returnRequest.label}</b>. Dépose ton colis dans un point relais avec cette référence. Le remboursement est fait sous 5 jours ouvrés après réception.</p>`) });
  return publicOrder(o);
});
route('GET', '/api/me/loyalty', ctx => loyalty(requireUser(ctx)));
route('POST', '/api/me/club/join', ({ ...ctx }) => {
  const u = requireUser(ctx);
  u.club.member = true; u.club.joinedAt ||= new Date().toISOString(); u.club.rulesAcceptedAt = new Date().toISOString();
  save();
  return loyalty(u);
});

// ===== Commande et paiement =====
route('POST', '/api/checkout', async ({ body, user, req }) => {
  if (limited('checkout:' + ipOf(req), 20, 36e5)) throw Object.assign(new Error('Trop de tentatives.'), { status: 429 });
  const email = String(user?.email || body.email || '').trim().toLowerCase();
  if (!validEmail(email)) throw Object.assign(new Error('Adresse e-mail invalide.'), { status: 400 });
  if (!body.acceptCgv) throw Object.assign(new Error('Merci d’accepter les conditions générales de vente.'), { status: 400 });
  const a = body.address || {};
  const address = { firstName: clean(a.firstName, 60), lastName: clean(a.lastName, 60), line1: clean(a.line1, 120), line2: clean(a.line2, 120), zip: clean(a.zip, 10), city: clean(a.city, 60), country: 'FR', phone: clean(a.phone, 20), relay: clean(a.relay, 120) };
  if (!address.firstName || !address.lastName || !address.line1 || !/^\d{5}$/.test(address.zip) || !address.city) throw Object.assign(new Error('Adresse de livraison incomplète (code postal à 5 chiffres, France métropolitaine).'), { status: 400 });
  if (/^(97|98|20)/.test(address.zip)) throw Object.assign(new Error('Livraison en France métropolitaine uniquement pour le lancement.'), { status: 400 });
  const priced = priceCart(db, { items: body.items, promoCode: body.promoCode, email, shippingMethod: body.shippingMethod });
  if (!priced.lines.length) throw Object.assign(new Error('Ton panier est vide.'), { status: 400 });
  if (priced.errors.length) throw Object.assign(new Error(priced.errors[0]), { status: 400 });
  if (priced.stockIssues.length) throw Object.assign(new Error(`Stock insuffisant : ${priced.stockIssues.join(' ; ')}`), { status: 409 });
  if (body.promoCode && priced.promoError) throw Object.assign(new Error(priced.promoError), { status: 400 });

  // Cadeau MOVA Club (récompense « séances ») ajouté gratuitement.
  let gift = null;
  if (user && body.giftRewardId) {
    const r = user.club.rewards.find(r => r.id === body.giftRewardId && r.type === 'seances' && r.status === 'disponible');
    const tier = r && db.settings.club.sessionTiers.find(t => t.sessions === r.tier);
    const gp = tier && db.products.find(p => p.id === tier.productId);
    if (gp) {
      const color = gp.colors.find(c => Object.entries(gp.stock).some(([k, v]) => k.startsWith(c + '|') && v > 0));
      const size = color && gp.sizes.find(s => (gp.stock[variantKey({ color, size: s })] || 0) > 0);
      if (color && size) gift = { productId: gp.id, color, size, qty: 1, key: variantKey({ color, size }), name: `${gp.name} (cadeau MOVA Club)`, type: gp.type, unitPrice: 0, lineTotal: 0, gift: true };
    }
  }
  const number = `MV${1000 + db.orders.length + 1}${crypto.randomInt(10, 99)}`;
  const order = {
    id: id('ord'), number, accessToken: token(16), userId: user?.id || null, email, createdAt: new Date().toISOString(), status: 'pending_payment', reservedUntil: Date.now() + 15 * 60e3,
    device: /Mobi/i.test(req.headers['user-agent'] || '') ? 'mobile' : 'desktop', source: clean(body.source, 30) || 'direct',
    lines: [...priced.lines.map(({ stock, ensembleGroup, ...l }) => l), ...(gift ? [gift] : [])], subtotal: priced.subtotal, ensemble: priced.ensemble, promo: priced.promo, promoDiscount: priced.promoDiscount,
    shippingMethod: priced.shippingMethod, shipping: priced.shipping, total: priced.total, address, estimatedDelivery: estimatedDelivery(priced.shippingMethod),
    payment: { provider: STRIPE_KEY ? 'stripe' : 'demo' }, refunds: [], tracking: null, returnRequest: null, giftRewardId: gift ? body.giftRewardId : null,
    createAccountAfter: !user && !!body.createAccount, newsletterConsent: !!body.newsletter
  };
  db.orders.push(order);
  adjustStock(order.lines, -1); // réservation 15 minutes
  if (user && !user.addresses.length) { user.addresses.push({ id: 'adr_1', label: 'Maison', ...address, default: true }); }
  save();

  if (STRIPE_KEY) {
    const lines = order.lines.filter(l => !l.gift);
    const description = lines.map(l => `${l.qty} × ${l.name} (${db.colors.find(c => c.id === l.color)?.name}, ${l.size})`).join(' · ').slice(0, 480);
    const session = await stripe('POST', 'checkout/sessions', {
      mode: 'payment', locale: 'fr', customer_email: email, client_reference_id: order.id,
      line_items: { 0: { quantity: 1, price_data: { currency: 'eur', unit_amount: Math.round(order.total * 100), product_data: { name: `Commande MOVA ${order.number}`, description } } } },
      metadata: { order_id: order.id, order_number: order.number },
      payment_intent_data: { metadata: { order_id: order.id, order_number: order.number }, description: `MOVA ${order.number}` },
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      success_url: `${BASE_URL}/#/confirmation/${order.id}?t=${order.accessToken}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/#/commande?annule=1`
    });
    order.payment.sessionId = session.id;
    save();
    return { orderId: order.id, redirect: session.url };
  }
  return { orderId: order.id, redirect: `/#/paiement-demo/${order.id}?t=${order.accessToken}`, demo: true };
});
route('POST', '/api/checkout/demo-pay', ({ body }) => {
  if (STRIPE_KEY) throw Object.assign(new Error('Le paiement de démonstration est désactivé quand Stripe est configuré.'), { status: 403 });
  const o = db.orders.find(o => o.id === body.orderId && o.accessToken === body.t);
  if (!o) throw Object.assign(new Error('Commande introuvable.'), { status: 404 });
  if (body.outcome === 'refuse') return { ok: false, error: 'Paiement refusé par la banque (simulation). Ton panier est conservé : tu peux réessayer.' };
  markPaid(o, { provider: 'demo', method: ['card', 'apple_pay', 'google_pay'].includes(body.method) ? body.method : 'card' });
  finishGuest(o);
  return { ok: true };
});
function finishGuest(o) {
  if (o.newsletterConsent && !db.newsletter.some(n => n.email === o.email)) db.newsletter.push({ email: o.email, createdAt: new Date().toISOString(), source: 'commande', consent: true, confirmed: false, welcomeCode: null, unsubscribed: false });
  save();
}
route('GET', '/api/orders/:id', async ({ params, url }) => {
  const o = db.orders.find(o => o.id === params.id);
  if (!o || !safeEqual(o.accessToken, url.searchParams.get('t') || '')) throw Object.assign(new Error('Commande introuvable.'), { status: 404 });
  const sid = url.searchParams.get('session_id');
  if (STRIPE_KEY && o.status === 'pending_payment' && sid && sid === o.payment.sessionId) {
    const s = await stripe('GET', `checkout/sessions/${encodeURIComponent(sid)}`);
    if (s.payment_status === 'paid') { markPaid(o, { provider: 'stripe', paymentIntent: s.payment_intent, method: 'stripe_checkout' }); finishGuest(o); }
  }
  return { ...publicOrder(o), canCreateAccount: !o.userId && !db.users.some(u => u.email === o.email) };
});
route('POST', '/api/stripe/webhook', ({ raw, req }) => {
  if (!verifyStripeSignature(raw.toString('utf8'), req.headers['stripe-signature'])) throw Object.assign(new Error('Signature invalide'), { status: 400 });
  const event = JSON.parse(raw.toString('utf8'));
  const obj = event.data?.object || {};
  if (event.type === 'checkout.session.completed' && obj.payment_status === 'paid') {
    const o = db.orders.find(o => o.id === obj.metadata?.order_id);
    if (o) { markPaid(o, { provider: 'stripe', paymentIntent: obj.payment_intent, method: 'stripe_checkout' }); finishGuest(o); }
  }
  if (event.type === 'charge.refunded') {
    const o = db.orders.find(o => o.payment?.paymentIntent === obj.payment_intent);
    if (o) audit('stripe', 'remboursement confirmé', `${o.number} — ${euros(obj.amount_refunded / 100)}`);
  }
  save();
  return { received: true };
}, { raw: true });

// ===== Partenaires (public) =====
route('GET', '/api/partners', () => db.partners.filter(p => p.status === 'actif').map(({ code, ...p }) => p));

// ===== Chatbot =====
route('POST', '/api/chat', async ({ body, req, user }) => {
  if (limited('chat:' + ipOf(req), 40, 36e5)) throw Object.assign(new Error('Trop de messages, réessaie dans un moment.'), { status: 429 });
  const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-12).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content, 1500) })).filter(m => m.content);
  const answer = await assistant.chat(db, messages, user);
  db.chatLogs.push({ at: new Date().toISOString(), userId: user?.id || null, question: messages.at(-1)?.content, reply: answer.reply, ai: !!answer.ai, handoff: !!answer.handoff });
  if (db.chatLogs.length > 3000) db.chatLogs.shift();
  save();
  return answer;
});
route('POST', '/api/contact', ({ body, req, user }) => {
  if (limited('contact:' + ipOf(req), 5, 36e5)) throw Object.assign(new Error('Trop de messages.'), { status: 429 });
  if (!validEmail(body.email)) throw Object.assign(new Error('Adresse e-mail invalide.'), { status: 400 });
  if (!clean(body.message, 3000)) throw Object.assign(new Error('Écris ton message.'), { status: 400 });
  const msg = { id: id('msg'), at: new Date().toISOString(), email: body.email.toLowerCase(), name: clean(body.name, 80), subject: clean(body.subject, 120), message: clean(body.message, 3000), order: clean(body.order, 20), transcript: Array.isArray(body.transcript) ? body.transcript.slice(-12).map(m => ({ role: m.role, content: clean(m.content, 600) })) : null, userId: user?.id || null, status: 'nouveau' };
  db.contactMessages.push(msg);
  if (user) user.supportNotes.push({ at: msg.at, type: 'message', text: msg.subject || msg.message.slice(0, 80) });
  save();
  return { ok: true, message: 'Message envoyé. Le service client te répond sous 24 h ouvrées.' };
});
route('GET', '/api/knowledge', () => knowledge(db.settings));

// Mesure d'audience anonyme sans cookie (exemptée de consentement si configurée ainsi).
route('POST', '/api/track', ({ body, req }) => {
  const today = new Date().toISOString().slice(0, 10);
  let d = db.traffic.days.find(x => x.date === today);
  if (!d) { d = { date: today, visits: 0, unique: 0, mobile: 0, sources: {} }; db.traffic.days.push(d); }
  if (body.newVisit) { d.visits++; d.unique++; if (/Mobi/i.test(req.headers['user-agent'] || '')) d.mobile++; const src = ['instagram', 'tiktok', 'google', 'newsletter'].find(s => String(body.ref || '').includes(s)) || 'direct'; d.sources[src] = (d.sources[src] || 0) + 1; }
  save();
  return { ok: true };
});

// ===== Espace partenaire =====
route('POST', '/api/partner/login', ({ body, req, res }) => {
  if (limited('plogin:' + ipOf(req), 10, 15 * 60e3)) throw Object.assign(new Error('Trop de tentatives.'), { status: 429 });
  const acc = db.partnerAccounts.find(a => a.login === String(body.login || '').trim().toLowerCase());
  if (!acc || !verifyPassword(body.password || '', acc.passwordHash)) throw Object.assign(new Error('Identifiants incorrects.'), { status: 401 });
  res.setHeader('set-cookie', cookie('mova_partner', createSession('partner', acc.id, 7), 7 * 86400));
  return { partner: db.partners.find(p => p.id === acc.partnerId) };
});
route('GET', '/api/partner/me', ctx => { const p = requirePartner(ctx); return { partner: p, history: db.audit.filter(a => a.actor === p.name).slice(-50).reverse() }; });
route('POST', '/api/partner/logout', ({ req, res }) => { destroySession(req, 'partner'); res.setHeader('set-cookie', cookie('mova_partner', '', 0)); return { ok: true }; });
route('POST', '/api/partner/scan', ({ body, ...ctx }) => {
  const partner = requirePartner(ctx);
  const raw = String(body.code || '').trim();
  if (raw.startsWith('MOVACLUB:')) {
    const u = db.users.find(u => u.club?.qrToken === raw.slice(9));
    if (!u || !u.club.member) throw Object.assign(new Error('QR code MOVA Club inconnu.'), { status: 404 });
    const today = new Date().toISOString().slice(0, 10);
    if (u.club.sessions.some(s => s.partnerId === partner.id && s.at.slice(0, 10) === today)) throw Object.assign(new Error('Séance déjà enregistrée aujourd’hui dans ce studio.'), { status: 409 });
    u.club.sessions.push({ at: new Date().toISOString(), partnerId: partner.id });
    audit(partner.name, 'séance validée', `${u.firstName} ${u.lastName.charAt(0)}.`);
    save();
    const l = loyalty(u);
    return { ok: true, kind: 'seance', member: `${u.firstName} ${u.lastName.charAt(0)}.`, sessions: l.sessions.count, nextTier: l.sessions.nextTier };
  }
  const code = raw.toUpperCase();
  for (const u of db.users) {
    const r = u.club?.rewards?.find(r => r.code === code);
    if (!r) continue;
    if (r.status !== 'disponible') throw Object.assign(new Error(`Code déjà ${r.status}${r.usedAt ? ` le ${new Date(r.usedAt).toLocaleDateString('fr-FR')}` : ''}.`), { status: 409 });
    if (r.expiresAt && new Date(r.expiresAt) < new Date()) { r.status = 'expirée'; save(); throw Object.assign(new Error('Code expiré.'), { status: 410 }); }
    r.status = 'utilisée'; r.usedAt = new Date().toISOString(); r.partnerId = partner.id;
    audit(partner.name, 'récompense utilisée', `${r.code} — ${r.label}`);
    save();
    return { ok: true, kind: 'recompense', member: `${u.firstName} ${u.lastName.charAt(0)}.`, reward: r.label };
  }
  throw Object.assign(new Error('Code inconnu.'), { status: 404 });
});

// ===== Back-office =====
route('POST', '/api/admin/login', ({ body, req, res }) => {
  if (limited('alogin:' + ipOf(req), 5, 15 * 60e3)) throw Object.assign(new Error('Trop de tentatives. Réessaie dans 15 minutes.'), { status: 429 });
  if (!verifyPassword(body.password || '', db.admin.passwordHash)) { audit('admin', 'échec de connexion', ipOf(req)); save(); throw Object.assign(new Error('Mot de passe incorrect.'), { status: 401 }); }
  const secret = process.env.ADMIN_TOTP_SECRET;
  if (secret && !verifyTotp(secret, body.totp || '')) throw Object.assign(new Error('Code de double authentification incorrect.'), { status: 401, needTotp: true });
  audit('admin', 'connexion', ipOf(req));
  res.setHeader('set-cookie', cookie('mova_admin', createSession('admin', 'admin', 1), 86400));
  return { ok: true, totp: !!secret, demoPassword: db.admin.demoPassword };
});
route('GET', '/api/admin/session', ctx => { requireAdmin(ctx); return { ok: true, totp: !!process.env.ADMIN_TOTP_SECRET, demoPassword: db.admin.demoPassword, stripe: !!STRIPE_KEY, stripeMode: STRIPE_KEY.startsWith('sk_live') ? 'live' : STRIPE_KEY ? 'test' : 'off', ai: assistant.aiEnabled(), mail: !!process.env.BREVO_API_KEY }; });
route('POST', '/api/admin/logout', ({ req, res }) => { destroySession(req, 'admin'); res.setHeader('set-cookie', cookie('mova_admin', '', 0)); return { ok: true }; });
route('GET', '/api/admin/stats', ({ url, ...ctx }) => { requireAdmin(ctx); return computeStats(db, Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30))); });
route('GET', '/api/admin/insights', ctx => { requireAdmin(ctx); return insights(db); });
route('POST', '/api/admin/ask', async ({ body, ...ctx }) => {
  requireAdmin(ctx);
  const stats = computeStats(db, 30);
  const ins = insights(db);
  const answer = await assistant.analyse(clean(body.question, 500), { ...stats, series: undefined }, ins).catch(() => null);
  return { answer: answer || 'Assistant IA non configuré (ANTHROPIC_API_KEY absente) : voici les constats calculés automatiquement.', insights: ins.items, ai: !!answer };
});
route('GET', '/api/admin/products', ctx => { requireAdmin(ctx); return db.products; });
route('PUT', '/api/admin/products/:id', ({ params, body, ...ctx }) => {
  requireAdmin(ctx);
  const p = db.products.find(p => p.id === params.id);
  if (!p) throw Object.assign(new Error('Produit introuvable.'), { status: 404 });
  const changes = [];
  if (body.name) { p.name = clean(body.name, 120); changes.push('nom'); }
  if (body.price !== undefined) { const v = Math.round(Number(body.price) * 100) / 100; if (!(v > 0)) throw Object.assign(new Error('Prix invalide.'), { status: 400 }); if (v !== p.price) changes.push(`prix ${p.price} → ${v} €`); p.price = v; }
  for (const f of ['description', 'composition', 'care', 'logo', 'fit']) if (body[f] !== undefined) { p[f] = clean(body[f], 2000); changes.push(f); }
  if (['published', 'draft', 'archived'].includes(body.status)) { p.status = body.status; changes.push(`statut ${body.status}`); }
  if (typeof body.bestseller === 'boolean') p.bestseller = body.bestseller;
  if (typeof body.isNew === 'boolean') p.isNew = body.isNew;
  if (body.lowStockThreshold !== undefined) p.lowStockThreshold = Math.max(0, parseInt(body.lowStockThreshold, 10) || 0);
  if (body.stock && typeof body.stock === 'object') {
    for (const [k, v] of Object.entries(body.stock)) {
      if (!(k in p.stock)) continue;
      const before = p.stock[k]; const after = Math.max(0, parseInt(v, 10) || 0);
      p.stock[k] = after;
      if (before === 0 && after > 0) notifyRestock(p, k);
    }
    changes.push('stock');
  }
  if (Array.isArray(body.colors)) {
    const valid = body.colors.filter(c => db.colors.some(x => x.id === c));
    if (valid.length) {
      for (const c of valid) if (!p.colors.includes(c)) for (const s of p.sizes) for (const cut of p.cuts || [undefined]) for (const len of p.lengths || [undefined]) p.stock[variantKey({ color: c, size: s, cut, length: len })] ??= 0;
      p.colors = valid; changes.push('coloris');
    }
  }
  audit('admin', 'produit modifié', `${p.name} : ${changes.join(', ') || 'aucun changement'}`);
  save();
  return p;
});
route('POST', '/api/admin/products', ({ body, ...ctx }) => {
  requireAdmin(ctx);
  const name = clean(body.name, 120);
  const cat = db.categories.find(c => c.id === body.category);
  if (!name || !cat) throw Object.assign(new Error('Nom et catégorie obligatoires.'), { status: 400 });
  const pid = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + crypto.randomInt(100, 999);
  const colors = (body.colors || ['noir']).filter(c => db.colors.some(x => x.id === c));
  const accessory = cat.group === 'accessoires';
  const sizes = accessory ? (cat.id.startsWith('chaussettes') ? ['35-38', '39-42'] : ['TU']) : ['XS', 'S', 'M', 'L', 'XL'];
  const stock = {}; for (const c of colors) for (const s of sizes) stock[variantKey({ color: c, size: s })] = 0;
  const typeByCat = { vestes: 'veste', pantalons: 'pantalon', sweats: 'sweat', brassieres: 'brassiere', leggings: 'legging', shorts: 'short-cycliste', casquettes: 'casquette', pinces: 'pince', chouchous: 'chouchou', bandeaux: 'bandeau', chaussettes: 'chaussettes', 'chaussettes-pilates': 'chaussettes-pilates', gourdes: 'gourde' };
  const p = { id: pid, name, category: cat.id, type: typeByCat[cat.id] || 'sweat', price: Number(body.price) || 30, colors, sizes, tags: [], popularity: 50, accessory, status: 'draft', stock, lowStockThreshold: 3,
    description: clean(body.description, 2000), composition: '', care: '', logo: 'Logo MOVA discret.', createdAt: new Date().toISOString(), rating: { average: 0, count: 0 }, images: {}, isNew: true };
  db.products.push(p);
  audit('admin', 'produit créé', name); save();
  return p;
});
// Photos produits (ex. accessoires personnalisés à venir) : data URL JPEG/PNG/WebP, 4 Mo max.
route('POST', '/api/admin/products/:id/images', ({ params, body, ...ctx }) => {
  requireAdmin(ctx);
  const p = db.products.find(p => p.id === params.id);
  if (!p) throw Object.assign(new Error('Produit introuvable.'), { status: 404 });
  const m = String(body.dataUrl || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw Object.assign(new Error('Format accepté : JPEG, PNG ou WebP.'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) throw Object.assign(new Error('Image trop lourde (4 Mo maximum).'), { status: 413 });
  const color = p.colors.includes(body.color) ? body.color : p.colors[0];
  fs.mkdirSync(UPLOADS, { recursive: true });
  const file = `${p.id}-${color}-${Date.now().toString(36)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(UPLOADS, file), buf);
  p.images ||= {}; (p.images[color] ||= []).push({ src: `/uploads/${file}`, alt: clean(body.alt, 160) || `${p.name} ${db.colors.find(c => c.id === color)?.name}` });
  audit('admin', 'photo ajoutée', `${p.name} (${color})`); save();
  return p;
}, { limit: 6e6 });
route('DELETE', '/api/admin/products/:id/images', ({ params, body, ...ctx }) => {
  requireAdmin(ctx);
  const p = db.products.find(p => p.id === params.id);
  if (!p || !p.images?.[body.color]) throw Object.assign(new Error('Photo introuvable.'), { status: 404 });
  p.images[body.color] = p.images[body.color].filter(i => i.src !== body.src);
  save(); return p;
});
route('GET', '/api/admin/orders', ({ url, ...ctx }) => {
  requireAdmin(ctx);
  const status = url.searchParams.get('status');
  const q = (url.searchParams.get('q') || '').toLowerCase();
  return db.orders.filter(o => o.status !== 'expired' && (!status || o.status === status) && (!q || o.number.toLowerCase().includes(q) || o.email.includes(q))).slice().reverse().slice(0, 300)
    .map(o => ({ ...publicOrder(o), customer: `${o.address?.firstName || ''} ${o.address?.lastName || ''}`.trim(), device: o.device, source: o.source }));
});
route('PUT', '/api/admin/orders/:id', ({ params, body, ...ctx }) => {
  requireAdmin(ctx);
  const o = db.orders.find(o => o.id === params.id);
  if (!o) throw Object.assign(new Error('Commande introuvable.'), { status: 404 });
  if (body.tracking !== undefined) o.tracking = clean(body.tracking, 40) || null;
  if (['paid', 'shipped', 'delivered'].includes(body.status) && o.status !== body.status) {
    const prev = o.status; o.status = body.status;
    if (body.status === 'shipped') sendEmail({ to: o.email, kind: 'expedition', subject: `Ta commande ${o.number} est en route`, html: mailLayout('Ton colis est en route', `<p>Numéro de suivi : <b>${o.tracking || 'communiqué prochainement'}</b>.</p>`) });
    if (body.status === 'delivered') { o.deliveredAt = new Date().toISOString(); sendEmail({ to: o.email, kind: 'apres-achat', subject: 'Prends soin de ta tenue MOVA', html: mailLayout('Comment trouves-tu ta tenue ?', `<p>Nos conseils : lavage à 30 °C à l’envers, sans adoucissant, séchage à plat.</p><p>Ton avis aide les autres clientes à choisir leur taille : <a href="${BASE_URL}/#/compte/commandes">laisser un avis vérifié</a>.</p>`) }); }
    audit('admin', 'statut commande', `${o.number} : ${prev} → ${body.status}`);
  }
  if (body.returnStatus && o.returnRequest) { o.returnRequest.status = clean(body.returnStatus, 30); audit('admin', 'retour', `${o.number} : ${o.returnRequest.status}`); }
  save();
  return publicOrder(o);
});
route('POST', '/api/admin/orders/:id/refund', async ({ params, body, ...ctx }) => {
  requireAdmin(ctx);
  const o = db.orders.find(o => o.id === params.id);
  if (!o || !PAID.includes(o.status)) throw Object.assign(new Error('Commande non remboursable.'), { status: 400 });
  const already = o.refunds.reduce((s, r) => s + r.amount, 0);
  const amount = round2(Math.min(Number(body.amount) || (o.total - already), o.total - already));
  if (!(amount > 0)) throw Object.assign(new Error('Montant invalide.'), { status: 400 });
  let stripeRefund = null;
  if (o.payment?.provider === 'stripe' && o.payment.paymentIntent && STRIPE_KEY) {
    stripeRefund = await stripe('POST', 'refunds', { payment_intent: o.payment.paymentIntent, amount: Math.round(amount * 100), metadata: { order_number: o.number } });
  }
  o.refunds.push({ amount, at: new Date().toISOString(), reason: clean(body.reason, 200), stripeId: stripeRefund?.id || null });
  const total = round2(already + amount);
  o.status = total >= o.total ? 'refunded' : 'partially_refunded';
  if (body.restock) adjustStock(o.lines.filter(l => !l.gift), +1);
  if (o.returnRequest) o.returnRequest.status = 'remboursé';
  audit('admin', 'remboursement', `${o.number} — ${euros(amount)}${stripeRefund ? ' (Stripe)' : ' (démo)'}`);
  save();
  sendEmail({ to: o.email, kind: 'remboursement', subject: `Remboursement de ta commande ${o.number}`, html: mailLayout('Ton remboursement est en cours', `<p>Nous avons remboursé <b>${euros(amount)}</b> sur ton moyen de paiement d’origine. Le délai d’apparition dépend de ta banque (5 à 10 jours).</p>`) });
  return publicOrder(o);
});
route('GET', '/api/admin/promos', ({ url, ...ctx }) => { requireAdmin(ctx); const all = url.searchParams.get('all'); return db.promoCodes.filter(p => all || !p.code.startsWith('BIENVENUE-')).slice().reverse(); });
route('POST', '/api/admin/promos', ({ body, ...ctx }) => {
  requireAdmin(ctx);
  const code = clean(body.code, 30).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (code.length < 4) throw Object.assign(new Error('Code trop court.'), { status: 400 });
  if (findPromo(db, code)) throw Object.assign(new Error('Ce code existe déjà.'), { status: 409 });
  const p = { code, label: clean(body.label, 80) || code, type: body.type === 'amount' ? 'amount' : 'percent', value: Math.max(1, Number(body.value) || 10), minTotal: Number(body.minTotal) || 0, active: true, uses: 0,
    maxUses: Number(body.maxUses) || null, firstOrderOnly: !!body.firstOrderOnly, expiresAt: body.expiresAt ? new Date(body.expiresAt).toISOString() : null, partnerId: body.partnerId || null, createdAt: new Date().toISOString() };
  db.promoCodes.push(p); audit('admin', 'code promo créé', code); save();
  return p;
});
route('PUT', '/api/admin/promos/:code', ({ params, body, ...ctx }) => {
  requireAdmin(ctx);
  const p = findPromo(db, params.code);
  if (!p) throw Object.assign(new Error('Code introuvable.'), { status: 404 });
  if (typeof body.active === 'boolean') p.active = body.active;
  audit('admin', 'code promo', `${p.code} ${p.active ? 'activé' : 'désactivé'}`); save();
  return p;
});
function customerMetrics(u) {
  const orders = db.orders.filter(o => o.userId === u.id && PAID.includes(o.status));
  const spent = round2(orders.reduce((s, o) => s + o.total - o.refunds.reduce((a, r) => a + r.amount, 0), 0));
  const last = orders.at(-1)?.paidAt || null;
  const fav = {};
  for (const o of orders) for (const l of o.lines) fav[l.productId] = (fav[l.productId] || 0) + l.qty;
  const days = orders.length > 1 ? Math.round((new Date(orders.at(-1).paidAt) - new Date(orders[0].paidAt)) / 864e5 / (orders.length - 1)) : null;
  const segments = [];
  if (Date.now() - new Date(u.createdAt) < 30 * 864e5) segments.push('nouvelle');
  if (orders.length >= 3) segments.push('fidèle');
  if (last && Date.now() - new Date(last) > 180 * 864e5) segments.push('inactive');
  if (db.carts.some(c => c.email === u.email && c.status === 'abandoned')) segments.push('panier abandonné');
  for (const i of u.interests || []) segments.push(i);
  return { orders: orders.length, spent, aov: orders.length ? round2(spent / orders.length) : 0, lastOrder: last, frequencyDays: days, favorites: Object.entries(fav).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => db.products.find(p => p.id === id)?.name || id), segments };
}
route('GET', '/api/admin/customers', ({ url, ...ctx }) => {
  requireAdmin(ctx);
  const seg = url.searchParams.get('segment'); const q = (url.searchParams.get('q') || '').toLowerCase();
  return db.users.map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email, createdAt: u.createdAt, newsletter: !!u.consents?.newsletter, club: !!u.club?.member, demo: !!u.demo, ...customerMetrics(u) }))
    .filter(c => (!seg || c.segments.includes(seg)) && (!q || c.name.toLowerCase().includes(q) || c.email.includes(q))).sort((a, b) => b.spent - a.spent);
});
route('GET', '/api/admin/customers/:id', ({ params, ...ctx }) => {
  requireAdmin(ctx);
  const u = db.users.find(u => u.id === params.id);
  if (!u) throw Object.assign(new Error('Cliente introuvable.'), { status: 404 });
  const { passwordHash, ...profile } = u;
  return { profile, metrics: customerMetrics(u), loyalty: loyalty(u, { notify: false }), orders: db.orders.filter(o => o.userId === u.id).slice().reverse().map(publicOrder), messages: db.contactMessages.filter(m => m.email === u.email) };
});
route('GET', '/api/admin/customers-export', ({ url, ...ctx }) => {
  requireAdmin(ctx);
  const marketingOnly = url.searchParams.get('marketing') === '1';
  const rows = db.users.filter(u => !marketingOnly || u.consents?.newsletter).map(u => { const m = customerMetrics(u); return [u.email, u.firstName, u.lastName, m.orders, m.spent, m.segments.join('|'), u.consents?.newsletter ? 'oui' : 'non']; });
  audit('admin', 'export CRM', `${rows.length} lignes${marketingOnly ? ' (consentement marketing)' : ''}`); save();
  return { csv: ['email,prenom,nom,commandes,montant,segments,newsletter', ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n') };
});
route('GET', '/api/admin/partners', ctx => { requireAdmin(ctx); return db.partners; });
route('POST', '/api/admin/partners', ({ body, ...ctx }) => {
  requireAdmin(ctx);
  const p = { id: id('prt'), status: 'prospect', name: clean(body.name, 120), activity: ['pilates', 'padel', 'fitness'].includes(body.activity) ? body.activity : 'pilates', address: clean(body.address, 200), lat: null, lng: null, description: '', advantages: [], website: '', code: null };
  if (!p.name) throw Object.assign(new Error('Nom obligatoire.'), { status: 400 });
  db.partners.push(p); audit('admin', 'partenaire ajouté', p.name); save();
  return p;
});
route('PUT', '/api/admin/partners/:id', ({ params, body, ...ctx }) => {
  requireAdmin(ctx);
  const p = db.partners.find(p => p.id === params.id);
  if (!p) throw Object.assign(new Error('Partenaire introuvable.'), { status: 404 });
  for (const f of ['name', 'address', 'description', 'website']) if (body[f] !== undefined) p[f] = clean(body[f], f === 'description' ? 800 : 200);
  if (['pilates', 'padel', 'fitness'].includes(body.activity)) p.activity = body.activity;
  if (['prospect', 'signé', 'actif', 'terminé'].includes(body.status)) {
    if (body.status === 'actif' && (p.lat == null || p.lng == null) && (body.lat == null || body.lng == null)) throw Object.assign(new Error('Renseigne la position (latitude, longitude) avant d’afficher le partenaire sur la carte.'), { status: 400 });
    p.status = body.status;
  }
  if (body.lat !== undefined && body.lng !== undefined) { const lat = Number(body.lat), lng = Number(body.lng); if (lat > 45 && lat < 46.5 && lng > 4 && lng < 5.5) { p.lat = lat; p.lng = lng; } else throw Object.assign(new Error('Coordonnées hors de la région lyonnaise.'), { status: 400 }); }
  if (Array.isArray(body.advantages)) p.advantages = body.advantages.map(a => clean(a, 160)).filter(Boolean).slice(0, 6);
  audit('admin', 'partenaire modifié', `${p.name} (${p.status})`); save();
  return p;
});
route('GET', '/api/admin/settings', ctx => { requireAdmin(ctx); return db.settings; });
route('PUT', '/api/admin/settings', ({ body, ...ctx }) => {
  requireAdmin(ctx);
  const s = db.settings;
  if (body.ensemblePrice !== undefined) s.ensemblePrice = Math.max(1, Number(body.ensemblePrice));
  if (typeof body.ensembleSameColor === 'boolean') s.ensembleSameColor = body.ensembleSameColor;
  if (body.welcome) for (const k of ['percent', 'validityDays', 'popupDelaySeconds', 'popupScrollPercent', 'cooldownDays']) if (body.welcome[k] !== undefined) s.welcome[k] = Math.max(0, Number(body.welcome[k]));
  if (body.shipping) { if (body.shipping.freeFrom !== undefined) s.shipping.freeFrom = Number(body.shipping.freeFrom); for (const m of body.shipping.methods || []) { const t = s.shipping.methods.find(x => x.id === m.id); if (t && m.price !== undefined) t.price = Math.max(0, Number(m.price)); } }
  if (body.returnDays !== undefined) s.returnDays = Math.max(14, Number(body.returnDays));
  if (body.club) {
    for (const k of ['purchasesForReward', 'rewardPercent', 'rewardValidityMonths', 'countDelayDays']) if (body.club[k] !== undefined) s.club[k] = Math.max(0, Number(body.club[k]));
    if (Array.isArray(body.club.sessionTiers)) s.club.sessionTiers = body.club.sessionTiers.map(t => ({ sessions: Math.max(1, parseInt(t.sessions, 10)), reward: clean(t.reward, 80), productId: db.products.some(p => p.id === t.productId) ? t.productId : null })).sort((a, b) => a.sessions - b.sessions);
  }
  audit('admin', 'réglages modifiés', Object.keys(body).join(', ')); save();
  return s;
});
route('GET', '/api/admin/reviews', ctx => { requireAdmin(ctx); return db.reviews.slice().reverse().slice(0, 200).map(r => ({ ...r, product: db.products.find(p => p.id === r.productId)?.name })); });
route('PUT', '/api/admin/reviews/:id', ({ params, body, ...ctx }) => {
  requireAdmin(ctx);
  const r = db.reviews.find(r => r.id === params.id);
  if (!r || !['published', 'rejected'].includes(body.status)) throw Object.assign(new Error('Avis introuvable.'), { status: 404 });
  r.status = body.status;
  const p = db.products.find(p => p.id === r.productId);
  const rs = db.reviews.filter(x => x.productId === r.productId && x.status === 'published');
  p.rating = { average: rs.length ? Math.round(rs.reduce((s, x) => s + x.rating, 0) / rs.length * 10) / 10 : 0, count: rs.length };
  audit('admin', 'avis modéré', `${r.id} → ${r.status}`); save();
  return r;
});
route('GET', '/api/admin/outbox', ctx => { requireAdmin(ctx); return db.outbox.slice().reverse().slice(0, 100); });
route('GET', '/api/admin/messages', ctx => { requireAdmin(ctx); return db.contactMessages.slice().reverse(); });
route('GET', '/api/admin/audit', ctx => { requireAdmin(ctx); return db.audit.slice().reverse().slice(0, 300); });
route('GET', '/api/admin/carts', ctx => { requireAdmin(ctx); return db.carts.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 200); });
route('POST', '/api/admin/carts/:id/remind', ({ params, ...ctx }) => {
  requireAdmin(ctx);
  const c = db.carts.find(c => c.id === params.id);
  if (!c || !c.email) throw Object.assign(new Error('Panier sans e-mail.'), { status: 400 });
  const consent = db.newsletter.some(n => n.email === c.email && n.consent && !n.unsubscribed) || db.users.some(u => u.email === c.email && u.consents?.newsletter);
  if (!consent) throw Object.assign(new Error('Pas de consentement marketing : relance impossible.'), { status: 403 });
  if (c.reminders >= 2) throw Object.assign(new Error('Deux relances maximum par panier.'), { status: 409 });
  c.reminders++;
  sendEmail({ to: c.email, kind: 'panier', marketing: true, subject: 'Ta tenue MOVA t’attend', html: mailLayout('Tu as oublié quelque chose ?', `<p>Ton panier de ${euros(c.value)} est toujours là. Besoin d’aide pour la taille ? Notre guide et l’assistant MOVA sont là.</p><p><a href="${BASE_URL}/#/panier">Retrouver mon panier</a></p>${unsubscribe(c.email)}`) });
  audit('admin', 'relance panier', c.email); save();
  return c;
});
route('POST', '/api/admin/newsletter/campaign', ({ body, ...ctx }) => {
  requireAdmin(ctx);
  const subject = clean(body.subject, 120); const text = clean(body.text, 3000);
  if (!subject || !text) throw Object.assign(new Error('Objet et texte obligatoires.'), { status: 400 });
  const recipients = [...new Set([...db.newsletter.filter(n => n.consent && !n.unsubscribed).map(n => n.email), ...db.users.filter(u => u.consents?.newsletter).map(u => u.email)])];
  const realRecipients = recipients.filter(e => !e.endsWith('@demo.mova.fr'));
  for (const e of realRecipients) sendEmail({ to: e, kind: 'campagne', marketing: true, subject, html: mailLayout(subject, `<p>${text.replace(/\n/g, '<br>')}</p>${unsubscribe(e)}`) });
  audit('admin', 'campagne e-mail', `${subject} — ${realRecipients.length} destinataires réels (${recipients.length - realRecipients.length} adresses de démo ignorées)`); save();
  return { sent: realRecipients.length, skippedDemo: recipients.length - realRecipients.length };
});
route('POST', '/api/admin/demo/purge', ({ body, ...ctx }) => {
  requireAdmin(ctx);
  if (body.confirm !== 'SUPPRIMER LA DEMO') throw Object.assign(new Error('Confirmation manquante.'), { status: 400 });
  const before = { orders: db.orders.length, users: db.users.length };
  db.orders = db.orders.filter(o => !o.demo); db.users = db.users.filter(u => !u.demo); db.reviews = db.reviews.filter(r => !r.demo);
  db.newsletter = db.newsletter.filter(n => !n.demo); db.promoCodes = db.promoCodes.filter(p => !p.demo); db.carts = db.carts.filter(c => !c.demo);
  db.partners = db.partners.filter(p => !p.demo); db.partnerAccounts = db.partnerAccounts.filter(a => !a.demo);
  db.traffic = { demo: false, days: db.traffic.days.map(d => ({ ...d, visits: 0, unique: 0, mobile: 0, sources: {} })), topPages: [] };
  for (const p of db.products) { for (const u of db.users) u.club.sessions = u.club.sessions.filter(s => !s.demo); p.rating = { average: 0, count: 0 }; }
  db.sessions = db.sessions.filter(s => s.kind === 'admin');
  audit('admin', 'données de démonstration supprimées', `${before.orders - db.orders.length} commandes, ${before.users - db.users.length} clientes`); save();
  return { ok: true };
});

// --- Serveur -------------------------------------------------------------------
async function handleApi(req, res, url) {
  const r = routes.find(r => r.method === req.method && r.re.test(url.pathname));
  if (!r) return fail(res, 404, 'Route inconnue.');
  try {
    let body = {}; let raw = null;
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      raw = await readBody(req, r.opts.limit || 1e6);
      if (!r.opts.raw && raw.length) {
        if (!String(req.headers['content-type'] || '').includes('application/json')) return fail(res, 415, 'JSON attendu.');
        body = JSON.parse(raw.toString('utf8'));
      }
    }
    const ctx = { req, res, url, body, raw, params: r.re.exec(url.pathname).groups || {}, user: currentUser(req) };
    const out = await r.handler(ctx);
    if (!res.headersSent && !res.writableEnded) send(res, 200, out ?? { ok: true });
  } catch (e) {
    if (e instanceof SyntaxError) return fail(res, 400, 'JSON invalide.');
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    if (!res.headersSent) fail(res, status, status >= 500 && IS_PROD ? 'Erreur interne.' : e.message, e.needTotp ? { needTotp: true } : {});
  }
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (p === '/admin' || p === '/admin/') p = '/admin.html';
  if (p === '/partenaire' || p === '/partenaire/') p = '/partenaire.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Interdit');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      if (path.extname(p)) return send(res, 404, 'Introuvable');
      return serveStatic(req, res, new URL('/index.html', url));
    }
    const ext = path.extname(file).toLowerCase();
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ['.html', '.css', '.js'].includes(ext) ? 'no-cache' : 'public, max-age=86400', 'last-modified': st.mtime.toUTCString() };
    // Vidéos : prise en charge des requêtes partielles (lecture et avance rapide sur iPhone).
    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range) && ['.mp4', '.webm'].includes(ext)) {
      const [s, e] = range.slice(6).split('-');
      const start = s ? parseInt(s, 10) : 0; const end = e ? Math.min(parseInt(e, 10), st.size - 1) : st.size - 1;
      res.writeHead(206, { ...headers, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    if (req.headers['if-modified-since'] && new Date(req.headers['if-modified-since']) >= new Date(st.mtime.toUTCString())) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, { ...headers, 'content-length': st.size, 'accept-ranges': 'bytes' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function handler(req, res) {
  if (!BASE_CONFIGURED && req.headers.host) BASE_URL = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('permissions-policy', 'camera=(self), geolocation=(self), microphone=()');
  res.setHeader('content-security-policy', CSP);
  if (BASE_URL.startsWith('https')) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
  const url = new URL(req.url, BASE_URL);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non autorisée');
  serveStatic(req, res, url);
}
const server = http.createServer(handler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n  MOVA — boutique en ligne : ${BASE_URL}`);
    console.log(`  Back-office : ${BASE_URL}/admin   ·   Espace partenaire : ${BASE_URL}/partenaire`);
    console.log(`  Paiement : ${STRIPE_KEY ? (STRIPE_KEY.startsWith('sk_live') ? 'Stripe LIVE' : 'Stripe mode test') : 'démonstration (aucune clé Stripe)'}   ·   Chatbot : ${assistant.aiEnabled() ? 'Claude' : 'moteur de règles'}\n`);
  });
  const flush = () => { clearTimeout(saveTimer); fs.writeFileSync(DBFILE, JSON.stringify(db)); process.exit(0); };
  process.on('SIGINT', flush); process.on('SIGTERM', flush);
}

module.exports = { server, handler, getDb: () => db };

// Génère data/db.json avec des données de DÉMONSTRATION clairement marquées (demo: true).
// Usage : node data/seed.js [--force]
const fs = require('fs');
const path = require('path');
const { COLORS, CUTS, LENGTHS, CATEGORIES, PRODUCTS, BUNDLES, SIZE_GUIDE } = require('./catalog');
const { hashPassword, readableCode, token } = require('../lib/security');
const { variantKey, priceCart } = require('../lib/pricing');

const DB_PATH = path.join(__dirname, 'db.json');

// Identifiants de test — documentés dans README.md et .env.example, jamais à utiliser en production.
const DEMO_CLIENT_PASSWORD = 'Demo-MOVA-2026!';
const DEMO_ADMIN_PASSWORD = 'Admin-MOVA-2026!';
const DEMO_PARTNER_PASSWORD = 'Studio-Demo-2026!';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(2608);
const pick = arr => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const daysAgo = (d, h = 12) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(h, between(0, 59), 0, 0); return t.toISOString(); };

function buildProducts() {
  return PRODUCTS.map(({ photos, ...p }, i) => {
    const stock = {};
    for (const color of p.colors) for (const size of p.sizes) {
      for (const cut of p.cuts || [undefined]) for (const length of p.lengths || [undefined]) {
        const r = rand();
        const qty = r < 0.07 ? 0 : r < 0.15 ? between(1, 3) : between(6, 40);
        stock[variantKey({ color, size, cut, length })] = qty;
      }
    }
    return {
      ...p, status: 'published', stock, lowStockThreshold: 3,
      createdAt: daysAgo(p.isNew ? between(2, 20) : between(40, 120)),
      rating: { average: 0, count: 0 },
      images: photos || {} // photos réelles ; les coloris sans photo utilisent les visuels provisoires
    };
  });
}

const FIRST = ['Camille', 'Léa', 'Sarah', 'Inès', 'Chloé', 'Manon', 'Jade', 'Louise', 'Emma', 'Zoé', 'Lina', 'Anaïs', 'Clara', 'Julie', 'Margaux', 'Nora', 'Yasmine', 'Lucie', 'Romane', 'Elsa'];
const LAST = ['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Garcia', 'Roux', 'Fournier', 'Girard', 'Benali', 'Mercier', 'Blanc', 'Chevalier', 'Perrin', 'Morel'];
const CITIES = [['69002', 'Lyon'], ['69003', 'Lyon'], ['69006', 'Lyon'], ['69007', 'Lyon'], ['69100', 'Villeurbanne'], ['69004', 'Lyon'], ['75011', 'Paris'], ['13006', 'Marseille'], ['33000', 'Bordeaux'], ['31000', 'Toulouse']];

function makeUser(first, last, i, extra = {}) {
  const [zip, city] = pick(CITIES);
  return {
    id: `usr_demo_${String(i).padStart(3, '0')}`, demo: true,
    email: `${first}.${last}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + `@demo.mova.fr`,
    firstName: first, lastName: last, passwordHash: null,
    createdAt: daysAgo(between(30, 160)), emailVerified: true,
    addresses: [{ id: 'adr_1', label: 'Maison', firstName: first, lastName: last, line1: `${between(1, 120)} rue de la Démo`, zip, city, country: 'FR', default: true }],
    favorites: [], sizeProfile: { top: pick(['S', 'M', 'M', 'L']), bottom: pick(['S', 'M', 'L']), fit: pick(['ajustee', 'normale', 'oversize']) },
    morphology: null,
    consents: { newsletter: rand() < 0.7 ? { at: daysAgo(between(10, 100)), source: 'inscription', text: 'J’accepte de recevoir les actualités MOVA par e-mail.' } : null, sms: null },
    interests: rand() < 0.5 ? [pick(['pilates', 'padel', 'fitness'])] : [],
    club: { member: rand() < 0.55, joinedAt: daysAgo(between(5, 90)), qrToken: token(12), sessions: [], rewards: [] },
    supportNotes: [],
    ...extra
  };
}

function seed() {
  const products = buildProducts();
  const db = {
    meta: { createdAt: new Date().toISOString(), note: 'Base de démonstration MOVA. Toutes les entrées demo:true sont fictives.' },
    settings: {
      ensemblePrice: 80, ensembleSameColor: true,
      welcome: { percent: 5, validityDays: 30, popupDelaySeconds: 6, popupScrollPercent: 40, cooldownDays: 14 },
      shipping: { freeFrom: 60, methods: [
        { id: 'domicile', name: 'Colissimo à domicile', price: 4.9, days: [2, 3] },
        { id: 'relais', name: 'Point relais', price: 3.9, days: [3, 4] }
      ] },
      returnDays: 30,
      club: { purchasesForReward: 5, rewardPercent: 10, rewardValidityMonths: 6, countDelayDays: 14,
        sessionTiers: [
          { sessions: 5, reward: 'Chouchou MOVA', productId: 'chouchou' },
          { sessions: 10, reward: 'Chaussettes de Pilates MOVA', productId: 'chaussettes-pilates' },
          { sessions: 15, reward: 'Gourde MOVA', productId: 'gourde' }
        ] },
      lowStockLabel: 3
    },
    colors: COLORS, cuts: CUTS, lengths: LENGTHS, categories: CATEGORIES, bundles: BUNDLES, sizeGuide: SIZE_GUIDE,
    products, users: [], sessions: [], orders: [], promoCodes: [], newsletter: [], restockAlerts: [], reviews: [],
    partners: [], partnerAccounts: [], admin: { passwordHash: hashPassword(DEMO_ADMIN_PASSWORD), demoPassword: true },
    audit: [], outbox: [], carts: [], chatLogs: [], contactMessages: [],
    traffic: { demo: true, days: [] }
  };

  // Studios et clubs partenaires (adresses et sites vérifiés le 8 octobre 2026, coordonnées OpenStreetMap).
  const A1 = '-10 % sur une séance avec une récompense MOVA Club';
  const P = (id, name, activity, address, lat, lng, description, website, code, extra = []) => ({ id, status: 'actif', name, activity, address, lat, lng, description, advantages: [A1, ...extra], website, code });
  db.partners = [
    P('prt_nous', 'Nous Studio', 'pilates', '9 rue Bellecombe, 69100 Villeurbanne', 45.7697592, 4.8631028, 'Pilates Reformer et cantine à Villeurbanne.', 'https://nousstudio.fr', 'NOUSSTUDIO10', ['Corner essayage MOVA']),
    P('prt_allme', 'Allmē Lagree Studio', 'pilates', '31 rue Édouard Aynard, 69100 Villeurbanne', 45.7600944, 4.8760784, 'Premier studio Lagree de Villeurbanne, à côté du Totem : entraînement intense à faible impact sur Micropro.', 'https://allme-lagree.fr', 'ALLME10'),
    P('prt_olya', 'Olya Studio Lagree', 'pilates', '19 bis quai Victor Augagneur, 69003 Lyon', 45.7589545, 4.8410564, 'Premier studio Lagree de Lyon, face à l’Hôtel-Dieu.', 'https://olya-lyonlagree.com', 'OLYA10'),
    P('prt_casa', 'Casa Pilates', 'pilates', '18 rue Sainte-Hélène, 69002 Lyon', 45.7548313, 4.8295056, 'Hot Pilates, Pilates Reformer et Pilates au sol à Ainay.', 'https://casapilates.fr', 'CASAPILATES10'),
    P('prt_newme', 'The New Me — Lyon Célestins', 'pilates', '9 quai des Célestins, 69002 Lyon', 45.7601580, 4.8307395, 'Studio 100 % Pilates Reformer avec boutique et latte bar.', 'https://thenewmeparis.com/pages/studio-reformer-lyon-celestins', 'NEWME10'),
    P('prt_reforme', 'Reforme Lyon', 'pilates', '88 rue Vendôme, 69006 Lyon', 45.7681614, 4.8450486, 'Studio de Pilates Reformer aux Brotteaux.', 'https://reforme-lyon.com', 'REFORME10'),
    P('prt_inspire', 'Inspire Pilates Studio', 'pilates', '15 rue Sully, 69006 Lyon', 45.7706305, 4.8428813, 'Pilates Reformer en petits groupes pour un suivi personnalisé.', 'https://www.inspirepilatesstudio.fr', 'INSPIRE10'),
    P('prt_lyon7padel', 'Lyon 7 Padel', 'padel', '17 rue de Gerland, 69007 Lyon', 45.7406305, 4.8411378, '2 terrains de padel couverts, badminton et pickleball, ouvert 7 jours sur 7 de 7 h à minuit.', 'https://www.citypadel.fr/lyon-7-padel', 'LYON7PADEL10', ['Challenge 10 matchs = chaussettes MOVA']),
    P('prt_allinpadel', 'All In Padel', 'padel', '2 avenue Simone Veil, 69150 Décines-Charpieu', 45.7680607, 4.9795660, '6 terrains couverts au pied du Groupama Stadium, à OL Vallée.', 'https://www.allin-padel.com', 'ALLINPADEL10'),
    P('prt_vvpadel', 'Lyon V&V Padel', 'padel', '11 impasse Frédéric Chopin, 69120 Vaulx-en-Velin', 45.7747385, 4.9100401, 'Club de padel avec location de matériel, cafétéria et parking.', 'https://playtomic.com/fr/clubs/lyon-vv-padel', 'VVPADEL10'),
    P('prt_4padel', '4PADEL Lyon Saint-Priest', 'padel', '7 impasse de la Madelon, 69800 Saint-Priest', 45.7112625, 4.9167328, '11 terrains couverts, dont 4 équipés de vidéo, cours et espace détente.', 'https://www.4padel.fr/nos-centres/113/lyon_saint_priest', '4PADEL10'),
    P('prt_onair', 'ON AIR Lyon Gerland', 'fitness', '60 avenue Tony Garnier, 69007 Lyon', 45.7263142, 4.8295525, 'Salle de sport haut de gamme, sans engagement annuel.', 'https://onair-fitness.fr', 'ONAIR10'),
    P('prt_wellness', 'Wellness Sport Club Lyon 3', 'fitness', '153 rue Vendôme, 69003 Lyon', 45.7632323, 4.8461577, 'Club de fitness premium : musculation, cardio et cours collectifs.', 'https://www.wellness-sportclub.fr', 'WELLNESS10'),
    P('prt_appart', 'L’Appart Fitness Lyon 3 Préfecture', 'fitness', '4 rue Pravaz, 69003 Lyon', 45.7605565, 4.8415960, 'Salle de fitness avec cours collectifs, dont des cours de Pilates.', 'https://www.lappartfitness.com', 'APPART10')
  ];
  db.partnerAccounts = db.partners.map((p, i) => ({
    id: `pac_${i + 1}`, partnerId: p.id, login: `studio${i + 1}@demo.mova.fr`, passwordHash: hashPassword(DEMO_PARTNER_PASSWORD), demo: true
  }));

  // Clientes de démonstration.
  const named = [
    makeUser('Camille', 'Démo', 1, { email: 'camille@demo.mova.fr', interests: ['padel'], club: { member: true, joinedAt: daysAgo(120), qrToken: token(12), sessions: [], rewards: [] } }),
    makeUser('Léa', 'Démo', 2, { email: 'lea@demo.mova.fr', interests: ['pilates'], club: { member: true, joinedAt: daysAgo(40), qrToken: token(12), sessions: [], rewards: [] } }),
    makeUser('Sarah', 'Démo', 3, { email: 'sarah@demo.mova.fr', interests: ['pilates'], club: { member: true, joinedAt: daysAgo(90), qrToken: token(12), sessions: [], rewards: [] } })
  ];
  for (const u of named) u.passwordHash = hashPassword(DEMO_CLIENT_PASSWORD);
  db.users.push(...named);
  for (let i = 4; i <= 70; i++) db.users.push(makeUser(pick(FIRST), pick(LAST), i));

  // Séances fictives validées par les studios de démonstration.
  const studios = db.partners.filter(p => p.status === 'actif');
  const addSessions = (u, n) => { for (let i = 0; i < n; i++) u.club.sessions.push({ at: daysAgo(n * 4 - i * 4 + 1), partnerId: pick(studios).id, demo: true }); };
  addSessions(named[0], 3); addSessions(named[2], 7);
  for (const u of db.users.slice(3)) if (u.club.member && rand() < 0.4) addSessions(u, between(1, 12));

  // Commandes de démonstration sur 90 jours.
  let orderNo = 1000;
  const published = db.products;
  const pickItem = () => {
    const p = rand() < 0.35 ? published.find(x => x.id === 'pantalon-survetement') : pick(published);
    const weightsColor = rand() < 0.3 ? 'bordeaux' : pick(p.colors);
    return { productId: p.id, color: p.colors.includes(weightsColor) ? weightsColor : p.colors[0], size: pick(p.sizes), cut: p.cuts ? pick(p.cuts) : undefined, length: p.lengths ? pick(p.lengths) : undefined, qty: 1 };
  };
  const makeOrder = (user, d) => {
    const items = [];
    const n = between(1, 3);
    for (let k = 0; k < n; k++) items.push(pickItem());
    if (rand() < 0.3) {
      const color = pick(['bordeaux', 'olive', 'noir', 'majorelle']);
      items.push({ productId: 'veste-cintree-studio', color, size: pick(['S', 'M']), qty: 1 }, { productId: 'pantalon-survetement', color, size: pick(['S', 'M', 'L']), cut: 'evasee', length: 'standard', qty: 1 });
    }
    if (items.some(i => i.productId.startsWith('brassiere')) && rand() < 0.55) items.push({ productId: 'chaussettes-pilates', color: 'noir', size: '35-38', qty: 1 });
    const priced = priceCart(db, { items, shippingMethod: rand() < 0.6 ? 'domicile' : 'relais' });
    const status = d > 6 ? (rand() < 0.06 ? 'refunded' : 'delivered') : d > 2 ? 'shipped' : 'paid';
    const createdAt = daysAgo(d, between(8, 22));
    return {
      id: `ord_demo_${orderNo}`, number: `MV${orderNo++}`, demo: true, userId: user.id, email: user.email,
      createdAt, paidAt: createdAt, status, device: rand() < 0.72 ? 'mobile' : 'desktop', source: pick(['instagram', 'tiktok', 'tiktok', 'google', 'direct', 'newsletter']),
      lines: priced.lines.map(({ stock, ...l }) => l), subtotal: priced.subtotal, ensemble: priced.ensemble, promo: null, promoDiscount: 0,
      shippingMethod: priced.shippingMethod, shipping: priced.shipping, total: priced.total,
      address: user.addresses[0], payment: { provider: 'demo', method: pick(['card', 'card', 'apple_pay', 'google_pay']) },
      refunds: status === 'refunded' ? [{ amount: priced.total, at: createdAt, reason: 'Taille' }] : [], tracking: status !== 'paid' ? `6A${between(10000000, 99999999)}` : null,
      returnRequest: null
    };
  };
  // Camille : 6 commandes anciennes -> 1 récompense MOVA Club ; Léa : 2 ; Sarah : 3 + 1 récente (en attente des 14 jours).
  [140, 110, 80, 60, 45, 30].forEach(d => db.orders.push(makeOrder(named[0], d)));
  [50, 20].forEach(d => db.orders.push(makeOrder(named[1], d)));
  [70, 50, 25, 5].forEach(d => db.orders.push(makeOrder(named[2], d)));
  db.orders.forEach(o => { if (named.some(u => u.id === o.userId)) o.status = o.status === 'refunded' ? 'delivered' : o.status; o.refunds = o.status === 'refunded' ? o.refunds : []; });
  for (let i = 0; i < 150; i++) {
    const d = Math.floor(Math.pow(rand(), 1.3) * 90);
    db.orders.push(makeOrder(pick(db.users.slice(3)), d));
  }
  db.orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Avis vérifiés fictifs (rattachés à des commandes de démonstration).
  const texts = [
    ['Coupe parfaite', 'Le pantalon évasé tombe super bien, je l’ai porté au Pilates puis en terrasse.', 5, 'normal'],
    ['Très confortable', 'Matière douce et opaque. J’ai pris ma taille habituelle.', 5, 'normal'],
    ['Joli coloris', 'Le bordeaux est encore plus beau en vrai.', 4, 'normal'],
    ['Taille un peu petit', 'Je conseille de prendre une taille au-dessus pour une coupe plus ample.', 4, 'petit'],
    ['Mon ensemble préféré', 'Je ne le quitte plus, du studio au bureau.', 5, 'normal'],
    ['Bien mais long', 'J’aurais dû prendre la longueur petite (1,58 m).', 4, 'grand']
  ];
  for (const o of db.orders.filter(o => o.status === 'delivered').slice(0, 90)) {
    if (rand() > 0.45) continue;
    const line = pick(o.lines);
    const [title, body, rating, fit] = pick(texts);
    db.reviews.push({ id: `rev_demo_${db.reviews.length + 1}`, demo: true, productId: line.productId, orderId: o.id, userId: o.userId,
      author: (db.users.find(u => u.id === o.userId)?.firstName || 'Cliente') + ' ' + (db.users.find(u => u.id === o.userId)?.lastName || '').charAt(0) + '.',
      rating, title, body, size: line.size, fit, status: 'published', createdAt: o.createdAt, verified: true });
  }

  // Note moyenne et nombre d'avis par produit.
  for (const p of db.products) {
    const rs = db.reviews.filter(r => r.productId === p.id && r.status === 'published');
    p.rating = { average: rs.length ? Math.round(rs.reduce((s, r) => s + r.rating, 0) / rs.length * 10) / 10 : 0, count: rs.length };
  }

  // Codes promo.
  db.promoCodes.push(
    { code: 'MOVA10', label: 'Lancement -10 % dès 50 €', type: 'percent', value: 10, minTotal: 50, active: true, uses: 12, maxUses: null, firstOrderOnly: false, expiresAt: null, demo: true, createdAt: daysAgo(60) },
    ...studios.map(s => ({ code: s.code, label: `Code partenaire ${s.name}`, type: 'percent', value: 10, minTotal: 0, active: true, uses: between(0, 9), maxUses: null, firstOrderOnly: false, expiresAt: null, partnerId: s.id, demo: true, createdAt: daysAgo(45) }))
  );

  // Inscriptions newsletter fictives (pop-up -5 %).
  for (let i = 0; i < 260; i++) {
    const d = Math.floor(rand() * 90);
    const code = readableCode('BIENVENUE');
    const email = `contact${i}@demo.mova.fr`;
    db.newsletter.push({ email, demo: true, createdAt: daysAgo(d), source: rand() < 0.8 ? 'popup_bienvenue' : 'footer', consent: true, confirmed: rand() < 0.85, welcomeCode: code, unsubscribed: rand() < 0.04 });
    db.promoCodes.push({ code, label: 'Bienvenue -5 %', type: 'percent', value: 5, active: true, uses: rand() < 0.18 ? 1 : 0, maxUses: 1, firstOrderOnly: true, email, expiresAt: new Date(Date.now() + (30 - d) * 864e5).toISOString(), demo: true, createdAt: daysAgo(d) });
  }

  // Trafic fictif (90 jours).
  for (let d = 89; d >= 0; d--) {
    const day = new Date(); day.setDate(day.getDate() - d);
    const base = 180 + (89 - d) * 4 + between(-40, 60);
    const visits = Math.max(60, base + (day.getDay() === 0 || day.getDay() === 6 ? 70 : 0));
    db.traffic.days.push({ date: day.toISOString().slice(0, 10), visits, unique: Math.round(visits * 0.74), mobile: Math.round(visits * (0.68 + rand() * 0.08)),
      sources: { instagram: Math.round(visits * 0.28), tiktok: Math.round(visits * 0.31), google: Math.round(visits * 0.17), direct: Math.round(visits * 0.16), newsletter: Math.round(visits * 0.08) } });
  }
  db.traffic.topPages = [['/', 'Accueil'], ['/collection/hiver', 'Collection hiver'], ['/produit/pantalon-survetement', 'Pantalon de survêtement'], ['/ensembles', 'Ensembles'], ['/mova-club', 'MOVA Club'], ['/carte', 'MOVA près de toi']]
    .map(([p, t], i) => ({ path: p, title: t, views: Math.round(9000 / (i + 1.2)) }));

  // Paniers abandonnés fictifs.
  for (let i = 0; i < 120; i++) {
    const user = pick(db.users);
    const items = [pickItem()];
    if (rand() < 0.4) items.push(pickItem());
    const priced = priceCart(db, { items });
    const recovered = rand() < 0.14;
    db.carts.push({ id: `cart_demo_${i}`, demo: true, userId: rand() < 0.5 ? user.id : null, email: rand() < 0.5 ? user.email : null, items, value: priced.total,
      updatedAt: daysAgo(Math.floor(rand() * 60)), device: rand() < 0.78 ? 'mobile' : 'desktop', status: recovered ? 'recovered' : rand() < 0.2 ? 'active' : 'abandoned', reminders: recovered ? 1 : between(0, 2) });
  }

  return db;
}

if (require.main === module) {
  if (fs.existsSync(DB_PATH) && !process.argv.includes('--force')) {
    console.log('data/db.json existe déjà. Ajoute --force pour le régénérer.');
    process.exit(0);
  }
  const db = seed();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 1));
  console.log(`Base de démonstration créée : ${db.products.length} produits, ${db.users.length} clientes, ${db.orders.length} commandes, ${db.partners.length} partenaires.`);
}

module.exports = { seed, DB_PATH };

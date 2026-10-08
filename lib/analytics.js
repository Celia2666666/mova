// Indicateurs du tableau de bord (cahier des charges §16.2) et constats automatiques (§16.3).
const { round2 } = require('./pricing');

const PAID = ['paid', 'shipped', 'delivered', 'partially_refunded', 'refunded'];
const dayKey = d => new Date(d).toISOString().slice(0, 10);
const refunded = o => (o.refunds || []).reduce((s, r) => s + r.amount, 0);

function inPeriod(iso, from, to) { const t = new Date(iso).getTime(); return t >= from && t < to; }

function computeStats(db, days = 30) {
  const to = Date.now();
  const from = to - days * 864e5;
  const prevFrom = from - days * 864e5;
  const orders = db.orders.filter(o => PAID.includes(o.status) && inPeriod(o.paidAt || o.createdAt, from, to));
  const prevOrders = db.orders.filter(o => PAID.includes(o.status) && inPeriod(o.paidAt || o.createdAt, prevFrom, from));
  const revenue = round2(orders.reduce((s, o) => s + o.total - refunded(o), 0));
  const prevRevenue = round2(prevOrders.reduce((s, o) => s + o.total - refunded(o), 0));
  const trafficDays = db.traffic.days.filter(d => inPeriod(d.date + 'T12:00:00Z', from, to));
  const visits = trafficDays.reduce((s, d) => s + d.visits, 0);
  const unique = trafficDays.reduce((s, d) => s + d.unique, 0);
  const mobile = trafficDays.reduce((s, d) => s + d.mobile, 0);
  const sources = {};
  for (const d of trafficDays) for (const [k, v] of Object.entries(d.sources || {})) sources[k] = (sources[k] || 0) + v;

  const byProduct = {}, byColor = {}, bySize = {};
  for (const o of orders) for (const l of o.lines) {
    byProduct[l.productId] = (byProduct[l.productId] || 0) + l.qty;
    byColor[l.color] = (byColor[l.color] || 0) + l.qty;
    bySize[l.size] = (bySize[l.size] || 0) + l.qty;
  }
  const productName = id => db.products.find(p => p.id === id)?.name || id;
  const top = Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, qty]) => ({ id, name: productName(id), qty }));

  const carts = db.carts.filter(c => inPeriod(c.updatedAt, from, to));
  const abandoned = carts.filter(c => c.status === 'abandoned');
  const recovered = carts.filter(c => c.status === 'recovered');
  const active = db.carts.filter(c => c.status === 'active');
  const cartTotal = abandoned.length + recovered.length + orders.length;

  const newCustomers = db.users.filter(u => inPeriod(u.createdAt, from, to)).length;
  const countByUser = {};
  for (const o of db.orders.filter(o => PAID.includes(o.status))) countByUser[o.email] = (countByUser[o.email] || 0) + 1;
  const recurring = Object.values(countByUser).filter(n => n >= 2).length;
  const buyers = Object.keys(countByUser).length;

  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(to - i * 864e5);
    const dayOrders = orders.filter(o => dayKey(o.paidAt || o.createdAt) === key);
    series.push({ date: key, revenue: round2(dayOrders.reduce((s, o) => s + o.total - refunded(o), 0)), orders: dayOrders.length, visits: trafficDays.find(d => d.date === key)?.visits || 0 });
  }

  return {
    period: { days, from: new Date(from).toISOString(), to: new Date(to).toISOString() },
    demo: db.orders.some(o => o.demo) || db.traffic.demo,
    traffic: { visits, unique, mobileShare: visits ? round2(mobile / visits * 100) : 0, sources, topPages: db.traffic.topPages || [] },
    sales: {
      revenue, prevRevenue, revenueChange: prevRevenue ? round2((revenue - prevRevenue) / prevRevenue * 100) : null,
      orders: orders.length, prevOrders: prevOrders.length, aov: orders.length ? round2(revenue / orders.length) : 0,
      conversion: visits ? round2(orders.length / visits * 100) : 0,
      top, byColor, bySize, ensembles: orders.reduce((s, o) => s + (o.ensemble?.count || 0), 0),
      refunds: round2(orders.reduce((s, o) => s + refunded(o), 0))
    },
    carts: {
      active: active.length, abandoned: abandoned.length, abandonedValue: round2(abandoned.reduce((s, c) => s + c.value, 0)),
      abandonRate: cartTotal ? round2(abandoned.length / cartTotal * 100) : 0, recovered: recovered.length,
      mobileAbandon: abandoned.filter(c => c.device === 'mobile').length, desktopAbandon: abandoned.filter(c => c.device !== 'mobile').length
    },
    customers: {
      total: db.users.length, newCustomers, recurring, buyers, repeatRate: buyers ? round2(recurring / buyers * 100) : 0,
      clubMembers: db.users.filter(u => u.club?.member).length,
      newsletter: db.newsletter.filter(n => n.consent && !n.unsubscribed).length,
      welcomeCodesUsed: db.promoCodes.filter(p => p.code.startsWith('BIENVENUE') && p.uses > 0).length
    },
    series
  };
}

// Constats chiffrés, toujours avec période et volume (cahier des charges §16.3).
function insights(db) {
  const out = [];
  const week = computeStats(db, 7);
  const month = computeStats(db, 30);
  const fragile = n => n < 30 ? ' Volume faible : tendance à confirmer.' : '';
  const colorName = id => db.colors.find(c => c.id === id)?.name || id;

  // 1. Coloris des ensembles cette semaine.
  const PAID_ = ['paid', 'shipped', 'delivered', 'partially_refunded'];
  const recent = db.orders.filter(o => PAID_.includes(o.status) && Date.now() - new Date(o.paidAt || o.createdAt) < 7 * 864e5);
  const ensColors = {};
  for (const o of recent) for (const l of o.lines) if (l.type === 'veste') ensColors[l.color] = (ensColors[l.color] || 0) + l.qty;
  const ensTotal = Object.values(ensColors).reduce((a, b) => a + b, 0);
  if (ensTotal) {
    const [c, n] = Object.entries(ensColors).sort((a, b) => b[1] - a[1])[0];
    out.push({ kind: 'ventes', text: `Les vestes ${colorName(c).toLowerCase()} représentent ${Math.round(n / ensTotal * 100)} % des vestes vendues sur les 7 derniers jours (${n} sur ${ensTotal}, ${recent.length} commandes).${fragile(recent.length)}` });
  }
  // 2. Évolution du chiffre d'affaires.
  if (month.sales.revenueChange !== null) {
    out.push({ kind: 'ventes', text: `Chiffre d'affaires des 30 derniers jours : ${month.sales.revenue.toFixed(0)} € (${month.sales.orders} commandes), soit ${month.sales.revenueChange >= 0 ? '+' : ''}${month.sales.revenueChange} % par rapport aux 30 jours précédents (${month.sales.prevOrders} commandes).${fragile(month.sales.orders)}` });
  }
  // 3. Abandon mobile vs ordinateur.
  const c = month.carts;
  if (c.abandoned) {
    const mobileShare = Math.round(c.mobileAbandon / c.abandoned * 100);
    out.push({ kind: 'paniers', text: `${mobileShare} % des ${c.abandoned} paniers abandonnés sur 30 jours viennent du mobile, pour ${month.traffic.mobileShare} % du trafic. ${mobileShare > month.traffic.mobileShare + 5 ? 'Le tunnel mobile est à examiner en priorité.' : 'Pas d’écart marqué entre mobile et ordinateur.'}` });
  }
  // 4. Association brassière -> chaussettes de Pilates.
  const allPaid = db.orders.filter(o => PAID_.includes(o.status) && Date.now() - new Date(o.paidAt || o.createdAt) < 90 * 864e5);
  const withBra = allPaid.filter(o => o.lines.some(l => l.type === 'brassiere'));
  if (withBra.length) {
    const both = withBra.filter(o => o.lines.some(l => l.productId === 'chaussettes-pilates')).length;
    out.push({ kind: 'paniers', text: `${Math.round(both / withBra.length * 100)} % des commandes avec une brassière contiennent aussi des chaussettes de Pilates (${both} sur ${withBra.length} commandes, 90 jours). Bonne association pour « Complète ton look ».${fragile(withBra.length)}` });
  }
  // 5. Stocks bas sur les meilleures ventes.
  const low = [];
  for (const p of db.products) for (const [k, v] of Object.entries(p.stock)) if (v > 0 && v <= (p.lowStockThreshold || 3) && p.bestseller) low.push(`${p.name} ${k.split('|').filter(x => x !== '-').join(' ')}`);
  if (low.length) out.push({ kind: 'stock', text: `${low.length} variantes de meilleures ventes ont 3 pièces ou moins en stock, dont ${low.slice(0, 3).join(' ; ')}.` });
  const zero = db.products.reduce((s, p) => s + Object.values(p.stock).filter(v => v === 0).length, 0);
  if (zero) out.push({ kind: 'stock', text: `${zero} variantes sont en rupture. ${db.restockAlerts.filter(a => !a.sentAt).length} alertes de réassort clientes sont en attente.` });
  return { generatedAt: new Date().toISOString(), demo: week.demo, items: out };
}

module.exports = { computeStats, insights, PAID };

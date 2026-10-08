// Calcul du panier — source unique de vérité, toujours côté serveur.
// Règles : cahier des charges §10.1 (ensemble 80 €), §8.1 (code de bienvenue), livraison.

const round2 = n => Math.round(n * 100) / 100;

function variantKey(item) {
  return [item.color, item.size, item.cut || '-', item.length || '-'].join('|');
}

function normaliseItems(db, rawItems) {
  const lines = [];
  const errors = [];
  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const product = db.products.find(p => p.id === raw.productId && p.status === 'published');
    if (!product) { errors.push(`Produit indisponible : ${raw.productId}`); continue; }
    const qty = Math.max(1, Math.min(10, parseInt(raw.qty, 10) || 1));
    const item = {
      productId: product.id, color: raw.color, size: raw.size,
      cut: product.cuts ? (raw.cut || product.cuts[0]) : undefined,
      length: product.lengths ? (raw.length || 'standard') : undefined, qty
    };
    if (!product.colors.includes(item.color)) { errors.push(`Coloris invalide pour ${product.name}`); continue; }
    if (!product.sizes.includes(item.size)) { errors.push(`Taille invalide pour ${product.name}`); continue; }
    if (product.cuts && !product.cuts.includes(item.cut)) { errors.push(`Coupe invalide pour ${product.name}`); continue; }
    if (product.lengths && !product.lengths.includes(item.length)) { errors.push(`Longueur invalide pour ${product.name}`); continue; }
    const key = variantKey(item);
    const stock = product.stock[key] ?? 0;
    lines.push({ ...item, key, name: product.name, type: product.type, ensembleRole: product.ensembleRole || product.type, unitPrice: product.price,
      ensembleGroup: product.ensembleGroup || null, stock, lineTotal: round2(product.price * qty) });
  }
  return { lines, errors };
}

// Associe vestes et pantalons compatibles en ensembles (tailles libres, coloris selon réglage).
function ensembleDiscount(lines, settings) {
  const price = settings.ensemblePrice;
  const sameColor = settings.ensembleSameColor;
  const units = { veste: [], pantalon: [] };
  for (const l of lines) {
    if (!l.ensembleGroup || !units[l.ensembleRole]) continue;
    for (let i = 0; i < l.qty; i++) units[l.ensembleRole].push({ color: l.color, price: l.unitPrice });
  }
  const pairs = [];
  const pants = [...units.pantalon];
  for (const v of units.veste) {
    const idx = pants.findIndex(p => !sameColor || p.color === v.color);
    if (idx < 0) continue;
    const [p] = pants.splice(idx, 1);
    const saving = round2(v.price + p.price - price);
    if (saving > 0) pairs.push({ color: v.color, colorPant: p.color, saving });
  }
  return { count: pairs.length, amount: round2(pairs.reduce((s, p) => s + p.saving, 0)), pairs };
}

function findPromo(db, code) {
  if (!code) return null;
  return db.promoCodes.find(p => p.code.toUpperCase() === String(code).trim().toUpperCase()) || null;
}

function checkPromo(db, promo, { email, merchandise }) {
  if (!promo) return 'Code inconnu.';
  if (!promo.active) return 'Ce code n’est plus actif.';
  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) return 'Ce code a expiré.';
  if (promo.maxUses && promo.uses >= promo.maxUses) return 'Ce code a déjà été utilisé.';
  if (promo.minTotal && merchandise < promo.minTotal) return `Ce code est valable dès ${promo.minTotal} € d’achat.`;
  if (promo.email && email && promo.email.toLowerCase() !== email.toLowerCase()) return 'Ce code est personnel et lié à une autre adresse e-mail.';
  if (promo.firstOrderOnly && email) {
    const already = db.orders.some(o => o.email.toLowerCase() === email.toLowerCase() && ['paid', 'shipped', 'delivered', 'partially_refunded'].includes(o.status));
    if (already) return 'Ce code est réservé à une première commande.';
  }
  return null;
}

function priceCart(db, { items, promoCode, email, shippingMethod }) {
  const settings = db.settings;
  const { lines, errors } = normaliseItems(db, items);
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const ensemble = ensembleDiscount(lines, settings);
  const merchandise = round2(subtotal - ensemble.amount);

  let promo = null;
  let promoDiscount = 0;
  let promoError = null;
  if (promoCode) {
    const found = findPromo(db, promoCode);
    promoError = checkPromo(db, found, { email, merchandise });
    if (!promoError) {
      promo = { code: found.code, label: found.label, type: found.type, value: found.value };
      promoDiscount = found.type === 'percent' ? round2(merchandise * found.value / 100) : Math.min(found.value, merchandise);
    }
  }
  const afterDiscounts = round2(merchandise - promoDiscount);
  const method = settings.shipping.methods.find(m => m.id === shippingMethod) || settings.shipping.methods[0];
  const freeShipping = afterDiscounts >= settings.shipping.freeFrom;
  const shipping = lines.length === 0 ? 0 : (freeShipping ? 0 : method.price);
  const total = round2(afterDiscounts + shipping);
  const stockIssues = lines.filter(l => l.stock < l.qty).map(l => `${l.name} (${l.color}, ${l.size}) : ${l.stock === 0 ? 'rupture de stock' : `plus que ${l.stock} en stock`}`);

  return {
    lines, errors, stockIssues, subtotal,
    ensemble: { count: ensemble.count, amount: ensemble.amount, unitPrice: settings.ensemblePrice },
    promo, promoDiscount, promoError,
    shippingMethod: method.id, shipping, freeShippingFrom: settings.shipping.freeFrom,
    remainingForFreeShipping: freeShipping ? 0 : round2(settings.shipping.freeFrom - afterDiscounts),
    total, totalCents: Math.round(total * 100)
  };
}

module.exports = { priceCart, variantKey, findPromo, round2 };

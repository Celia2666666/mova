// Assistant MOVA (chatbot) et assistant d'analyse du back-office.
// Avec ANTHROPIC_API_KEY : Claude + outils branchés sur les vraies données (catalogue, stock, commandes).
// Sans clé : moteur de règles fondé sur les mêmes données. Dans les deux cas, rien n'est inventé.
const knowledge = require('./knowledge');

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (client) return client;
  try {
    const mod = require('@anthropic-ai/sdk');
    const Anthropic = mod.Anthropic || mod.default || mod;
    client = new Anthropic();
  } catch (e) {
    console.warn('[assistant] SDK Anthropic non installé (npm install) — moteur de règles utilisé.');
    client = null;
  }
  return client;
}
const MODEL = process.env.MOVA_AI_MODEL || 'claude-opus-5-5';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// --- Outils partagés -------------------------------------------------------
function searchCatalog(db, { query = '', category, color, tag, size, max = 6 } = {}) {
  const q = norm(query);
  const words = q.split(/\s+/).filter(w => w.length > 2);
  const colorIds = db.colors.filter(c => q.includes(norm(c.name)) || q.includes(c.id)).map(c => c.id);
  if (color) colorIds.push(color);
  const results = [];
  for (const p of db.products.filter(p => p.status === 'published')) {
    if (category && p.category !== category) continue;
    if (tag && !p.tags.includes(tag)) continue;
    const colors = p.colors.filter(c => !colorIds.length || colorIds.includes(c));
    if (!colors.length) continue;
    const available = colors.filter(c => Object.entries(p.stock).some(([k, v]) => k.startsWith(c + '|') && v > 0 && (!size || k.split('|')[1] === size)));
    if (!available.length) continue;
    const hay = norm([p.name, p.category, p.description, p.fit, ...p.tags].join(' '));
    const score = words.reduce((s, w) => s + (hay.includes(w) ? 2 : 0), 0) + p.popularity / 100 + (colorIds.length ? 1 : 0);
    if (words.length && score < 1.5 && !colorIds.length && !category && !tag) continue;
    results.push({ score, product: { id: p.id, name: p.name, price: p.price, category: p.category, fit: p.fit, tags: p.tags, colorsInStock: available, cuts: p.cuts || null } });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, max).map(r => r.product);
}

function orderStatus(db, { orderNumber, email }, user) {
  const o = db.orders.find(o => o.number.toUpperCase() === String(orderNumber || '').trim().toUpperCase());
  if (!o) return { found: false };
  const allowed = (user && o.userId === user.id) || (email && o.email.toLowerCase() === String(email).toLowerCase());
  if (!allowed) return { found: false, note: 'Numéro et e-mail ne correspondent pas.' };
  return { found: true, number: o.number, status: o.status, createdAt: o.createdAt, tracking: o.tracking, total: o.total };
}

const STATUS_FR = { pending_payment: 'en attente de paiement', paid: 'payée, en préparation', shipped: 'expédiée', delivered: 'livrée', refunded: 'remboursée', partially_refunded: 'partiellement remboursée', expired: 'expirée (paiement non finalisé)' };

// --- Moteur de règles (sans clé API) ---------------------------------------
function rulesReply(db, text, user) {
  const kb = knowledge(db.settings);
  const t = norm(text);
  const has = (...w) => w.some(x => t.includes(x));
  const orderMatch = text.match(/MV\d{3,6}/i);
  if (orderMatch || has('ma commande', 'mon colis', 'suivi', 'ou en est')) {
    if (!orderMatch && !user) return { reply: 'Donne-moi ton numéro de commande (il commence par MV) et l’e-mail utilisé, ou connecte-toi pour que je retrouve tes commandes.' };
    if (!orderMatch && user) {
      const last = db.orders.filter(o => o.userId === user.id && o.status !== 'expired').at(-1);
      if (!last) return { reply: 'Je ne vois aucune commande sur ton compte.' };
      return { reply: `Ta dernière commande ${last.number} est ${STATUS_FR[last.status] || last.status}.${last.tracking ? ` Numéro de suivi : ${last.tracking}.` : ''}` };
    }
    const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const r = orderStatus(db, { orderNumber: orderMatch[0], email: emailMatch && emailMatch[0] }, user);
    if (!r.found) return { reply: 'Je ne peux pas afficher cette commande : il me faut le numéro et l’e-mail de commande correspondants (ou connecte-toi).' };
    return { reply: `La commande ${r.number} est ${STATUS_FR[r.status] || r.status}.${r.tracking ? ` Numéro de suivi : ${r.tracking}.` : ''}` };
  }
  if (has('livraison', 'livre', 'delai', 'expedi', 'frais de port')) return { reply: kb.livraison };
  if (has('retour', 'rembours', 'echange', 'renvoyer')) return { reply: kb.retours };
  if (has('club', 'fidelit', 'recompense', 'points')) return { reply: kb.club };
  if (has('partenaire', 'studio', 'collab', 'carte')) return { reply: kb.partenaires, link: { href: '#/mova-pres-de-toi', label: 'Voir la carte' } };
  if (has('matiere', 'composition', 'tissu', 'lavage', 'entretien', 'opaque')) return { reply: kb.matieres };
  if (has('paiement', 'payer', 'apple pay', 'google pay', 'carte bancaire')) return { reply: kb.paiement };
  if (has('ensemble', '80')) return { reply: kb.ensemble, products: searchCatalog(db, { category: 'vestes', max: 2 }) };
  if (has('coupe', 'evase', 'droite', 'jogging', 'ajuste')) return { reply: kb.coupes, products: searchCatalog(db, { query: 'pantalon', max: 1 }) };
  if (has('taille', 'mensuration', 'je fais', 'xs', ' xl')) return { reply: kb.tailles };
  if (has('code', 'reduc', 'promo', 'newsletter', '5 %', '5%')) return { reply: kb.bienvenue };
  if (has('humain', 'conseill', 'contact', 'personne', 'service client')) return { reply: kb.contact, handoff: true };

  // Recommandation produit.
  const tags = ['pilates', 'padel', 'fitness', 'ville'].filter(x => t.includes(x));
  const wantsOutfit = has('tenue', 'ensemble', 'look', 'cherche', 'conseil', 'porter', 'idee');
  const results = searchCatalog(db, { query: text, tag: tags[0], max: 4 });
  if (results.length && (wantsOutfit || tags.length || results.length)) {
    let reply;
    if (tags.includes('pilates') && tags.includes('ville')) {
      const studio = db.products.find(p => p.id === 'veste-cintree-studio');
      const pant = db.products.find(p => p.id === 'pantalon-survetement');
      const inStock = c => Object.entries(pant.stock).some(([k, v]) => k.startsWith(c + '|') && v > 0) && Object.entries(studio.stock).some(([k, v]) => k.startsWith(c + '|') && v > 0);
      const colors = ['bordeaux', 'olive', 'noir', 'majorelle'].filter(inStock).map(c => db.colors.find(x => x.id === c).name.toLowerCase());
      reply = `Je te conseille notre Ensemble Studio : pantalon évasé + veste cintrée, ${db.settings.ensemblePrice} € l’ensemble, disponible en ce moment en ${colors.slice(0, 3).join(', ')}. Il tient au Pilates et passe très bien en ville.`;
      return { reply, products: [studio, pant].map(p => ({ id: p.id, name: p.name, price: p.price })) };
    }
    reply = `Voici ce que j’ai en stock qui correspond${tags.length ? ` (${tags.join(', ')})` : ''} :`;
    return { reply, products: results };
  }
  return { reply: 'Je n’ai pas la réponse à cette question. Je peux t’aider sur les tailles, les produits, la livraison, les retours, ta commande ou MOVA Club — ou te mettre en contact avec le service client.', handoff: true };
}

// --- Claude + outils --------------------------------------------------------
const TOOLS = [
  { name: 'search_catalog', description: 'Cherche des produits MOVA publiés et en stock. Retourne uniquement les coloris réellement disponibles. À utiliser avant toute recommandation de produit.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Mots-clés (ex. « pantalon évasé », « brassière »).' },
      category: { type: 'string', enum: ['vestes', 'pantalons', 'sweats', 'brassieres', 'leggings', 'shorts', 'casquettes', 'pinces', 'chouchous', 'bandeaux', 'chaussettes', 'chaussettes-pilates', 'gourdes'] },
      color: { type: 'string', enum: ['bordeaux', 'olive', 'majorelle', 'orange', 'jaune', 'rose', 'leopard', 'noir'] },
      tag: { type: 'string', enum: ['pilates', 'padel', 'fitness', 'ville'] },
      size: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL', 'TU', '35-38', '39-42'] } }, additionalProperties: false } },
  { name: 'get_policy', description: 'Renvoie le texte officiel MOVA sur un sujet de service client.',
    input_schema: { type: 'object', properties: { topic: { type: 'string', enum: ['livraison', 'retours', 'tailles', 'matieres', 'ensemble', 'coupes', 'club', 'partenaires', 'paiement', 'bienvenue', 'contact'] } }, required: ['topic'], additionalProperties: false } },
  { name: 'get_order_status', description: 'Statut d’une commande. Nécessite le numéro (MVxxxx) et l’e-mail de commande, sauf si la cliente est connectée.',
    input_schema: { type: 'object', properties: { orderNumber: { type: 'string' }, email: { type: 'string' } }, required: ['orderNumber'], additionalProperties: false } },
  { name: 'list_partners', description: 'Liste des studios partenaires actifs affichés sur la carte.', input_schema: { type: 'object', properties: {}, additionalProperties: false } }
];

const SYSTEM = `Tu es l'Assistant MOVA, conseillère de la marque de sportswear féminin MOVA (Lyon). Tu tutoies, tu es chaleureuse et concise (3 phrases maximum, sans liste à puces sauf pour comparer des produits).
Règles strictes :
- Pour tout produit, coloris, stock, prix, délai ou statut de commande, appelle d'abord un outil. N'invente jamais une information qu'un outil ne t'a pas donnée.
- Ne recommande que des produits renvoyés par search_catalog, avec les coloris de colorsInStock.
- N'annonce aucun partenariat en dehors de list_partners. N'accorde ni remise ni remboursement.
- Si tu ne sais pas, propose le service client (formulaire de la page Aide).
- Rappelle que les recommandations de taille sont indicatives.`;

async function claudeReply(db, messages, user) {
  const c = getClient();
  if (!c) return null;
  const found = new Map();
  const runTool = (name, input) => {
    if (name === 'search_catalog') { const r = searchCatalog(db, input); r.forEach(p => found.set(p.id, p)); return r; }
    if (name === 'get_policy') return { text: knowledge(db.settings)[input.topic] || 'Sujet inconnu.' };
    if (name === 'get_order_status') { const r = orderStatus(db, input, user); if (r.found) r.statusLabel = STATUS_FR[r.status]; return r; }
    if (name === 'list_partners') return db.partners.filter(p => p.status === 'actif').map(p => ({ name: p.name, activity: p.activity, address: p.address, advantages: p.advantages, demo: !!p.demo }));
    return { error: 'Outil inconnu' };
  };
  const convo = messages.slice(-12).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 2000) }));
  if (user) convo[convo.length - 1].content += `\n\n(Contexte : cliente connectée, prénom ${user.firstName}.)`;
  for (let i = 0; i < 5; i++) {
    const res = await c.beta.messages.create({
      model: MODEL, max_tokens: 2048, system: SYSTEM, tools: TOOLS, messages: convo,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'
    });
    if (res.stop_reason === 'refusal') return { reply: 'Je ne peux pas répondre à cette demande. Le service client peut t’aider via la page Aide.', handoff: true };
    convo.push({ role: 'assistant', content: res.content });
    const uses = res.content.filter(b => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !uses.length) {
      const reply = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      const products = [...found.values()].filter(p => reply.includes(p.name)).slice(0, 3);
      return { reply: reply || 'Je n’ai pas pu formuler de réponse.', products, ai: true };
    }
    convo.push({ role: 'user', content: uses.map(u => {
      try { return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(runTool(u.name, u.input || {})) }; }
      catch (e) { return { type: 'tool_result', tool_use_id: u.id, content: `Erreur : ${e.message}`, is_error: true }; }
    }) });
  }
  return { reply: 'Je n’ai pas réussi à trouver la réponse. Le service client peut t’aider.', handoff: true };
}

async function chat(db, messages, user) {
  const last = messages.filter(m => m.role === 'user').at(-1);
  if (!last) return { reply: 'Bonjour ! Comment puis-je t’aider ?' };
  try {
    const ai = await claudeReply(db, messages, user);
    if (ai) return ai;
  } catch (e) {
    console.warn('[assistant] API indisponible, bascule sur le moteur de règles :', e.message);
  }
  return rulesReply(db, last.content, user);
}

// --- Assistant d'analyse (back-office) --------------------------------------
async function analyse(question, stats, insights) {
  const c = getClient();
  if (!c) return null;
  const res = await c.beta.messages.create({
    model: MODEL, max_tokens: 2048, output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    system: 'Tu es l’analyste e-commerce de MOVA. Réponds en français, en 5 phrases maximum, uniquement à partir des données JSON fournies. Cite toujours la période et le volume (nombre de commandes ou de visites) de chaque constat. Si le volume est inférieur à 30 commandes, dis que la tendance est fragile. Si les données sont marquées demo, précise qu’elles sont fictives.',
    messages: [{ role: 'user', content: `Données :\n${JSON.stringify({ stats, insights })}\n\nQuestion : ${question}` }]
  });
  if (res.stop_reason === 'refusal') return null;
  return res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

module.exports = { chat, analyse, searchCatalog, aiEnabled: () => !!getClient() };

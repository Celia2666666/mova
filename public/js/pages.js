// MOVA — pages : compte et fidélité, MOVA Club, carte, essayage virtuel, univers, aide, légal, chatbot.
(function () {
  'use strict';
  const M = window.MOVA;
  const { $, $$, esc, euro, euro2, api, store, toast } = M;
  const S = M.state;
  const fdate = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const STATUS = { pending_payment: 'En attente de paiement', paid: 'Payée · en préparation', shipped: 'Expédiée', delivered: 'Livrée', refunded: 'Remboursée', partially_refunded: 'Remboursée en partie', expired: 'Expirée' };

  function qrSvg(text, size = 4) {
    if (!window.qrcode) return `<div class="tiny" style="word-break:break-all">${esc(text)}</div>`;
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: size, margin: 0, scalable: true });
  }
  M.qrSvg = qrSvg;

  // ---------- Coloris et looks ----------
  M.route('/coloris', () => { location.replace('#/tenues'); });
  const LOOKS = [
    { name: 'Wide & cosy', scene: 'ville', items: [['hoodie-oversize', 'moka'], ['pantalon-wide-lisere', 'moka'], ['casquette', 'chocolat'], ['chaussettes-pilates', 'creme']] },
    { name: 'Pilates to coffee', scene: 'cafe', items: [['veste-cintree-studio', 'bordeaux'], ['pantalon-survetement', 'bordeaux', 'evasee'], ['brassiere-sculpt', 'noir'], ['chaussettes-pilates', 'bordeaux']] },
    { name: 'Padel du dimanche', scene: 'ville', items: [['short-ample', 'rose'], ['brassiere-croisee', 'rose'], ['casquette', 'rose'], ['gourde', 'rose']] },
    { name: 'Cocon en ville', scene: 'ville', items: [['veste-zippee-city', 'olive'], ['pantalon-survetement', 'olive', 'jogging'], ['casquette', 'olive']] },
    { name: 'Reformer en Majorelle', scene: 'pilates', items: [['brassiere-sculpt', 'majorelle'], ['legging-seconde-peau', 'majorelle'], ['chaussettes-pilates', 'majorelle'], ['chouchou', 'majorelle']] },
    { name: 'Léopard après le studio', scene: 'soir', items: [['veste-zippee-city', 'leopard'], ['pantalon-survetement', 'noir', 'droite'], ['pince-cheveux', 'leopard']] },
    { name: 'Matin solaire', scene: 'maison', items: [['sweat-court', 'jaune'], ['legging-flare', 'noir'], ['pince-cheveux', 'jaune']] }
  ];
  M.route('/looks', ({ main }) => {
    const LOOK_PHOTO = { 'Wide & cosy': null, 'Pilates to coffee': 'creme', 'Padel du dimanche': 'shortVille', 'Cocon en ville': 'marron', 'Reformer en Majorelle': 'braReformer', 'Léopard après le studio': 'soir', 'Matin solaire': 'sweatRoseRue' };
    const lookFig = l => LOOK_PHOTO[l.name] ? MovaPhotos.img(LOOK_PHOTO[l.name], { w: 700, h: 875 }) : M.visual(M.product(l.items[1][0]), l.items[1][1]);
    const priceOf = l => { const items = l.items.map(([id]) => M.product(id)); const sum = items.reduce((s, p) => s + p.price, 0); const ens = items.some(p => p.type === 'veste') && items.some(p => p.type === 'pantalon') && l.items.find(i => M.product(i[0]).type === 'veste')[1] === l.items.find(i => M.product(i[0]).type === 'pantalon')[1]; return { sum, total: ens ? sum - 10 : sum }; };
    main.innerHTML = `<div class="container"><header class="page-hero"><p class="eyebrow">Collections</p><h1>Looks complets</h1><p>Des tenues pensées de la tête aux pieds, à ajouter au panier en un clic — choisis tes tailles juste avant.</p></header>
      <div class="grid grid-3">${LOOKS.map((l, i) => { const pr = priceOf(l); return `<article class="card reveal"><div class="card-media"><div class="art">${lookFig(l)}</div></div><div class="card-info"><h3>${esc(l.name)}</h3><span class="price">${pr.total !== pr.sum ? `<span class="strike">${euro(pr.sum)}</span> ` : ''}${euro(pr.total)}</span></div>
        <ul class="small" style="margin:0;padding-left:18px">${l.items.map(([id, c, cut]) => `<li><a href="#/produit/${id}?color=${c}${cut ? '&cut=' + cut : ''}">${esc(M.product(id).name)}</a> · ${esc(M.color(c).name)}</li>`).join('')}</ul>
        <form class="look-form" data-look="${i}"><div class="chips" style="margin:8px 0">${['XS', 'S', 'M', 'L', 'XL'].map(s => `<label class="chip" style="display:inline-flex;align-items:center"><input type="radio" name="size" value="${s}" ${s === (S.user?.sizeProfile?.top || 'M') ? 'checked' : ''} style="margin-right:6px">${s}</label>`).join('')}</div><button class="btn btn-dark btn-block btn-sm">Ajouter le look (taille choisie)</button></form></article>`; }).join('')}</div></div>`;
    main.onsubmit = e => {
      e.preventDefault(); const l = LOOKS[+e.target.dataset.look]; const size = new FormData(e.target).get('size');
      let missing = [];
      for (const [id, c, cut] of l.items) {
        const p = M.product(id); const sz = p.sizes.includes(size) ? size : p.sizes.includes('35-38') ? (['L', 'XL'].includes(size) ? '39-42' : '35-38') : p.sizes[0];
        const item = { productId: id, color: c, size: sz, cut: p.cuts ? (cut || p.cuts[0]) : undefined, length: p.lengths ? 'standard' : undefined };
        if (M.availability(p, item) > 0) M.addToCart(item, { open: false, silent: true }); else missing.push(p.name);
      }
      toast(missing.length ? `Look ajouté, sauf (épuisé en ${size}) : ${esc(missing.join(', '))}.` : 'Look complet ajouté au panier.', { error: !!missing.length });
      M.openDrawer();
    };
  });

  // ---------- Favoris ----------
  M.route('/favoris', ({ main }) => {
    const prods = S.favs.map(M.product).filter(Boolean);
    const bundles = S.catalog.bundles.filter(b => S.favs.includes(b.id));
    main.innerHTML = `<div class="container"><header class="page-hero"><p class="eyebrow">Ma sélection</p><h1>Favoris</h1><p>${S.user ? 'Tes favoris sont enregistrés dans ton compte.' : 'Tes favoris sont gardés sur cet appareil. <a href="#/compte">Connecte-toi</a> pour les retrouver partout.'}</p></header>
      ${prods.length || bundles.length ? `<div class="grid grid-4">${bundles.map(M.bundleCard).join('')}${prods.map(p => M.productCard(p)).join('')}</div>` : '<div class="empty"><p>Aucun favori pour l’instant. Touche le ♡ d’un produit pour le garder ici.</p><a class="btn btn-dark" href="#/tenues">Découvrir la collection</a></div>'}</div>`;
  });

  // ---------- Compte ----------
  const TABS = [['', 'Tableau de bord'], ['commandes', 'Commandes'], ['fidelite', 'MOVA Club'], ['favoris', 'Favoris'], ['tailles', 'Profil de taille'], ['adresses', 'Adresses'], ['infos', 'Informations'], ['preferences', 'Préférences & données']];
  function authPage(main, query) {
    main.innerHTML = `<div class="container"><div class="auth-wrap">
      <section class="panel"><h1 style="font-size:30px">Connexion</h1>
        <form id="login-form"><div class="field"><label for="li-email">E-mail</label><input id="li-email" type="email" name="email" autocomplete="email" required></div>
        <div class="field"><label for="li-pw">Mot de passe</label><input id="li-pw" type="password" name="password" autocomplete="current-password" required></div>
        <button class="btn btn-dark btn-block" type="submit">Se connecter</button><p class="form-msg" aria-live="polite"></p></form>
</section>
      <section class="panel"><h2 style="font-size:30px">Créer mon compte</h2><p class="small muted">Suivi de commande, retours en ligne, favoris partout et MOVA Club.</p>
        <form id="register-form"><div class="cols-2"><div class="field"><label for="rg-fn">Prénom</label><input id="rg-fn" name="firstName" autocomplete="given-name" required></div><div class="field"><label for="rg-ln">Nom</label><input id="rg-ln" name="lastName" autocomplete="family-name" required></div></div>
        <div class="field"><label for="rg-email">E-mail</label><input id="rg-email" type="email" name="email" autocomplete="email" required></div>
        <div class="field"><label for="rg-pw">Mot de passe <span class="muted tiny">(10 caractères minimum)</span></label><input id="rg-pw" type="password" name="password" minlength="10" autocomplete="new-password" required></div>
        <label class="check small"><input type="checkbox" name="joinClub" ${query.get('club') ? 'checked' : ''}> Rejoindre MOVA Club (gratuit) et accepter son <a href="#/mova-club#reglement">règlement</a></label>
        <label class="check small" style="margin:8px 0 14px"><input type="checkbox" name="newsletter"> Recevoir les actualités et offres MOVA par e-mail (facultatif)</label>
        <button class="btn btn-outline btn-block" type="submit">Créer mon compte</button><p class="form-msg" aria-live="polite"></p></form></section></div></div>`;
    const after = () => { const back = query.get('retour'); location.hash = back === 'commande' ? '#/commande' : back === 'club' ? '#/compte/fidelite' : '#/compte'; M.render(); };
    $('#login-form', main).addEventListener('submit', async e => {
      e.preventDefault(); const msg = $('.form-msg', e.target);
      try { const r = await api('/api/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); S.user = r.user; S.favs = [...new Set([...S.favs, ...r.user.favorites])]; store.set('mova_favs', S.favs); api('/api/me', { method: 'PUT', body: { favorites: S.favs } }).catch(() => { }); toast(`Bonjour ${esc(r.user.firstName)} !`); after(); }
      catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }
    });
    $('#register-form', main).addEventListener('submit', async e => {
      e.preventDefault(); const msg = $('.form-msg', e.target); const fd = Object.fromEntries(new FormData(e.target));
      try { const r = await api('/api/auth/register', { method: 'POST', body: { ...fd, joinClub: !!fd.joinClub, newsletter: !!fd.newsletter, favorites: S.favs } }); S.user = r.user; toast('Compte créé, bienvenue chez MOVA !'); after(); }
      catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }
    });
  }

  async function accountPage(main, tab, query) {
    if (!S.user) return authPage(main, query);
    const u = S.user;
    const nav = `<nav class="account-nav" aria-label="Mon compte">${TABS.map(([id, l]) => `<a href="#/compte${id ? '/' + id : ''}" ${id === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}<a href="#" data-logout>Se déconnecter</a></nav>`;
    main.innerHTML = `<div class="container"><div class="account">${nav}<div id="acc-body"><p class="muted">Chargement…</p></div></div></div>`;
    main.onclick = async e => { if (e.target.closest('[data-logout]')) { e.preventDefault(); await api('/api/auth/logout', { method: 'POST' }); S.user = null; toast('Tu es déconnectée.'); location.hash = '#/'; } };
    const body = $('#acc-body', main);
    const save = async (patch, msgEl) => { try { const r = await api('/api/me', { method: 'PUT', body: patch }); S.user = r.user; if (msgEl) { msgEl.className = 'form-msg ok'; msgEl.textContent = 'Enregistré.'; } return true; } catch (err) { if (msgEl) { msgEl.className = 'form-msg err'; msgEl.textContent = err.message; } return false; } };

    if (tab === '') {
      const [orders, loy] = await Promise.all([api('/api/me/orders'), api('/api/me/loyalty')]);
      const last = orders[0];
      body.innerHTML = `<h1 style="font-size:34px">Bonjour ${esc(u.firstName)}</h1>
        <div class="kpis"><div class="kpi"><b>${orders.filter(o => o.status !== 'pending_payment').length}</b><span>commandes</span></div><div class="kpi"><b>${loy.member ? `${loy.purchases.progress}/${loy.purchases.target}` : '—'}</b><span>achats vers ta récompense</span></div><div class="kpi"><b>${loy.sessions.count}</b><span>séances validées</span></div><div class="kpi"><b>${loy.rewards.filter(r => r.status === 'disponible').length}</b><span>récompenses disponibles</span></div></div>
        ${last ? `<div class="panel"><h2>Dernière commande</h2><div class="order-row"><div><b>${esc(last.number)}</b> · ${fdate(last.createdAt)}<br><span class="status ${last.status}">${STATUS[last.status]}</span>${last.tracking ? ` <span class="small">Suivi : ${esc(last.tracking)}</span>` : ''}</div><b>${euro2(last.total)}</b></div><a class="btn btn-outline btn-sm" style="margin-top:12px" href="#/compte/commandes">Toutes mes commandes</a></div>` : '<div class="panel"><p>Aucune commande pour l’instant.</p><a class="btn btn-dark" href="#/tenues">Découvrir la collection</a></div>'}
        ${loy.member ? `<div class="panel"><h2>MOVA Club</h2><p>${loy.purchases.target - loy.purchases.progress} achat${loy.purchases.target - loy.purchases.progress > 1 ? 's' : ''} avant ta prochaine récompense studio.</p><div class="gauge"><i style="width:${loy.purchases.progress / loy.purchases.target * 100}%"></i></div><a class="btn btn-outline btn-sm" style="margin-top:14px" href="#/compte/fidelite">Mon espace fidélité</a></div>` : `<div class="panel"><h2>Rejoins MOVA Club</h2><p>5 achats = -10 % sur une séance dans un studio partenaire, et des accessoires offerts avec tes séances.</p><a class="btn btn-dark" href="#/compte/fidelite">Découvrir</a></div>`}`;
    }

    if (tab === 'commandes') {
      const orders = await api('/api/me/orders');
      body.innerHTML = `<h1 style="font-size:34px">Mes commandes</h1>${orders.length ? orders.map(o => `<div class="panel" data-order="${o.id}">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><b>${esc(o.number)}</b> · ${fdate(o.createdAt)}<br><span class="status ${o.status}">${STATUS[o.status] || o.status}</span></div><b>${euro2(o.total)}</b></div>
        ${o.lines.map(l => `<div class="order-row"><div>${esc(l.name)}<div class="small muted">${esc(M.color(l.color)?.name || '')} · ${esc(l.size)}${l.cut ? ' · ' + esc(M.cutName(l.cut)) : ''} · ×${l.qty}</div></div><div style="text-align:right">${l.gift ? 'Offert' : euro2(l.unitPrice * l.qty)}${['delivered', 'shipped'].includes(o.status) && !l.gift ? `<br><a class="small" href="#/produit/${l.productId}#avis">Laisser un avis</a>` : ''}</div></div>`).join('')}
        <p class="small" style="margin-top:12px">${o.tracking ? `Suivi Colissimo : <a href="https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(o.tracking)}" target="_blank" rel="noopener">${esc(o.tracking)}</a> · ` : ''}${o.address ? `Livraison : ${esc(o.address.line1)}, ${esc(o.address.zip)} ${esc(o.address.city)}` : ''}</p>
        ${o.refunds?.length ? `<p class="small">Remboursé : ${o.refunds.map(r => `${euro2(r.amount)} le ${fdate(r.at)}`).join(', ')}</p>` : ''}
        ${o.returnRequest ? `<p class="small">Retour ${esc(o.returnRequest.status)} · référence <b>${esc(o.returnRequest.label)}</b></p>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn btn-outline btn-sm" data-invoice>Facture</button>${['delivered', 'shipped'].includes(o.status) && !o.returnRequest ? '<button class="btn btn-outline btn-sm" data-return>Retourner un article</button>' : ''}</div>
        <form data-return-form hidden style="margin-top:12px"><p class="small">Articles à retourner :</p>${o.lines.filter(l => !l.gift).map(l => `<label class="check small"><input type="checkbox" name="line" value="${esc(l.key + '#' + l.productId)}" checked> ${esc(l.name)} (${esc(l.size)})</label>`).join('')}
          <div class="field" style="margin-top:8px"><label>Motif</label><select name="reason"><option>Taille trop petite</option><option>Taille trop grande</option><option>Coloris différent de l’attendu</option><option>Je change d’avis</option><option>Article défectueux</option></select></div><button class="btn btn-dark btn-sm">Valider le retour</button><p class="form-msg" aria-live="polite"></p></form></div>`).join('') : '<div class="panel"><p>Aucune commande.</p></div>'}`;
      body.onclick = e => {
        const card = e.target.closest('[data-order]'); if (!card) return;
        const o = orders.find(x => x.id === card.dataset.order);
        if (e.target.closest('[data-return]')) $('[data-return-form]', card).hidden = false;
        if (e.target.closest('[data-invoice]')) invoice(o);
      };
      body.onsubmit = async e => {
        e.preventDefault(); const card = e.target.closest('[data-order]'); const fd = new FormData(e.target); const msg = $('.form-msg', e.target);
        try { await api(`/api/me/orders/${card.dataset.order}/return`, { method: 'POST', body: { lines: fd.getAll('line'), reason: fd.get('reason') } }); toast('Demande de retour enregistrée. Un e-mail t’a été envoyé.'); accountPage(main, tab, query); }
        catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }
      };
    }

    if (tab === 'fidelite') {
      const loy = await api('/api/me/loyalty');
      const cfg = S.catalog.settings.club;
      if (!loy.member) {
        body.innerHTML = `<h1 style="font-size:34px">MOVA Club</h1><div class="panel"><p>Le programme de fidélité MOVA est gratuit. Après ${cfg.purchasesForReward} achats validés, tu reçois un code de -${cfg.rewardPercent} % sur une séance dans un studio partenaire. Tes séances validées en studio te font aussi gagner des accessoires MOVA.</p>
          <label class="check small"><input type="checkbox" id="club-rules"> J’ai lu et j’accepte le <a href="#/mova-club#reglement" target="_blank">règlement MOVA Club</a></label>
          <button class="btn btn-dark" style="margin-top:14px" id="join-club">Rejoindre MOVA Club</button><p class="form-msg" aria-live="polite"></p>
          <p class="small muted" style="margin-top:12px">Tu as déjà ${loy.totalOrders} commande${loy.totalOrders > 1 ? 's' : ''} : elles comptent dès ton inscription.</p></div>`;
        $('#join-club', body).onclick = async () => { if (!$('#club-rules', body).checked) { const m = $('.form-msg', body); m.className = 'form-msg err'; m.textContent = 'Merci d’accepter le règlement.'; return; } await api('/api/me/club/join', { method: 'POST' }); toast('Bienvenue au MOVA Club !'); accountPage(main, tab, query); };
        return;
      }
      const p = loy.purchases, s = loy.sessions;
      const rewardRow = r => `<div class="reward ${r.status !== 'disponible' ? 'used' : ''}"><div class="qr" aria-label="QR code de la récompense">${r.status === 'disponible' ? qrSvg(r.code) : ''}</div><div><p class="eyebrow" style="margin:0">${r.type === 'achats' ? 'Récompense achats' : `Récompense ${r.tier} séances`}</p><b>${esc(r.label)}</b><br><code>${esc(r.code)}</code><br>
        <span class="small muted">${r.status === 'disponible' ? (r.expiresAt ? `Valable jusqu’au ${fdate(r.expiresAt)} · usage unique · à présenter au studio` : 'À ajouter gratuitement à ta prochaine commande ou à retirer en studio') : r.status === 'utilisée' ? `Utilisée le ${fdate(r.usedAt)}${r.partner ? ' · ' + esc(r.partner) : ''}${r.usedIn ? ' · commande ' + esc(r.usedIn) : ''}` : 'Expirée'}</span></div></div>`;
      body.innerHTML = `<h1 style="font-size:34px">Mon espace fidélité</h1>
        <div class="member-card"><div><span class="brand-logo light" data-logo="wordmark"></span><p class="eyebrow" style="color:#D8C7B5;margin-top:14px">MOVA Club · membre depuis ${loy.joinedAt ? fdate(loy.joinedAt) : '—'}</p><h2 style="color:#fff;margin:0">${esc(u.firstName)} ${esc(u.lastName)}</h2><p class="small" style="margin:8px 0 0;color:#E7DACB">Présente ce QR code à l’accueil d’un studio partenaire pour valider ta séance.</p></div><div class="qr">${qrSvg(loy.qrToken)}</div></div>
        <div class="kpis" style="margin-top:18px"><div class="kpi"><b>${loy.totalOrders}</b><span>commandes au total</span></div><div class="kpi"><b>${p.validated}</b><span>achats validés</span></div><div class="kpi"><b>${s.count}</b><span>séances en studio</span></div><div class="kpi"><b>${loy.rewards.filter(r => r.status === 'disponible').length}</b><span>récompenses disponibles</span></div></div>
        <div class="panel"><h2>Mes achats · ${p.progress} / ${p.target}</h2><div class="gauge"><i style="width:${p.progress / p.target * 100}%"></i></div>
          <p class="small" style="margin-top:10px">Encore <b>${p.target - p.progress}</b> achat${p.target - p.progress > 1 ? 's' : ''} pour débloquer -${loy.rewardPercent} % sur une séance en studio partenaire.</p>
          <details class="acc"><summary>Détail de mes achats</summary><div class="acc-body">${p.list.length ? p.list.slice().reverse().map(o => `<div class="order-row"><span>${esc(o.number)} · ${fdate(o.paidAt)}</span><span class="small ${o.counted ? '' : 'muted'}">${o.counted ? '✓ compté' : `compté le ${fdate(o.countsOn)}`}</span></div>`).join('') : 'Aucun achat.'}
          <p class="tiny muted" style="margin-top:8px">Une commande compte une fois, quel que soit le nombre d’articles, ${p.countDelayDays} jours après le paiement (délai de rétractation), si elle n’est pas remboursée en totalité.</p></div></details></div>
        <div class="panel"><h2>Mes séances · ${s.count}</h2><div class="tiers">${s.tiers.map(t => `<div class="tier ${s.count >= t.sessions ? 'done' : ''}"><b>${t.sessions}</b>séances<br><span class="small">${esc(t.reward)}</span></div>`).join('')}</div>
          <p class="small" style="margin-top:12px">${s.nextTier ? `Encore <b>${s.nextTier.sessions - s.count}</b> séance${s.nextTier.sessions - s.count > 1 ? 's' : ''} pour gagner : ${esc(s.nextTier.reward)}.` : 'Tu as atteint tous les paliers, bravo !'} Les séances sont validées par le studio en scannant ton QR code : une simple déclaration ne suffit pas.</p>
          <details class="acc"><summary>Historique des séances</summary><div class="acc-body">${s.history.length ? s.history.map(h => `<div class="order-row"><span>${esc(h.partner)}</span><span class="small">${fdate(h.at)}</span></div>`).join('') : 'Aucune séance validée.'}</div></details></div>
        <div class="panel" id="recompenses"><h2>Mes récompenses</h2>${loy.rewards.length ? loy.rewards.map(rewardRow).join('') : '<p class="muted">Pas encore de récompense. Elles apparaîtront ici avec leur code unique et leur QR code.</p>'}
          <p class="tiny muted">Chaque code ne peut être utilisé qu’une fois, dans un studio partenaire participant. La remise est appliquée par le studio.</p></div>
        <div class="panel"><h2>Où utiliser mes avantages ?</h2><a class="btn btn-outline" href="#/mova-pres-de-toi">Voir les studios sur la carte</a> <a class="btn btn-outline" href="#/mova-club#reglement">Règlement du programme</a></div>`;
      M.paintLogos(body);
    }

    if (tab === 'favoris') { location.hash = '#/favoris'; return; }

    if (tab === 'tailles') {
      const sp = u.sizeProfile || {}; const mo = u.morphology || {};
      const opts = (list, cur) => list.map(x => `<option ${x === cur ? 'selected' : ''}>${x}</option>`).join('');
      body.innerHTML = `<h1 style="font-size:34px">Profil de taille</h1>
        <form class="panel" id="size-form"><h2>Mes tailles habituelles</h2><div class="cols-2"><div class="field"><label for="sp-top">Haut</label><select id="sp-top" name="top"><option value="">—</option>${opts(['XS', 'S', 'M', 'L', 'XL'], sp.top)}</select></div><div class="field"><label for="sp-bottom">Bas</label><select id="sp-bottom" name="bottom"><option value="">—</option>${opts(['XS', 'S', 'M', 'L', 'XL'], sp.bottom)}</select></div></div>
          <div class="cols-2"><div class="field"><label for="sp-fit">Coupe préférée</label><select id="sp-fit" name="fit">${[['ajustee', 'Ajustée'], ['normale', 'Normale'], ['oversize', 'Oversize']].map(([v, l]) => `<option value="${v}" ${v === sp.fit ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="field"><label for="sp-len">Longueur de pantalon</label><select id="sp-len" name="length">${S.catalog.lengths.map(l => `<option value="${l.id}" ${l.id === sp.length ? 'selected' : ''}>${l.name} (${l.hint})</option>`).join('')}</select></div></div>
          <button class="btn btn-dark">Enregistrer</button><p class="form-msg" aria-live="polite"></p></form>
        <form class="panel" id="morpho-form"><h2>Mes mensurations <span class="tiny muted">(facultatif)</span></h2><p class="small muted">Utilisées uniquement pour l’essayage virtuel et la recommandation de taille. Jamais pour la publicité. Tu peux les effacer à tout moment.</p>
          <div class="cols-2">${[['height', 'Taille (cm)'], ['weight', 'Poids (kg)'], ['bust', 'Tour de poitrine (cm)'], ['waist', 'Tour de taille (cm)'], ['hips', 'Tour de hanches (cm)'], ['inseam', 'Entrejambe (cm)']].map(([k, l]) => `<div class="field"><label for="mo-${k}">${l}</label><input id="mo-${k}" type="number" inputmode="numeric" name="${k}" value="${mo[k] || ''}" min="0" max="250"></div>`).join('')}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-dark">Enregistrer</button><button type="button" class="btn btn-outline" data-erase>Effacer mes mensurations</button><a class="btn btn-outline" href="#/essayage">Ouvrir l’essayage virtuel</a></div><p class="form-msg" aria-live="polite"></p></form>`;
      $('#size-form', body).onsubmit = e => { e.preventDefault(); save({ sizeProfile: Object.fromEntries(new FormData(e.target)) }, $('.form-msg', e.target)); };
      $('#morpho-form', body).onsubmit = e => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target)); save({ morphology: { ...fd, shape: mo.shape } }, $('.form-msg', e.target)); };
      $('[data-erase]', body).onclick = async () => { await save({ morphology: null }); toast('Mensurations effacées.'); accountPage(main, tab, query); };
    }

    if (tab === 'adresses') {
      const addrs = u.addresses.length ? u.addresses : [{}];
      const draw = () => {
        body.innerHTML = `<h1 style="font-size:34px">Mes adresses</h1><form id="addr-form">${addrs.map((a, i) => `<fieldset class="panel" data-i="${i}"><legend style="font-size:18px">Adresse ${i + 1}</legend>
          <div class="cols-2"><div class="field"><label>Nom de l’adresse</label><input name="label" value="${esc(a.label || '')}" placeholder="Maison, bureau…"></div><div class="field"><label>Téléphone</label><input name="phone" type="tel" value="${esc(a.phone || '')}"></div></div>
          <div class="cols-2"><div class="field"><label>Prénom</label><input name="firstName" value="${esc(a.firstName || u.firstName)}" required></div><div class="field"><label>Nom</label><input name="lastName" value="${esc(a.lastName || u.lastName)}" required></div></div>
          <div class="field"><label>Adresse</label><input name="line1" value="${esc(a.line1 || '')}" required></div><div class="field"><label>Complément</label><input name="line2" value="${esc(a.line2 || '')}"></div>
          <div class="cols-2"><div class="field"><label>Code postal</label><input name="zip" value="${esc(a.zip || '')}" pattern="\\d{5}" required></div><div class="field"><label>Ville</label><input name="city" value="${esc(a.city || '')}" required></div></div>
          <label class="check small"><input type="radio" name="default" value="${i}" ${a.default || (i === 0 && !addrs.some(x => x.default)) ? 'checked' : ''}> Adresse par défaut</label> <button type="button" class="linklike small" data-del="${i}">Supprimer</button></fieldset>`).join('')}
          <div style="display:flex;gap:8px"><button type="button" class="btn btn-outline" data-add>Ajouter une adresse</button><button class="btn btn-dark">Enregistrer</button></div><p class="form-msg" aria-live="polite"></p></form>`;
      };
      const collect = () => $$('fieldset[data-i]', body).map(fs => { const o = {}; $$('input', fs).forEach(i => { if (i.name !== 'default') o[i.name] = i.value; }); o.default = $('input[name=default]', fs).checked; return o; });
      body.onclick = e => { if (e.target.closest('[data-add]')) { addrs.splice(0, addrs.length, ...collect(), {}); draw(); } const d = e.target.closest('[data-del]'); if (d) { const c = collect(); c.splice(+d.dataset.del, 1); addrs.splice(0, addrs.length, ...(c.length ? c : [{}])); draw(); } };
      body.onsubmit = e => { e.preventDefault(); save({ addresses: collect().filter(a => a.line1) }, $('.form-msg', body)); };
      draw();
    }

    if (tab === 'infos') {
      body.innerHTML = `<h1 style="font-size:34px">Mes informations</h1>
        <form class="panel" id="info-form"><div class="cols-2"><div class="field"><label for="in-fn">Prénom</label><input id="in-fn" name="firstName" value="${esc(u.firstName)}" required></div><div class="field"><label for="in-ln">Nom</label><input id="in-ln" name="lastName" value="${esc(u.lastName)}" required></div></div>
          <div class="field"><label>E-mail</label><input value="${esc(u.email)}" disabled></div>
          <div class="cols-2"><div class="field"><label for="in-ph">Téléphone</label><input id="in-ph" name="phone" type="tel" value="${esc(u.phone)}"></div><div class="field"><label for="in-bd">Date de naissance (facultatif)</label><input id="in-bd" name="birthDate" type="date" value="${esc(u.birthDate)}"></div></div>
          <button class="btn btn-dark">Enregistrer</button><p class="form-msg" aria-live="polite"></p></form>
        <form class="panel" id="pw-form"><h2>Mot de passe</h2><div class="field"><label for="pw-cur">Mot de passe actuel</label><input id="pw-cur" type="password" name="currentPassword" autocomplete="current-password" required></div><div class="field"><label for="pw-new">Nouveau mot de passe (10 caractères minimum)</label><input id="pw-new" type="password" name="password" minlength="10" autocomplete="new-password" required></div><button class="btn btn-dark">Changer mon mot de passe</button><p class="form-msg" aria-live="polite"></p></form>`;
      $('#info-form', body).onsubmit = e => { e.preventDefault(); save(Object.fromEntries(new FormData(e.target)), $('.form-msg', e.target)); };
      $('#pw-form', body).onsubmit = async e => { e.preventDefault(); if (await save(Object.fromEntries(new FormData(e.target)), $('.form-msg', e.target))) e.target.reset(); };
    }

    if (tab === 'preferences') {
      body.innerHTML = `<h1 style="font-size:34px">Préférences & données</h1>
        <form class="panel" id="pref-form"><h2>Communications</h2><label class="check"><input type="checkbox" name="newsletter" ${u.consents.newsletter ? 'checked' : ''}> Recevoir la newsletter et les offres MOVA par e-mail</label><label class="check" style="margin-top:8px"><input type="checkbox" name="sms" ${u.consents.sms ? 'checked' : ''}> Recevoir les offres par SMS</label>
          <h2 style="margin-top:20px">Mes activités <span class="tiny muted">(facultatif, pour personnaliser tes recommandations)</span></h2><div class="chips">${['pilates', 'padel', 'fitness', 'ville'].map(t => `<label class="chip" style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" name="interest" value="${t}" ${u.interests.includes(t) ? 'checked' : ''}>${t[0].toUpperCase() + t.slice(1)}</label>`).join('')}</div>
          <button class="btn btn-dark" style="margin-top:16px">Enregistrer</button><p class="form-msg" aria-live="polite"></p></form>
        <div class="panel"><h2>Mes données personnelles</h2><p class="small">Conformément au RGPD, tu peux télécharger une copie de tes données ou supprimer ton compte. Les factures sont conservées 10 ans (obligation légale) sous forme anonymisée.</p>
          <button class="btn btn-outline" id="export">Télécharger mes données</button>
          <details class="acc" style="margin-top:14px"><summary style="color:var(--err)">Supprimer mon compte</summary><form class="acc-body" id="del-form"><p class="small">Action définitive : ton profil, tes favoris, ton statut MOVA Club et tes récompenses seront supprimés.</p><div class="field"><label for="del-pw">Confirme avec ton mot de passe</label><input id="del-pw" type="password" name="password" required></div><button class="btn btn-outline" style="border-color:var(--err);color:var(--err)">Supprimer définitivement</button><p class="form-msg" aria-live="polite"></p></form></details></div>`;
      $('#pref-form', body).onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target); save({ consents: { newsletter: !!fd.get('newsletter'), sms: !!fd.get('sms') }, interests: fd.getAll('interest') }, $('.form-msg', e.target)); };
      $('#export', body).onclick = async () => { const data = await api('/api/me/export'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = 'mes-donnees-mova.json'; a.click(); };
      $('#del-form', body).onsubmit = async e => { e.preventDefault(); const msg = $('.form-msg', e.target); try { await api('/api/me', { method: 'DELETE', body: { password: e.target.password.value } }); S.user = null; toast('Ton compte a été supprimé.'); location.hash = '#/'; } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; } };
    }
  }
  M.route('/compte', ({ main, query }) => accountPage(main, '', query));
  M.route('/compte/:tab', ({ main, params, query }) => accountPage(main, params.tab, query));
  M.route('/connexion', ({ main, query }) => authPage(main, query));

  function invoice(o) {
    const w = window.open('', '_blank');
    if (!w) return toast('Autorise les fenêtres pour afficher la facture.', { error: true });
    const ht = o.total / 1.2;
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Facture ${esc(o.number)}</title><style>body{font:14px/1.5 Inter,Arial,sans-serif;color:#1C1A19;max-width:760px;margin:40px auto;padding:0 24px}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{padding:8px;border-bottom:1px solid #E6DFD3;text-align:left}.r{text-align:right}.muted{color:#7A716A;font-size:12px}</style></head><body>
      <p style="letter-spacing:.3em;font-weight:700;color:#4A2A1C">MOVA</p><h1>Facture ${esc(o.number)}</h1><p>Date : ${fdate(o.paidAt || o.createdAt)}<br>Client·e : ${esc(o.address?.firstName)} ${esc(o.address?.lastName)}, ${esc(o.address?.line1)}, ${esc(o.address?.zip)} ${esc(o.address?.city)}<br>E-mail : ${esc(o.email)}</p>
      <table><thead><tr><th>Article</th><th>Qté</th><th class="r">Prix TTC</th></tr></thead><tbody>${o.lines.map(l => `<tr><td>${esc(l.name)} — ${esc(M.color(l.color)?.name || '')}, ${esc(l.size)}</td><td>${l.qty}</td><td class="r">${euro2(l.unitPrice * l.qty)}</td></tr>`).join('')}
      ${o.ensemble?.amount ? `<tr><td>Remise ensemble</td><td></td><td class="r">−${euro2(o.ensemble.amount)}</td></tr>` : ''}${o.promo ? `<tr><td>Code ${esc(o.promo.code)}</td><td></td><td class="r">−${euro2(o.promoDiscount)}</td></tr>` : ''}<tr><td>Livraison</td><td></td><td class="r">${euro2(o.shipping)}</td></tr>
      <tr><td><b>Total TTC</b></td><td></td><td class="r"><b>${euro2(o.total)}</b></td></tr><tr><td>dont TVA 20 %</td><td></td><td class="r">${euro2(o.total - ht)}</td></tr></tbody></table>
      <p class="muted">MOVA — [raison sociale, adresse, SIRET et n° de TVA à compléter avant la mise en ligne].</p><script>print()<\/script></body></html>`);
    w.document.close();
  }

  // ---------- MOVA Club ----------
  M.route('/mova-club', ({ main }) => {
    const c = S.catalog.settings.club;
    main.innerHTML = `<div class="container">
      <header class="page-hero"><p class="eyebrow">Programme de fidélité</p><h1>MOVA Club</h1><p>Le club qui relie ta garde-robe à tes studios lyonnais. Gratuit, sans carte à garder dans ton portefeuille : tout est dans ton compte.</p>
        <a class="btn btn-dark" href="${S.user ? '#/compte/fidelite' : '#/compte?club=1&retour=club'}">${S.user ? 'Mon espace fidélité' : 'Rejoindre MOVA Club'}</a></header>
      <section class="grid grid-3" style="margin:24px 0 56px">
        <div class="value"><p class="eyebrow">Achats</p><h3>${c.purchasesForReward} achats = -${c.rewardPercent} % en studio</h3><p class="small">Chaque commande validée compte pour 1, quel que soit le nombre d’articles. À la ${c.purchasesForReward}e, tu reçois un code unique et un QR code de -${c.rewardPercent} % sur une séance dans un studio partenaire participant.</p></div>
        <div class="value"><p class="eyebrow">Séances</p><h3>Tes séances te récompensent</h3><p class="small">${c.sessionTiers.map(t => `<b>${t.sessions} séances</b> : ${esc(t.reward)}`).join('<br>')}<br>Les séances sont confirmées par le studio en scannant ton QR code MOVA Club.</p></div>
        <div class="value"><p class="eyebrow">Communauté</p><h3>Événements à Lyon</h3><p class="small">Cours partenaires, essayages, drops de coloris en avant-première : les membres sont prévenues en premier.</p></div>
      </section>
      <section id="recompenses" class="panel"><h2>Comment ça marche</h2><ol><li>Crée ton compte et rejoins le club (case à cocher, gratuit).</li><li>Commande sur mova : chaque commande payée compte ${c.countDelayDays} jours après le paiement.</li><li>À ${c.purchasesForReward} achats, ta récompense apparaît dans ton espace fidélité et par e-mail.</li><li>Montre ton code ou ton QR code à l’accueil du studio : il le valide, la remise s’applique.</li><li>À chaque séance, fais scanner ton QR code MOVA Club : tes accessoires se débloquent aux paliers.</li></ol><a class="btn btn-outline" href="#/mova-pres-de-toi">Voir les studios partenaires</a></section>
      <section id="reglement" class="panel prose" style="max-width:none"><h2>Règlement du programme</h2>
        <ol class="small"><li>Le programme MOVA Club est gratuit et réservé aux personnes majeures titulaires d’un compte MOVA.</li>
        <li>Une commande payée et non remboursée en totalité compte comme un achat, quel que soit le nombre d’articles. Elle est comptabilisée ${c.countDelayDays} jours après le paiement. Une commande remboursée en totalité ne compte pas.</li>
        <li>À ${c.purchasesForReward} achats comptabilisés, une récompense est générée : un code unique (et son QR code) donnant droit à ${c.rewardPercent} % de réduction sur une séance dans un studio partenaire participant. Le compteur repart alors de zéro.</li>
        <li>Chaque code est valable ${c.rewardValidityMonths} mois, utilisable une seule fois, non échangeable contre de l’argent, non cumulable avec une autre offre du studio sauf mention contraire.</li>
        <li>Les séances sont comptabilisées uniquement lorsqu’elles sont confirmées par un studio partenaire (scan du QR code personnel ou synchronisation avec son système de réservation), dans la limite d’une séance par jour et par studio. Aucune séance n’est attribuée sur simple déclaration.</li>
        <li>Les paliers et récompenses « séances » peuvent évoluer ; les récompenses déjà obtenues restent acquises.</li>
        <li>Toute fraude entraîne l’annulation des récompenses et la clôture du compte.</li>
        <li>Les données traitées (achats, séances) servent uniquement au fonctionnement du programme. Le studio ne reçoit que ton prénom et l’initiale de ton nom au moment de la validation.</li></ol></section></div>`;
  });

  // ---------- Carte des studios ----------
  M.route('/mova-pres-de-toi', async ({ main, query }) => {
    const partners = M.partnersCache = await api('/api/partners');
    let filter = 'tous'; let selected = query.get('studio');
    const isApple = /iPhone|iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
    // Itinéraire vers l'établissement (nom + adresse : le service de cartes trouve la fiche du lieu).
    const route = p => { const dest = encodeURIComponent(`${p.name}, ${p.address}`); return isApple ? `https://maps.apple.com/?daddr=${dest}` : `https://www.google.com/maps/dir/?api=1&destination=${dest}`; };
    main.innerHTML = `<div class="container"><header class="page-hero"><p class="eyebrow">Nos partenaires sportifs</p><h1>MOVA près de toi</h1><p>Studios de Pilates, de fitness et de padel à Lyon où profiter de tes avantages MOVA Club.</p></header>
      <div class="toolbar"><div class="chips" role="group" aria-label="Filtrer par activité">${[['tous', 'Tous les partenaires'], ['pilates', 'Pilates'], ['padel', 'Padel'], ['fitness', 'Fitness']].map(([v, l]) => `<button class="chip" data-filter="${v}" aria-pressed="${v === filter}">${l}</button>`).join('')}</div><button class="btn btn-outline btn-sm" id="near">📍 Autour de moi</button></div>
      <div class="map-wrap"><div class="studio-list" id="studio-list" role="list"></div><div id="map" role="region" aria-label="Carte des studios partenaires à Lyon"></div></div></div>`;
    let map = null; const markers = {};
    const list = $('#studio-list', main);
    const card = p => `<div class="studio-item" role="listitem" data-id="${p.id}" tabindex="0" ${p.id === selected ? 'aria-current="true"' : ''}><h3>${esc(p.name)}</h3><p class="small muted" style="margin:0 0 6px">${esc(p.activity[0].toUpperCase() + p.activity.slice(1))} · ${esc(p.address)}</p>
      ${p.id === selected ? `<div class="art" style="border-radius:8px;overflow:hidden;height:140px;margin-bottom:8px">${MovaPhotos.img((MovaPhotos.ACTIVITY[p.activity] || ['studioPilates'])[partners.filter(x => x.activity === p.activity).indexOf(p) % (MovaPhotos.ACTIVITY[p.activity] || [1]).length], { w: 600, h: 280 })}</div><p class="small">${esc(p.description)}</p><ul class="small">${p.advantages.map(a => `<li>${esc(a)}</li>`).join('')}</ul><a class="btn btn-dark btn-sm" href="${route(p)}" target="_blank" rel="noopener">Itinéraire</a> ${p.website ? `<a class="btn btn-outline btn-sm" href="${esc(p.website)}" target="_blank" rel="noopener">Site officiel</a>` : ''}` : ''}</div>`;
    const draw = () => {
      const visible = partners.filter(p => filter === 'tous' || p.activity === filter);
      list.innerHTML = visible.length ? visible.map(card).join('') : '<p class="studio-item muted">Aucun partenaire pour cette activité.</p>';
      if (map) { Object.entries(markers).forEach(([id, m]) => { const show = visible.some(p => p.id === id); if (show && !map.hasLayer(m)) m.addTo(map); if (!show && map.hasLayer(m)) m.remove(); }); }
    };
    const select = (id, fly = true) => { selected = id; draw(); const p = partners.find(x => x.id === id); if (map && p && fly) { map.flyTo([p.lat, p.lng], 15, { duration: .6 }); markers[id].openPopup(); } };
    main.onclick = e => {
      const f = e.target.closest('[data-filter]'); if (f) { filter = f.dataset.filter; $$('[data-filter]', main).forEach(b => b.setAttribute('aria-pressed', String(b === f))); draw(); return; }
      const it = e.target.closest('.studio-item[data-id]'); if (it && !e.target.closest('a')) select(it.dataset.id);
      if (e.target.closest('#near')) {
        if (!navigator.geolocation) return toast('Géolocalisation indisponible.', { error: true });
        navigator.geolocation.getCurrentPosition(pos => { const { latitude: la, longitude: lo } = pos.coords; const d = p => (p.lat - la) ** 2 + (p.lng - lo) ** 2; partners.sort((a, b) => d(a) - d(b)); draw(); map?.setView([la, lo], 13); L.circleMarker([la, lo], { radius: 8, color: '#4A2A1C' }).addTo(map).bindPopup('Tu es ici'); }, () => toast('Position non partagée.', { error: true }), { timeout: 8000 });
      }
    };
    list.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.id) select(e.target.dataset.id); });
    draw();
    const initMap = () => {
      if (!window.L) return setTimeout(initMap, 150);
      if (!$('#map', main)) return;
      map = L.map($('#map', main), { scrollWheelZoom: false }).setView([45.757, 4.84], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© contributeurs OpenStreetMap' }).addTo(map);
      const icon = L.divIcon({ className: '', html: '<div class="mova-pin" style="width:28px;height:28px"></div>', iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26] });
      for (const p of partners) markers[p.id] = L.marker([p.lat, p.lng], { icon, title: p.name, alt: p.name }).addTo(map).bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.address)}<br><a href="${route(p)}" target="_blank" rel="noopener">Itinéraire</a>`).on('click', () => select(p.id, false));
      if (partners.length) map.fitBounds(L.latLngBounds(partners.map(p => [p.lat, p.lng])), { padding: [30, 30] });
      if (selected) select(selected);
      setTimeout(() => map.invalidateSize(), 200);
    };
    initMap();
  });

  // ---------- Essayage virtuel ----------
  const SIZES_IDX = { XS: 0, S: 1, M: 2, L: 3, XL: 4 };
  const GUIDE_MID = { XS: [80, 62, 88], S: [84, 66, 92], M: [88, 70, 96], L: [93, 75, 101], XL: [99, 81, 107] };
  // Indice de taille continu (0 = XS … 4 = XL) à partir des mensurations.
  function bodySizeIndex(b) {
    const scores = Object.entries(GUIDE_MID).map(([sz, [bu, wa, hi]]) => [sz, Math.abs(b.bust - bu) + Math.abs(b.waist - wa) + Math.abs(b.hips - hi) * 1.2]).sort((a, c) => a[1] - c[1]);
    const [s1, d1] = scores[0], [s2, d2] = scores[1];
    const t = d1 + d2 === 0 ? 0 : d1 / (d1 + d2);
    return SIZES_IDX[s1] + (SIZES_IDX[s2] - SIZES_IDX[s1]) * t;
  }
  M.route('/essayage', ({ main, query }) => {
    const mo = S.user?.morphology || store.get('mova_tryon', {}) || {};
    const tops = ['veste-cintree-studio', 'veste-zippee-city', 'hoodie-oversize', 'sweat-oversize', 'sweat-court', 'brassiere-sculpt'].map(M.product).filter(Boolean);
    const bottoms = ['pantalon-survetement', 'pantalon-wide-lisere', 'legging-seconde-peau', 'legging-flare', 'short-cycliste', 'short-ample'].map(M.product).filter(Boolean);
    const s = { height: mo.height || 166, weight: mo.weight || '', bust: mo.bust || '', waist: mo.waist || '', hips: mo.hips || '', shape: mo.shape || '', pref: S.user?.sizeProfile?.fit || 'normale',
      top: query.get('top') && M.product(query.get('top')) ? query.get('top') : 'veste-cintree-studio', bottom: query.get('bottom') && M.product(query.get('bottom')) ? query.get('bottom') : 'pantalon-survetement',
      cut: 'evasee', length: 'standard', color: query.get('color') || 'bordeaux', topSize: null, bottomSize: null, rotate: 0, remember: false };
    const estimate = () => {
      // Mensurations manquantes estimées à partir de la taille et du poids (approximation, signalée à l'écran).
      const h = +s.height || 166; const w = +s.weight;
      const bmi = w ? w / ((h / 100) ** 2) : 21.5;
      const base = { bust: 88 + (bmi - 21.5) * 2.4 + (h - 166) * 0.15, waist: 70 + (bmi - 21.5) * 2.6, hips: 96 + (bmi - 21.5) * 2.3 + (h - 166) * 0.2 };
      const adj = { sablier: [2, -3, 2], triangle: [-3, 0, 4], 'triangle-inverse': [4, 1, -3], rectangle: [0, 4, -2], ronde: [3, 6, 3] }[s.shape] || [0, 0, 0];
      return { height: h, bust: +s.bust || Math.round(base.bust + adj[0]), waist: +s.waist || Math.round(base.waist + adj[1]), hips: +s.hips || Math.round(base.hips + adj[2]), shape: s.shape, estimated: !(s.bust && s.waist && s.hips) };
    };
    const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
    const recommend = (body, p) => {
      let idx = bodySizeIndex(body) + ({ ajustee: -0.25, normale: 0, oversize: 0.9 }[s.pref] || 0);
      if (p.fit === 'Oversize' && s.pref === 'oversize') idx -= 0.6; // déjà ample
      const lo = Math.max(0, Math.min(4, Math.floor(idx))), hi = Math.max(0, Math.min(4, Math.ceil(idx)));
      const frac = idx - Math.floor(idx);
      if (lo !== hi && frac > 0.3 && frac < 0.7) return { size: SIZES[s.pref === 'ajustee' ? lo : hi], text: `Entre ${SIZES[lo]} et ${SIZES[hi]} : plutôt ${SIZES[s.pref === 'ajustee' ? lo : hi]} pour ${s.pref === 'ajustee' ? 'un effet gainant' : 'plus d’aisance'}.`, idx };
      const one = SIZES[Math.max(0, Math.min(4, Math.round(idx)))];
      return { size: one, text: `Taille ${one} recommandée.`, idx };
    };
    const lengthFor = h => h < 160 ? 'petite' : h > 172 ? 'longue' : 'standard';
    const draw = () => {
      const body = estimate();
      const T = M.product(s.top), B = M.product(s.bottom);
      const rt = recommend(body, T), rb = recommend(body, B);
      s.topSize ||= rt.size; s.bottomSize ||= rb.size;
      if (!T.colors.includes(s.color)) s.color = T.colors[0];
      const bColor = B.colors.includes(s.color) ? s.color : B.colors[0];
      if (B.cuts && !B.cuts.includes(s.cut)) s.cut = B.cuts[0];
      const stage = $('#stage', main);
      const G = S.catalog.sizeGuide;
      const fitRow = (label, val, range, extraEase) => {
        const [lo, hi] = range; const mid = (lo + hi) / 2 + extraEase;
        const diff = val - mid; const state = diff > 3 ? ['Près du corps', 'tight'] : diff < -6 ? ['Ample', 'loose'] : ['Ajusté', 'ok'];
        const pct = Math.max(4, Math.min(96, 50 + diff * 4));
        return `<div class="fit-row"><div class="fit-head"><b>${label}</b><span>Toi : ${Math.round(val)} cm · taille : ${lo}–${hi} cm</span></div><div class="fit-bar"><i style="left:${pct}%"></i></div><div class="fit-scale"><span>Ample</span><span class="fit-${state[1]}">${state[0]}</span><span>Près du corps</span></div></div>`;
      };
      const tEase = T.fit === 'Oversize' || ['sweat', 'hoodie'].includes(T.type) ? 8 : 0;
      const bEase = B.type === 'pantalon-wide' ? 8 : B.type === 'pantalon' ? ({ jogging: 6, droite: 3, evasee: 2, ajustee: 0 }[s.cut] || 0) : 0;
      const pT = T.images && Object.values(T.images)[0]?.length, pB = B.images && Object.values(B.images)[0]?.length;
      stage.innerHTML = `<div class="tryon-photos"><figure>${M.visual(T, s.color)}<figcaption>${esc(T.name)} · taille ${esc(s.topSize)}</figcaption></figure><figure>${M.visual(B, bColor)}<figcaption>${esc(B.name)} · taille ${esc(s.bottomSize)}</figcaption></figure></div>
        <div class="fit-panel"><h3>Comment ça tombe sur toi</h3>
          ${G[s.topSize] ? fitRow('Poitrine · haut', body.bust, G[s.topSize].poitrine, tEase) : '<p class="small muted">Taille unique.</p>'}
          ${G[s.bottomSize] ? fitRow('Taille · bas', body.waist, G[s.bottomSize].taille, bEase) + fitRow('Hanches · bas', body.hips, G[s.bottomSize].hanches, bEase) : ''}
          ${B.lengths ? `<p class="small">Longueur : <b>${esc(M.lengthName(s.length))}</b> ${s.length === lengthFor(body.height) ? '— adaptée à ta taille.' : `— pour ${Math.round(body.height)} cm, nous conseillons la longueur ${esc(M.lengthName(lengthFor(body.height)).toLowerCase())}.`}</p>` : ''}</div>`;
      $('#reco', main).innerHTML = `<div class="reco"><span class="small">Haut · ${esc(T.name)}</span><b>${rt.size}</b><span class="small">${esc(rt.text)}</span></div><div class="reco" style="background:var(--ink)"><span class="small">Bas · ${esc(B.name)}</span><b>${rb.size}</b><span class="small">${esc(rb.text)}${B.lengths ? ` Longueur conseillée : ${M.lengthName(lengthFor(body.height)).toLowerCase()}.` : ''}</span></div>
        ${body.estimated ? '<p class="tiny muted">Certaines mensurations sont estimées à partir de ta taille' + (s.weight ? ' et de ton poids' : '') + ' : renseigne-les pour une recommandation plus précise.</p>' : ''}
`;
      $('#garments', main).innerHTML = `
        <div class="field"><label for="to-top">Haut</label><select id="to-top" data-s="top">${tops.map(p => `<option value="${p.id}" ${p.id === s.top ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        <div class="chips" aria-label="Taille du haut">${T.sizes.map(z => `<button class="chip" data-s="topSize" data-v="${z}" aria-pressed="${z === s.topSize}">${z}</button>`).join('')}</div>
        <div class="field" style="margin-top:14px"><label for="to-bottom">Bas</label><select id="to-bottom" data-s="bottom">${bottoms.map(p => `<option value="${p.id}" ${p.id === s.bottom ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        ${B.cuts ? `<div class="chips" style="margin-bottom:8px">${B.cuts.map(c => `<button class="chip" data-s="cut" data-v="${c}" aria-pressed="${c === s.cut}">${esc(M.cutName(c))}</button>`).join('')}</div>` : ''}
        ${B.lengths ? `<div class="chips" style="margin-bottom:8px">${B.lengths.map(c => `<button class="chip" data-s="length" data-v="${c}" aria-pressed="${c === s.length}">${esc(M.lengthName(c))}</button>`).join('')}</div>` : ''}
        <div class="chips" aria-label="Taille du bas">${B.sizes.map(z => `<button class="chip" data-s="bottomSize" data-v="${z}" aria-pressed="${z === s.bottomSize}">${z}</button>`).join('')}</div>
        <p class="small" style="margin:14px 0 6px">Coloris</p><div class="swatches">${T.colors.map(c => M.swatchHtml(c, { tag: 'button', cls: 'swatch-lg' + (c === s.color ? ' on' : ''), attrs: `data-s="color" data-v="${c}" aria-pressed="${c === s.color}"` })).join('')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px"><a class="btn btn-dark btn-sm" href="#/produit/${T.id}?color=${s.color}">Voir le haut</a><a class="btn btn-dark btn-sm" href="#/produit/${B.id}?color=${bColor}${B.cuts ? '&cut=' + s.cut : ''}">Voir le bas</a></div>`;
    };
    main.innerHTML = `<div class="container"><header class="page-hero"><p class="eyebrow">Essayage virtuel</p><h1>Trouve ta taille</h1><p>Renseigne ta silhouette : on compare tes mensurations au guide des tailles de chaque pièce et on te recommande ta taille.</p></header>
      <div class="warning" role="note"><b>Recommandation indicative.</b> Le tombé réel peut varier selon ta morphologie et la matière.</div>
      <div class="tryon"><div><div class="tryon-stage" id="stage" aria-live="polite"></div></div>
        <div><form class="panel" id="body-form"><h2 style="font-size:20px">Ta silhouette</h2>
          <div class="field"><label for="b-height">Taille (cm) *</label><input id="b-height" type="number" name="height" min="140" max="200" value="${s.height}" required></div>
          <div class="cols-2"><div class="field"><label for="b-weight">Poids (kg)</label><input id="b-weight" type="number" name="weight" min="35" max="160" value="${s.weight}" placeholder="facultatif"></div><div class="field"><label for="b-bust">Poitrine (cm)</label><input id="b-bust" type="number" name="bust" min="60" max="150" value="${s.bust}" placeholder="facultatif"></div>
          <div class="field"><label for="b-waist">Taille (cm)</label><input id="b-waist" type="number" name="waist" min="50" max="140" value="${s.waist}" placeholder="facultatif"></div><div class="field"><label for="b-hips">Hanches (cm)</label><input id="b-hips" type="number" name="hips" min="70" max="160" value="${s.hips}" placeholder="facultatif"></div></div>
          <div class="field"><label for="b-shape">Morphologie (facultatif)</label><select id="b-shape" name="shape"><option value="">Je ne précise pas</option>${[['sablier', 'Épaules et hanches alignées, taille marquée'], ['triangle', 'Hanches plus larges que les épaules'], ['triangle-inverse', 'Épaules plus larges que les hanches'], ['rectangle', 'Silhouette droite'], ['ronde', 'Silhouette tout en courbes']].map(([v, l]) => `<option value="${v}" ${v === s.shape ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label for="b-pref">Tu préfères porter</label><select id="b-pref" name="pref">${[['ajustee', 'Ajusté'], ['normale', 'Normal'], ['oversize', 'Oversize']].map(([v, l]) => `<option value="${v}" ${v === s.pref ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${S.user ? `<label class="check small"><input type="checkbox" name="remember"> Mémoriser ma silhouette dans mon compte (supprimable à tout moment)</label>` : '<p class="tiny muted">Tes données restent sur cet appareil. Connecte-toi pour les mémoriser dans ton compte, si tu le souhaites.</p>'}
        </form><div id="reco"></div><div class="panel" id="garments"></div></div></div></div>`;
    const form = $('#body-form', main);
    form.addEventListener('input', M.debounce(e => {
      const fd = Object.fromEntries(new FormData(form));
      Object.assign(s, { height: fd.height, weight: fd.weight, bust: fd.bust, waist: fd.waist, hips: fd.hips, shape: fd.shape, pref: fd.pref });
      s.topSize = s.bottomSize = null; // nouvelle recommandation
      store.set('mova_tryon', { height: s.height, weight: s.weight, bust: s.bust, waist: s.waist, hips: s.hips, shape: s.shape });
      if (S.user && fd.remember) api('/api/me', { method: 'PUT', body: { morphology: { height: s.height, weight: s.weight, bust: s.bust, waist: s.waist, hips: s.hips, shape: s.shape }, sizeProfile: { ...S.user.sizeProfile, fit: s.pref } } }).then(r => S.user = r.user).catch(() => { });
      draw();
    }, 200));
    main.addEventListener('click', e => { const b = e.target.closest('[data-s][data-v]'); if (b) { s[b.dataset.s] = b.dataset.v; draw(); } });
    main.addEventListener('change', e => { const sel = e.target.closest('select[data-s]'); if (sel) { s[sel.dataset.s] = sel.value; if (sel.dataset.s === 'top') s.topSize = null; if (sel.dataset.s === 'bottom') s.bottomSize = null; draw(); } });
    draw();
  });

  // ---------- Univers ----------
  M.route('/univers', ({ main }) => {
    main.innerHTML = `<div class="container"><header class="page-hero"><p class="eyebrow">Notre univers</p><h1>L’histoire de MOVA</h1></header>
      <div class="club-grid"><div class="prose"><p style="font-size:20px">MOVA est née d’une évidence : une femme ne devrait pas avoir besoin de changer de tenue pour passer d’un cours de Pilates à un rendez-vous entre amies.</p>
        <p>Nous dessinons à Lyon des vêtements confortables, tendance et polyvalents : des coupes flatteuses, des matières qui tiennent la séance et l’après, et des couleurs qui donnent envie de sortir. Le sport et la mode ne sont pas deux garde-robes, mais une seule.</p>
        <p>MOVA veut garder une esthétique soignée sans pratiquer des prix de luxe, et construire une vraie communauté autour du mouvement, du bien-être et des studios de notre ville.</p>
        <p><b>Ton rythme. Ton style.</b></p><a class="btn btn-outline" href="#/univers/valeurs">Nos valeurs</a> <a class="btn btn-dark" href="#/univers/campagne">La campagne</a></div>
        <div class="art" style="border-radius:16px;overflow:hidden;max-width:420px;aspect-ratio:3/4;justify-self:center">${MovaPhotos.img('ville', { w: 700, h: 930 })}</div></div></div>`;
  });
  M.route('/univers/valeurs', ({ main }) => {
    main.innerHTML = `<div class="container"><header class="page-hero"><p class="eyebrow">Notre univers</p><h1>Nos valeurs</h1></header>
      <div class="values">${[['Polyvalence', 'Chaque pièce est pensée pour toute une journée : elle doit tenir au studio et plaire en ville.'], ['Tous les corps', 'Des coupes au choix, des longueurs adaptées, une taille par pièce. On ne parle jamais de minceur, on parle de confort et d’allure.'], ['Prix juste', 'Une qualité soignée et un ensemble à 80 € : l’esthétique premium sans le prix du luxe.'], ['Matières responsables', 'Polyamide recyclé et coton biologique sur nos pièces phares, pour durer plus longtemps.'], ['Ancrage local', 'Nous construisons MOVA avec les studios et les sportives de Lyon.'], ['Transparence', 'Pas de faux avis, pas de fausses promesses : nos avis sont vérifiés et notre essayage virtuel reste indicatif.']].map(([h, p]) => `<div class="value reveal"><h3>${h}</h3><p class="small">${p}</p></div>`).join('')}</div></div>`;
  });
  M.route('/univers/campagne', ({ main }) => {
    const scenes = [['maison', '8:00', 'Elle se lève'], ['reformer', '9:30', 'Cours de Pilates'], ['cafe', '11:30', 'Café avec une amie'], ['ville', '15:00', 'Balade en ville'], ['soir', '19:00', 'Fin de journée']];
    main.innerHTML = `<div class="story" style="padding:56px 0 72px"><div class="container"><p class="eyebrow">Campagne de lancement</p><h1 style="color:#fff">Une tenue. Tous tes plans.</h1><p style="max-width:640px;color:#E7DACB">Une journée, une femme, un seul ensemble MOVA. Du réveil au dernier verre, elle ne se change pas : la tenue s’adapte à son rythme.</p>
      <div class="story-track" style="margin-top:32px">${scenes.map(([sc, t, h], i) => `<div class="story-step"><div class="art">${MovaPhotos.img(sc, { w: 600, h: 1100 })}</div><p class="time">${t}</p><h3>${h}</h3></div>`).join('')}</div>
      <a class="btn btn-light" style="margin-top:24px" href="#/ensemble/ensemble-studio?color=bordeaux">Shop l’ensemble · ${euro(S.catalog.settings.ensemblePrice)}</a></div></div>`;
  });

  // ---------- Aide ----------
  M.route('/aide', async ({ main }) => helpPage(main, ''));
  M.route('/aide/:sub', async ({ main, params }) => helpPage(main, params.sub));
  async function helpPage(main, sub) {
    const kb = await api('/api/knowledge');
    const faq = [['Quel est le délai de livraison ?', kb.livraison], ['Comment retourner un article ?', kb.retours], ['Comment choisir ma taille ?', kb.tailles], ['Comment fonctionne le prix ensemble à 80 € ?', kb.ensemble], ['Quelles coupes existent pour les pantalons ?', kb.coupes], ['De quoi sont faits les vêtements ?', kb.matieres], ['Qu’est-ce que MOVA Club ?', kb.club], ['Quels sont les studios partenaires ?', kb.partenaires], ['Quels moyens de paiement acceptez-vous ?', kb.paiement], ['Comment obtenir -5 % ?', kb.bienvenue]];
    const transcript = store.sget('mova_chat_handoff', null);
    main.innerHTML = `<div class="container"><header class="page-hero"><p class="eyebrow">Service client</p><h1>${sub === 'contact' ? 'Nous contacter' : sub === 'livraison' ? 'Livraison et retours' : 'Comment pouvons-nous t’aider ?'}</h1><p>${esc(kb.contact)}</p></header>
      <div class="club-grid" style="align-items:start"><div class="faq">${(sub === 'livraison' ? faq.slice(0, 2) : faq).map(([q, a], i) => `<details ${sub === 'livraison' || i === 0 ? 'open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}<p class="small"><a href="#/guide-des-tailles">Guide des tailles complet</a> · <a href="#/legal/cgv">Conditions générales de vente</a></p></div>
        <form class="panel" id="contact-form"><h2>Écris-nous</h2>
          <div class="cols-2"><div class="field"><label for="ct-name">Prénom et nom</label><input id="ct-name" name="name" value="${esc(S.user ? S.user.firstName + ' ' + S.user.lastName : '')}" required></div><div class="field"><label for="ct-email">E-mail</label><input id="ct-email" type="email" name="email" value="${esc(S.user?.email || '')}" required></div></div>
          <div class="cols-2"><div class="field"><label for="ct-subject">Sujet</label><select id="ct-subject" name="subject"><option>Ma commande</option><option>Un retour ou un remboursement</option><option>Une question sur un produit</option><option>MOVA Club</option><option>Partenariat studio</option><option>Autre</option></select></div><div class="field"><label for="ct-order">N° de commande (facultatif)</label><input id="ct-order" name="order" placeholder="MV…"></div></div>
          <div class="field"><label for="ct-msg">Message</label><textarea id="ct-msg" name="message" required>${transcript ? 'Suite à ma conversation avec l’assistant MOVA : ' : ''}</textarea></div>
          ${transcript ? '<p class="tiny muted">La conversation avec l’assistant sera jointe à ton message.</p>' : ''}
          <button class="btn btn-dark">Envoyer</button><p class="form-msg" aria-live="polite"></p></form></div></div>`;
    $('#contact-form', main).onsubmit = async e => {
      e.preventDefault(); const msg = $('.form-msg', e.target);
      try { const r = await api('/api/contact', { method: 'POST', body: { ...Object.fromEntries(new FormData(e.target)), transcript } }); msg.className = 'form-msg ok'; msg.textContent = r.message; e.target.reset(); store.sset('mova_chat_handoff', null); }
      catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }
    };
  }
  M.route('/guide-des-tailles', ({ main }) => { main.innerHTML = `<div class="container" style="max-width:860px;padding:40px var(--gutter) 80px">${M.sizeGuideHtml(null).replace('<h2 id="sg-title">', '<h1 id="sg-title">').replace('</h2>', '</h1>')}</div>`; });

  // ---------- Pages légales (modèles à compléter et faire relire) ----------
  const LEGAL = {
    mentions: ['Mentions légales', `<h2>Éditeur du site</h2><p>MOVA — [forme juridique, capital social], [adresse du siège], RCS [ville] [numéro], SIRET [numéro], TVA intracommunautaire [numéro]. Directrice de la publication : [nom].<br>Contact : [adresse e-mail], [téléphone].</p><h2>Hébergement</h2><p>[Nom de l’hébergeur, adresse, téléphone].</p><h2>Propriété intellectuelle</h2><p>Le nom MOVA, ses logos, textes et visuels sont la propriété de MOVA. Toute reproduction sans autorisation est interdite.</p><h2>Médiation de la consommation</h2><p>En cas de litige, tu peux recourir gratuitement au médiateur de la consommation : [nom et coordonnées du médiateur].</p>`],
    cgv: ['Conditions générales de vente', `<h2>1. Objet</h2><p>Les présentes conditions régissent les ventes conclues sur le site MOVA entre MOVA et toute personne agissant en qualité de consommatrice.</p><h2>2. Prix</h2><p>Les prix sont indiqués en euros toutes taxes comprises, hors frais de livraison indiqués avant la validation de la commande. Le prix ensemble s’applique à une veste et un pantalon de survêtement compatibles${'' }, selon les conditions affichées.</p><h2>3. Commande</h2><p>La commande est conclue après le clic sur « Commander avec obligation de paiement » et la confirmation du paiement. Un e-mail récapitulatif est envoyé.</p><h2>4. Paiement</h2><p>Paiement par carte bancaire, Apple Pay ou Google Pay via Stripe. MOVA ne conserve aucune donnée bancaire.</p><h2>5. Livraison</h2><p>Livraison en France métropolitaine, selon les modes et délais indiqués lors de la commande.</p><h2>6. Droit de rétractation</h2><p>Tu disposes de 14 jours à compter de la réception pour te rétracter sans motif (articles L221-18 et suivants du Code de la consommation). MOVA prolonge ce délai à 30 jours pour les retours. Le remboursement intervient au plus tard 14 jours après la réception du retour.</p><h2>7. Garanties légales</h2><p>Tu bénéficies de la garantie légale de conformité (articles L217-3 et suivants du Code de la consommation) et de la garantie des vices cachés (articles 1641 et suivants du Code civil).</p><h2>8. Codes promotionnels</h2><p>Un seul code par commande. Le code de bienvenue est à usage unique, valable sur une première commande pendant la durée indiquée.</p><h2>9. Litiges</h2><p>Droit français. Médiation de la consommation : voir les mentions légales.</p>`],
    confidentialite: ['Politique de confidentialité', `<h2>Responsable du traitement</h2><p>MOVA, [coordonnées]. Contact données personnelles : [e-mail].</p><h2>Données collectées et finalités</h2><ul><li><b>Commandes</b> (identité, adresse, e-mail, historique) : exécution du contrat, factures (conservées 10 ans).</li><li><b>Compte et MOVA Club</b> (achats, séances validées, récompenses) : fonctionnement du programme, pendant la durée du compte puis 3 ans.</li><li><b>Newsletter</b> (e-mail, date et texte du consentement) : prospection avec consentement, 3 ans après le dernier contact.</li><li><b>Paniers des clientes identifiées</b> : relance de panier, uniquement avec consentement marketing.</li><li><b>Mensurations (facultatives)</b> : recommandation de taille uniquement, jamais pour la publicité, supprimables à tout moment.</li><li><b>Assistant MOVA</b> : conversations conservées 12 mois pour améliorer le service, sans donnée bancaire.</li><li><b>Mesure d’audience</b> : statistiques anonymes sans cookie ; mesure détaillée seulement avec ton accord.</li></ul><h2>Destinataires</h2><p>Prestataires agissant pour MOVA : paiement (Stripe), hébergement, e-mailing, transport, fournisseur du service d’IA de l’assistant. Les studios partenaires reçoivent uniquement ton prénom et l’initiale de ton nom lors de la validation d’une séance ou d’une récompense.</p><h2>Tes droits</h2><p>Accès, rectification, effacement, opposition, limitation, portabilité : depuis ton compte (export et suppression) ou en écrivant à [e-mail]. Réclamation possible auprès de la CNIL (cnil.fr).</p>`],
    cookies: ['Politique cookies', `<h2>Cookies nécessaires</h2><p>Session de connexion (mova_user), sécurité du back-office. Le panier, les favoris et tes choix sont gardés dans le stockage local de ton navigateur. Ils ne nécessitent pas ton accord.</p><h2>Mesure d’audience</h2><p>Comptage anonyme des visites, sans cookie ni identifiant. Une mesure détaillée n’est activée qu’avec ton accord.</p><h2>Personnalisation et publicité</h2><p>Désactivées par défaut, activées uniquement avec ton accord.</p><h2>Changer d’avis</h2><p>Lien « Gérer mes cookies » en bas de chaque page. Ton choix est conservé 6 mois.</p>`],
    accessibilite: ['Déclaration d’accessibilité', `<p>MOVA s’engage à rendre son site accessible conformément au RGAA (niveau AA des WCAG 2.1). Navigation au clavier, contrastes, textes alternatifs, bouton pause sur la vidéo et respect du réglage « réduire les animations » ont été pris en compte dès la conception.</p><p>État de conformité : non audité à ce jour. Pour signaler un défaut d’accessibilité : [e-mail]. Recours : Défenseur des droits.</p>`]
  };
  M.route('/credits-photos', ({ main }) => {
    main.innerHTML = `<div class="container"><div class="prose" style="padding:40px 0 80px"><h1>Crédits photos</h1><p>Les photos produits de la casquette, de la pince, des chaussettes de Pilates, de la gourde et du pantalon wide sont des photos MOVA. Les photos d’ambiance proviennent d’<a href="https://unsplash.com" target="_blank" rel="noopener">Unsplash</a> (licence Unsplash). Merci aux photographes :</p>
      <ul class="credits-list">${MovaPhotos.credits().map(c => `<li><a href="https://unsplash.com/@${esc(c.user)}" target="_blank" rel="noopener">${esc(c.name)}</a></li>`).join('')}</ul></div></div>`;
  });
  M.route('/legal/:page', ({ main, params }) => {
    const l = LEGAL[params.page]; if (!l) return M.notFound(main);
    main.innerHTML = `<div class="container"><div class="prose" style="padding:40px 0 80px"><h1>${l[0]}</h1>${l[1]}</div></div>`;
  });

  // ---------- Assistant MOVA (chatbot) ----------
  function setupChat() {
    const bubble = $('#chat-bubble'), panel = $('#chat-panel'), log = $('#chat-log'), form = $('#chat-form'), input = $('#chat-input');
    let history = store.sget('mova_chat', []);
    const SUGG = ['Quelle taille choisir ?', 'Une tenue Pilates et ville', 'Où est ma commande ?', 'Délais de livraison', 'C’est quoi MOVA Club ?', 'Parler au service client'];
    const msgHtml = m => {
      const prods = (m.products || []).map(p => M.product(p.id)).filter(Boolean);
      return `<div class="msg ${m.role === 'user' ? 'me' : 'bot'}">${esc(m.content)}${prods.length ? `<div class="prods">${prods.map(p => { const c = p.colors.find(x => M.colorInStock(p, x)) || p.colors[0]; return `<a class="prod" href="#/produit/${p.id}?color=${c}"><span class="thumb">${M.visual(p, c)}</span><span><b>${esc(p.name)}</b><br>${euro(p.price)}</span></a>`; }).join('')}</div>` : ''}${m.handoff ? `<div style="margin-top:8px"><a class="btn btn-outline btn-sm" href="#/aide/contact" data-handoff>Contacter le service client</a></div>` : ''}${m.link ? `<div style="margin-top:8px"><a href="${esc(m.link.href)}">${esc(m.link.label)}</a></div>` : ''}</div>`;
    };
    const draw = () => {
      log.innerHTML = msgHtml({ role: 'assistant', content: `Bonjour${S.user ? ' ' + S.user.firstName : ''} ! Je suis l’assistant MOVA. Je peux t’aider sur les tailles, les produits, ta commande, la livraison, les retours ou MOVA Club.` }) + history.map(msgHtml).join('');
      log.scrollTop = log.scrollHeight;
      $('#chat-suggestions').innerHTML = history.length ? '' : SUGG.map(s => `<button type="button">${s}</button>`).join('');
    };
    const open = () => { panel.hidden = false; bubble.setAttribute('aria-expanded', 'true'); draw(); input.focus(); };
    const close = () => { panel.hidden = true; bubble.setAttribute('aria-expanded', 'false'); bubble.focus(); };
    bubble.onclick = () => panel.hidden ? open() : close();
    $('#chat-close').onclick = close;
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const send = async text => {
      if (!text.trim()) return;
      history.push({ role: 'user', content: text.trim() });
      draw();
      log.insertAdjacentHTML('beforeend', '<div class="msg bot" id="typing"><span class="typing"><i></i><i></i><i></i></span><span class="sr-only">L’assistant écrit…</span></div>');
      log.scrollTop = log.scrollHeight;
      try {
        const r = await api('/api/chat', { method: 'POST', body: { messages: history.map(({ role, content }) => ({ role, content })) } });
        history.push({ role: 'assistant', content: r.reply, products: r.products, handoff: r.handoff, link: r.link });
      } catch (e) { history.push({ role: 'assistant', content: e.message, handoff: true }); }
      history = history.slice(-20); store.sset('mova_chat', history); draw();
    };
    form.onsubmit = e => { e.preventDefault(); const t = input.value; input.value = ''; send(t); };
    $('#chat-suggestions').onclick = e => { const b = e.target.closest('button'); if (b) send(b.textContent); };
    log.addEventListener('click', e => { if (e.target.closest('[data-handoff]')) store.sset('mova_chat_handoff', history.map(({ role, content }) => ({ role, content }))); if (e.target.closest('a')) close(); });
  }
  document.addEventListener('DOMContentLoaded', setupChat);
})();

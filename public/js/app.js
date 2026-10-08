// MOVA — application boutique (cœur : état, navigation, catalogue, produit, panier, commande).
(function () {
  'use strict';
  const M = window.MOVA = {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const euro = n => `${Number(n).toFixed(2).replace('.', ',').replace(',00', '')} €`;
  const euro2 = n => `${Number(n).toFixed(2).replace('.', ',')} €`;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  Object.assign(M, { $, $$, esc, euro, euro2, debounce });

  // ---------- Stockage local (préférences de navigation uniquement) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* navigation privée */ } },
    sget(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    sset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { } }
  };
  M.store = store;

  // ---------- API ----------
  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let data = null;
    try { data = await res.json(); } catch { }
    if (!res.ok) throw Object.assign(new Error(data?.error || 'Une erreur est survenue. Réessaie.'), { status: res.status, data });
    return data;
  }
  M.api = api;

  // ---------- État ----------
  const S = M.state = { catalog: null, user: null, cart: store.get('mova_cart', []), favs: store.get('mova_favs', []), priced: null, promo: store.get('mova_promo', '') };
  const product = id => S.catalog.products.find(p => p.id === id);
  const color = id => S.catalog.colors.find(c => c.id === id);
  const cutName = id => S.catalog.cuts.find(c => c.id === id)?.name || id;
  const lengthName = id => S.catalog.lengths.find(c => c.id === id)?.name || id;
  const catName = id => S.catalog.categories.find(c => c.id === id)?.name || id;
  Object.assign(M, { product, color, cutName, lengthName, catName });
  const vkey = i => [i.color, i.size, i.cut || '-', i.length || '-'].join('|');
  M.vkey = vkey;

  function availability(p, sel) {
    // Disponibilité d'une taille pour la combinaison coloris / coupe / longueur choisie.
    const key = vkey({ color: sel.color, size: sel.size, cut: p.cuts ? sel.cut : undefined, length: p.lengths ? sel.length : undefined });
    return p.availability[key] ?? 0;
  }
  const colorInStock = (p, c) => Object.entries(p.availability).some(([k, v]) => k.startsWith(c + '|') && v > 0);
  M.availability = availability; M.colorInStock = colorInStock;

  // ---------- Visuels ----------
  function visual(p, colorId, view = 'face', opts = {}) {
    const c = color(colorId) || S.catalog.colors[0];
    // 1. photo MOVA du coloris, 2. photo MOVA d'un autre coloris, 3. photo réelle de la photothèque.
    const own = p.images?.[colorId]?.length ? p.images[colorId] : Object.values(p.images || {}).find(a => a?.length);
    if (own) {
      const ph = view === 'face' ? own[0] : own[1] || own[0];
      return `<img src="${esc(ph.src)}" alt="${esc(ph.alt)}" loading="lazy" ${view !== 'face' && !own[1] ? 'class="zoomed"' : ''}>`;
    }
    const keys = MovaPhotos.PRODUCT[p.id] || ['creme'];
    const k = view === 'face' ? keys[0] : keys[1] || keys[0];
    return MovaPhotos.img(k, { w: 700, h: 875, alt: `${p.name}, ${c.name}`, cls: view !== 'face' && !keys[1] ? 'zoomed' : '' });
  }
  M.visual = visual;
  const swatchHtml = (cid, opts = {}) => { const c = color(cid); return `<${opts.tag || 'span'} class="swatch ${c.pattern ? 'leo' : ''} ${opts.cls || ''}" style="--c:${c.hex}" title="${esc(c.name)}" ${opts.attrs || ''}>${opts.tag === 'button' ? `<span class="sr-only">${esc(c.name)}</span>` : ''}</${opts.tag || 'span'}>`; };
  M.swatchHtml = swatchHtml;

  // Logo : transforme le JPEG fourni (fond crème) en image transparente, en brun ou en clair.
  const logoCache = {};
  function logoURL(kind, tone) {
    const k = kind + tone;
    if (logoCache[k]) return logoCache[k];
    logoCache[k] = new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, cv.width, cv.height);
        const [r, g, b] = tone === 'light' ? [246, 239, 228] : [74, 42, 28];
        for (let i = 0; i < d.data.length; i += 4) {
          const lum = (d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11);
          const a = Math.max(0, Math.min(255, (240 - lum) * 255 / (240 - 60)));
          d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b; d.data[i + 3] = a;
        }
        ctx.putImageData(d, 0, 0);
        resolve(cv.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = kind === 'symbol' ? '/assets/img/symbole-mova-crop.jpg' : '/assets/img/logo-mova-crop.jpg';
    });
    return logoCache[k];
  }
  function paintLogos(root = document) {
    for (const el of $$('[data-logo]', root)) {
      if (el.dataset.painted) continue;
      el.dataset.painted = '1';
      el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'MOVA');
      logoURL(el.dataset.logo, el.classList.contains('light') ? 'light' : 'dark').then(u => { if (u) el.style.setProperty('--logo-src', `url(${u})`); });
    }
  }
  M.paintLogos = paintLogos;

  // ---------- Notifications ----------
  function toast(html, { error = false, ms = 3800 } = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (error ? ' err' : '');
    el.innerHTML = html;
    $('#toasts').append(el);
    setTimeout(() => el.remove(), ms);
  }
  M.toast = toast;

  // ---------- Favoris ----------
  const isFav = id => S.favs.includes(id);
  async function toggleFav(id) {
    S.favs = isFav(id) ? S.favs.filter(x => x !== id) : [...S.favs, id];
    store.set('mova_favs', S.favs);
    updateBadges();
    $$(`[data-fav="${id}"]`).forEach(b => b.setAttribute('aria-pressed', String(isFav(id))));
    toast(isFav(id) ? 'Ajouté à tes favoris. <a href="#/favoris">Voir</a>' : 'Retiré des favoris.');
    if (S.user) api('/api/me', { method: 'PUT', body: { favorites: S.favs } }).catch(() => { });
  }
  M.toggleFav = toggleFav; M.isFav = isFav;

  // ---------- Panier ----------
  function saveCart() {
    store.set('mova_cart', S.cart);
    updateBadges();
    syncCart();
    if (!$('#cart-drawer').hidden) renderDrawer();
  }
  const syncCart = debounce(() => {
    if (!S.user) return; // relance de panier uniquement pour les clientes identifiées
    api('/api/cart/sync', { method: 'POST', body: { items: S.cart, ua: navigator.userAgent } }).catch(() => { });
  }, 1500);
  function addToCart(item, { open = true, silent = false } = {}) {
    const k = vkey(item);
    const existing = S.cart.find(i => i.productId === item.productId && vkey(i) === k);
    if (existing) existing.qty = Math.min(10, existing.qty + (item.qty || 1));
    else S.cart.push({ productId: item.productId, color: item.color, size: item.size, cut: item.cut, length: item.length, qty: item.qty || 1 });
    saveCart();
    const b = $('#cart-count'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
    if (!silent) toast(`${esc(product(item.productId).name)} ajouté au panier. <a href="#/panier">Voir le panier</a>`);
    if (open) openDrawer();
  }
  M.addToCart = addToCart; M.saveCart = saveCart;
  async function priceCurrent(extra = {}) {
    S.priced = await api('/api/cart/price', { method: 'POST', body: { items: S.cart, promoCode: S.promo || undefined, email: extra.email, shippingMethod: extra.shippingMethod } });
    if (S.promo && S.priced.promoError) { /* on garde le code saisi pour afficher l'erreur */ }
    return S.priced;
  }
  M.priceCurrent = priceCurrent;

  function updateBadges() {
    const n = S.cart.reduce((s, i) => s + i.qty, 0);
    const cb = $('#cart-count'); cb.textContent = n; cb.hidden = !n;
    const fb = $('#fav-count'); fb.textContent = S.favs.length; fb.hidden = !S.favs.length;
    $('#cart-btn').setAttribute('aria-label', `Panier, ${n} article${n > 1 ? 's' : ''}`);
  }

  function lineHtml(l, i, { editable = true } = {}) {
    const p = product(l.productId);
    if (!p) return '';
    const meta = [color(l.color)?.name, `Taille ${l.size}`, l.cut && cutName(l.cut), l.length && `Longueur ${lengthName(l.length).toLowerCase()}`].filter(Boolean).join(' · ');
    const sizes = p.sizes.map(s => { const av = availability(p, { ...l, size: s }); return `<option value="${s}" ${s === l.size ? 'selected' : ''} ${av <= 0 && s !== l.size ? 'disabled' : ''}>${s}${av <= 0 ? ' (épuisé)' : ''}</option>`; }).join('');
    const issue = S.priced?.stockIssues?.find(x => x.startsWith(p.name));
    return `<div class="line" data-i="${i}">
      <a class="thumb" href="#/produit/${p.id}?color=${l.color}" tabindex="-1" aria-hidden="true">${visual(p, l.color, 'face', l)}</a>
      <div><a class="name" href="#/produit/${p.id}?color=${l.color}">${esc(p.name)}</a><div class="meta">${esc(meta)}</div>
        ${issue ? `<div class="meta" style="color:var(--err)">${esc(issue.split(' : ')[1])}</div>` : ''}
        ${editable ? `<div><span class="qty"><button data-q="-1" aria-label="Retirer un">−</button><span aria-live="polite">${l.qty}</span><button data-q="1" aria-label="Ajouter un">+</button></span>
        ${p.sizes.length > 1 ? `<label class="sr-only" for="sz${i}">Taille</label><select id="sz${i}" data-size>${sizes}</select>` : ''}</div>
        <button class="linklike remove" data-remove>Retirer</button> · <button class="linklike remove" data-later>Mettre en favori</button>` : `<div class="meta">Quantité : ${l.qty}</div>`}
      </div>
      <div class="price">${euro2(p.price * l.qty)}</div></div>`;
  }
  function bindLines(root, rerender) {
    root.addEventListener('click', e => {
      const line = e.target.closest('.line'); if (!line) return;
      const i = +line.dataset.i; const it = S.cart[i]; if (!it) return;
      if (e.target.closest('[data-q]')) { it.qty = Math.max(0, Math.min(10, it.qty + +e.target.closest('[data-q]').dataset.q)); if (!it.qty) S.cart.splice(i, 1); saveCart(); rerender(); }
      if (e.target.closest('[data-remove]')) { S.cart.splice(i, 1); saveCart(); rerender(); toast('Article retiré.'); }
      if (e.target.closest('[data-later]')) { if (!isFav(it.productId)) toggleFav(it.productId); S.cart.splice(i, 1); saveCart(); rerender(); }
    });
    root.addEventListener('change', e => {
      if (!e.target.matches('[data-size]')) return;
      const i = +e.target.closest('.line').dataset.i; S.cart[i].size = e.target.value;
      // Fusionne si la même variante existe déjà.
      const k = vkey(S.cart[i]); const dup = S.cart.findIndex((x, j) => j !== i && x.productId === S.cart[i].productId && vkey(x) === k);
      if (dup >= 0) { S.cart[dup].qty += S.cart[i].qty; S.cart.splice(i, 1); }
      saveCart(); rerender();
    });
  }
  function summaryHtml(pr, { promoField = true } = {}) {
    if (!pr) return '';
    return `<div class="summary">
      <div class="row"><span>Sous-total</span><span>${euro2(pr.subtotal)}</span></div>
      ${pr.ensemble.amount ? `<div class="row save"><span>Ensemble MOVA ×${pr.ensemble.count} (${euro(pr.ensemble.unitPrice)} l’ensemble)</span><span>−${euro2(pr.ensemble.amount)}</span></div>` : ''}
      ${pr.promo ? `<div class="row save"><span>Code ${esc(pr.promo.code)}</span><span>−${euro2(pr.promoDiscount)}</span></div>` : ''}
      <div class="row"><span>Livraison${pr.lines.length ? '' : ''}</span><span>${pr.shipping ? euro2(pr.shipping) : pr.lines.length ? 'Offerte' : '—'}</span></div>
      <div class="row total"><span>Total TTC</span><span>${euro2(pr.total)}</span></div>
    </div>
    ${promoField ? `<form class="promo-form inline-field" data-promo><label class="sr-only" for="promo-${Math.random().toString(36).slice(2, 6)}">Code promo</label><input name="code" placeholder="Code promo" value="${esc(S.promo)}" autocapitalize="characters"><button class="btn btn-outline btn-sm" type="submit">Appliquer</button></form>
    <p class="form-msg ${pr.promoError ? 'err' : pr.promo ? 'ok' : ''}">${pr.promoError && S.promo ? esc(pr.promoError) : pr.promo ? `Code ${esc(pr.promo.code)} appliqué.` : ''}</p>` : ''}`;
  }
  function bindPromo(root, rerender) {
    root.addEventListener('submit', e => {
      if (!e.target.matches('[data-promo]')) return;
      e.preventDefault();
      S.promo = e.target.code.value.trim().toUpperCase();
      store.set('mova_promo', S.promo);
      rerender();
    });
  }
  M.lineHtml = lineHtml; M.summaryHtml = summaryHtml; M.bindLines = bindLines; M.bindPromo = bindPromo;

  function recoAccessories(limit = 4) {
    const inCart = new Set(S.cart.map(i => i.productId));
    const colorsInCart = S.cart.map(i => i.color);
    const ids = ['chaussettes-pilates', 'chouchou', 'pince-cheveux', 'gourde', 'bandeau', 'casquette'].filter(id => !inCart.has(id) && product(id));
    return ids.slice(0, limit).map(id => { const p = product(id); const c = p.colors.find(c => colorsInCart.includes(c) && colorInStock(p, c)) || p.colors.find(c => colorInStock(p, c)) || p.colors[0]; return { p, c }; });
  }
  function miniRecoHtml() {
    const recos = recoAccessories();
    if (!recos.length) return '';
    return `<h3 class="small" style="margin-top:18px">Complète avec un accessoire</h3><div class="mini-reco">${recos.map(({ p, c }) => `
      <div class="card"><div class="card-media"><div class="art">${visual(p, c)}</div></div><div class="card-info"><span>${esc(p.name)}</span><b>${euro(p.price)}</b></div>
      <button class="btn btn-outline btn-sm" data-quickadd="${p.id}" data-color="${c}">Ajouter</button></div>`).join('')}</div>`;
  }
  function quickAdd(id, c) {
    const p = product(id);
    const size = p.sizes.find(s => availability(p, { color: c, size: s, cut: p.cuts?.[0], length: p.lengths ? 'standard' : undefined }) > 0);
    if (!size) return toast('Ce coloris est épuisé.', { error: true });
    if (p.sizes.length > 1 && !p.accessory) { location.hash = `#/produit/${id}?color=${c}`; return; }
    addToCart({ productId: id, color: c, size, cut: p.cuts?.[0], length: p.lengths ? 'standard' : undefined }, { open: false });
  }
  M.quickAdd = quickAdd;
  document.addEventListener('click', e => { const b = e.target.closest('[data-quickadd]'); if (b) { e.preventDefault(); quickAdd(b.dataset.quickadd, b.dataset.color); if ($('#cart-drawer').hidden === false) renderDrawer(); } });

  // Tiroir panier
  let lastFocus = null;
  function openDrawer() {
    lastFocus = document.activeElement;
    $('#drawer-backdrop').hidden = false; $('#cart-drawer').hidden = false;
    document.body.style.overflow = 'hidden';
    renderDrawer();
    setTimeout(() => $('#cart-drawer [data-close-drawer]').focus(), 50);
  }
  function closeDrawer() { $('#drawer-backdrop').hidden = true; $('#cart-drawer').hidden = true; document.body.style.overflow = ''; lastFocus?.focus?.(); }
  M.openDrawer = openDrawer; M.closeDrawer = closeDrawer;
  async function renderDrawer() {
    const body = $('#cart-drawer-body');
    if (!S.cart.length) { body.innerHTML = `<div class="empty"><p>Ton panier est vide.</p><a class="btn btn-dark" href="#/tenues" data-close-drawer>Découvrir la collection</a></div>${miniRecoHtml()}`; return; }
    let pr; try { pr = await priceCurrent(); } catch (e) { body.innerHTML = `<p class="form-msg err">${esc(e.message)}</p>`; return; }
    const pct = Math.min(100, (1 - pr.remainingForFreeShipping / pr.freeShippingFrom) * 100);
    body.innerHTML = `<div class="ship-meter">${pr.remainingForFreeShipping > 0 ? `Plus que <b>${euro2(pr.remainingForFreeShipping)}</b> pour la livraison offerte` : '<b>Livraison offerte</b> 🎉'.replace(' 🎉', '')}<div class="gauge"><i style="width:${pct}%"></i></div></div>
      <div class="lines">${S.cart.map((l, i) => lineHtml(l, i)).join('')}</div>
      ${summaryHtml(pr)}
      <a class="btn btn-dark btn-block" href="#/commande" data-close-drawer>Commander · ${euro2(pr.total)}</a>
      <a class="btn btn-outline btn-block" style="margin-top:8px" href="#/panier" data-close-drawer>Voir le panier</a>
      <div class="pay-methods" style="justify-content:center;margin-top:12px"><span>CB</span><span>Visa</span><span>Mastercard</span><span>Apple Pay</span><span>Google Pay</span></div>
      ${miniRecoHtml()}`;
  }
  M.renderDrawer = renderDrawer;

  // ---------- Cartes produits ----------
  function productCard(p, opts = {}) {
    const c = opts.color && p.colors.includes(opts.color) ? opts.color : (p.colors.find(x => colorInStock(p, x)) || p.colors[0]);
    const soldOut = !p.colors.some(x => colorInStock(p, x));
    const tag = soldOut ? 'Épuisé' : p.isNew ? 'Nouveau' : p.bestseller ? 'Best-seller' : '';
    return `<article class="card reveal" data-card="${p.id}" data-color="${c}">
      <div class="card-media"><div class="art">${visual(p, c, 'face')}</div><div class="art alt-view">${visual(p, c, 'porte')}</div>
        ${tag ? `<span class="tag">${tag}</span>` : ''}
        <a class="cover" href="#/produit/${p.id}?color=${c}" aria-label="${esc(p.name)}, ${euro(p.price)}"></a>
        <button class="icon-btn fav" data-fav="${p.id}" aria-pressed="${isFav(p.id)}" aria-label="Ajouter ${esc(p.name)} aux favoris"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button>
        ${!soldOut ? `<div class="quick"><a class="btn btn-light btn-block btn-sm" href="#/produit/${p.id}?color=${c}">${p.accessory && p.sizes.length === 1 ? 'Voir' : 'Choisir ma taille'}</a></div>` : ''}
      </div>
      <div class="card-info"><h3>${esc(p.name)}</h3><span class="price">${euro(p.price)}</span></div>
      ${p.rating?.count ? `<div class="rating">★ ${p.rating.average.toString().replace('.', ',')} <span class="muted">(${p.rating.count})</span></div>` : ''}
      <div class="swatches" role="group" aria-label="Coloris">${p.colors.slice(0, 6).map(x => swatchHtml(x, { tag: 'button', cls: x === c ? 'on' : '', attrs: `data-swatch="${x}" aria-pressed="${x === c}" ${colorInStock(p, x) ? '' : 'style="--c:' + color(x).hex + ';opacity:.35"'}` })).join('')}${p.colors.length > 6 ? `<span class="small muted">+${p.colors.length - 6}</span>` : ''}</div>
    </article>`;
  }
  function bundleCard(b) {
    const v = product(b.veste), pa = product(b.pantalon);
    if (!v || !pa) return '';
    const colors = v.colors.filter(c => pa.colors.includes(c));
    const c = colors.find(x => colorInStock(v, x) && colorInStock(pa, x)) || colors[0];
    return `<article class="card reveal" data-bundle="${b.id}">
      <div class="card-media"><div class="art">${MovaPhotos.BUNDLE[b.id] ? MovaPhotos.img(MovaPhotos.BUNDLE[b.id], { w: 700, h: 875 }) : visual(pa, c)}</div><span class="tag">Ensemble · ${euro(S.catalog.settings.ensemblePrice)}</span>
        <a class="cover" href="#/ensemble/${b.id}?color=${c}" aria-label="${esc(b.name)}"></a>
        <button class="icon-btn fav" data-fav="${b.id}" aria-pressed="${isFav(b.id)}" aria-label="Ajouter ${esc(b.name)} aux favoris"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button></div>
      <div class="card-info"><h3>${esc(b.name)}</h3><span class="price"><span class="strike">${euro(v.price + pa.price)}</span> ${euro(S.catalog.settings.ensemblePrice)}</span></div>
      <p class="small muted" style="margin:0">${esc(b.description)}</p>
      <div class="swatches">${colors.map(x => swatchHtml(x)).join('')}</div></article>`;
  }
  M.productCard = productCard; M.bundleCard = bundleCard;
  document.addEventListener('click', e => {
    const fav = e.target.closest('[data-fav]');
    if (fav) { e.preventDefault(); toggleFav(fav.dataset.fav); return; }
    const sw = e.target.closest('.card [data-swatch]');
    if (sw) {
      e.preventDefault();
      const card = sw.closest('.card'); const p = product(card.dataset.card); const c = sw.dataset.swatch;
      card.dataset.color = c;
      const arts = $$('.card-media > .art', card); arts[0].innerHTML = visual(p, c, 'face'); arts[1].innerHTML = visual(p, c, 'porte');
      $$('[data-swatch]', card).forEach(b => { b.classList.toggle('on', b === sw); b.setAttribute('aria-pressed', String(b === sw)); });
      $$('a[href^="#/produit"]', card).forEach(a => a.href = `#/produit/${p.id}?color=${c}`);
    }
  });

  // ---------- Navigation ----------
  const NAV = [
    { label: 'Nouveautés', href: '#/nouveautes' },
    { label: 'Tenues', href: '#/tenues', cols: [{ title: 'Tenues', links: [['Ensembles de survêtement', '#/categorie/ensembles'], ['Vestes', '#/categorie/vestes'], ['Bas de survêtement', '#/categorie/pantalons'], ['Sweats', '#/categorie/sweats'], ['Brassières', '#/categorie/brassieres'], ['Leggings', '#/categorie/leggings'], ['Shorts', '#/categorie/shorts']] }, { title: 'Par sport', links: [['Pilates', '#/tenues?sport=pilates'], ['Padel', '#/tenues?sport=padel'], ['Fitness', '#/tenues?sport=fitness'], ['Ville', '#/tenues?sport=ville'], ['Compose ton ensemble', '#/compose']] }], feature: 'ensemble' },
    { label: 'Accessoires', href: '#/accessoires', cols: [{ title: 'Accessoires', links: [['Casquettes', '#/categorie/casquettes'], ['Pinces à cheveux', '#/categorie/pinces'], ['Chouchous', '#/categorie/chouchous'], ['Bandeaux', '#/categorie/bandeaux'], ['Chaussettes', '#/categorie/chaussettes'], ['Chaussettes antidérapantes de Pilates', '#/categorie/chaussettes-pilates'], ['Gourdes', '#/categorie/gourdes']] }], feature: 'accessoire' },
    { label: 'Collections', href: '#/tenues', cols: [{ title: 'Collections', links: [['Ensembles de survêtement', '#/categorie/ensembles'], ['Brassières', '#/categorie/brassieres'], ['Shorts', '#/categorie/shorts'], ['Leggings', '#/categorie/leggings'], ['Sweats', '#/categorie/sweats'], ['Bas de survêtement', '#/categorie/pantalons'], ['Toutes les tenues', '#/tenues']] }], feature: 'coloris' },
    { label: 'MOVA Club', href: '#/mova-club', cols: [{ title: 'MOVA Club', links: [['Programme de fidélité', '#/mova-club'], ['Récompenses', '#/mova-club#recompenses'], ['Studios partenaires', '#/mova-pres-de-toi'], ['Carte interactive', '#/mova-pres-de-toi'], ['Mon espace fidélité', '#/compte/fidelite']] }], feature: 'club' },
    { label: 'Notre univers', href: '#/univers', cols: [{ title: 'Notre univers', links: [['L’histoire de MOVA', '#/univers'], ['Nos valeurs', '#/univers/valeurs'], ['La campagne « Une tenue. Tous tes plans. »', '#/univers/campagne']] }], feature: 'campagne' }
  ];
  function buildNav() {
    $('#nav-list').innerHTML = NAV.map((n, i) => `<li>${n.cols ? `<button aria-expanded="false" aria-controls="mega" data-mega="${i}">${n.label}</button>` : `<a href="${n.href}">${n.label}</a>`}</li>`).join('');
    const mob = $('#mobile-nav');
    mob.innerHTML = `<div class="mn-head"><span class="brand-logo" data-logo="wordmark"></span><button class="icon-btn" id="mn-close" aria-label="Fermer le menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      ${NAV.map(n => n.cols ? `<details><summary>${n.label}</summary><ul>${n.cols.flatMap(c => c.links).map(([l, h]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul></details>` : `<a href="${n.href}">${n.label}</a>`).join('')}
      <a href="#/compte">Mon compte</a><a href="#/favoris">Favoris</a><a href="#/aide">Service client</a>`;
    paintLogos(mob);
    let megaOpen = null;
    const mega = $('#mega');
    const openMega = i => {
      const n = NAV[i]; megaOpen = i;
      $$('[data-mega]').forEach(b => b.setAttribute('aria-expanded', String(+b.dataset.mega === i)));
      const featureArt = {
        ensemble: [MovaPhotos.img('rose', { w: 400, h: 500 }), 'Ensembles de survêtement', '#/categorie/ensembles'],
        accessoire: [visual(product('chaussettes-pilates'), 'bordeaux'), 'Chaussettes de Pilates', '#/produit/chaussettes-pilates'],
        coloris: ['<img src="/assets/img/produits/pantalon-wide-moka-face.jpg" alt="" style="width:100%;aspect-ratio:4/5;object-fit:cover">', 'Le pantalon wide à liseré', '#/produit/pantalon-wide-lisere'],
        club: [MovaPhotos.img('reformerArche', { w: 400, h: 500 }), '5 achats = -10 % sur une séance', '#/mova-club'],
        campagne: [MovaPhotos.img('ville', { w: 400, h: 500 }), 'Une tenue. Tous tes plans.', '#/univers/campagne']
      }[n.feature];
      mega.innerHTML = `<div class="mega-inner">${n.cols.map(c => `<div><h3>${c.title}</h3><ul>${c.links.map(([l, h]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}</ul></div>`).join('')}
        ${featureArt ? `<a class="mega-feature" href="${featureArt[2]}"><div class="art">${featureArt[0]}</div><div><p class="eyebrow">À la une</p><b>${featureArt[1]}</b></div></a>` : ''}</div>`;
      mega.hidden = false;
    };
    const closeMega = () => { mega.hidden = true; megaOpen = null; $$('[data-mega]').forEach(b => b.setAttribute('aria-expanded', 'false')); };
    $('#nav-list').addEventListener('click', e => { const b = e.target.closest('[data-mega]'); if (b) megaOpen === +b.dataset.mega ? closeMega() : openMega(+b.dataset.mega); });
    $('#nav-list').addEventListener('mouseover', debounce(e => { const b = e.target.closest('[data-mega]'); if (b && matchMedia('(hover:hover)').matches) openMega(+b.dataset.mega); }, 80));
    $('#header').addEventListener('mouseleave', () => matchMedia('(hover:hover)').matches && closeMega());
    mega.addEventListener('click', e => { if (e.target.closest('a')) closeMega(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMega(); });
    M.closeMega = closeMega;
    const openMobile = () => { mob.hidden = false; $('#burger').setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; $('#mn-close').focus(); };
    const closeMobile = () => { mob.hidden = true; $('#burger').setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; };
    $('#burger').addEventListener('click', openMobile);
    mob.addEventListener('click', e => { if (e.target.closest('#mn-close') || e.target.closest('a')) closeMobile(); });
    M.closeMobile = closeMobile;
  }

  // ---------- Routeur ----------
  const routes = [];
  M.route = (pattern, render) => routes.push({ re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), render });
  function parseHash() {
    const h = location.hash.replace(/^#/, '') || '/';
    const [p, q] = h.split('?');
    return { path: p.replace(/\/+$/, '') || '/', query: new URLSearchParams(q || '') };
  }
  M.parseHash = parseHash;
  let currentPath = null;
  async function render() {
    const { path, query } = parseHash();
    // Ancre interne (#/page#section) : on garde la page.
    const [cleanPath, anchor] = path.split('#');
    const r = routes.find(r => r.re.test(cleanPath)) || routes.find(r => r.re.source === '^\\/404$');
    const params = r.re.exec(cleanPath)?.groups || {};
    const main = $('#main');
    M.closeMega?.(); M.closeMobile?.();
    if (currentPath !== cleanPath) window.scrollTo({ top: 0, behavior: 'instant' });
    currentPath = cleanPath;
    document.body.classList.remove('has-sticky-atc');
    try {
      const out = await r.render({ params, query, main });
      if (typeof out === 'string') main.innerHTML = out;
    } catch (e) {
      console.error(e);
      main.innerHTML = `<div class="container section"><h1>Oups</h1><p>${esc(e.message)}</p><a class="btn btn-dark" href="#/">Retour à l’accueil</a></div>`;
    }
    paintLogos(main);
    observeReveal(main);
    if (anchor) document.getElementById(anchor)?.scrollIntoView();
    const h1 = $('h1', main);
    document.title = h1 && cleanPath !== '/' ? `${h1.textContent.trim()} · MOVA` : 'MOVA — Ton rythme. Ton style.';
    if (cleanPath !== '/' && !anchor) main.focus({ preventScroll: true });
    api('/api/track', { method: 'POST', body: { path: cleanPath, newVisit: !store.sget('mova_visit'), ref: document.referrer } }).catch(() => { });
    store.sset('mova_visit', 1);
  }
  M.render = render;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -40px' }) : null;
  function observeReveal(root) { $$('.reveal:not(.in)', root).forEach(el => io ? io.observe(el) : el.classList.add('in')); }
  M.observeReveal = observeReveal;

  // ---------- Photos d'ambiance (Unsplash, licence gratuite usage commercial, affichées depuis leur source) ----------
  const UNSPLASH = {
    jaune: ['photo-1515886657613-9f3515b0c78f', 'Femme en ensemble de survêtement jaune sur un terrain de basket', 'Dom Hill', 'domjewel'],
    rose: ['photo-1722507390029-e9758e1f11f2', 'Femme en ensemble de survêtement rose', 'Deny Hill', 'deny_hill'],
    roseAccroupie: ['photo-1722507389991-5147c8ad2050', 'Femme accroupie en ensemble de survêtement rose', 'Deny Hill', 'deny_hill'],
    creme: ['photo-1685464583529-7f527c50e22f', 'Femme en ensemble de survêtement crème devant une fenêtre', 'Navid Sohrabi', 'navidsohrabi'],
    cremeRue: ['photo-1685464583257-66f61ea61380', 'Femme en ensemble de survêtement crème dans la rue', 'Navid Sohrabi', 'navidsohrabi'],
    marron: ['photo-1610892923471-d8efa48225d0', 'Femme en ensemble de survêtement marron en ville', 'Khalid Boutchich', 'khalidboutchich'],
    lavande: ['photo-1689701252584-a1f25051fa59', 'Femme en ensemble de survêtement lavande', 'Ben Iwara', '1hundredimages']
  };
  const photo = (k, { w = 900, h = 1200, cls = '', eager = false } = {}) => { const [id, alt] = UNSPLASH[k]; return `<img src="https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80" alt="${esc(alt)}" ${eager ? '' : 'loading="lazy"'} class="${cls}" style="width:100%;height:100%;object-fit:cover">`; };
  M.photo = photo; M.UNSPLASH = UNSPLASH;

  // ---------- Pages : accueil ----------
  const OUTFIT = (top, bottom, extra = {}) => ({ top: { type: top.type, color: color(top.c), oversize: top.oversize }, under: extra.under ? { color: color(extra.under) } : null, bottom: { type: bottom.type, color: color(bottom.c), cut: bottom.cut, length: bottom.length } });
  M.OUTFIT = OUTFIT;

  M.route('/', ({ main }) => {
    const st = S.catalog.settings;
    const COLLECTIONS = [
      ['ensembles', 'Ensembles de survêtement', photo('jaune', { w: 700, h: 930 })],
      ['brassieres', 'Brassières', MovaPhotos.img('braRose', { w: 700, h: 930 })],
      ['shorts', 'Shorts', MovaPhotos.img('shortVille', { w: 700, h: 930 })],
      ['leggings', 'Leggings', MovaPhotos.img('leggingOlive', { w: 700, h: 930 })],
      ['sweats', 'Sweats', photo('creme', { w: 700, h: 930 })],
      ['pantalons', 'Bas de survêtement', '<img src="/assets/img/produits/pantalon-wide-moka-face.jpg" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">']
    ];
    const collectionTiles = COLLECTIONS.map(([id, name, art]) => `<a class="color-tile reveal" href="#/categorie/${id}"><div class="art">${art}</div><span>${esc(name)} · ${id === 'ensembles' ? S.catalog.bundles.length : S.catalog.products.filter(p => p.category === id).length}</span></a>`).join('');
    const storySteps = [['8:00', 'maison', 'Elle se lève', 'Ensemble enfilé, café à emporter, elle part sans réfléchir à sa tenue.'], ['9:30', 'reformer', 'Cours de Pilates', 'Brassière et pantalon suivent chaque mouvement sur le reformer.'], ['11:30', 'cafe', 'Café avec une amie', 'Un sweat par-dessus : prête pour la terrasse.'], ['15:00', 'ville', 'Balade en ville', 'Le pantalon passe partout, la veste structure la silhouette.'], ['19:00', 'soir', 'Fin de journée', 'Toujours dans sa tenue MOVA. Une tenue. Tous ses plans.']];
    M.storySteps = storySteps;
    const story = storySteps.map(([t, scene, h, p], i) => `<div class="story-step reveal"><div class="art">${MovaPhotos.img(scene, { w: 600, h: 1100 })}</div><p class="time">${t}</p><h3>${h}</h3><p>${p}</p></div>`).join('');
    const best = S.catalog.products.filter(p => p.bestseller).sort((a, b) => b.popularity - a.popularity);
    const order = ['pantalon-wide-lisere', 'pantalon-survetement', 'veste-cintree-studio', 'brassiere-sculpt', 'chaussettes-pilates', 'casquette', 'gourde', 'pince-cheveux'];
    const bestSorted = order.map(product).filter(Boolean);
    const partners = M.partnersCache || [];
    main.innerHTML = `
    <section class="hero" aria-label="MOVA, Ton rythme. Ton style.">
      <video id="hero-video" class="ready" muted loop playsinline autoplay preload="auto" poster="/assets/video/mova-hero-poster.jpg" aria-hidden="true"></video>
      <div class="hero-content">
        <h1 class="sr-only">MOVA — Ton rythme. Ton style.</h1>
        <span class="brand-logo light" data-logo="wordmark" style="aspect-ratio:1420/320"></span>
        <p>Ton rythme. Ton style.</p>
        <a class="btn btn-light" href="#/tenues">Découvrir la collection</a>
      </div>
      <div class="hero-controls"><button id="hero-toggle" aria-label="Mettre la vidéo en pause" hidden>❚❚</button></div>
    </section>

    <section class="section container" aria-labelledby="new-coll">
      <div class="section-head"><div><p class="eyebrow">Collections</p><h2 id="new-coll">Nos collections</h2></div><a class="btn btn-outline" href="#/tenues">Shop the collection</a></div>
      <div class="colors-grid collections-grid">${collectionTiles}</div>
    </section>

    <section class="section story" aria-labelledby="story-title">
      <div class="container">
        <div class="section-head"><div><p class="eyebrow">La campagne</p><h2 id="story-title">Une tenue. Tous tes plans.</h2></div><a class="btn btn-ghost-light" href="#/ensemble/ensemble-studio?color=bordeaux">Shop ce look · ${euro(st.ensemblePrice)}</a></div>
        <div class="story-track" tabindex="0" aria-label="Une journée en ensemble MOVA, faire défiler">${story}</div>
      </div>
    </section>

    <section class="section container" aria-labelledby="best-title">
      <div class="section-head"><div><p class="eyebrow">Les incontournables</p><h2 id="best-title">Les meilleures ventes</h2></div><a class="btn btn-outline" href="#/tenues?tri=popularite">Tout voir</a></div>
      <div class="grid grid-4">${bestSorted.map(p => productCard(p)).join('')}</div>
    </section>

    <section class="section container" id="compose" aria-labelledby="compose-title">
      <div class="section-head"><div><p class="eyebrow">Compose ton ensemble</p><h2 id="compose-title">Ton haut, ton bas, ta coupe</h2></div><p class="muted" style="max-width:420px;margin:0">Choisis chaque pièce dans sa taille. Veste + pantalon assortis = <b>${euro(st.ensemblePrice)}</b> au lieu de 90 €, même avec des tailles différentes.</p></div>
      <div id="composer-mount"></div>
    </section>

    <section class="section club-band" aria-labelledby="club-title">
      <div class="container club-grid">
        <div><p class="eyebrow">MOVA Club</p><h2 id="club-title">Tes achats t’ouvrent les studios</h2>
          <div class="perks">
            <div class="perk"><span class="n">${st.club.purchasesForReward}</span><div><b>${st.club.purchasesForReward} achats = -${st.club.rewardPercent} % sur une séance</b><span class="muted small">Un code unique à présenter dans un studio partenaire.</span></div></div>
            <div class="perk"><span class="n">${st.club.sessionTiers[0]?.sessions || 5}</span><div><b>Tes séances te font gagner des accessoires</b><span class="muted small">${st.club.sessionTiers.map(t => `${t.sessions} séances : ${esc(t.reward.toLowerCase())}`).join(' · ')}</span></div></div>
            <div class="perk"><span class="n">♡</span><div><b>Avant-premières et événements à Lyon</b><span class="muted small">Drops de coloris, cours partenaires, essayages.</span></div></div>
          </div>
          <a class="btn btn-dark" href="#/mova-club">Rejoindre MOVA Club</a></div>
        <div class="art" style="border-radius:16px;overflow:hidden;max-width:420px;aspect-ratio:3/4;justify-self:center">${MovaPhotos.img('reformerArche', { w: 700, h: 930 })}</div>
      </div>
    </section>

    <section class="section container" aria-labelledby="partners-title">
      <div class="section-head"><div><p class="eyebrow">Nos partenaires sportifs</p><h2 id="partners-title">MOVA près de toi, à Lyon</h2></div><a class="btn btn-outline" href="#/mova-pres-de-toi">Voir la carte</a></div>
      <div class="partner-strip" id="partner-strip">${partners.map(p => `<a class="partner-pill" href="#/mova-pres-de-toi?studio=${p.id}">${esc(p.name)} <i>${esc(p.activity)}</i></a>`).join('')}</div>
    </section>

    <section class="section container" aria-labelledby="ugc-title">
      <div class="section-head"><div><p class="eyebrow">Instagram &amp; TikTok</p><h2 id="ugc-title">La communauté MOVA</h2></div><div style="display:flex;gap:8px"><a class="btn btn-outline btn-sm" href="https://www.instagram.com/" target="_blank" rel="noopener">Instagram</a><a class="btn btn-outline btn-sm" href="https://www.tiktok.com/" target="_blank" rel="noopener">TikTok</a></div></div>
      <div class="ugc">${['roseAccroupie', 'leggingFenetre', 'cafe', 'shortCreme', 'cremeRue', 'braReformer'].map(k => `<a href="https://www.instagram.com/" target="_blank" rel="noopener" aria-label="Voir sur Instagram"><div class="art" style="height:100%">${MovaPhotos.img(k, { w: 400, h: 400 })}</div></a>`).join('')}</div>
      <div class="newsletter-band">
        <div><h2 style="color:#fff">-${st.welcome.percent} % sur ta première commande</h2><p style="margin:0;color:#D8C7B5">Nouveaux coloris, événements à Lyon et conseils, une à deux fois par mois.</p></div>
        <form data-newsletter="home" class="newsletter-inline"><div class="inline-field"><label class="sr-only" for="nl-home">E-mail</label><input id="nl-home" type="email" name="email" placeholder="ton@email.fr" autocomplete="email" required><button class="btn btn-light" type="submit">Je m’inscris</button></div>
          <label class="check small" style="margin-top:10px"><input type="checkbox" name="consent" required> J’accepte de recevoir les actualités et offres MOVA par e-mail. Désinscription en un clic.</label><p class="form-msg" aria-live="polite"></p></form>
      </div>
    </section>`;
    M.mountComposer($('#composer-mount'));
    setupHeroVideo();
    if (!M.partnersCache) api('/api/partners').then(ps => { M.partnersCache = ps; const strip = $('#partner-strip'); if (strip) strip.innerHTML = ps.map(p => `<a class="partner-pill" href="#/mova-pres-de-toi?studio=${p.id}">${esc(p.name)} <i>${esc(p.activity)}</i></a>`).join(''); }).catch(() => { });
  });

  // Vidéo d'accueil : chargée seulement si les conditions sont bonnes, image de remplacement sinon.
  function setupHeroVideo() {
    const v = $('#hero-video'); if (!v) return;
    const big = innerWidth * (devicePixelRatio || 1) > 1600;
    v.src = big ? '/assets/video/mova-hero-1080.mp4' : '/assets/video/mova-hero.mp4';
    v.muted = true;
    const btn = $('#hero-toggle'); btn.hidden = false;
    const setBtn = () => { btn.textContent = v.paused ? '▶' : '❚❚'; btn.setAttribute('aria-label', v.paused ? 'Lire la vidéo' : 'Mettre la vidéo en pause'); };
    // Si l'utilisatrice a demandé moins d'animations, la vidéo reste en pause sur sa première image.
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) v.play().catch(() => { }); else v.pause();
    v.addEventListener('play', setBtn); v.addEventListener('pause', setBtn); setBtn();
    btn.addEventListener('click', () => v.paused ? v.play() : v.pause());
  }

  // ---------- Compose ton ensemble ----------
  M.mountComposer = function (mount, preset = {}) {
    const st = S.catalog.settings;
    const TOPS = ['veste-cintree-studio', 'veste-zippee-city', 'hoodie-oversize', 'sweat-oversize', 'sweat-court', 'brassiere-sculpt', 'brassiere-croisee'].map(product).filter(Boolean);
    const BOTTOMS = ['pantalon-survetement', 'pantalon-wide-lisere', 'legging-seconde-peau', 'legging-flare', 'short-cycliste', 'short-ample'].map(product).filter(Boolean);
    const s = Object.assign({ top: 'veste-cintree-studio', bottom: 'pantalon-survetement', cut: 'evasee', length: 'standard', topColor: 'bordeaux', bottomColor: 'bordeaux', topSize: S.user?.sizeProfile?.top || 'M', bottomSize: S.user?.sizeProfile?.bottom || 'M', sameColor: true }, preset);
    const draw = () => {
      const T = product(s.top), B = product(s.bottom);
      if (!T.colors.includes(s.topColor)) s.topColor = T.colors[0];
      if (s.sameColor && B.colors.includes(s.topColor)) s.bottomColor = s.topColor;
      if (!B.colors.includes(s.bottomColor)) s.bottomColor = B.colors[0];
      if (!B.cuts) s.cut = null; else if (!B.cuts.includes(s.cut)) s.cut = B.cuts[0];
      if (!B.lengths) s.length = null; else if (!B.lengths.includes(s.length)) s.length = B.lengths.includes('standard') ? 'standard' : B.lengths[0];
      const topAv = size => availability(T, { color: s.topColor, size });
      const botAv = size => availability(B, { color: s.bottomColor, size, cut: s.cut, length: s.length });
      const isEnsemble = T.ensembleGroup && B.ensembleGroup && T.type === 'veste' && (B.ensembleRole || B.type) === 'pantalon' && (!st.ensembleSameColor || s.topColor === s.bottomColor);
      const full = T.price + B.price;
      const total = isEnsemble ? st.ensemblePrice : full;
      const outfit = { top: { type: T.type === 'brassiere' ? 'brassiere' : T.type, color: color(s.topColor), oversize: T.fit === 'Oversize' }, under: T.type === 'veste' ? { color: color(s.topColor === 'noir' ? 'jaune' : 'noir') } : null,
        bottom: { type: B.type, color: color(s.bottomColor), cut: s.cut, length: s.length } };
      const chips = (list, cur, key, label = x => x, dis = () => false) => list.map(x => `<button type="button" class="chip" data-k="${key}" data-v="${x}" aria-pressed="${x === cur}" ${dis(x) ? 'disabled' : ''}>${esc(label(x))}</button>`).join('');
      const colorChips = (p, cur, key) => p.colors.map(c => swatchHtml(c, { tag: 'button', cls: 'swatch-lg' + (c === cur ? ' on' : ''), attrs: `data-k="${key}" data-v="${c}" aria-pressed="${c === cur}" ${colorInStock(p, c) ? '' : 'disabled'}` })).join('');
      mount.innerHTML = `<div class="composer">
        <div class="composer-preview" aria-live="polite"><div class="composer-photos"><figure>${visual(T, s.topColor)}<figcaption>${esc(T.name)} · ${esc(color(s.topColor).name)}</figcaption></figure><figure>${visual(B, s.bottomColor)}<figcaption>${esc(B.name)} · ${esc(color(s.bottomColor).name)}</figcaption></figure></div></div>
        <div>
          <div class="step"><h3>1. Le haut <small>${esc(T.name)} · ${euro(T.price)}</small></h3><div class="chips">${chips(TOPS.map(p => p.id), s.top, 'top', id => product(id).name)}</div></div>
          <div class="step"><h3>2. Le bas <small>${esc(B.name)} · ${euro(B.price)}</small></h3><div class="chips">${chips(BOTTOMS.map(p => p.id), s.bottom, 'bottom', id => product(id).name)}</div></div>
          ${B.cuts ? `<div class="step"><h3>3. La coupe <small>${esc(cutName(s.cut))}</small></h3><div class="chips">${chips(B.cuts, s.cut, 'cut', cutName)}</div>
            <div class="chips" style="margin-top:10px">${chips(B.lengths, s.length, 'length', l => `${lengthName(l)}`)}</div><p class="tiny muted" style="margin:8px 0 0">Petite : moins de 1,60 m · Standard : 1,60 à 1,72 m · Longue : plus de 1,72 m</p></div>` : ''}
          <div class="step"><h3>${B.cuts ? 4 : 3}. Les tailles <small><a href="#/guide-des-tailles">Guide des tailles</a> · <a href="#/essayage?top=${T.id}&bottom=${B.id}">Trouver ma taille</a></small></h3>
            <p class="small" style="margin-bottom:6px">Haut</p><div class="chips">${chips(T.sizes, s.topSize, 'topSize', x => x, x => topAv(x) <= 0)}</div>
            <p class="small" style="margin:12px 0 6px">Bas</p><div class="chips">${chips(B.sizes, s.bottomSize, 'bottomSize', x => x, x => botAv(x) <= 0)}</div></div>
          <div class="step"><h3>${B.cuts ? 5 : 4}. Les coloris <small>${esc(color(s.topColor).name)}${s.topColor !== s.bottomColor ? ' / ' + esc(color(s.bottomColor).name) : ''}</small></h3>
            <label class="check small" style="margin-bottom:10px"><input type="checkbox" data-same ${s.sameColor ? 'checked' : ''}> Même coloris pour le haut et le bas</label>
            <p class="small" style="margin-bottom:6px">Haut</p><div class="swatches">${colorChips(T, s.topColor, 'topColor')}</div>
            ${!s.sameColor ? `<p class="small" style="margin:12px 0 6px">Bas</p><div class="swatches">${colorChips(B, s.bottomColor, 'bottomColor')}</div>` : ''}</div>
          <div class="price-box" aria-live="polite">
            <div class="row"><span>${esc(T.name)} (${s.topSize})</span><span>${euro(T.price)}</span></div>
            <div class="row"><span>${esc(B.name)} (${s.bottomSize})</span><span>${euro(B.price)}</span></div>
            ${isEnsemble ? `<div class="row save"><span>Remise ensemble MOVA</span><span>−${euro(full - total)}</span></div>` : T.type === 'veste' && (B.ensembleRole || B.type) === 'pantalon' ? `<div class="row tiny muted"><span>Choisis le même coloris pour obtenir le prix ensemble à ${euro(st.ensemblePrice)}.</span></div>` : ''}
            <div class="row total"><span>Total</span><span>${isEnsemble ? `<span class="strike">${euro(full)}</span> ` : ''}${euro(total)}</span></div>
          </div>
          <button class="btn btn-dark btn-block" data-add-set ${topAv(s.topSize) <= 0 || botAv(s.bottomSize) <= 0 ? 'disabled' : ''}>${topAv(s.topSize) <= 0 || botAv(s.bottomSize) <= 0 ? 'Taille épuisée dans ce coloris' : 'Ajouter l’ensemble au panier'}</button>
        </div></div>`;
    };
    mount.addEventListener('click', e => {
      const b = e.target.closest('[data-k]');
      if (b && !b.disabled) { s[b.dataset.k] = b.dataset.v; if (b.dataset.k === 'topColor' && s.sameColor) s.bottomColor = b.dataset.v; draw(); return; }
      if (e.target.closest('[data-add-set]')) {
        addToCart({ productId: s.top, color: s.topColor, size: s.topSize }, { open: false, silent: true });
        addToCart({ productId: s.bottom, color: s.bottomColor, size: s.bottomSize, cut: s.cut || undefined, length: s.length || undefined }, { open: true, silent: true });
        toast('Ton ensemble est dans le panier.');
      }
    });
    mount.addEventListener('change', e => { if (e.target.matches('[data-same]')) { s.sameColor = e.target.checked; draw(); } });
    draw();
  };

  // ---------- Listes de produits ----------
  const PAGE_SIZE = 12;
  function listingPage({ main, title, intro, eyebrow, base, query, lockCategory, showBundles }) {
    const st = { cat: query.getAll('cat'), size: query.getAll('taille'), col: query.getAll('coloris'), cut: query.getAll('coupe'), sport: query.getAll('sport'), price: query.get('prix') || '', sort: query.get('tri') || 'nouveaute', q: query.get('q') || '', shown: PAGE_SIZE };
    const products = S.catalog.products.filter(base);
    const allCats = [...new Set(products.map(p => p.category))];
    const allSizes = [...new Set(products.flatMap(p => p.sizes))];
    const allColors = S.catalog.colors.filter(c => products.some(p => p.colors.includes(c.id)));
    const hasPants = products.some(p => p.cuts);
    const apply = () => {
      let list = products.filter(p =>
        (!st.cat.length || st.cat.includes(p.category)) &&
        (!st.size.length || p.sizes.some(s => st.size.includes(s) && Object.entries(p.availability).some(([k, v]) => k.split('|')[1] === s && v > 0))) &&
        (!st.col.length || p.colors.some(c => st.col.includes(c))) &&
        (!st.cut.length || (p.cuts && p.cuts.some(c => st.cut.includes(c)))) &&
        (!st.sport.length || p.tags.some(t => st.sport.includes(t))) &&
        (!st.price || (([a, b]) => p.price >= a && p.price <= b)(st.price.split('-').map(Number))));
      const sorters = { nouveaute: (a, b) => (b.isNew - a.isNew) || b.createdAt.localeCompare(a.createdAt), 'prix-asc': (a, b) => a.price - b.price, 'prix-desc': (a, b) => b.price - a.price, popularite: (a, b) => b.popularity - a.popularity };
      return list.sort(sorters[st.sort] || sorters.nouveaute);
    };
    const syncUrl = () => {
      const q = new URLSearchParams();
      st.cat.forEach(v => q.append('cat', v)); st.size.forEach(v => q.append('taille', v)); st.col.forEach(v => q.append('coloris', v)); st.cut.forEach(v => q.append('coupe', v)); st.sport.forEach(v => q.append('sport', v));
      if (st.price) q.set('prix', st.price); if (st.sort !== 'nouveaute') q.set('tri', st.sort); if (st.q) q.set('q', st.q);
      history.replaceState(null, '', `#${parseHash().path}${q.toString() ? '?' + q : ''}`);
    };
    const opt = (key, val, label, type = 'checkbox') => `<label class="check small"><input type="${type}" name="${key}" value="${val}" ${(Array.isArray(st[key]) ? st[key].includes(val) : st[key] === val) ? 'checked' : ''}> ${label}</label>`;
    main.innerHTML = `<div class="container">
      <header class="page-hero"><p class="eyebrow">${esc(eyebrow || 'Boutique')}</p><h1>${esc(title)}</h1>${intro ? `<p>${intro}</p>` : ''}</header>
      ${showBundles ? `<div class="grid grid-3" style="margin-bottom:40px">${S.catalog.bundles.map(bundleCard).join('')}</div>` : ''}
      <div class="listing">
        <aside class="filters" id="filters" aria-label="Filtres">
          <div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:20px;margin:0">Filtres</h2><button class="linklike small" data-reset>Tout effacer</button></div>
          ${!lockCategory && allCats.length > 1 ? `<details open><summary>Catégorie</summary><div class="opts">${allCats.map(c => opt('cat', c, esc(catName(c)))).join('')}</div></details>` : ''}
          <details open><summary>Taille</summary><div class="opts row">${allSizes.map(s => opt('size', s, s)).join('')}</div></details>
          <details open><summary>Coloris</summary><div class="opts">${allColors.map(c => opt('col', c.id, `${swatchHtml(c.id)} ${esc(c.name)}`)).join('')}</div></details>
          ${hasPants ? `<details><summary>Coupe</summary><div class="opts">${S.catalog.cuts.map(c => opt('cut', c.id, esc(c.name))).join('')}</div></details>` : ''}
          <details><summary>Prix</summary><div class="opts">${[['', 'Tous les prix'], ['0-15', 'Moins de 15 €'], ['15-30', '15 à 30 €'], ['30-50', '30 à 50 €']].map(([v, l]) => opt('price', v, l, 'radio')).join('')}</div></details>
          <details><summary>Activité</summary><div class="opts">${['pilates', 'padel', 'fitness', 'ville'].map(t => opt('sport', t, t[0].toUpperCase() + t.slice(1))).join('')}</div></details>
          <button class="btn btn-dark apply filter-toggle" data-close-filters>Voir les résultats</button>
        </aside>
        <div>
          <div class="toolbar"><div style="display:flex;gap:10px;align-items:center"><button class="btn btn-outline btn-sm filter-toggle" data-open-filters>Filtres</button><span class="small muted" id="count" aria-live="polite"></span></div>
            <label class="small">Trier par <select id="sort"><option value="nouveaute">Nouveauté</option><option value="popularite">Popularité</option><option value="prix-asc">Prix croissant</option><option value="prix-desc">Prix décroissant</option></select></label></div>
          <div class="active-filters" id="active-filters"></div>
          <div class="grid grid-3" id="results" style="margin-top:14px"></div>
          <div class="load-more" id="more"></div>
        </div></div></div>`;
    $('#sort', main).value = st.sort;
    const draw = () => {
      const list = apply();
      $('#count', main).textContent = `${list.length} produit${list.length > 1 ? 's' : ''}`;
      $('#results', main).innerHTML = list.length ? list.slice(0, st.shown).map(p => productCard(p, { color: st.col.find(c => p.colors.includes(c)) })).join('') : `<div class="empty" style="grid-column:1/-1"><p>Aucun produit ne correspond à ces filtres.</p><button class="btn btn-outline" data-reset>Effacer les filtres</button></div>`;
      $('#more', main).innerHTML = list.length > st.shown ? `<button class="btn btn-outline" data-more>Voir plus (${list.length - st.shown})</button>` : '';
      const chips = [...st.cat.map(v => ['cat', v, catName(v)]), ...st.size.map(v => ['size', v, `Taille ${v}`]), ...st.col.map(v => ['col', v, color(v).name]), ...st.cut.map(v => ['cut', v, cutName(v)]), ...st.sport.map(v => ['sport', v, v])];
      $('#active-filters', main).innerHTML = chips.map(([k, v, l]) => `<button data-rm="${k}" data-v="${v}">${esc(l)} ×</button>`).join('');
      observeReveal(main); syncUrl();
    };
    const filters = $('#filters', main);
    filters.addEventListener('change', e => {
      const i = e.target; if (!i.name) return;
      if (i.type === 'radio') st[i.name] = i.value;
      else st[i.name] = i.checked ? [...st[i.name], i.value] : st[i.name].filter(x => x !== i.value);
      st.shown = PAGE_SIZE; draw();
    });
    main.addEventListener('click', e => {
      if (e.target.closest('[data-reset]')) { Object.assign(st, { cat: [], size: [], col: [], cut: [], sport: [], price: '' }); $$('input', filters).forEach(i => i.checked = i.type === 'radio' && i.value === ''); draw(); }
      if (e.target.closest('[data-more]')) { st.shown += PAGE_SIZE; draw(); }
      const rm = e.target.closest('[data-rm]'); if (rm) { st[rm.dataset.rm] = st[rm.dataset.rm].filter(x => x !== rm.dataset.v); const inp = filters.querySelector(`input[name="${rm.dataset.rm}"][value="${rm.dataset.v}"]`); if (inp) inp.checked = false; draw(); }
      if (e.target.closest('[data-open-filters]')) filters.classList.add('open');
      if (e.target.closest('[data-close-filters]')) filters.classList.remove('open');
    });
    $('#sort', main).addEventListener('change', e => { st.sort = e.target.value; draw(); });
    draw();
  }
  M.listingPage = listingPage;

  M.route('/nouveautes', ({ main, query }) => listingPage({ main, query, title: 'Nouveautés', eyebrow: 'Boutique', intro: 'Les dernières pièces arrivées chez MOVA.', base: p => p.isNew }));
  M.route('/tenues', ({ main, query }) => listingPage({ main, query, title: 'Tenues', intro: 'Ensembles, vestes, pantalons, brassières et leggings pensés pour passer du studio à la ville.', base: p => !p.accessory, showBundles: true }));
  M.route('/accessoires', ({ main, query }) => listingPage({ main, query, title: 'Accessoires', intro: 'Les finitions qui complètent ton look, avec le logo MOVA discret.', base: p => p.accessory }));
  M.route('/collection/hiver', () => { location.replace('#/tenues'); });
  M.route('/categorie/:id', ({ main, query, params }) => {
    if (params.id === 'ensembles') return M.ensemblesPage(main);
    const cat = S.catalog.categories.find(c => c.id === params.id);
    if (!cat) return M.notFound(main);
    listingPage({ main, query, title: cat.name, eyebrow: cat.group === 'accessoires' ? 'Accessoires' : 'Tenues', base: p => p.category === cat.id, lockCategory: true });
  });
  M.route('/coloris/:id', ({ params }) => { location.replace(`#/tenues?coloris=${encodeURIComponent(params.id)}`); });
  M.route('/recherche', ({ main, query }) => {
    const q = (query.get('q') || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = q.split(/\s+/).filter(Boolean);
    listingPage({ main, query, title: `Résultats pour « ${query.get('q') || ''} »`, eyebrow: 'Recherche', base: p => { const h = [p.name, catName(p.category), p.fit, ...p.tags, ...p.colors.map(c => color(c).name)].join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return words.every(w => h.includes(w)); } });
  });
  M.ensemblesPage = main => {
    main.innerHTML = `<div class="container"><header class="page-hero"><p class="eyebrow">Tenues</p><h1>Ensembles de survêtement</h1><p>Une veste + un pantalon assortis = ${euro(S.catalog.settings.ensemblePrice)} au lieu de 90 €, même si tu prends des tailles différentes en haut et en bas.</p></header>
      <div class="lookbook">${['rose', 'marron', 'lavande', 'cremeRue'].map(k => `<figure>${photo(k, { w: 600, h: 800 })}</figure>`).join('')}</div>
      <div class="grid grid-3">${S.catalog.bundles.map(bundleCard).join('')}</div>
      <section class="section" style="padding-bottom:0"><h2>Ou compose le tien</h2><div id="composer-mount"></div></section></div>`;
    M.mountComposer($('#composer-mount', main));
  };

  // ---------- Fiche produit ----------
  function deliveryWindow() {
    const m = S.catalog.settings.shipping.methods[0];
    const add = (d, n) => { const x = new Date(d); let k = 0; while (k < n) { x.setDate(x.getDate() + 1); if (x.getDay() % 6) k++; } return x; };
    const start = new Date(); if (start.getHours() >= 13) start.setDate(start.getDate() + 1);
    const f = d => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return `Livrée entre le ${f(add(start, m.days[0]))} et le ${f(add(start, m.days[1]))}`;
  }
  function completeLook(p, c) {
    const pick = (ids) => ids.map(product).filter(x => x && x.id !== p.id).map(x => ({ p: x, c: x.colors.includes(c) && colorInStock(x, c) ? c : x.colors.find(cc => colorInStock(x, cc)) || x.colors[0] }));
    const byType = {
      pantalon: ['veste-cintree-studio', 'brassiere-sculpt', 'chaussettes-pilates', 'chouchou'], 'pantalon-wide': ['hoodie-oversize', 'veste-zippee-city', 'casquette', 'chaussettes-pilates'], hoodie: ['pantalon-wide-lisere', 'casquette', 'pince-cheveux', 'gourde'], veste: ['pantalon-survetement', 'brassiere-sculpt', 'chaussettes-pilates', 'casquette'],
      brassiere: ['legging-seconde-peau', 'veste-cintree-studio', 'chaussettes-pilates', 'chouchou'], legging: ['brassiere-sculpt', 'sweat-court', 'chaussettes-pilates', 'pince-cheveux'],
      'legging-flare': ['brassiere-croisee', 'sweat-court', 'chaussettes-pilates', 'pince-cheveux'], sweat: ['pantalon-survetement', 'brassiere-sculpt', 'casquette', 'chaussettes'],
      'sweat-court': ['legging-flare', 'brassiere-sculpt', 'pince-cheveux', 'gourde'], 'short-cycliste': ['brassiere-sculpt', 'sweat-oversize', 'casquette', 'gourde'], 'short-ample': ['brassiere-croisee', 'casquette', 'bandeau', 'gourde']
    };
    return pick(byType[p.type] || ['brassiere-sculpt', 'pantalon-survetement', 'chaussettes-pilates', 'chouchou']).slice(0, 4);
  }
  M.completeLook = completeLook;

  M.route('/produit/:id', async ({ main, params, query }) => {
    const p = product(params.id);
    if (!p) return M.notFound(main);
    const sp = S.user?.sizeProfile || {};
    const s = { color: p.colors.includes(query.get('color')) ? query.get('color') : (p.colors.find(c => colorInStock(p, c)) || p.colors[0]), cut: p.cuts ? (p.cuts.includes(query.get('cut')) ? query.get('cut') : p.cuts[0]) : undefined, length: p.lengths ? (p.lengths.includes(sp.length) ? sp.length : p.lengths.includes('standard') ? 'standard' : p.lengths[0]) : undefined, size: p.sizes.length === 1 ? p.sizes[0] : null };
    const preferred = ['pantalon', 'pantalon-wide', 'legging', 'legging-flare', 'short-cycliste', 'short-ample'].includes(p.type) ? sp.bottom : sp.top;
    let reviews = [];
    const isBottom = ['pantalon', 'pantalon-wide', 'legging', 'legging-flare', 'short-cycliste', 'short-ample'].includes(p.type);
    const draw = () => {
      const c = color(s.color);
      const photos = p.images?.[s.color] || [];
      const own = photos.length ? photos : Object.values(p.images || {}).find(a => a?.length) || [];
      const keys = MovaPhotos.PRODUCT[p.id] || [];
      const shots = own.length
        ? [...own.map(ph => `<img src="${esc(ph.src)}" alt="${esc(ph.alt)}" loading="lazy">`), `<img src="${esc(own[0].src)}" alt="Détail : ${esc(own[0].alt)}" class="zoomed" loading="lazy">`]
        : [...keys.map(k => MovaPhotos.img(k, { w: 1000, h: 1250, alt: `${p.name}, ${c.name}` })), keys[0] ? MovaPhotos.img(keys[0], { w: 1000, h: 1250, cls: 'zoomed', alt: `Détail : ${p.name}` }) : ''].filter(Boolean);
      const fitBadge = p.fit && !p.accessory ? `<span class="fit-badge">Coupe ${esc(p.fit.toLowerCase())}</span>` : '';
      const av = s.size ? availability(p, s) : null;
      const lowLabel = S.catalog.settings.lowStockLabel || 3;
      const stockLine = s.size == null ? `<span class="dot"></span>Choisis ta taille pour voir la disponibilité` : av <= 0 ? `<span class="dot out"></span>Épuisé dans cette taille` : av <= lowLabel ? `<span class="dot low"></span>Plus que ${av} en stock` : `<span class="dot"></span>En stock`;
      const fitVotes = reviews.reduce((o, r) => (o[r.fit] = (o[r.fit] || 0) + 1, o), {});
      const fitHint = reviews.length >= 3 ? (fitVotes.petit > reviews.length / 3 ? 'Les clientes trouvent que ce modèle taille un peu petit.' : fitVotes.grand > reviews.length / 3 ? 'Les clientes trouvent que ce modèle taille un peu grand.' : 'Les clientes trouvent que ce modèle taille normalement.') : '';
      const bundle = S.catalog.bundles.find(b => (b.veste === p.id || b.pantalon === p.id));
      main.innerHTML = `<div class="container">
        <nav class="small muted" aria-label="Fil d’Ariane" style="padding-top:18px"><a href="#/">Accueil</a> / <a href="#/categorie/${p.category}">${esc(catName(p.category))}</a> / ${esc(p.name)}</nav>
        <div class="pdp">
          <div class="gallery" aria-label="Photos du produit">${shots.map((sh, i) => `<div class="shot" ${i ? '' : 'id="main-shot"'}>${sh}${i ? '' : fitBadge}</div>`).join('')}</div>
          <div class="buybox">
            ${p.isNew ? '<p class="eyebrow">Nouveau</p>' : p.bestseller ? '<p class="eyebrow">Best-seller</p>' : ''}
            <h1>${esc(p.name)}</h1>
            <div class="price">${euro(p.price)}</div>
            ${p.rating?.count ? `<a class="rating" href="#avis" style="text-decoration:none">★ ${p.rating.average.toString().replace('.', ',')} · ${p.rating.count} avis vérifiés</a>` : '<span class="small muted">Pas encore d’avis</span>'}
            <div class="opt"><div class="opt-head"><span>Coloris : <b>${esc(c.name)}</b></span></div><div class="swatches" role="radiogroup" aria-label="Coloris">${p.colors.map(x => swatchHtml(x, { tag: 'button', cls: 'swatch-lg' + (x === s.color ? ' on' : ''), attrs: `role="radio" aria-checked="${x === s.color}" data-color="${x}" ${colorInStock(p, x) ? '' : 'style="--c:' + color(x).hex + ';opacity:.35"'}` })).join('')}</div></div>
            ${p.cuts ? `<div class="opt"><div class="opt-head"><span>Coupe : <b>${esc(cutName(s.cut))}</b></span></div><div class="chips">${p.cuts.map(x => `<button class="chip" data-cut="${x}" aria-pressed="${x === s.cut}">${esc(cutName(x))}</button>`).join('')}</div></div>` : ''}
            ${p.lengths ? `<div class="opt"><div class="opt-head"><span>Longueur : <b>${esc(lengthName(s.length))}</b></span><span class="muted tiny">${esc(S.catalog.lengths.find(l => l.id === s.length)?.hint || '')}</span></div><div class="chips">${p.lengths.map(x => `<button class="chip" data-length="${x}" aria-pressed="${x === s.length}">${esc(lengthName(x))}</button>`).join('')}</div></div>` : ''}
            ${p.sizes.length > 1 ? `<div class="opt"><div class="opt-head"><span>Taille${s.size ? ` : <b>${s.size}</b>` : ''}${preferred && !s.size ? ` <span class="muted tiny">(ta taille habituelle : ${esc(preferred)})</span>` : ''}</span><span><a href="#" data-guide class="small">Guide des tailles</a>${p.accessory ? '' : ` · <a class="small" href="#/essayage?${isBottom ? 'bottom' : 'top'}=${p.id}&color=${s.color}">Trouver ma taille</a>`}</span></div>
              <div class="chips">${p.sizes.map(x => { const a = availability(p, { ...s, size: x }); return `<button class="chip" data-size="${x}" aria-pressed="${x === s.size}" ${a <= 0 ? 'aria-describedby="oos"' : ''} style="${a <= 0 ? 'text-decoration:line-through;opacity:.55' : ''}">${x}</button>`; }).join('')}</div><span id="oos" class="sr-only">épuisé</span>
              ${fitHint ? `<p class="tiny muted" style="margin:8px 0 0">${fitHint}</p>` : ''}</div>` : ''}
            <p class="stock-line">${stockLine}</p>
            <div id="atc-zone">${av !== null && av <= 0 ? `<form data-alert class="inline-field"><label class="sr-only" for="alert-email">E-mail</label><input id="alert-email" type="email" name="email" placeholder="ton@email.fr" value="${esc(S.user?.email || '')}" required><button class="btn btn-dark" type="submit">Me prévenir</button></form><p class="form-msg" aria-live="polite"></p>`
              : `<div style="display:flex;gap:10px"><button class="btn btn-dark" style="flex:1" data-atc>Ajouter au panier</button><button class="icon-btn" style="border:1.5px solid var(--sand);width:48px;height:48px" data-fav="${p.id}" aria-pressed="${isFav(p.id)}" aria-label="Ajouter aux favoris"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button></div>`}</div>
            <p class="small" style="margin-top:12px">🚚 ${deliveryWindow()} · Retours gratuits sous ${S.catalog.settings.returnDays} jours</p>
            ${bundle && p.colors.includes(s.color) ? `<div class="ensemble-tip"><div><b>Ensemble à ${euro(S.catalog.settings.ensemblePrice)}</b><br><span class="small muted">${p.type === 'veste' ? 'Ajoute le pantalon assorti' : 'Ajoute la veste assortie'} en ${esc(c.name.toLowerCase())}, même dans une autre taille.</span></div><a class="btn btn-outline btn-sm" href="#/ensemble/${bundle.id}?color=${s.color}">Voir l’ensemble</a></div>` : ''}
            <details class="acc" open><summary>Description</summary><div class="acc-body"><p>${esc(p.description)}</p>${p.fit ? `<p><b>Coupe :</b> ${esc(p.fit)}</p>` : ''}<p><b>Logo :</b> ${esc(p.logo)}</p></div></details>
            <details class="acc"><summary>Composition et entretien</summary><div class="acc-body"><p>${esc(p.composition)}</p><p>${esc(p.care)}</p></div></details>
            <details class="acc"><summary>Livraison et retours</summary><div class="acc-body"><p>${S.catalog.settings.shipping.methods.map(m => `${esc(m.name)} : ${euro2(m.price)} (${m.days[0]} à ${m.days[1]} jours ouvrés)`).join('<br>')}<br>Offerte dès ${euro(S.catalog.settings.shipping.freeFrom)}.</p><p>Retours sous ${S.catalog.settings.returnDays} jours depuis ton compte. Remboursement sur le moyen de paiement d’origine.</p></div></details>
          </div></div>
        <section class="section" style="padding-bottom:0"><div class="section-head"><h2>Complète ton look</h2></div><div class="grid grid-4">${completeLook(p, s.color).map(({ p: x, c: cc }) => productCard(x, { color: cc })).join('')}</div></section>
        <section class="section" style="padding-bottom:0"><div class="section-head"><h2>Tu pourrais aussi aimer</h2></div><div class="grid grid-4">${S.catalog.products.filter(x => x.id !== p.id && (x.category === p.category || x.tags.some(t => p.tags.includes(t))) && !completeLook(p, s.color).some(cl => cl.p.id === x.id)).sort((a, b) => b.popularity - a.popularity).slice(0, 4).map(x => productCard(x)).join('')}</div></section>
        <section class="section" id="avis"><div class="section-head"><h2>Avis clientes</h2>${p.rating?.count ? `<span class="rating" style="font-size:16px">★ ${p.rating.average.toString().replace('.', ',')} / 5 · ${p.rating.count} avis</span>` : ''}</div>
          <p class="tiny muted">Avis vérifiés : seules les clientes ayant acheté ce produit sur mova peuvent publier un avis, après modération. Les avis ne sont pas rémunérés.</p>
          <div class="reviews">${reviews.length ? reviews.slice(0, 8).map(r => `<article class="review"><header><b>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} ${esc(r.title)}</b><span class="muted">${esc(r.author)} · ${new Date(r.createdAt).toLocaleDateString('fr-FR')}</span></header><p style="margin:8px 0">${esc(r.body)}</p><span class="verified">✓ Achat vérifié</span> <span class="tiny muted">· Taille ${esc(r.size)} · ${r.fit === 'petit' ? 'Taille petit' : r.fit === 'grand' ? 'Taille grand' : 'Taille normalement'}</span></article>`).join('') : '<p class="muted">Aucun avis pour le moment.</p>'}</div>
          ${S.user ? `<details class="acc" style="margin-top:18px"><summary>Laisser un avis</summary><form class="acc-body" data-review>
            <div class="field"><label for="rv-rating">Note</label><select id="rv-rating" name="rating">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n} / 5</option>`).join('')}</select></div>
            <div class="field"><label for="rv-fit">La taille</label><select id="rv-fit" name="fit"><option value="normal">Taille normalement</option><option value="petit">Taille petit</option><option value="grand">Taille grand</option></select></div>
            <div class="field"><label for="rv-title">Titre</label><input id="rv-title" name="title" maxlength="80" required></div>
            <div class="field"><label for="rv-body">Ton avis</label><textarea id="rv-body" name="body" maxlength="1500" required></textarea></div>
            <button class="btn btn-dark" type="submit">Envoyer mon avis</button><p class="form-msg" aria-live="polite"></p></form></details>` : ''}
        </section></div>
        <div class="sticky-atc"><div><b>${euro(p.price)}</b><br><span class="tiny muted">${esc(c.name)}${s.size ? ' · ' + s.size : ''}</span></div><button class="btn btn-dark" data-atc ${av !== null && av <= 0 ? 'disabled' : ''}>${av !== null && av <= 0 ? 'Épuisé' : 'Ajouter au panier'}</button></div>`;
      document.body.classList.add('has-sticky-atc');
      observeReveal(main);
    };
    main.onclick = e => {
      const t = e.target;
      const col = t.closest('[data-color]'); if (col && col.closest('.buybox')) { s.color = col.dataset.color; history.replaceState(null, '', `#/produit/${p.id}?color=${s.color}`); draw(); return; }
      const cut = t.closest('[data-cut]'); if (cut) { s.cut = cut.dataset.cut; draw(); return; }
      const len = t.closest('[data-length]'); if (len) { s.length = len.dataset.length; draw(); return; }
      const sz = t.closest('[data-size]'); if (sz) { s.size = sz.dataset.size; draw(); return; }
      if (t.closest('[data-guide]')) { e.preventDefault(); M.sizeGuideModal(p); return; }
      if (t.closest('[data-atc]')) {
        if (!s.size) { toast('Choisis d’abord ta taille.', { error: true }); $('.chips [data-size]', main)?.focus(); return; }
        if (availability(p, s) <= 0) return;
        addToCart({ productId: p.id, color: s.color, size: s.size, cut: s.cut, length: s.length });
      }
    };
    main.onsubmit = async e => {
      e.preventDefault();
      const f = e.target; const msg = f.parentElement.querySelector('.form-msg') || $('.form-msg', f);
      try {
        if (f.matches('[data-alert]')) { const r = await api('/api/restock-alerts', { method: 'POST', body: { productId: p.id, key: vkey({ color: s.color, size: s.size, cut: s.cut, length: s.length }), email: f.email.value } }); msg.className = 'form-msg ok'; msg.textContent = r.message; }
        if (f.matches('[data-review]')) { const r = await api('/api/reviews', { method: 'POST', body: { productId: p.id, rating: f.rating.value, fit: f.fit.value, title: f.title.value, body: f.body.value } }); msg.className = 'form-msg ok'; msg.textContent = r.message; f.reset(); }
      } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }
    };
    draw();
    reviews = await api(`/api/reviews/${p.id}`).catch(() => []);
    if (parseHash().path === `/produit/${p.id}`) draw();
  });

  M.route('/ensemble/:id', ({ main, params, query }) => {
    const b = S.catalog.bundles.find(x => x.id === params.id);
    if (!b) return M.notFound(main);
    const v = product(b.veste), pa = product(b.pantalon);
    main.innerHTML = `<div class="container"><header class="page-hero"><p class="eyebrow">Ensemble · ${euro(S.catalog.settings.ensemblePrice)} au lieu de ${euro(v.price + pa.price)}</p><h1>${esc(b.name)}</h1><p>${esc(b.description)} Choisis une taille différente en haut et en bas si tu veux : le prix ensemble s’applique quand même${S.catalog.settings.ensembleSameColor ? ' (même coloris)' : ''}.</p></header><div id="composer-mount"></div></div>`;
    const c = query.get('color');
    M.mountComposer($('#composer-mount', main), { top: b.veste, bottom: b.pantalon, cut: b.defaultCut, topColor: v.colors.includes(c) ? c : 'bordeaux', bottomColor: v.colors.includes(c) ? c : 'bordeaux' });
  });
  M.route('/compose', ({ main }) => {
    main.innerHTML = `<div class="container"><header class="page-hero"><p class="eyebrow">Compose ton ensemble</p><h1>Ton haut, ton bas, ta coupe</h1><p>Veste + pantalon de survêtement assortis = ${euro(S.catalog.settings.ensemblePrice)} au lieu de 90 €, même avec des tailles différentes.</p></header><div id="composer-mount"></div></div>`;
    M.mountComposer($('#composer-mount', main));
  });

  M.sizeGuideModal = function (p) {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="sg-title"><button class="icon-btn modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button><div class="modal-body">${M.sizeGuideHtml(p)}</div></div>`;
    document.body.append(back);
    const close = () => back.remove();
    back.addEventListener('click', e => { if (e.target === back || e.target.closest('.modal-close')) close(); });
    back.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    $('.modal-close', back).focus();
  };
  M.sizeGuideHtml = function (p) {
    const g = S.catalog.sizeGuide;
    return `<h2 id="sg-title">Guide des tailles${p ? ` · ${esc(p.name)}` : ''}</h2><p class="small muted">Mesures du corps en centimètres. Entre deux tailles : la plus petite pour un effet gainant, la plus grande pour plus d’aisance.</p>
      <div style="overflow-x:auto"><table class="size-table"><thead><tr><th>Taille</th><th>Tour de poitrine</th><th>Tour de taille</th><th>Tour de hanches</th></tr></thead><tbody>${Object.entries(g).map(([s, m]) => `<tr><th>${s}</th><td>${m.poitrine.join('–')}</td><td>${m.taille.join('–')}</td><td>${m.hanches.join('–')}</td></tr>`).join('')}</tbody></table></div>
      <h3 style="margin-top:20px">Longueurs (pantalons et leggings)</h3><p class="small">${S.catalog.lengths.map(l => `<b>${l.name}</b> : ${l.hint}`).join(' · ')}</p>
      <h3>Comment te mesurer</h3><ul class="small"><li><b>Poitrine</b> : à l’endroit le plus fort, mètre bien horizontal.</li><li><b>Taille</b> : au creux de la taille, au-dessus du nombril.</li><li><b>Hanches</b> : à l’endroit le plus large, pieds joints.</li></ul>
      <a class="btn btn-outline btn-sm" href="#/essayage${p ? `?${['pantalon', 'pantalon-wide', 'legging', 'legging-flare', 'short-cycliste', 'short-ample'].includes(p.type) ? 'bottom' : 'top'}=${p.id}` : ''}">Essayage virtuel : trouver ma taille</a>`;
  };

  // ---------- Panier (page) ----------
  M.route('/panier', async ({ main }) => {
    const draw = async () => {
      if (!S.cart.length) { main.innerHTML = `<div class="container section"><h1>Ton panier</h1><div class="empty"><p>Ton panier est vide.</p><a class="btn btn-dark" href="#/tenues">Découvrir la collection</a></div></div>`; return; }
      const pr = await priceCurrent();
      main.innerHTML = `<div class="container"><div class="checkout"><div><h1>Ton panier</h1>
        <div class="ship-meter">${pr.remainingForFreeShipping > 0 ? `Plus que <b>${euro2(pr.remainingForFreeShipping)}</b> pour la livraison offerte` : '<b>Livraison offerte</b>'}<div class="gauge"><i style="width:${Math.min(100, (1 - pr.remainingForFreeShipping / pr.freeShippingFrom) * 100)}%"></i></div></div>
        <div id="lines">${S.cart.map((l, i) => lineHtml(l, i)).join('')}</div>${miniRecoHtml()}</div>
        <aside class="checkout-aside"><h2 style="font-size:22px">Récapitulatif</h2>${summaryHtml(pr)}
          ${pr.stockIssues.length ? `<p class="form-msg err">${pr.stockIssues.map(esc).join('<br>')}</p>` : ''}
          <a class="btn btn-dark btn-block ${pr.stockIssues.length ? 'disabled' : ''}" href="#/commande" ${pr.stockIssues.length ? 'aria-disabled="true" onclick="return false"' : ''}>Passer commande</a>
          <div class="pay-methods" style="justify-content:center;margin-top:12px"><span>CB</span><span>Apple Pay</span><span>Google Pay</span></div>
          <p class="secure">🔒 Paiement sécurisé par Stripe. Aucune donnée bancaire n’est conservée par MOVA.</p></aside></div></div>`;
    };
    main.onclick = null;
    bindLines(main, draw); bindPromo(main, draw);
    await draw();
  });

  // ---------- Commande ----------
  const RELAYS = [['Relais Bellecour', '2 place Bellecour, 69002 Lyon'], ['Relais Part-Dieu', '17 rue du Docteur Bouchut, 69003 Lyon'], ['Relais Croix-Rousse', '8 grande rue de la Croix-Rousse, 69004 Lyon']];
  M.route('/commande', async ({ main, query }) => {
    if (!S.cart.length) { location.hash = '#/panier'; return; }
    const u = S.user;
    const addr = u?.addresses?.find(a => a.default) || u?.addresses?.[0] || store.sget('mova_checkout_addr', {});
    const st = { shippingMethod: store.sget('mova_ship', 'domicile'), email: u?.email || store.sget('mova_checkout_email', '') };
    const st2 = S.catalog.settings;
    let loyalty = null;
    if (u) loyalty = await api('/api/me/loyalty').catch(() => null);
    const gifts = loyalty?.rewards?.filter(r => r.type === 'seances' && r.status === 'disponible') || [];
    const drawAside = async () => {
      const pr = await priceCurrent({ email: st.email, shippingMethod: st.shippingMethod });
      $('#aside', main).innerHTML = `<h2 style="font-size:20px">Ta commande</h2>${S.cart.map((l, i) => lineHtml(l, i, { editable: false })).join('')}${summaryHtml(pr)}${pr.stockIssues.length ? `<p class="form-msg err">${pr.stockIssues.map(esc).join('<br>')}</p>` : ''}`;
      $('#pay-btn', main).textContent = `Commander avec obligation de paiement · ${euro2(pr.total)}`;
    };
    main.innerHTML = `<div class="container">${query.get('annule') ? '<p class="form-msg err" style="padding-top:16px">Paiement annulé. Ton panier est conservé : tu peux réessayer.</p>' : ''}<div class="checkout"><form id="checkout-form" novalidate>
      <h1>Commande</h1>
      <div class="steps-bar"><b>1. Identification</b> → <b>2. Livraison</b> → <b>3. Paiement</b></div>
      <fieldset><legend>1. Identification</legend>
        ${u ? `<p>Connectée en tant que <b>${esc(u.email)}</b>. <button type="button" class="linklike" data-logout>Ce n’est pas toi ?</button></p>` : `
        <p class="small">Déjà cliente ? <a href="#/compte?retour=commande">Connecte-toi</a> pour cumuler tes achats MOVA Club. Sinon, continue en invitée :</p>
        <div class="field"><label for="co-email">E-mail</label><input id="co-email" type="email" name="email" autocomplete="email" required value="${esc(st.email)}"></div>
        <label class="check small"><input type="checkbox" name="createAccount"> Créer mon compte après la commande (suivi, retours, MOVA Club)</label>`}
      </fieldset>
      <fieldset><legend>2. Livraison</legend>
        <div class="cols-2"><div class="field"><label for="co-fn">Prénom</label><input id="co-fn" name="firstName" autocomplete="given-name" required value="${esc(addr.firstName || u?.firstName || '')}"></div><div class="field"><label for="co-ln">Nom</label><input id="co-ln" name="lastName" autocomplete="family-name" required value="${esc(addr.lastName || u?.lastName || '')}"></div></div>
        <div class="field"><label for="co-l1">Adresse</label><input id="co-l1" name="line1" autocomplete="address-line1" required value="${esc(addr.line1 || '')}"></div>
        <div class="field"><label for="co-l2">Complément (facultatif)</label><input id="co-l2" name="line2" autocomplete="address-line2" value="${esc(addr.line2 || '')}"></div>
        <div class="cols-2"><div class="field"><label for="co-zip">Code postal</label><input id="co-zip" name="zip" inputmode="numeric" autocomplete="postal-code" pattern="\\d{5}" required value="${esc(addr.zip || '')}"></div><div class="field"><label for="co-city">Ville</label><input id="co-city" name="city" autocomplete="address-level2" required value="${esc(addr.city || '')}"></div></div>
        <div class="field"><label for="co-phone">Téléphone (pour le transporteur, facultatif)</label><input id="co-phone" name="phone" type="tel" autocomplete="tel" value="${esc(addr.phone || '')}"></div>
        <p class="small" style="margin:8px 0">Mode de livraison · France métropolitaine</p>
        ${st2.shipping.methods.map(m => `<label class="radio-card"><input type="radio" name="ship" value="${m.id}" ${st.shippingMethod === m.id ? 'checked' : ''}><span class="grow"><b>${esc(m.name)}</b><br><span class="small muted">${m.days[0]} à ${m.days[1]} jours ouvrés</span></span><span>${euro2(m.price)}<br><span class="tiny muted">offerte dès ${euro(st2.shipping.freeFrom)}</span></span></label>`).join('')}
        <div class="field" id="relay-field" ${st.shippingMethod === 'relais' ? '' : 'hidden'}><label for="co-relay">Point relais</label><select id="co-relay" name="relay">${RELAYS.map(([n, a]) => `<option>${esc(n)} — ${esc(a)}</option>`).join('')}</select></div>
      </fieldset>
      ${gifts.length ? `<fieldset><legend>Ton cadeau MOVA Club</legend>${gifts.map(g => `<label class="check"><input type="checkbox" name="gift" value="${g.id}"> Ajouter gratuitement : <b>${esc(g.label)}</b></label>`).join('')}</fieldset>` : ''}
      <fieldset><legend>3. Paiement</legend>
        <div class="pay-methods"><span>Carte bancaire</span><span>Apple Pay</span><span>Google Pay</span></div>
        <p class="small muted">${S.catalog.stripe ? 'Tu seras redirigée vers la page de paiement sécurisée Stripe.' : 'Mode démonstration : aucun paiement réel ne sera effectué.'}</p>
        <label class="check small"><input type="checkbox" name="cgv" required> J’ai lu et j’accepte les <a href="#/legal/cgv" target="_blank">conditions générales de vente</a>, dont le droit de rétractation de 14 jours.</label>
        ${u?.consents?.newsletter ? '' : `<label class="check small" style="margin-top:8px"><input type="checkbox" name="newsletter"> Je souhaite recevoir les actualités et offres MOVA par e-mail (facultatif).</label>`}
        <button class="btn btn-dark btn-block" style="margin-top:18px" id="pay-btn" type="submit">Commander avec obligation de paiement</button>
        <p class="form-msg" id="co-msg" aria-live="assertive"></p>
        <p class="secure">🔒 Paiement chiffré et traité par Stripe. MOVA ne conserve aucune donnée bancaire.</p>
      </fieldset></form>
      <aside class="checkout-aside" id="aside"></aside></div></div>`;
    const form = $('#checkout-form', main);
    form.addEventListener('change', e => {
      if (e.target.name === 'ship') { st.shippingMethod = e.target.value; store.sset('mova_ship', st.shippingMethod); $('#relay-field', main).hidden = st.shippingMethod !== 'relais'; drawAside(); }
      if (e.target.name === 'email') { st.email = e.target.value; store.sset('mova_checkout_email', st.email); drawAside(); }
    });
    $('#aside', main).addEventListener('submit', e => { if (e.target.matches('[data-promo]')) { e.preventDefault(); S.promo = e.target.code.value.trim().toUpperCase(); store.set('mova_promo', S.promo); drawAside(); } });
    form.addEventListener('click', async e => { if (e.target.closest('[data-logout]')) { await api('/api/auth/logout', { method: 'POST' }); S.user = null; render(); } });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('#co-msg', main); msg.className = 'form-msg'; msg.textContent = '';
      const invalid = $$('input[required]', form).find(i => !i.checkValidity());
      if (invalid) { invalid.focus(); msg.className = 'form-msg err'; msg.textContent = invalid.type === 'checkbox' ? 'Merci d’accepter les conditions générales de vente.' : `Vérifie le champ « ${invalid.labels?.[0]?.textContent || invalid.name} ».`; return; }
      const f = Object.fromEntries(new FormData(form));
      const address = { firstName: f.firstName, lastName: f.lastName, line1: f.line1, line2: f.line2, zip: f.zip, city: f.city, phone: f.phone, relay: st.shippingMethod === 'relais' ? f.relay : '' };
      store.sset('mova_checkout_addr', address);
      const btn = $('#pay-btn', main); btn.disabled = true; btn.textContent = 'Préparation du paiement…';
      try {
        const r = await api('/api/checkout', { method: 'POST', body: { items: S.cart, promoCode: S.promo || undefined, email: u?.email || f.email, address, shippingMethod: st.shippingMethod, acceptCgv: !!f.cgv, newsletter: !!f.newsletter, createAccount: !!f.createAccount, giftRewardId: f.gift || undefined, source: store.sget('mova_source', 'direct') } });
        store.sset('mova_pending_order', r.orderId);
        location.href = r.redirect;
      } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; btn.disabled = false; drawAside(); }
    });
    drawAside();
  });

  M.route('/paiement-demo/:id', ({ main, params, query }) => {
    const t = query.get('t');
    main.innerHTML = `<div class="container"><div class="demo-pay"><p class="demo-flag">Mode démonstration</p><h1 style="font-size:28px;margin-top:12px">Paiement</h1>
      <p class="small muted">Aucune clé Stripe n’est configurée : ce paiement est simulé, aucun débit n’a lieu. Une fois Stripe configuré, cette étape est remplacée par la page de paiement sécurisée Stripe (carte, Apple Pay, Google Pay).</p>
      <button class="paybtn apple" data-pay="apple_pay"> Pay (simulation)</button><button class="paybtn google" data-pay="google_pay">G Pay (simulation)</button><button class="paybtn card" data-pay="card">Payer par carte (simulation)</button>
      <button class="linklike small muted" data-pay="refuse">Simuler un paiement refusé</button><p class="form-msg" aria-live="assertive"></p></div></div>`;
    main.onclick = async e => {
      const b = e.target.closest('[data-pay]'); if (!b) return;
      const msg = $('.form-msg', main);
      $$('[data-pay]', main).forEach(x => x.disabled = true);
      try {
        const r = await api('/api/checkout/demo-pay', { method: 'POST', body: { orderId: params.id, t, method: b.dataset.pay, outcome: b.dataset.pay === 'refuse' ? 'refuse' : 'ok' } });
        if (!r.ok) { msg.className = 'form-msg err'; msg.innerHTML = `${esc(r.error)} <a href="#/commande">Revenir à la commande</a>`; $$('[data-pay]', main).forEach(x => x.disabled = false); return; }
        location.hash = `#/confirmation/${params.id}?t=${encodeURIComponent(t)}`;
      } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; $$('[data-pay]', main).forEach(x => x.disabled = false); }
    };
  });

  M.route('/confirmation/:id', async ({ main, params, query }) => {
    main.innerHTML = '<div class="container section"><p>Vérification du paiement…</p></div>';
    const o = await api(`/api/orders/${params.id}?t=${encodeURIComponent(query.get('t') || '')}${query.get('session_id') ? `&session_id=${encodeURIComponent(query.get('session_id'))}` : ''}`);
    const paid = !['pending_payment', 'expired'].includes(o.status);
    if (paid && store.sget('mova_pending_order') === o.id) { S.cart = []; S.promo = ''; store.set('mova_promo', ''); saveCart(); store.sset('mova_pending_order', null); }
    const f = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    main.innerHTML = `<div class="container" style="max-width:820px;padding:48px 0 80px">
      ${paid ? `<p class="eyebrow">Commande ${esc(o.number)}</p><h1>Merci, ta commande est confirmée</h1><p>Un e-mail récapitulatif a été envoyé à <b>${esc(o.email)}</b>. Livraison estimée entre le ${f(o.estimatedDelivery.from)} et le ${f(o.estimatedDelivery.to)}.</p>`
        : `<h1>Paiement en attente</h1><p>Nous n’avons pas encore reçu la confirmation de paiement. Si tu as payé, rafraîchis cette page dans quelques secondes.</p>`}
      <div class="panel">${o.lines.map(l => `<div class="order-row"><div><b>${esc(l.name)}</b><div class="small muted">${esc(color(l.color)?.name || '')} · ${esc(l.size)}${l.cut ? ' · ' + esc(cutName(l.cut)) : ''}${l.length ? ' · ' + esc(lengthName(l.length)) : ''} · ×${l.qty}</div></div><span>${l.gift ? 'Offert' : euro2(l.unitPrice * l.qty)}</span></div>`).join('')}
        <div class="summary">${o.ensemble?.amount ? `<div class="row save"><span>Remise ensemble</span><span>−${euro2(o.ensemble.amount)}</span></div>` : ''}${o.promo ? `<div class="row save"><span>Code ${esc(o.promo.code)}</span><span>−${euro2(o.promoDiscount)}</span></div>` : ''}<div class="row"><span>Livraison</span><span>${o.shipping ? euro2(o.shipping) : 'Offerte'}</span></div><div class="row total"><span>Total payé</span><span>${euro2(o.total)}</span></div></div></div>
      ${paid && o.canCreateAccount ? `<div class="panel"><h2>Crée ton compte en 10 secondes</h2><p class="small">Suis ta commande, fais tes retours en ligne et rejoins MOVA Club : cette commande comptera pour ta première récompense.</p>
        <form id="post-register"><div class="cols-2"><div class="field"><label for="pr-fn">Prénom</label><input id="pr-fn" name="firstName" required value="${esc(o.address.firstName)}"></div><div class="field"><label for="pr-ln">Nom</label><input id="pr-ln" name="lastName" required value="${esc(o.address.lastName)}"></div></div>
        <div class="field"><label for="pr-pw">Mot de passe (10 caractères minimum)</label><input id="pr-pw" type="password" name="password" minlength="10" autocomplete="new-password" required></div>
        <label class="check small"><input type="checkbox" name="joinClub" checked> Rejoindre MOVA Club (gratuit) et accepter son <a href="#/mova-club#reglement" target="_blank">règlement</a></label>
        <button class="btn btn-dark" style="margin-top:12px" type="submit">Créer mon compte</button><p class="form-msg" aria-live="polite"></p></form></div>` : ''}
      <a class="btn btn-outline" href="#/">Continuer mes achats</a> ${S.user ? '<a class="btn btn-dark" href="#/compte/commandes">Suivre ma commande</a>' : ''}</div>`;
    const pf = $('#post-register', main);
    if (pf) pf.addEventListener('submit', async e => {
      e.preventDefault(); const fd = Object.fromEntries(new FormData(pf)); const msg = $('.form-msg', pf);
      try { const r = await api('/api/auth/register', { method: 'POST', body: { email: o.email, ...fd, joinClub: !!fd.joinClub, favorites: S.favs } }); S.user = r.user; msg.className = 'form-msg ok'; msg.innerHTML = 'Compte créé ! Ta commande y est rattachée. <a href="#/compte/fidelite">Voir mon espace fidélité</a>'; }
      catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; }
    });
  });

  M.notFound = main => { main.innerHTML = `<div class="container section" style="text-align:center"><p class="eyebrow">Erreur 404</p><h1>Cette page a pris un autre rythme</h1><p>Elle n’existe pas ou plus.</p><a class="btn btn-dark" href="#/">Retour à l’accueil</a><div class="grid grid-4" style="margin-top:48px;text-align:left">${S.catalog.products.filter(p => p.bestseller).slice(0, 4).map(p => productCard(p)).join('')}</div></div>`; };
  M.route('/404', ({ main }) => M.notFound(main));

  // ---------- Recherche ----------
  function setupSearch() {
    const ov = $('#search-overlay'), input = $('#search-input'), out = $('#search-results');
    const open = () => { ov.hidden = false; document.body.style.overflow = 'hidden'; input.focus(); if (!input.value) suggestDefault(); };
    const close = () => { ov.hidden = true; document.body.style.overflow = ''; };
    const suggestDefault = () => { out.innerHTML = `<h3>Recherches populaires</h3>${['pantalon évasé', 'brassière', 'bordeaux', 'chaussettes pilates', 'ensemble'].map(t => `<a class="sr-row" href="#/recherche?q=${encodeURIComponent(t)}" style="grid-template-columns:1fr"><span>${t}</span></a>`).join('')}`; };
    const run = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) return suggestDefault();
      const r = await api(`/api/search?q=${encodeURIComponent(q)}`).catch(() => null); if (!r) return;
      out.innerHTML = (r.products.length ? `<h3>Produits</h3>${r.products.map(p => `<a class="sr-row" href="#/produit/${p.id}"><span class="thumb">${visual(product(p.id), p.color)}</span><span>${esc(p.name)}</span><b>${euro(p.price)}</b></a>`).join('')}` : '')
        + (r.categories.length ? `<h3>Catégories</h3>${r.categories.map(c => `<a class="sr-row" style="grid-template-columns:1fr" href="#/categorie/${c.id}">${esc(c.name)}</a>`).join('')}` : '')
        + (r.colors.length ? `<h3>Coloris</h3>${r.colors.map(c => `<a class="sr-row" style="grid-template-columns:28px 1fr" href="#/tenues?coloris=${c.id}">${swatchHtml(c.id)}<span>${esc(c.name)}</span></a>`).join('')}` : '')
        + (!r.products.length && !r.categories.length && !r.colors.length ? `<p class="muted">Aucun résultat pour « ${esc(q)} ». Essaie « legging », « veste » ou un coloris.</p>` : `<p style="margin-top:16px"><a href="#/recherche?q=${encodeURIComponent(q)}">Voir tous les résultats</a></p>`);
    }, 160);
    $('#search-btn').addEventListener('click', open);
    $('#search-close').addEventListener('click', close);
    input.addEventListener('input', run);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && input.value.trim()) { location.hash = `#/recherche?q=${encodeURIComponent(input.value.trim())}`; close(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); $('.sr-row', out)?.focus(); }
    });
    out.addEventListener('keydown', e => { const rows = $$('.sr-row', out); const i = rows.indexOf(document.activeElement); if (e.key === 'ArrowDown') { e.preventDefault(); rows[i + 1]?.focus(); } if (e.key === 'ArrowUp') { e.preventDefault(); (rows[i - 1] || input).focus(); } });
    out.addEventListener('click', e => { if (e.target.closest('a')) close(); });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.addEventListener('keydown', e => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); open(); } });
  }

  // ---------- Newsletter, pop-up -5 %, cookies ----------
  async function subscribe(form) {
    const msg = $('.form-msg', form);
    const fd = new FormData(form);
    try {
      const r = await api('/api/newsletter', { method: 'POST', body: { email: fd.get('email'), consent: !!fd.get('consent'), source: form.dataset.newsletter } });
      store.set('mova_nl_done', true);
      if (form.id === 'welcome-form') {
        form.hidden = true;
        $('#welcome-success').hidden = false;
        $('#welcome-success').innerHTML = r.code ? `<p>Ton code, aussi envoyé par e-mail :</p><div class="code-box">${esc(r.code)}</div><p class="small muted">-${r.percent} % sur ta première commande, valable ${r.validityDays} jours. Il s’appliquera automatiquement à ton panier.</p><button class="btn btn-dark btn-block" data-close-welcome>Je découvre la collection</button>` : `<p>${esc(r.message || 'Merci, tu es inscrite !')}</p>`;
        if (r.code) { S.promo = r.code; store.set('mova_promo', r.code); }
        return;
      }
      msg.className = 'form-msg ok';
      msg.innerHTML = r.code ? `Merci ! Ton code -${r.percent} % : <b>${esc(r.code)}</b> (aussi envoyé par e-mail).` : esc(r.message || 'Merci, tu es inscrite !');
      if (r.code) { S.promo = r.code; store.set('mova_promo', r.code); }
      form.reset();
    } catch (e) { msg.className = 'form-msg err'; msg.textContent = e.message; }
  }
  document.addEventListener('submit', e => { if (e.target.matches('[data-newsletter]')) { e.preventDefault(); subscribe(e.target); } });

  function setupWelcome() {
    const w = S.catalog.settings.welcome;
    $('#welcome-percent').textContent = `-${w.percent} %`;
    $('#welcome-terms').textContent = `Code à usage unique, valable ${w.validityDays} jours sur ta première commande, non cumulable avec un autre code. Données traitées selon notre politique de confidentialité.`;
    const modal = $('#welcome');
    const eligible = () => {
      if (S.user || store.get('mova_nl_done', false) || store.sget('mova_popup_seen', false)) return false;
      const dismissed = store.get('mova_popup_dismissed', 0);
      if (dismissed && Date.now() - dismissed < w.cooldownDays * 864e5) return false;
      if (!store.get('mova_consent', null)) return false; // jamais avant le choix cookies
      return !/^\/(commande|paiement|confirmation|compte)/.test(parseHash().path);
    };
    let shown = false;
    const show = () => {
      if (shown || !eligible()) return;
      shown = true; store.sset('mova_popup_seen', true);
      $('#welcome-art').innerHTML = photo('roseAccroupie', { w: 600, h: 800 });
      modal.hidden = false; document.body.style.overflow = 'hidden';
      setTimeout(() => $('#welcome-email').focus(), 50);
    };
    const close = () => { modal.hidden = true; document.body.style.overflow = ''; if (!store.get('mova_nl_done', false)) store.set('mova_popup_dismissed', Date.now()); };
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close-welcome]')) { close(); if (e.target.closest('#welcome-success')) location.hash = '#/tenues'; } });
    modal.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { const f = $$('button, input, a', modal).filter(x => !x.closest('[hidden]') && x.offsetParent); if (!f.length) return; const first = f[0], last = f.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
    const arm = () => {
      setTimeout(show, w.popupDelaySeconds * 1000);
      const onScroll = () => { const pct = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight) * 100; if (pct >= w.popupScrollPercent) { show(); removeEventListener('scroll', onScroll); } };
      addEventListener('scroll', onScroll, { passive: true });
    };
    M.armWelcome = arm;
    if (store.get('mova_consent', null)) arm();
  }

  function setupCookies() {
    const banner = $('#cookie-banner');
    const c = store.get('mova_consent', null);
    const expired = c && Date.now() - c.at > 182 * 864e5;
    const decide = (analytics, marketing) => {
      store.set('mova_consent', { analytics, marketing, at: Date.now() });
      banner.hidden = true;
      M.armWelcome?.();
    };
    if (!c || expired) banner.hidden = false;
    $('#cookie-accept').onclick = () => decide(true, true);
    $('#cookie-refuse').onclick = () => decide(false, false);
    $('#cookie-custom').onclick = () => {
      const d = $('#cookie-details');
      if (d.hidden) { d.hidden = false; $('#cookie-custom').textContent = 'Enregistrer mes choix'; const cur = store.get('mova_consent', {}); $('#ck-analytics').checked = !!cur?.analytics; $('#ck-marketing').checked = !!cur?.marketing; }
      else decide($('#ck-analytics').checked, $('#ck-marketing').checked);
    };
    $('#cookie-settings').onclick = () => { banner.hidden = false; $('#cookie-details').hidden = true; $('#cookie-custom').textContent = 'Personnaliser'; };
  }

  // ---------- Démarrage ----------
  async function boot() {
    $('#year').textContent = new Date().getFullYear();
    paintLogos();
    const ref = document.referrer;
    const src = ['instagram', 'tiktok', 'google'].find(s => ref.includes(s)) || new URLSearchParams(location.search).get('utm_source');
    if (src) store.sset('mova_source', src);
    try {
      const [catalog, me] = await Promise.all([api('/api/catalog'), api('/api/me')]);
      S.catalog = catalog; window.MOVA_COLORS = catalog.colors;
      S.user = me.user;
      if (S.user) { S.favs = [...new Set([...S.favs, ...(S.user.favorites || [])])]; store.set('mova_favs', S.favs); if (S.favs.length !== S.user.favorites.length) api('/api/me', { method: 'PUT', body: { favorites: S.favs } }).catch(() => { }); }
    } catch (e) {
      $('#main').innerHTML = `<div class="container section"><h1>Connexion impossible</h1><p>Le serveur MOVA ne répond pas. Réessaie dans un instant.</p></div>`;
      return;
    }
    // Nettoie le panier des produits disparus.
    S.cart = S.cart.filter(i => product(i.productId));
    buildNav(); updateBadges(); setupSearch(); setupCookies(); setupWelcome();
    $('#cart-btn').addEventListener('click', openDrawer);
    $('#drawer-backdrop').addEventListener('click', closeDrawer);
    $('#cart-drawer').addEventListener('click', e => { if (e.target.closest('[data-close-drawer]')) closeDrawer(); });
    $('#cart-drawer').addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
    bindLines($('#cart-drawer-body'), renderDrawer); bindPromo($('#cart-drawer-body'), renderDrawer);
    addEventListener('scroll', () => $('#header').classList.toggle('scrolled', scrollY > 10), { passive: true });
    addEventListener('hashchange', render);
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    if (q.get('newsletter') === 'confirmee') toast('Inscription confirmée, merci !');
    if (q.get('newsletter') === 'desinscrite') toast('Tu es désinscrite de la newsletter.');
    render();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();

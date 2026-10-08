// Photothèque MOVA : uniquement des photos réelles.
// - Photos produits MOVA : public/assets/img/produits (fournies par MOVA).
// - Photos d'ambiance : Unsplash (licence Unsplash, usage commercial gratuit), affichées depuis leur source.
(function () {
  'use strict';
  // clé : [identifiant Unsplash, texte alternatif, photographe, compte Unsplash]
  const LIB = {
    jaune: ['photo-1515886657613-9f3515b0c78f', 'Femme en ensemble de survêtement jaune', 'Dom Hill', 'domjewel'],
    rose: ['photo-1722507390029-e9758e1f11f2', 'Femme en ensemble de survêtement rose', 'Deny Hill', 'deny_hill'],
    roseAccroupie: ['photo-1722507389991-5147c8ad2050', 'Femme accroupie en ensemble de survêtement rose', 'Deny Hill', 'deny_hill'],
    creme: ['photo-1685464583529-7f527c50e22f', 'Femme en ensemble de survêtement crème', 'Navid Sohrabi', 'navidsohrabi'],
    cremeRue: ['photo-1685464583257-66f61ea61380', 'Femme en ensemble crème dans la rue', 'Navid Sohrabi', 'navidsohrabi'],
    marron: ['photo-1610892923471-d8efa48225d0', 'Femme en ensemble de survêtement marron en ville', 'Khalid Boutchich', 'khalidboutchich'],
    lavande: ['photo-1689701252584-a1f25051fa59', 'Femme en ensemble de survêtement lavande', 'Ben Iwara', '1hundredimages'],
    braRose: ['photo-1606902965551-dce093cda6e7', 'Femme en brassière et legging assortis', 'Julia Rekamie', 'juliarekamie'],
    braDos: ['photo-1604603565810-9f2a167d6b6e', 'Brassière rose vue de dos', 'Jacob Bentzinger', 'jacobbentzinger'],
    braReformer: ['photo-1717500251716-27057c48ace4', 'Femme en brassière sur un reformer de Pilates', 'Ahmet Kurt', 'ahmetkurt'],
    leggingOlive: ['photo-1713201435382-bb915a39be16', 'Femme en brassière et legging vert olive', 'Look Studio', 'lookphoto'],
    leggingStudio: ['photo-1713201679128-38da5657f611', 'Femme en legging dans une posture de yoga', 'Look Studio', 'lookphoto'],
    leggingFenetre: ['photo-1713201507895-1f90510984e8', 'Femme en legging devant une fenêtre', 'Look Studio', 'lookphoto'],
    shortNoir: ['photo-1685811982522-46383318bc8d', 'Femme en brassière et short cycliste noirs', 'SoyBreno', 'soybrenofotografia'],
    shortCreme: ['photo-1628271491650-c2346e8aa7c5', 'Femme en débardeur et short crème', 'semen zhuravlev', 'sezha72'],
    shortVille: ['photo-1634276702982-3ba828ac4b7a', 'Femme en brassière et short en ville', 'Venti Views', 'ventiviews'],
    sweatRose: ['photo-1636373679006-19e2caed9743', 'Femme en sweat rose', 'mehrab zahedbeigi', 'estoymhrb'],
    sweatLavande: ['photo-1781935673753-c2b245af6614', 'Femme en sweat bleu lavande', 'maks_d', 'maks_d'],
    sweatRoseRue: ['photo-1742749649070-1e54de0ea988', 'Femme en sweat dans une rue', 'Asal Mshk', 'asalmashkoori'],
    studioPilates: ['photo-1717500252297-b09508db7ceb', 'Studio de Pilates avec reformers', 'Ahmet Kurt', 'ahmetkurt'],
    reformer: ['photo-1717500252615-56256c6261d8', 'Femme sur un reformer de Pilates', 'Ahmet Kurt', 'ahmetkurt'],
    reformerArche: ['photo-1747238415033-b74eec07eb59', 'Exercice de Pilates sur reformer', 'ROXANA POPOVICI', 'roxanarxx'],
    coursMat: ['photo-1763403921315-f2ef8697199f', 'Cours collectif sur tapis', 'Jan Suchánek', 'johnny_slav'],
    padelTerrain: ['photo-1709587825415-814c2d7cfce7', 'Terrain de padel', 'Bruno Vaccaro Vercellino', 'vaccarovercellino'],
    padelBalle: ['photo-1541744573515-478c959628a0', 'Balle sur un court', 'Mario Gogh', 'mariogogh'],
    salleFitness: ['photo-1708011108850-49646bd34503', 'Femme dans une salle de fitness', 'Daniel Azmanov', 'dazmanov'],
    cafe: ['photo-1542033474370-d28774f3338d', 'Femme en sweat avec un café', 'Hunter Newton', 'r7studios'],
    cafeFenetre: ['photo-1540804485132-9c94bcae6c66', 'Femme avec un café dans sa cuisine', 'Ksu Fuchs', 'ksu__fuchs18'],
    ville: ['photo-1752079437025-b4d98f83b22e', 'Femme marchant sous une arche en ville', 'Konrad Nowacki', 'knowacki'],
    villeRue: ['photo-1558573768-5a2ef48319d7', 'Femme dans une rue', 'Garin Chadwick', 'garinchadwick'],
    maison: ['photo-1688548481662-f2a6837f06e2', 'Femme qui s’étire le matin', 'Marea Wellness', 'mareawellness'],
    soir: ['photo-1760625525384-f31c1c573129', 'Femme en ville le soir', 'Julio Lopez', 'juliolopez'],
    chouchou: ['photo-1630081757603-a46d414be089', 'Chouchous en tissu', 'John Carlo Tubelleza', 'jctubelleza'],
    bandeau: ['photo-1609175215545-3b41b17d9e1e', 'Femme portant un bandeau', 'Cheyenne Doig', 'cheyennedoig'],
    chaussettes: ['photo-1615486364462-ef6363adbc18', 'Chaussettes', 'Mockup Graphics', 'mockupgraphics']
  };

  // Photos des produits qui n'ont pas encore leur propre photo MOVA : [principale, secondaire].
  const PRODUCT = {
    'veste-cintree-studio': ['creme', 'cremeRue'], 'veste-zippee-city': ['marron', 'lavande'], 'pantalon-survetement': ['rose', 'roseAccroupie'],
    'hoodie-oversize': ['lavande', 'jaune'], 'brassiere-sculpt': ['braRose', 'braReformer'], 'brassiere-croisee': ['braDos', 'reformer'],
    'legging-seconde-peau': ['leggingOlive', 'leggingFenetre'], 'legging-flare': ['leggingStudio', 'leggingFenetre'], 'sweat-oversize': ['sweatRose', 'cafe'],
    'sweat-court': ['sweatRoseRue', 'sweatLavande'], 'short-cycliste': ['shortNoir', 'shortVille'], 'short-ample': ['shortCreme', 'shortVille'],
    chouchou: ['chouchou'], bandeau: ['bandeau'], chaussettes: ['chaussettes']
  };
  const BUNDLE = { 'ensemble-studio': 'creme', 'ensemble-city': 'marron', 'ensemble-wide': null };
  const ACTIVITY = { pilates: ['studioPilates', 'reformerArche', 'reformer'], padel: ['padelTerrain', 'padelBalle'], fitness: ['salleFitness', 'coursMat'] };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const src = (key, w = 900, h = 1200) => `https://images.unsplash.com/${LIB[key][0]}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;
  function img(key, { w = 900, h = 1200, cls = '', eager = false, alt } = {}) {
    if (!LIB[key]) return '';
    return `<img src="${src(key, w, h)}" alt="${esc(alt || LIB[key][1])}" ${eager ? '' : 'loading="lazy"'} class="${cls}" style="width:100%;height:100%;object-fit:cover">`;
  }
  const credits = () => {
    const seen = new Map();
    for (const [, , name, user] of Object.values(LIB)) if (!seen.has(user)) seen.set(user, name);
    return [...seen].map(([user, name]) => ({ user, name }));
  };
  window.MovaPhotos = { LIB, PRODUCT, BUNDLE, ACTIVITY, img, src, credits };
})();

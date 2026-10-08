// Catalogue de référence MOVA — collection hiver.
// Prix fictifs (cahier des charges §11.1), modifiables ensuite dans le back-office.

const COLORS = [
  { id: 'bordeaux', name: 'Bordeaux', hex: '#6D1A2B' },
  { id: 'olive', name: 'Vert olive', hex: '#6B6B3A' },
  { id: 'majorelle', name: 'Bleu Majorelle', hex: '#3B4FC4' },
  { id: 'orange', name: 'Orange', hex: '#E0702F' },
  { id: 'jaune', name: 'Jaune clair', hex: '#F2E3A0', light: true },
  { id: 'rose', name: 'Rose clair', hex: '#F1C9CF', light: true },
  { id: 'leopard', name: 'Léopard', hex: '#C8955A', pattern: true },
  { id: 'noir', name: 'Noir', hex: '#151515' },
  // Coloris complémentaires (pièces photographiées, hors nuancier des 8 coloris de la collection hiver).
  { id: 'moka', name: 'Moka', hex: '#8B7465', extra: true },
  { id: 'chocolat', name: 'Chocolat', hex: '#5A3A26', extra: true },
  { id: 'ecaille', name: 'Écaille', hex: '#7A3E12', extra: true },
  { id: 'creme', name: 'Crème à pois', hex: '#EFE6D6', light: true, extra: true }
];
const ALL = COLORS.filter(c => !c.extra).map(c => c.id);
const P = '/assets/img/produits/';
const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
const SOCK_SIZES = ['35-38', '39-42'];
const TU = ['TU'];

const CUTS = [
  { id: 'droite', name: 'Droite' },
  { id: 'evasee', name: 'Évasée' },
  { id: 'jogging', name: 'Jogging ample' },
  { id: 'ajustee', name: 'Ajustée' }
];
const LENGTHS = [
  { id: 'petite', name: 'Petite', hint: 'moins de 1,60 m' },
  { id: 'standard', name: 'Standard', hint: '1,60 m à 1,72 m' },
  { id: 'longue', name: 'Longue', hint: 'plus de 1,72 m' }
];

const CATEGORIES = [
  { id: 'ensembles', name: 'Ensembles de survêtement', group: 'tenues' },
  { id: 'vestes', name: 'Vestes', group: 'tenues' },
  { id: 'pantalons', name: 'Bas de survêtement', group: 'tenues' },
  { id: 'sweats', name: 'Sweats', group: 'tenues' },
  { id: 'brassieres', name: 'Brassières', group: 'tenues' },
  { id: 'leggings', name: 'Leggings', group: 'tenues' },
  { id: 'shorts', name: 'Shorts', group: 'tenues' },
  { id: 'casquettes', name: 'Casquettes', group: 'accessoires' },
  { id: 'pinces', name: 'Pinces à cheveux', group: 'accessoires' },
  { id: 'chouchous', name: 'Chouchous', group: 'accessoires' },
  { id: 'bandeaux', name: 'Bandeaux', group: 'accessoires' },
  { id: 'chaussettes', name: 'Chaussettes', group: 'accessoires' },
  { id: 'chaussettes-pilates', name: 'Chaussettes antidérapantes de Pilates', group: 'accessoires' },
  { id: 'gourdes', name: 'Gourdes', group: 'accessoires' }
];

const KNIT = '72 % polyamide recyclé, 28 % élasthanne. Maille côtelée douce, opaque, séchage rapide.';
const FLEECE = '80 % coton biologique, 20 % polyester recyclé. Molleton gratté à l’intérieur, 320 g/m².';
const CARE_SPORT = 'Lavage en machine à 30 °C, à l’envers. Pas d’adoucissant ni de sèche-linge. Repassage interdit sur le logo.';
const CARE_FLEECE = 'Lavage en machine à 30 °C, à l’envers. Séchage à plat. Repassage doux sur l’envers.';

const PRODUCTS = [
  {
    id: 'veste-cintree-studio', name: 'Veste cintrée Studio', category: 'vestes', type: 'veste', price: 40,
    colors: ALL, sizes: SIZES, ensembleGroup: 'ensemble', fit: 'Cintrée',
    tags: ['pilates', 'ville', 'fitness'], bestseller: true, isNew: true, popularity: 96,
    description: 'Veste zippée près du corps, col montant et poignets pouces. Elle suit tes mouvements au studio et structure ta silhouette en ville.',
    composition: KNIT, care: CARE_SPORT, logo: 'Symbole MOVA brodé ton sur ton sur le cœur.'
  },
  {
    id: 'veste-zippee-city', name: 'Veste zippée City oversize', category: 'vestes', type: 'veste', price: 40,
    colors: ['noir', 'bordeaux', 'olive', 'majorelle', 'leopard', 'rose'], sizes: SIZES, ensembleGroup: 'ensemble', fit: 'Oversize',
    tags: ['ville', 'padel'], bestseller: false, isNew: true, popularity: 81,
    description: 'Coupe ample et épaules tombantes, molleton doux. La pièce cocon pour l’après-séance et les journées en ville.',
    composition: FLEECE, care: CARE_FLEECE, logo: 'Wordmark MOVA imprimé dans le dos, sous le col.'
  },
  {
    id: 'pantalon-survetement', name: 'Pantalon de survêtement MOVA', category: 'pantalons', type: 'pantalon', price: 50,
    colors: ALL, sizes: SIZES, cuts: ['droite', 'evasee', 'jogging', 'ajustee'], lengths: ['petite', 'standard', 'longue'],
    ensembleGroup: 'ensemble', fit: '4 coupes au choix', tags: ['pilates', 'ville', 'fitness', 'padel'], bestseller: true, isNew: true, popularity: 99,
    description: 'Taille haute gainante, ceinture plate sans cordon apparent. Choisis ta coupe — droite, évasée, jogging ample ou ajustée — et ta longueur.',
    composition: KNIT, care: CARE_SPORT, logo: 'Symbole MOVA brodé sur la hanche gauche.'
  },
  {
    id: 'pantalon-wide-lisere', name: 'Pantalon wide à liseré', category: 'pantalons', type: 'pantalon-wide', ensembleRole: 'pantalon', price: 50,
    colors: ['moka', 'noir', 'bordeaux', 'olive'], sizes: SIZES, lengths: ['standard', 'longue'], ensembleGroup: 'ensemble', fit: 'Wide',
    tags: ['ville', 'pilates'], bestseller: true, isNew: true, popularity: 97,
    description: 'Jambe large qui tombe droit jusqu\u2019au sol, double ceinture côtelée avec liseré blanc et passepoils contrastés sur le devant. Poche plaquée au dos.',
    composition: FLEECE, care: CARE_FLEECE, logo: 'Symbole MOVA imprimé ton crème sur la cuisse et brodé sur la ceinture au dos.',
    photos: { moka: [{ src: P + 'pantalon-wide-moka-face.jpg', alt: 'Pantalon wide à liseré moka, porté de face' }, { src: P + 'pantalon-wide-moka-dos.jpg', alt: 'Pantalon wide à liseré moka, vue de dos avec poche plaquée' }] }
  },
  {
    id: 'hoodie-oversize', name: 'Sweat à capuche oversize', category: 'sweats', type: 'hoodie', price: 40,
    colors: ['leopard', 'noir', 'moka', 'bordeaux', 'olive'], sizes: SIZES, fit: 'Oversize', tags: ['ville'], isNew: true, popularity: 89,
    description: 'Capuche doublée, manches bouffantes resserrées aux poignets, bas élastiqué qui blouse sur la taille. À porter avec le pantalon wide assorti.',
    composition: FLEECE, care: CARE_FLEECE, logo: 'Wordmark MOVA brodé sur la poitrine, symbole sur la manche.'
  },
  {
    id: 'brassiere-sculpt', name: 'Brassière Sculpt', category: 'brassieres', type: 'brassiere', price: 25,
    colors: ALL, sizes: SIZES, fit: 'Maintien moyen', tags: ['pilates', 'fitness'], bestseller: true, popularity: 94,
    description: 'Dos nageur, double épaisseur et coussinets amovibles. Maintien moyen pensé pour le Pilates, le yoga et le renforcement.',
    composition: KNIT, care: CARE_SPORT, logo: 'Wordmark MOVA tissé sur la bande élastique.'
  },
  {
    id: 'brassiere-croisee', name: 'Brassière dos croisé', category: 'brassieres', type: 'brassiere', price: 25,
    colors: ['noir', 'bordeaux', 'rose', 'jaune', 'majorelle'], sizes: SIZES, fit: 'Maintien léger', tags: ['pilates', 'ville'], popularity: 77,
    description: 'Bretelles fines croisées dans le dos, décolleté carré. Assez jolie pour se porter sous une veste ouverte.',
    composition: KNIT, care: CARE_SPORT, logo: 'Symbole MOVA brodé au centre du dos.'
  },
  {
    id: 'legging-seconde-peau', name: 'Legging Seconde Peau', category: 'leggings', type: 'legging', price: 35,
    colors: ['noir', 'bordeaux', 'olive', 'majorelle', 'leopard'], sizes: SIZES, lengths: ['petite', 'standard', 'longue'],
    fit: 'Ajusté', tags: ['pilates', 'fitness'], bestseller: true, popularity: 92,
    description: 'Taille très haute, sans couture devant, opacité testée en squat. La sensation d’une seconde peau.',
    composition: KNIT, care: CARE_SPORT, logo: 'Symbole MOVA imprimé au bas du dos.'
  },
  {
    id: 'legging-flare', name: 'Legging évasé Flow', category: 'leggings', type: 'legging-flare', price: 35,
    colors: ['noir', 'bordeaux', 'olive', 'rose'], sizes: SIZES, lengths: ['standard', 'longue'],
    fit: 'Évasé', tags: ['pilates', 'ville'], isNew: true, popularity: 88,
    description: 'Ajusté jusqu’au genou puis légèrement évasé. Le legging qui passe du tapis au café sans se changer.',
    composition: KNIT, care: CARE_SPORT, logo: 'Symbole MOVA brodé sur la hanche.'
  },
  {
    id: 'sweat-oversize', name: 'Sweat oversize Week-end', category: 'sweats', type: 'sweat', price: 40,
    colors: ALL, sizes: SIZES, fit: 'Oversize', tags: ['ville'], bestseller: true, popularity: 90,
    description: 'Col rond, épaules tombantes, bord-côtes larges. Le sweat qu’on enfile sur une brassière en sortant du studio.',
    composition: FLEECE, care: CARE_FLEECE, logo: 'Wordmark MOVA brodé ton sur ton sur la poitrine.'
  },
  {
    id: 'sweat-court', name: 'Sweat court Studio', category: 'sweats', type: 'sweat-court', price: 40,
    colors: ['rose', 'jaune', 'olive', 'noir', 'orange'], sizes: SIZES, fit: 'Court', tags: ['pilates', 'ville'], isNew: true, popularity: 74,
    description: 'Longueur à la taille, parfait avec un pantalon taille haute. Manches amples resserrées aux poignets.',
    composition: FLEECE, care: CARE_FLEECE, logo: 'Symbole MOVA brodé sur la manche.'
  },
  {
    id: 'short-cycliste', name: 'Short cycliste', category: 'shorts', type: 'short-cycliste', price: 30,
    colors: ['noir', 'bordeaux', 'majorelle', 'leopard', 'olive'], sizes: SIZES, fit: 'Ajusté', tags: ['fitness', 'pilates'], popularity: 79,
    description: 'Entrejambe de 18 cm, taille haute, poche pour le téléphone dans la ceinture.',
    composition: KNIT, care: CARE_SPORT, logo: 'Symbole MOVA imprimé sur la cuisse.'
  },
  {
    id: 'short-ample', name: 'Short ample Padel', category: 'shorts', type: 'short-ample', price: 30,
    colors: ['rose', 'jaune', 'orange', 'noir'], sizes: SIZES, fit: 'Ample', tags: ['padel', 'ville'], popularity: 70,
    description: 'Short fluide avec cuissard intégré et poche à balle. Pensé pour le padel, joli pour l’apéro.',
    composition: '88 % polyester recyclé, 12 % élasthanne. Toile légère déperlante.', care: CARE_SPORT, logo: 'Wordmark MOVA imprimé sur la ceinture.'
  },
  { id: 'casquette', name: 'Casquette MOVA', category: 'casquettes', type: 'casquette', price: 22, colors: ['chocolat', 'noir', 'bordeaux', 'olive', 'majorelle', 'rose'], photos: { chocolat: [{ src: P + 'casquette-chocolat.jpg', alt: 'Casquette MOVA chocolat en laine, symbole brodé crème' }] }, sizes: TU, tags: ['padel', 'ville'], bestseller: true, popularity: 85, accessory: true,
    description: 'Casquette six pans, fermeture réglable en laiton. Version chocolat en drap de laine chiné pour l\u2019hiver.', composition: 'Coloris chocolat : 70 % laine, 30 % polyester. Autres coloris : 100 % coton biologique.', care: 'Lavage à la main à froid.', logo: 'Symbole MOVA brodé en façade.' },
  { id: 'pince-cheveux', name: 'Pince à cheveux MOVA', category: 'pinces', type: 'pince', price: 10, colors: ['ecaille', 'leopard', 'noir', 'bordeaux', 'rose', 'jaune'], photos: { ecaille: [{ src: P + 'pince-ecaille.jpg', alt: 'Grande pince à cheveux MOVA écaille, symbole crème' }] }, sizes: TU, tags: ['ville', 'pilates'], popularity: 83, accessory: true, isNew: true,
    description: 'Grande pince en acétate, tient une chevelure épaisse pendant toute la séance.', composition: 'Acétate de cellulose.', care: 'Nettoyer avec un chiffon doux.', logo: 'Symbole MOVA gravé.' },
  { id: 'chouchou', name: 'Chouchou MOVA', category: 'chouchous', type: 'chouchou', price: 8, colors: ALL, sizes: TU, tags: ['pilates', 'ville'], bestseller: true, popularity: 87, accessory: true,
    description: 'Chouchou en maille côtelée, assorti à tes ensembles.', composition: KNIT, care: CARE_SPORT, logo: 'Étiquette MOVA tissée.' },
  { id: 'bandeau', name: 'Bandeau MOVA', category: 'bandeaux', type: 'bandeau', price: 12, colors: ['noir', 'bordeaux', 'olive', 'rose', 'leopard'], sizes: TU, tags: ['padel', 'fitness'], popularity: 68, accessory: true,
    description: 'Bandeau large antidérapant, absorbe la transpiration.', composition: KNIT, care: CARE_SPORT, logo: 'Wordmark MOVA imprimé.' },
  { id: 'chaussettes', name: 'Chaussettes MOVA (lot de 2)', category: 'chaussettes', type: 'chaussettes', price: 10, colors: ['noir', 'rose', 'jaune', 'olive'], sizes: SOCK_SIZES, tags: ['ville', 'fitness'], popularity: 72, accessory: true,
    description: 'Chaussettes mi-mollet en coton peigné, bord-côte confortable.', composition: '80 % coton, 18 % polyamide, 2 % élasthanne.', care: 'Lavage en machine à 40 °C.', logo: 'Symbole MOVA tricoté sur la cheville.' },
  { id: 'chaussettes-pilates', name: 'Chaussettes antidérapantes de Pilates', category: 'chaussettes-pilates', type: 'chaussettes-pilates', price: 14, colors: ['creme', 'noir', 'bordeaux', 'rose', 'majorelle', 'olive'], photos: { creme: [{ src: P + 'chaussettes-pilates-creme.jpg', alt: 'Chaussettes de Pilates crème à pois chocolat, bord volanté et semelle à picots' }] }, sizes: SOCK_SIZES, tags: ['pilates'], bestseller: true, popularity: 95, accessory: true,
    description: 'Semelle à picots en silicone pour une adhérence parfaite sur le reformer et le tapis. Coloris crème : pois chocolat et bord volanté.', composition: '78 % coton, 20 % polyamide, 2 % élasthanne. Picots silicone.', care: 'Lavage en machine à 30 °C, à l’envers.', logo: 'Symbole MOVA en picots sous la semelle.' },
  { id: 'gourde', name: 'Gourde isotherme MOVA 500 ml', category: 'gourdes', type: 'gourde', price: 30, colors: ['leopard', 'noir', 'olive', 'bordeaux', 'rose', 'majorelle'], photos: { leopard: [{ src: P + 'gourde-leopard.jpg', alt: 'Gourde isotherme MOVA motif léopard, bouchon inox' }] }, sizes: TU, tags: ['pilates', 'padel', 'fitness'], popularity: 76, accessory: true,
    description: 'Inox double paroi : 12 h au chaud, 24 h au frais. Bouchon avec anse.', composition: 'Inox 18/8, bouchon sans BPA.', care: 'Lavage à la main uniquement.', logo: 'Wordmark MOVA gravé au laser.' }
];

// Ensembles = une veste + un pantalon compatibles, au prix ensemble (80 € par défaut).
const BUNDLES = [
  { id: 'ensemble-studio', name: 'Ensemble Studio', veste: 'veste-cintree-studio', pantalon: 'pantalon-survetement', defaultCut: 'evasee',
    description: 'Veste cintrée + pantalon évasé : l’ensemble signature MOVA, du reformer au café.', tags: ['pilates', 'ville'] },
  { id: 'ensemble-wide', name: 'Ensemble Wide', veste: 'veste-zippee-city', pantalon: 'pantalon-wide-lisere', defaultCut: null,
    description: 'Veste oversize + pantalon wide à liseré : la silhouette ample et graphique, du studio au week-end.', tags: ['ville'] },
  { id: 'ensemble-city', name: 'Ensemble City', veste: 'veste-zippee-city', pantalon: 'pantalon-survetement', defaultCut: 'jogging',
    description: 'Veste oversize + jogging ample : le confort cocon, pensé pour la ville et le padel.', tags: ['ville', 'padel'] }
];

// Guide des tailles en centimètres (proposition, à caler sur les patronages réels).
const SIZE_GUIDE = {
  XS: { poitrine: [78, 82], taille: [60, 64], hanches: [86, 90] },
  S: { poitrine: [82, 86], taille: [64, 68], hanches: [90, 94] },
  M: { poitrine: [86, 90], taille: [68, 72], hanches: [94, 98] },
  L: { poitrine: [90, 96], taille: [72, 78], hanches: [98, 104] },
  XL: { poitrine: [96, 102], taille: [78, 84], hanches: [104, 110] }
};

module.exports = { COLORS, SIZES, CUTS, LENGTHS, CATEGORIES, PRODUCTS, BUNDLES, SIZE_GUIDE };

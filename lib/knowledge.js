// Base de connaissances du service client — utilisée par l'Assistant MOVA et la FAQ.
// Contenus [PROPOSITION] du cahier des charges, à faire valider (notamment CGV et retours).
module.exports = function knowledge(settings) {
  const ship = settings.shipping;
  const club = settings.club;
  return {
    livraison: `Livraison en France métropolitaine. ${ship.methods.map(m => `${m.name} : ${m.price.toFixed(2).replace('.', ',')} € (${m.days[0]} à ${m.days[1]} jours ouvrés)`).join(' ; ')}. Livraison offerte dès ${ship.freeFrom} € d'achat. Les commandes passées avant 13 h en semaine partent le jour même. Un e-mail avec le lien de suivi est envoyé à l'expédition.`,
    retours: `Tu as ${settings.returnDays} jours après réception pour retourner un article non porté, avec ses étiquettes. Fais la demande depuis ton compte (Commandes > Retourner un article) ou via le service client si tu as commandé en invitée. Le remboursement est fait sur le moyen de paiement d'origine sous 5 jours ouvrés après réception du colis. Droit de rétractation légal : 14 jours.`,
    tailles: `Les tailles vont du XS au XL. Repères (en cm) : XS poitrine 78-82, taille 60-64, hanches 86-90 ; S 82-86 / 64-68 / 90-94 ; M 86-90 / 68-72 / 94-98 ; L 90-96 / 72-78 / 98-104 ; XL 96-102 / 78-84 / 104-110. Pantalons et leggings existent en longueur petite (moins de 1,60 m), standard (1,60 m à 1,72 m) et longue (plus de 1,72 m). Entre deux tailles : la plus petite pour un effet gainant, la plus grande pour plus d'aisance. L'outil « Trouver ma taille » sur chaque fiche donne une recommandation indicative.`,
    matieres: `Les pièces techniques (vestes cintrées, pantalons, brassières, leggings) sont en maille côtelée 72 % polyamide recyclé et 28 % élasthanne : opaque, douce, séchage rapide. Les sweats et la veste oversize sont en molleton 80 % coton biologique et 20 % polyester recyclé. Lavage à 30 °C à l'envers, sans adoucissant ni sèche-linge.`,
    ensemble: `Une veste et un pantalon de survêtement compatibles achetés ensemble coûtent ${settings.ensemblePrice} € au lieu de 90 €, même si les tailles sont différentes${settings.ensembleSameColor ? ', à condition de choisir le même coloris' : ''}. La remise s'applique automatiquement dans le panier.`,
    coupes: `Le pantalon de survêtement existe en 4 coupes : droite, évasée, jogging ample et ajustée, et en 3 longueurs. Les vestes existent en coupe cintrée (Veste Studio) et oversize (Veste City).`,
    club: `MOVA Club est le programme de fidélité gratuit. Après ${club.purchasesForReward} commandes validées (payées, non remboursées en totalité, après un délai de ${club.countDelayDays} jours), tu reçois un code unique de -${club.rewardPercent} % sur une séance dans un studio partenaire participant, valable ${club.rewardValidityMonths} mois. Les séances validées en studio par QR code débloquent aussi des accessoires : ${club.sessionTiers.map(t => `${t.sessions} séances = ${t.reward}`).join(', ')}. Les séances doivent être confirmées par le studio : une simple déclaration ne suffit pas.`,
    partenaires: `MOVA collabore avec des studios de Pilates, de fitness et de padel à Lyon. Retrouve-les sur la carte « MOVA près de toi » : tes récompenses MOVA Club y sont utilisables.`,
    paiement: `Paiement sécurisé par carte bancaire, Apple Pay et Google Pay. Aucune donnée bancaire n'est stockée par MOVA : le paiement est traité par Stripe.`,
    bienvenue: `En t'inscrivant à la newsletter, tu reçois un code de -${settings.welcome.percent} % valable ${settings.welcome.validityDays} jours sur ta première commande, non cumulable avec un autre code.`,
    contact: `Le service client répond du lundi au vendredi de 9 h à 18 h via le formulaire de la page Aide, sous 24 h ouvrées.`
  };
};

# MOVA — boutique en ligne

Ton rythme. Ton style.

## Lancer le site

```bash
cd mova
npm install
npm start
```

Ouvrir http://localhost:3000. La base de démonstration (`data/db.json`) est créée au premier lancement. Pour la régénérer : `npm run seed`.

## Configuration (fichier `.env`, facultatif)

| Variable | Rôle |
| --- | --- |
| `STRIPE_SECRET_KEY` | Clé Stripe (`sk_test_…` en développement). Sans clé : paiement de démonstration. |
| `STRIPE_WEBHOOK_SECRET` | Secret du webhook `/api/stripe/webhook`. |
| `ANTHROPIC_API_KEY` | Active l'Assistant MOVA (Claude). Sans clé : moteur de règles sur les vraies données. |
| `ADMIN_PASSWORD` | Remplace le mot de passe administrateur de démonstration. |
| `ADMIN_TOTP_SECRET` | Active la double authentification du back-office. |
| `BREVO_API_KEY`, `MAIL_FROM` | Envoi réel des e-mails (sinon boîte d'envoi locale). |
| `BASE_URL`, `PORT` | URL publique et port. |

## Comptes de test (données de démonstration uniquement)

- Clientes : `camille@demo.mova.fr` (a une récompense MOVA Club), `sarah@demo.mova.fr`, `lea@demo.mova.fr` — mot de passe `Demo-MOVA-2026!`
- Back-office (`/admin`) : mot de passe `Admin-MOVA-2026!` (à remplacer via `ADMIN_PASSWORD`)
- Espace studios (`/partenaire`) : `studio1@demo.mova.fr` — mot de passe `Studio-Demo-2026!`

## Vidéo d'accueil

`public/assets/video/mova-hero-1080.mp4` (grands écrans) et `mova-hero.mp4` (720p, autres écrans), avec `mova-hero-poster.jpg` (première image de la vidéo) affichée pendant le chargement. Pour changer de vidéo, remplacer ces trois fichiers. Droits d'utilisation à obtenir par écrit avant la mise en ligne.

## Photos produits

Les photos réelles sont dans `public/assets/img/produits/` et déclarées dans `data/catalog.js` (champ `photos`, par coloris). Le site n'utilise que des photos réelles. Un produit sans photo MOVA affiche une photo d'ambiance Unsplash définie dans `public/js/photos.js` (objet `PRODUCT`) ; les crédits sont listés sur la page `#/credits-photos`. Après une modification du catalogue, arrêter le serveur puis lancer `npm run seed` (sinon le serveur réécrit l'ancienne base à l'arrêt).

## État d'avancement

Fait : boutique (accueil, catalogue, filtres, fiches, ensembles 80 €, compose ton ensemble, panier, commande, paiement Stripe ou démo), compte client, espace fidélité MOVA Club, carte des studios, essayage virtuel 2D, chatbot, pop-up -5 %, cookies, pages légales (modèles), API complète du back-office et de l'espace partenaire.

Reste à faire : interfaces `public/admin.html` (+ `js/admin.js`) et `public/partenaire.html` (+ `js/partner.js`) branchées sur les routes `/api/admin/*` et `/api/partner/*` déjà en place ; tests de bout en bout.

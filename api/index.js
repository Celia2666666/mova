// Point d'entrée Vercel : toutes les routes /api/* passent par le serveur MOVA.
const { handler } = require('../server');
module.exports = handler;

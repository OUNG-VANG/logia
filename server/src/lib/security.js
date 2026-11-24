// Réglages de sécurité HTTP : en-têtes (Helmet), origines autorisées (CORS) et limites de requêtes.
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');

// Origines du site autorisées à appeler l'API, séparées par des virgules (ex. https://logia.fr).
function allowedOrigins() {
  const configured = (process.env.CLIENT_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);
  return configured.length ? configured : ['http://localhost:5173', 'http://127.0.0.1:5173'];
}

const securityHeaders = helmet({
  // Les photos des annonces sont affichées par le site, qui peut être sur un autre sous-domaine.
  crossOriginResourcePolicy: { policy: 'same-site' },
});

const corsPolicy = cors({
  origin(origin, callback) {
    // Sans en-tête Origin (outils en ligne de commande, même origine) : rien à vérifier.
    if (!origin || allowedOrigins().includes(origin)) return callback(null, true);
    return callback(null, false);
  },
});

function limiter({ windowMinutes, max, message }) {
  // RATE_LIMITS=off désactive les limites, uniquement pour un serveur de test (ex. script de démonstration).
  if (process.env.RATE_LIMITS === 'off') return (req, res, next) => next();
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message },
  });
}

// Limites par adresse IP. Elles freinent les attaques par force brute sur les mots de passe.
const limits = {
  api: limiter({ windowMinutes: 1, max: 300, message: 'Trop de requêtes. Réessaie dans une minute.' }),
  login: limiter({ windowMinutes: 15, max: 10, message: 'Trop de tentatives de connexion. Réessaie dans 15 minutes.' }),
  register: limiter({ windowMinutes: 60, max: 10, message: 'Trop de créations de compte depuis cette connexion. Réessaie plus tard.' }),
  forgotPassword: limiter({ windowMinutes: 60, max: 5, message: 'Trop de demandes de lien. Réessaie dans une heure.' }),
  resetPassword: limiter({ windowMinutes: 60, max: 10, message: 'Trop de tentatives de réinitialisation. Réessaie dans une heure.' }),
};

module.exports = { securityHeaders, corsPolicy, limits, allowedOrigins };

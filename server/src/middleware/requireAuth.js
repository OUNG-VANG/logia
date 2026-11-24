const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { issuedBeforePasswordChange } = require('../lib/tokens');

async function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  const secret = process.env.JWT_SECRET;

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentification requise.' });
  }

  if (!secret || secret.length < 32 || secret.startsWith('replace-with-')) {
    return res.status(503).json({ message: 'La configuration JWT du serveur est incomplète.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch {
    return res.status(401).json({ code: 'SESSION_INVALID', message: 'Ta session a expiré. Reconnecte-toi.' });
  }

  // Compte supprimé ou mot de passe changé depuis l'ouverture de la session : on refuse le jeton.
  if (mongoose.connection.readyState === 1) {
    try {
      const user = await User.findById(payload.sub).select('passwordChangedAt').lean();
      if (!user) return res.status(401).json({ code: 'SESSION_INVALID', message: 'Ce compte n’existe plus.' });
      if (issuedBeforePasswordChange(payload, user.passwordChangedAt)) {
        return res.status(401).json({ code: 'SESSION_INVALID', message: 'Ta session a expiré après un changement de mot de passe. Reconnecte-toi.' });
      }
    } catch {
      return res.status(500).json({ message: 'Impossible de vérifier ta session pour le moment.' });
    }
  }

  req.auth = { userId: payload.sub };
  return next();
}

module.exports = requireAuth;

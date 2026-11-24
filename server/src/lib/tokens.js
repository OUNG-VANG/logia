// Jeton de session (JWT) remis à la connexion.
const jwt = require('jsonwebtoken');

function createToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

// Un jeton émis avant le dernier changement de mot de passe n'est plus valable
// (une seconde de marge : la date du jeton est arrondie à la seconde).
function issuedBeforePasswordChange(payload, passwordChangedAt) {
  if (!passwordChangedAt || !payload?.iat) return false;
  return payload.iat * 1000 < new Date(passwordChangedAt).getTime() - 1000;
}

module.exports = { createToken, issuedBeforePasswordChange };

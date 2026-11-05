const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const [scheme, token] = authorization.split(' ');
  const secret = process.env.JWT_SECRET;

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentification requise.' });
  }

  if (!secret || secret.length < 32 || secret.startsWith('replace-with-')) {
    return res.status(503).json({ message: 'La configuration JWT du serveur est incomplète.' });
  }

  try {
    const payload = jwt.verify(token, secret);
    req.auth = { userId: payload.sub };
    return next();
  } catch {
    return res.status(401).json({ message: 'Jeton invalide ou expiré.' });
  }
}

module.exports = requireAuth;

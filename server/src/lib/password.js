// Règles et outils communs pour les mots de passe et les liens de réinitialisation.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_MINUTES = 60;

// bcrypt ne prend en compte que les 72 premiers octets : au-delà, on refuse plutôt que de tronquer en silence.
function passwordError(password) {
  const bytes = Buffer.byteLength(typeof password === 'string' ? password : '', 'utf8');
  if (bytes < 8 || bytes > 72) return 'Le mot de passe doit contenir au moins 8 caractères et au maximum 72 octets.';
  return null;
}

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

// Empreinte d'un mot de passe inexistant : comparer quand même évite de révéler, par le temps de réponse,
// si une adresse e-mail a un compte.
const dummyHash = bcrypt.hashSync('logia-mot-de-passe-factice', BCRYPT_ROUNDS);

// Le lien envoyé par e-mail contient un jeton aléatoire ; seule son empreinte SHA-256 est stockée,
// pour qu'une fuite de la base ne permette pas de réinitialiser les comptes.
function createResetToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    hash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000),
  };
}

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = { passwordError, hashPassword, dummyHash, createResetToken, hashResetToken, RESET_TOKEN_MINUTES };

const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const { ProfileError, parseProfile, publicUser } = require('../lib/profile');
const { passwordError, hashPassword, dummyHash, createResetToken, hashResetToken, RESET_TOKEN_MINUTES } = require('../lib/password');
const { limits } = require('../lib/security');
const { sendMail } = require('../lib/mailer');
const { createToken } = require('../lib/tokens');

const router = express.Router();
const allowedRoles = new Set(['tenant', 'landlord']);

function getConfigurationError() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32 || secret.startsWith('replace-with-')) {
    return 'La configuration JWT du serveur est incomplète.';
  }

  return null;
}


function databaseUnavailable(res) {
  if (mongoose.connection.readyState === 1) return false;

  res.status(503).json({ message: 'La base de données est indisponible.' });
  return true;
}

router.post('/register', limits.register, async (req, res) => {
  if (databaseUnavailable(res)) return;

  const configurationError = getConfigurationError();
  if (configurationError) {
    return res.status(503).json({ message: configurationError });
  }

  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const role = body.role || 'tenant';

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ message: 'Adresse e-mail invalide.' });
  }

  if (passwordError(password)) {
    return res.status(400).json({ message: passwordError(password) });
  }

  if (!allowedRoles.has(role)) {
    return res.status(400).json({ message: 'Rôle invalide. Choisis tenant ou landlord.' });
  }

  if (body.acceptTerms !== true) {
    return res.status(400).json({ message: 'Tu dois accepter la politique de confidentialité pour créer un compte.' });
  }

  let profile;
  try {
    profile = parseProfile(body, role);
  } catch (error) {
    if (error instanceof ProfileError) return res.status(400).json({ message: error.message });
    throw error;
  }

  try {
    const passwordHash = await hashPassword(password);
    const user = await User.create({ email, passwordHash, role, ...profile, termsAcceptedAt: new Date() });

    return res.status(201).json({
      user: publicUser(user),
      token: createToken(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Un compte existe déjà avec cette adresse e-mail.' });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Les informations du compte sont invalides.' });
    }

    console.error('Erreur lors de la création du compte :', error.message);
    return res.status(500).json({ message: 'Impossible de créer le compte pour le moment.' });
  }
});

router.post('/login', limits.login, async (req, res) => {
  if (databaseUnavailable(res)) return;

  const configurationError = getConfigurationError();
  if (configurationError) {
    return res.status(503).json({ message: configurationError });
  }

  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password) {
    return res.status(400).json({ message: 'Adresse e-mail et mot de passe requis.' });
  }

  try {
    const user = await User.findOne({ email }).select('+passwordHash');
    // Même temps de calcul que l'adresse existe ou non.
    const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : dummyHash);

    if (!user || !passwordMatches) {
      return res.status(401).json({ message: 'Adresse e-mail ou mot de passe incorrect.' });
    }

    return res.json({
      user: publicUser(user),
      token: createToken(user),
    });
  } catch (error) {
    console.error('Erreur lors de la connexion :', error.message);
    return res.status(500).json({ message: 'Impossible de se connecter pour le moment.' });
  }
});

// Mot de passe oublié : envoie un lien de réinitialisation. La réponse est la même que le compte
// existe ou non, pour ne pas révéler quelles adresses sont inscrites.
router.post('/forgot-password', limits.forgotPassword, async (req, res) => {
  if (databaseUnavailable(res)) return;
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const genericMessage = 'Si un compte existe avec cette adresse, un lien de réinitialisation vient d’y être envoyé. Il est valable 1 heure.';
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ message: 'Adresse e-mail invalide.' });
  }

  try {
    const user = await User.findOne({ email });
    if (user) {
      const { token, hash, expiresAt } = createResetToken();
      user.resetPasswordHash = hash;
      user.resetPasswordExpires = expiresAt;
      await user.save();
      const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
      await sendMail({
        to: user.email,
        subject: 'Logia : réinitialise ton mot de passe',
        text: `Bonjour${user.firstName ? ' ' + user.firstName : ''},\n\n`
          + `Tu as demandé à réinitialiser ton mot de passe Logia. Ouvre ce lien pour en choisir un nouveau `
          + `(il est valable ${RESET_TOKEN_MINUTES} minutes et ne fonctionne qu’une fois) :\n\n${appUrl}/?reset=${token}\n\n`
          + `Si tu n’es pas à l’origine de cette demande, ignore ce message : ton mot de passe ne change pas.\n\nL’équipe Logia`,
      });
    }
    return res.json({ message: genericMessage });
  } catch (error) {
    console.error('Erreur lors de la demande de réinitialisation :', error.message);
    return res.status(500).json({ message: 'Impossible d’envoyer le lien pour le moment.' });
  }
});

// Réinitialisation : le jeton du lien et le nouveau mot de passe.
router.post('/reset-password', limits.resetPassword, async (req, res) => {
  if (databaseUnavailable(res)) return;
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ message: 'Ce lien de réinitialisation est invalide.' });
  }
  if (passwordError(password)) return res.status(400).json({ message: passwordError(password) });

  try {
    const user = await User.findOne({ resetPasswordHash: hashResetToken(token), resetPasswordExpires: { $gt: new Date() } })
      .select('+resetPasswordHash +resetPasswordExpires');
    if (!user) {
      return res.status(400).json({ message: 'Ce lien a expiré ou a déjà été utilisé. Demande un nouveau lien.' });
    }
    user.passwordHash = await hashPassword(password);
    user.passwordChangedAt = new Date();
    user.resetPasswordHash = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    return res.json({ message: 'Ton mot de passe est modifié. Tu peux te connecter.' });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation :', error.message);
    return res.status(500).json({ message: 'Impossible de modifier le mot de passe pour le moment.' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  if (databaseUnavailable(res)) return;

  try {
    const user = await User.findById(req.auth.userId);

    if (!user) {
      return res.status(401).json({ message: 'Ce compte n’existe plus.' });
    }

    return res.json({ user: publicUser(user) });
  } catch (error) {
    console.error('Erreur lors de la lecture du compte :', error.message);
    return res.status(500).json({ message: 'Impossible de charger le compte pour le moment.' });
  }
});

// Mise à jour du profil (nom, civilité, profil locataire). L'e-mail, le rôle et le mot de passe ne changent pas ici.
router.patch('/me', requireAuth, async (req, res) => {
  if (databaseUnavailable(res)) return;

  try {
    const user = await User.findById(req.auth.userId);
    if (!user) {
      return res.status(401).json({ message: 'Ce compte n’existe plus.' });
    }

    let profile;
    try {
      profile = parseProfile(req.body, user.role);
    } catch (error) {
      if (error instanceof ProfileError) return res.status(400).json({ message: error.message });
      throw error;
    }

    user.set(profile);
    await user.save();
    return res.json({ user: publicUser(user) });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Les informations du profil sont invalides.' });
    }
    console.error('Erreur lors de la mise à jour du profil :', error.message);
    return res.status(500).json({ message: 'Impossible d’enregistrer le profil pour le moment.' });
  }
});

module.exports = router;

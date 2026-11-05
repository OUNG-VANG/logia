const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const allowedRoles = new Set(['tenant', 'landlord']);

function getConfigurationError() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32 || secret.startsWith('replace-with-')) {
    return 'La configuration JWT du serveur est incomplète.';
  }

  return null;
}

function createToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

function publicUser(user) {
  return {
    id: user._id,
    email: user.email,
    role: user.role,
  };
}

function databaseUnavailable(res) {
  if (mongoose.connection.readyState === 1) return false;

  res.status(503).json({ message: 'La base de données est indisponible.' });
  return true;
}

router.post('/register', async (req, res) => {
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

  if (Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({
      message: 'Le mot de passe doit contenir au moins 8 caractères et au maximum 72 octets.',
    });
  }

  if (!allowedRoles.has(role)) {
    return res.status(400).json({ message: 'Rôle invalide. Choisis tenant ou landlord.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash, role });

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

router.post('/login', async (req, res) => {
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
    const passwordMatches = user && (await bcrypt.compare(password, user.passwordHash));

    if (!passwordMatches) {
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

module.exports = router;

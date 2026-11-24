// Droits RGPD de l'utilisateur sur ses données : accès / portabilité (export) et effacement (suppression du compte).
const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const path = require('path');
const { unlink } = require('fs/promises');
const Application = require('../models/Application');
const Housing = require('../models/Housing');
const TenantDocument = require('../models/TenantDocument');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const { publicUser } = require('../lib/profile');
const { passwordError, hashPassword } = require('../lib/password');
const { createToken } = require('../lib/tokens');

const router = express.Router();
const uploadsDirectory = path.join(__dirname, '../../uploads');
const dossierDirectory = path.join(__dirname, '../../private-uploads/dossiers');

function databaseUnavailable(res) {
  if (mongoose.connection.readyState === 1) return false;
  res.status(503).json({ message: 'La base de données est indisponible.' });
  return true;
}

const removeFile = (directory, name) => unlink(path.join(directory, path.basename(name))).catch(() => {});

router.use(requireAuth);

// Export : toutes les données liées au compte, dans un fichier JSON lisible.
router.get('/export', async (req, res) => {
  if (databaseUnavailable(res)) return;
  try {
    const user = await User.findById(req.auth.userId);
    if (!user) return res.status(401).json({ message: 'Ce compte n’existe plus.' });

    const data = {
      exportedAt: new Date(),
      notice: 'Export de tes données Logia (RGPD, articles 15 et 20). Les pièces du dossier sont listées ; tu peux les télécharger depuis ton espace.',
      account: { ...publicUser(user), createdAt: user.createdAt, termsAcceptedAt: user.termsAcceptedAt || null },
    };

    if (user.role === 'tenant') {
      data.dossier = await TenantDocument.find({ tenant: user._id }).select('category originalName mimeType size createdAt').lean();
      data.applications = await Application.find({ tenant: user._id })
        .select('status message matchScore createdAt decidedAt')
        .populate('housing', 'title location.city rent')
        .lean();
    } else {
      const listings = await Housing.find({ landlord: user._id }).lean();
      data.listings = listings;
      // Candidatures reçues : sans les données personnelles des locataires, qui leur appartiennent.
      data.receivedApplications = await Application.find({ housing: { $in: listings.map((listing) => listing._id) } })
        .select('housing status createdAt decidedAt')
        .lean();
    }

    res.set('Content-Disposition', `attachment; filename="logia-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`);
    res.set('Cache-Control', 'private, no-store');
    return res.json(data);
  } catch (error) {
    console.error('Erreur lors de l’export des données :', error.message);
    return res.status(500).json({ message: 'Impossible d’exporter tes données pour le moment.' });
  }
});

// Changer son mot de passe : l'ancien est demandé. Les autres sessions ouvertes sont déconnectées.
router.patch('/password', async (req, res) => {
  if (databaseUnavailable(res)) return;
  try {
    const user = await User.findById(req.auth.userId).select('+passwordHash');
    if (!user) return res.status(401).json({ message: 'Ce compte n’existe plus.' });

    const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return res.status(401).json({ message: 'Mot de passe actuel incorrect.' });
    }
    if (passwordError(newPassword)) return res.status(400).json({ message: passwordError(newPassword) });
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({ message: 'Choisis un mot de passe différent de l’actuel.' });
    }

    user.passwordHash = await hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    await user.save();
    // Nouveau jeton pour la session en cours, les autres deviennent invalides.
    return res.json({ message: 'Ton mot de passe est modifié.', token: createToken(user) });
  } catch (error) {
    console.error('Erreur lors du changement de mot de passe :', error.message);
    return res.status(500).json({ message: 'Impossible de modifier le mot de passe pour le moment.' });
  }
});

// Suppression définitive du compte et de tout ce qui y est rattaché. Le mot de passe est demandé.
router.delete('/', async (req, res) => {
  if (databaseUnavailable(res)) return;
  try {
    const user = await User.findById(req.auth.userId).select('+passwordHash');
    if (!user) return res.status(401).json({ message: 'Ce compte n’existe plus.' });

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Mot de passe incorrect.' });
    }

    const removed = { documents: 0, applications: 0, listings: 0 };
    if (user.role === 'tenant') {
      const documents = await TenantDocument.find({ tenant: user._id }).select('+storedName');
      await Promise.all(documents.map((document) => removeFile(dossierDirectory, document.storedName)));
      removed.documents = (await TenantDocument.deleteMany({ tenant: user._id })).deletedCount;
      removed.applications = (await Application.deleteMany({ tenant: user._id })).deletedCount;
    } else {
      const listings = await Housing.find({ landlord: user._id }).select('images');
      await Promise.all(listings.flatMap((listing) => (listing.images || []).map((image) => removeFile(uploadsDirectory, image))));
      removed.applications = (await Application.deleteMany({ housing: { $in: listings.map((listing) => listing._id) } })).deletedCount;
      removed.listings = (await Housing.deleteMany({ landlord: user._id })).deletedCount;
    }
    await User.deleteOne({ _id: user._id });

    return res.json({ deleted: true, removed });
  } catch (error) {
    console.error('Erreur lors de la suppression du compte :', error.message);
    return res.status(500).json({ message: 'Impossible de supprimer le compte pour le moment.' });
  }
});

module.exports = router;

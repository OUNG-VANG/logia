const express = require('express');
const mongoose = require('mongoose');
const Housing = require('../models/Housing');
const TenantDocument = require('../models/TenantDocument');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const { computeMatch } = require('../lib/matching');
const { dossierSummary } = require('../lib/dossier');

const router = express.Router();
const listingFields = 'title description propertyType location rent charges areaM2 bedrooms availableFrom amenities images createdAt';

function databaseUnavailable(res) {
  if (mongoose.connection.readyState === 1) return false;
  res.status(503).json({ message: 'La base de données est indisponible.' });
  return true;
}

// Charge le locataire connecté avec ce qu'il faut pour calculer ses scores.
async function loadTenantContext(req, res) {
  const tenant = await User.findById(req.auth.userId).select('role tenantProfile');
  if (!tenant) {
    res.status(401).json({ message: 'Ce compte n’existe plus.' });
    return null;
  }
  if (tenant.role !== 'tenant') {
    res.status(403).json({ message: 'Les recommandations sont réservées aux comptes locataires.' });
    return null;
  }
  const documents = await TenantDocument.find({ tenant: tenant._id }).select('category');
  return {
    profile: tenant.tenantProfile ? tenant.tenantProfile.toObject() : {},
    dossier: dossierSummary(tenant, documents),
  };
}

router.use(requireAuth);

// Locataire : annonces publiées classées par score de compatibilité.
router.get('/recommendations', async (req, res) => {
  if (databaseUnavailable(res)) return;
  try {
    const context = await loadTenantContext(req, res);
    if (!context) return;

    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 6, 1), 50);
    const listings = await Housing.find({ status: 'published' }).select(listingFields).sort({ createdAt: -1 }).limit(500);
    const ranked = listings
      .map((listing) => ({ listing, match: computeMatch(context.profile, listing, context.dossier) }))
      .filter(({ match }) => match.score !== null)
      .sort((a, b) => b.match.score - a.match.score || b.listing.createdAt - a.listing.createdAt)
      .slice(0, limit);

    const profileFilled = ranked[0]?.match.confidence ?? 0;
    return res.json({ recommendations: ranked, confidence: profileFilled });
  } catch (error) {
    console.error('Erreur lors du calcul des recommandations :', error.message);
    return res.status(500).json({ message: 'Impossible de calculer tes recommandations pour le moment.' });
  }
});

// Locataire : score pour une annonce précise (page de détail).
router.get('/listings/:id', async (req, res) => {
  if (databaseUnavailable(res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Identifiant de logement invalide.' });
  }
  try {
    const context = await loadTenantContext(req, res);
    if (!context) return;
    const listing = await Housing.findOne({ _id: req.params.id, status: 'published' }).select(listingFields);
    if (!listing) return res.status(404).json({ message: 'Logement introuvable.' });
    return res.json({ match: computeMatch(context.profile, listing, context.dossier) });
  } catch (error) {
    console.error('Erreur lors du calcul du score :', error.message);
    return res.status(500).json({ message: 'Impossible de calculer le score pour le moment.' });
  }
});

module.exports = router;

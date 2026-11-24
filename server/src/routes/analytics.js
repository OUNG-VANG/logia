const express = require('express');
const mongoose = require('mongoose');
const Application = require('../models/Application');
const Housing = require('../models/Housing');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const { computeMatch } = require('../lib/matching');
const { marketByCity, applicationStats, countBy, foldSmallGroups } = require('../lib/analytics');
const { trainAndEvaluate } = require('../lib/ml');

const router = express.Router();

router.use(requireAuth);

// Observatoire : statistiques agrégées de la plateforme (aucune donnée personnelle).
router.get('/', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: 'La base de données est indisponible.' });
  }

  try {
    const [listings, applications, tenantCount, landlordCount] = await Promise.all([
      Housing.find({ status: 'published' }).select('location rent charges areaM2').lean(),
      Application.find({})
        .select('tenant housing status createdAt decidedAt updatedAt matchScore matchCriteria')
        .populate('tenant', 'tenantProfile')
        .populate('housing', 'location rent charges areaM2 bedrooms propertyType availableFrom')
        .lean(),
      User.countDocuments({ role: 'tenant' }),
      User.countDocuments({ role: 'landlord' }),
    ]);

    // Les candidatures envoyées avant l'enregistrement du score sont estimées avec le profil actuel.
    let estimatedScores = 0;
    const trainingSamples = [];
    let estimatedSamples = 0;
    const scored = applications.map((application) => {
      let { matchScore } = application;
      let criteria = application.matchCriteria;
      let estimated = false;
      if ((!Number.isFinite(matchScore) || !criteria) && application.tenant && application.housing) {
        const match = computeMatch(application.tenant.tenantProfile || {}, application.housing);
        if (!Number.isFinite(matchScore)) {
          matchScore = match.score;
          if (Number.isFinite(matchScore)) estimatedScores += 1;
        }
        if (!criteria) {
          criteria = Object.fromEntries(match.criteria.map((criterion) => [criterion.key, criterion.score]));
          estimated = true;
        }
      }
      // Données d'apprentissage : seulement les candidatures avec une décision du propriétaire.
      if ((application.status === 'accepted' || application.status === 'rejected') && criteria && Number.isFinite(matchScore)) {
        trainingSamples.push({ criteria, matchScore, accepted: application.status === 'accepted' });
        if (estimated) estimatedSamples += 1;
      }
      const decided = application.status === 'accepted' || application.status === 'rejected';
      return {
        status: application.status,
        createdAt: application.createdAt,
        decidedAt: application.decidedAt || (decided ? application.updatedAt : null),
        matchScore: Number.isFinite(matchScore) ? matchScore : null,
      };
    });

    // Une seule fois par candidat, même s'il a postulé à plusieurs annonces.
    const applicants = new Map();
    applications.forEach((application) => {
      if (application.tenant) applicants.set(String(application.tenant._id), application.tenant.tenantProfile || {});
    });

    const rents = listings.map((listing) => Number(listing.rent)).filter((rent) => rent > 0);

    return res.json({
      generatedAt: new Date(),
      overview: {
        publishedListings: listings.length,
        tenants: tenantCount,
        landlords: landlordCount,
        averageRent: rents.length ? Math.round(rents.reduce((sum, rent) => sum + rent, 0) / rents.length) : null,
      },
      market: marketByCity(listings),
      applications: { ...applicationStats(scored), estimatedScores },
      // Les situations comptant moins de 3 candidats sont regroupées pour éviter toute réidentification.
      applicantSituations: foldSmallGroups(countBy([...applicants.values()].map((profile) => profile.situation))),
      model: { ...trainAndEvaluate(trainingSamples), estimatedSamples },
    });
  } catch (error) {
    console.error('Erreur lors du calcul des statistiques :', error.message);
    return res.status(500).json({ message: 'Impossible de calculer les statistiques pour le moment.' });
  }
});

module.exports = router;

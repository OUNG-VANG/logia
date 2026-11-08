const express = require('express');
const mongoose = require('mongoose');
const Application = require('../models/Application');
const Housing = require('../models/Housing');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const TenantDocument = require('../models/TenantDocument');
const { applicantSummary, isProfileComplete } = require('../lib/profile');
const { dossierSummary } = require('../lib/dossier');
const { computeMatch } = require('../lib/matching');

const router = express.Router();
const housingFields = 'title propertyType location rent charges areaM2 bedrooms availableFrom images status';
const applicantFields = 'email firstName lastName tenantProfile';

// Remplace le compte locataire complet par ce qu'un propriétaire a le droit de voir,
// et ajoute l'état de son dossier (pièces fournies).
async function forLandlord(applications) {
  const tenantIds = applications.map((application) => application.tenant?._id).filter(Boolean);
  const documents = await TenantDocument.find({ tenant: { $in: tenantIds } }).select('tenant category');
  return applications.map((application) => {
    const result = application.toObject();
    result.tenant = applicantSummary(application.tenant);
    if (application.tenant) {
      const tenantDocuments = documents.filter((document) => document.tenant.equals(application.tenant._id));
      result.dossier = dossierSummary(application.tenant, tenantDocuments);
      // Score de compatibilité entre le candidat et le logement demandé (sans âge ni sexe).
      if (application.housing) {
        const profile = application.tenant.tenantProfile ? application.tenant.tenantProfile.toObject() : {};
        result.match = computeMatch(profile, application.housing, result.dossier);
      }
    }
    return result;
  });
}

function databaseUnavailable(res) {
  if (mongoose.connection.readyState === 1) return false;
  res.status(503).json({ message: 'La base de données est indisponible.' });
  return true;
}

// Loads the signed-in user and checks the role. Sends the error itself and returns null on failure.
async function loadUserWithRole(req, res, role, message) {
  const user = await User.findById(req.auth.userId).select('role email');
  if (!user) {
    res.status(401).json({ message: 'Ce compte n’existe plus.' });
    return null;
  }
  if (user.role !== role) {
    res.status(403).json({ message });
    return null;
  }
  return user;
}

// Un locataire ne peut postuler qu'avec un profil complet et toutes les pièces obligatoires de son dossier.
async function applicationReadiness(tenantId) {
  const tenant = await User.findById(tenantId).select('role firstName lastName gender tenantProfile');
  const documents = await TenantDocument.find({ tenant: tenantId }).select('category');
  const profileComplete = isProfileComplete(tenant);
  const dossier = dossierSummary(tenant, documents);
  return { ready: profileComplete && dossier.complete, profileComplete, dossier, tenant };
}

function readinessMessage(readiness) {
  if (!readiness.profileComplete) return 'Complète d’abord ton profil (nom, situation…) avant de postuler.';
  const count = readiness.dossier.missing.length;
  return `Ton dossier n’est pas complet : il manque ${count} pièce${count > 1 ? 's' : ''} obligatoire${count > 1 ? 's' : ''}. ${count > 1 ? 'Ajoute-les' : 'Ajoute-la'} dans « Mon dossier » pour pouvoir postuler.`;
}

router.use(requireAuth);

// Locataire : peut-il postuler maintenant ?
router.get('/readiness', async (req, res) => {
  if (databaseUnavailable(res)) return;
  try {
    const tenant = await loadUserWithRole(req, res, 'tenant', 'Réservé aux comptes locataires.');
    if (!tenant) return;
    const readiness = await applicationReadiness(tenant._id);
    const { tenant: _tenant, ...publicReadiness } = readiness;
    return res.json({ ...publicReadiness, message: readiness.ready ? '' : readinessMessage(readiness) });
  } catch (error) {
    console.error('Erreur lors de la vérification du dossier :', error.message);
    return res.status(500).json({ message: 'Impossible de vérifier ton dossier pour le moment.' });
  }
});

// Locataire : postuler à une annonce publiée.
router.post('/', async (req, res) => {
  if (databaseUnavailable(res)) return;

  try {
    const tenant = await loadUserWithRole(req, res, 'tenant', 'Seul un compte locataire peut envoyer une candidature.');
    if (!tenant) return;

    const body = req.body || {};
    if (!mongoose.isValidObjectId(body.housingId)) {
      return res.status(400).json({ message: 'Identifiant de logement invalide.' });
    }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length > 2000) {
      return res.status(400).json({ message: 'Ton message doit faire 2000 caractères au maximum.' });
    }

    const housing = await Housing.findOne({ _id: body.housingId, status: 'published' }).select(housingFields);
    if (!housing) {
      return res.status(404).json({ message: 'Ce logement n’est plus disponible.' });
    }

    const existing = await Application.findOne({ tenant: tenant._id, housing: housing._id });
    if (existing && existing.status !== 'withdrawn') {
      return res.status(409).json({ message: 'Tu as déjà postulé à ce logement.' });
    }

    const readiness = await applicationReadiness(tenant._id);
    if (!readiness.ready) {
      return res.status(403).json({
        code: readiness.profileComplete ? 'DOSSIER_INCOMPLETE' : 'PROFILE_INCOMPLETE',
        message: readinessMessage(readiness),
        missing: readiness.dossier.missing,
      });
    }

    const profile = readiness.tenant.tenantProfile ? readiness.tenant.tenantProfile.toObject() : {};
    const matchScore = computeMatch(profile, housing, readiness.dossier).score ?? undefined;

    let application;
    if (existing) {
      // Une candidature retirée peut être renvoyée.
      existing.status = 'pending';
      existing.message = message;
      existing.matchScore = matchScore;
      existing.decidedAt = undefined;
      application = await existing.save();
    } else {
      application = await Application.create({ tenant: tenant._id, housing: housing._id, message, matchScore });
    }

    await application.populate('housing', housingFields);
    return res.status(201).json({ application });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Tu as déjà postulé à ce logement.' });
    }
    console.error('Erreur lors de la création de la candidature :', error.message);
    return res.status(500).json({ message: 'Impossible d’envoyer la candidature pour le moment.' });
  }
});

// Locataire : ses candidatures.
router.get('/mine', async (req, res) => {
  if (databaseUnavailable(res)) return;

  try {
    const tenant = await loadUserWithRole(req, res, 'tenant', 'Cette liste est réservée aux comptes locataires.');
    if (!tenant) return;

    const applications = await Application.find({ tenant: tenant._id })
      .populate('housing', housingFields)
      .sort({ updatedAt: -1 })
      .limit(100);
    return res.json({ applications });
  } catch (error) {
    console.error('Erreur lors du chargement des candidatures :', error.message);
    return res.status(500).json({ message: 'Impossible de charger tes candidatures pour le moment.' });
  }
});

// Propriétaire : candidatures reçues sur ses annonces.
router.get('/received', async (req, res) => {
  if (databaseUnavailable(res)) return;

  try {
    const landlord = await loadUserWithRole(req, res, 'landlord', 'Cette liste est réservée aux comptes propriétaires.');
    if (!landlord) return;

    const housingIds = await Housing.find({ landlord: landlord._id }).distinct('_id');
    const applications = await Application.find({ housing: { $in: housingIds }, status: { $ne: 'withdrawn' } })
      .populate('housing', housingFields)
      .populate('tenant', applicantFields)
      .sort({ createdAt: -1 })
      .limit(200);
    return res.json({ applications: await forLandlord(applications) });
  } catch (error) {
    console.error('Erreur lors du chargement des candidatures reçues :', error.message);
    return res.status(500).json({ message: 'Impossible de charger les candidatures reçues pour le moment.' });
  }
});

// Propriétaire : accepter ou refuser. Locataire : retirer sa candidature.
router.patch('/:id/status', async (req, res) => {
  if (databaseUnavailable(res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Identifiant de candidature invalide.' });
  }

  const status = req.body?.status;
  if (!['accepted', 'rejected', 'withdrawn'].includes(status)) {
    return res.status(400).json({ message: 'Statut invalide.' });
  }

  try {
    const user = await User.findById(req.auth.userId).select('role');
    if (!user) return res.status(401).json({ message: 'Ce compte n’existe plus.' });

    const application = await Application.findById(req.params.id).populate('housing', `${housingFields} landlord`);
    if (!application) return res.status(404).json({ message: 'Candidature introuvable.' });

    if (status === 'withdrawn') {
      if (user.role !== 'tenant' || !application.tenant.equals(user._id)) {
        return res.status(404).json({ message: 'Candidature introuvable.' });
      }
      if (application.status !== 'pending') {
        return res.status(409).json({ message: 'Seule une candidature en attente peut être retirée.' });
      }
    } else {
      if (user.role !== 'landlord' || !application.housing?.landlord?.equals(user._id)) {
        return res.status(404).json({ message: 'Candidature introuvable.' });
      }
      if (application.status === 'withdrawn') {
        return res.status(409).json({ message: 'Le locataire a retiré cette candidature.' });
      }
    }

    application.status = status;
    if (status === 'accepted' || status === 'rejected') application.decidedAt = new Date();
    await application.save();
    application.housing.landlord = undefined;
    if (user.role === 'landlord') {
      await application.populate('tenant', applicantFields);
      const [result] = await forLandlord([application]);
      return res.json({ application: result });
    }
    return res.json({ application });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la candidature :', error.message);
    return res.status(500).json({ message: 'Impossible de mettre à jour la candidature pour le moment.' });
  }
});

module.exports = router;

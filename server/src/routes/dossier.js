const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { mkdir, writeFile, unlink } = require('fs/promises');
const { randomUUID } = require('crypto');
const Application = require('../models/Application');
const Housing = require('../models/Housing');
const TenantDocument = require('../models/TenantDocument');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');
const {
  categoryKeys, maxFilesPerCategory, maxFileBytes, allowedTypes, matchesSignature, dossierSummary,
} = require('../lib/dossier');

const router = express.Router();
// Hors du dossier public `uploads` : ces fichiers ne passent que par les routes ci-dessous.
const dossierDirectory = path.join(__dirname, '../../private-uploads/dossiers');
const documentFields = 'category originalName mimeType size createdAt';

class DossierError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function databaseUnavailable(res) {
  if (mongoose.connection.readyState === 1) return false;
  res.status(503).json({ message: 'La base de données est indisponible.' });
  return true;
}

function sendError(res, error, fallback) {
  if (error instanceof DossierError) return res.status(error.statusCode).json({ message: error.message });
  console.error(fallback, error.message);
  return res.status(500).json({ message: 'Une erreur est survenue. Réessaie dans un instant.' });
}

async function loadUser(req, role) {
  const user = await User.findById(req.auth.userId).select('role tenantProfile');
  if (!user) throw new DossierError(401, 'Ce compte n’existe plus.');
  if (role && user.role !== role) {
    throw new DossierError(403, role === 'tenant'
      ? 'Le dossier est réservé aux comptes locataires.'
      : 'Cette action est réservée aux comptes propriétaires.');
  }
  return user;
}

// Un propriétaire voit le dossier d'un locataire seulement si ce locataire a une candidature
// en cours (en attente ou acceptée) sur l'une de ses annonces.
async function landlordHasActiveApplication(landlordId, tenantId) {
  const housingIds = await Housing.find({ landlord: landlordId }).distinct('_id');
  if (!housingIds.length) return false;
  return Boolean(await Application.exists({
    tenant: tenantId,
    housing: { $in: housingIds },
    status: { $in: ['pending', 'accepted'] },
  }));
}

function cleanFileName(value) {
  const name = typeof value === 'string' ? value.normalize('NFC').replace(/[\\/\u0000-\u001f]/g, '').trim() : '';
  return (name || 'document').slice(0, 160);
}

router.use(requireAuth);

// Locataire : son dossier et sa complétude.
router.get('/mine', async (req, res) => {
  if (databaseUnavailable(res)) return;
  try {
    const tenant = await loadUser(req, 'tenant');
    const documents = await TenantDocument.find({ tenant: tenant._id }).select(documentFields).sort({ createdAt: 1 });
    return res.json({ documents, summary: dossierSummary(tenant, documents) });
  } catch (error) {
    return sendError(res, error, 'Erreur lors du chargement du dossier :');
  }
});

// Locataire : ajouter une pièce (PDF, JPG ou PNG en base64, 5 Mo maximum).
router.post('/documents', async (req, res) => {
  if (databaseUnavailable(res)) return;
  let storedName;
  try {
    const tenant = await loadUser(req, 'tenant');
    const body = req.body || {};

    if (!categoryKeys.includes(body.category)) throw new DossierError(400, 'Type de pièce invalide.');
    const match = typeof body.data === 'string'
      ? body.data.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/)
      : null;
    if (!match || !allowedTypes[match[1]]) {
      throw new DossierError(400, 'Ajoute un fichier PDF, JPG ou PNG.');
    }

    const [, mimeType, encoded] = match;
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length > maxFileBytes) throw new DossierError(400, 'Chaque fichier doit faire moins de 5 Mo.');
    if (!matchesSignature(buffer, mimeType)) {
      throw new DossierError(400, 'Le contenu du fichier ne correspond pas à son format.');
    }

    const count = await TenantDocument.countDocuments({ tenant: tenant._id, category: body.category });
    if (count >= maxFilesPerCategory) {
      throw new DossierError(400, `Tu peux ajouter jusqu’à ${maxFilesPerCategory} fichiers par pièce.`);
    }

    await mkdir(dossierDirectory, { recursive: true });
    storedName = `${randomUUID()}.${allowedTypes[mimeType]}`;
    await writeFile(path.join(dossierDirectory, storedName), buffer, { flag: 'wx' });

    const document = await TenantDocument.create({
      tenant: tenant._id,
      category: body.category,
      originalName: cleanFileName(body.fileName),
      mimeType,
      size: buffer.length,
      storedName,
    });
    storedName = null;

    const documents = await TenantDocument.find({ tenant: tenant._id }).select(documentFields);
    const result = document.toObject();
    delete result.storedName;
    return res.status(201).json({ document: result, summary: dossierSummary(tenant, documents) });
  } catch (error) {
    if (storedName) await unlink(path.join(dossierDirectory, storedName)).catch(() => {});
    return sendError(res, error, 'Erreur lors de l’ajout d’une pièce :');
  }
});

// Locataire : retirer une pièce.
router.delete('/documents/:id', async (req, res) => {
  if (databaseUnavailable(res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Identifiant de pièce invalide.' });
  }
  try {
    const tenant = await loadUser(req, 'tenant');
    const document = await TenantDocument.findOneAndDelete({ _id: req.params.id, tenant: tenant._id }).select('+storedName');
    if (!document) return res.status(404).json({ message: 'Pièce introuvable dans ton dossier.' });
    await unlink(path.join(dossierDirectory, document.storedName)).catch(() => {});

    const documents = await TenantDocument.find({ tenant: tenant._id }).select(documentFields);
    return res.json({ deletedId: document._id, summary: dossierSummary(tenant, documents) });
  } catch (error) {
    return sendError(res, error, 'Erreur lors de la suppression d’une pièce :');
  }
});

// Propriétaire : dossier d'un candidat qui a postulé à l'une de ses annonces.
router.get('/applicants/:tenantId', async (req, res) => {
  if (databaseUnavailable(res)) return;
  if (!mongoose.isValidObjectId(req.params.tenantId)) {
    return res.status(400).json({ message: 'Identifiant de locataire invalide.' });
  }
  try {
    const landlord = await loadUser(req, 'landlord');
    if (!(await landlordHasActiveApplication(landlord._id, req.params.tenantId))) {
      return res.status(404).json({ message: 'Dossier introuvable.' });
    }
    const tenant = await User.findById(req.params.tenantId).select('tenantProfile');
    const documents = await TenantDocument.find({ tenant: req.params.tenantId }).select(documentFields).sort({ createdAt: 1 });
    return res.json({ documents, summary: dossierSummary(tenant, documents) });
  } catch (error) {
    return sendError(res, error, 'Erreur lors du chargement du dossier d’un candidat :');
  }
});

// Ouvrir un fichier : le locataire lui-même, ou un propriétaire avec une candidature en cours.
router.get('/documents/:id/file', async (req, res) => {
  if (databaseUnavailable(res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Identifiant de pièce invalide.' });
  }
  try {
    const user = await loadUser(req);
    const document = await TenantDocument.findById(req.params.id).select('+storedName');
    const allowed = document && (
      document.tenant.equals(user._id)
      || (user.role === 'landlord' && await landlordHasActiveApplication(user._id, document.tenant))
    );
    if (!allowed) return res.status(404).json({ message: 'Pièce introuvable.' });

    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(document.originalName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.sendFile(document.storedName, { root: dossierDirectory }, (error) => {
      if (error && !res.headersSent) res.status(404).json({ message: 'Fichier introuvable.' });
    });
  } catch (error) {
    return sendError(res, error, 'Erreur lors de l’ouverture d’une pièce :');
  }
});

module.exports = router;

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { mkdir, writeFile, unlink } = require('fs/promises');
const { randomUUID } = require('crypto');
const Housing = require('../models/Housing');
const Application = require('../models/Application');
const User = require('../models/User');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const uploadsDirectory = path.join(__dirname, '../../uploads');
const maxPhotoCount = 5;
const maxPhotoBytes = 2 * 1024 * 1024;


function verifyImageSignature(buffer, mimeType) {
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/webp') return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

async function saveListingImages(images) {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > maxPhotoCount) {
    const error = new Error(`Tu peux ajouter jusqu’à ${maxPhotoCount} photos.`);
    error.statusCode = 400;
    throw error;
  }

  await mkdir(uploadsDirectory, { recursive: true });
  const savedPaths = [];
  try {
    for (const dataUrl of images) {
      const match = typeof dataUrl === 'string'
        ? dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
        : null;
      if (!match) {
        const error = new Error('Une photo est invalide. Utilise un fichier JPG, PNG ou WebP.');
        error.statusCode = 400;
        throw error;
      }

      const [, mimeType, encoded] = match;
      const buffer = Buffer.from(encoded, 'base64');
      if (buffer.length > maxPhotoBytes) {
        const error = new Error('Chaque photo doit faire moins de 2 Mo après optimisation.');
        error.statusCode = 400;
        throw error;
      }
      if (!verifyImageSignature(buffer, mimeType)) {
        const error = new Error('Le contenu d’une photo ne correspond pas à son format.');
        error.statusCode = 400;
        throw error;
      }

      const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
      const filename = `${randomUUID()}.${extension}`;
      await writeFile(path.join(uploadsDirectory, filename), buffer, { flag: 'wx' });
      savedPaths.push(`/api/uploads/${filename}`);
    }
    return savedPaths;
  } catch (error) {
    await Promise.all(savedPaths.map((imagePath) => unlink(path.join(uploadsDirectory, path.basename(imagePath))).catch(() => {})));
    throw error;
  }
}

function databaseUnavailable(res) {
  if (mongoose.connection.readyState === 1) return false;
  res.status(503).json({ message: 'La base de données est indisponible.' });
  return true;
}

function optionalNumber(value) {
  if (value === '' || value === undefined || value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

router.get('/', async (req, res) => {
  if (databaseUnavailable(res)) return;

  const filter = { status: 'published' };
  if (typeof req.query.city === 'string' && req.query.city.trim()) {
    const city = req.query.city.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter['location.city'] = { $regex: city, $options: 'i' };
  }

  if (req.query.maxRent !== undefined) {
    const maxRent = Number(req.query.maxRent);
    if (!Number.isFinite(maxRent) || maxRent < 0) {
      return res.status(400).json({ message: 'Le loyer maximum doit être un nombre positif.' });
    }
    filter.rent = { $lte: maxRent };
  }

  try {
    const listings = await Housing.find(filter)
      .select('title description propertyType location rent charges areaM2 bedrooms availableFrom amenities images createdAt')
      .sort({ createdAt: -1 })
      .limit(50);

    return res.json({ listings });
  } catch (error) {
    console.error('Erreur lors de la recherche de logements :', error.message);
    return res.status(500).json({ message: 'Impossible de charger les logements pour le moment.' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  if (databaseUnavailable(res)) return;

  try {
    const listings = await Housing.find({ landlord: req.auth.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    return res.json({ listings });
  } catch (error) {
    console.error('Erreur lors du chargement des annonces :', error.message);
    return res.status(500).json({ message: 'Impossible de charger tes annonces pour le moment.' });
  }
});

router.patch('/:id/location', requireAuth, async (req, res) => {
  if (databaseUnavailable(res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Identifiant de logement invalide.' });
  }

  const latitude = optionalNumber(req.body?.latitude);
  const longitude = optionalNumber(req.body?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ message: 'Une adresse exacte est nécessaire pour placer le logement sur la carte.' });
  }

  try {
    const listing = await Housing.findOneAndUpdate(
      { _id: req.params.id, landlord: req.auth.userId },
      { $set: { 'location.latitude': latitude, 'location.longitude': longitude, 'location.precision': 'address' } },
      { new: true, runValidators: true },
    );
    if (!listing) return res.status(404).json({ message: 'Logement introuvable dans tes annonces.' });
    return res.json({ listing });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la localisation :', error.message);
    return res.status(500).json({ message: 'Impossible de mettre à jour la localisation pour le moment.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  if (databaseUnavailable(res)) return;

  try {
    const landlord = await User.findById(req.auth.userId).select('role');
    if (!landlord || landlord.role !== 'landlord') {
      return res.status(403).json({ message: 'Seul un compte propriétaire peut publier un logement.' });
    }

    const body = req.body || {};
    const latitude = optionalNumber(body.latitude);
    const longitude = optionalNumber(body.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ message: 'Une adresse exacte est nécessaire pour placer le logement sur la carte.' });
    }
    const images = await saveListingImages(body.images);
    let listing;
    try {
      listing = await Housing.create({
        landlord: landlord._id,
        title: typeof body.title === 'string' ? body.title.trim() : '',
        description: typeof body.description === 'string' ? body.description.trim() : '',
        propertyType: body.propertyType,
        location: {
          city: typeof body.city === 'string' ? body.city.trim() : '',
          postalCode: typeof body.postalCode === 'string' ? body.postalCode.trim() : '',
          country: 'France',
          latitude,
          longitude,
          precision: 'address',
        },
        rent: optionalNumber(body.rent),
        charges: optionalNumber(body.charges) ?? 0,
        areaM2: optionalNumber(body.areaM2),
        bedrooms: optionalNumber(body.bedrooms) ?? 0,
        availableFrom: body.availableFrom || undefined,
        images,
        status: 'published',
      });
    } catch (error) {
      await Promise.all(images.map((imagePath) => unlink(path.join(uploadsDirectory, path.basename(imagePath))).catch(() => {})));
      throw error;
    }

    return res.status(201).json({ listing });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({ message: 'Vérifie les informations de l’annonce.' });
    }
    console.error('Erreur lors de la création du logement :', error.message);
    return res.status(500).json({ message: 'Impossible de publier le logement pour le moment.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (databaseUnavailable(res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Identifiant de logement invalide.' });
  }

  try {
    const listing = await Housing.findOneAndDelete({ _id: req.params.id, landlord: req.auth.userId });
    if (!listing) return res.status(404).json({ message: 'Logement introuvable dans tes annonces.' });

    // Les candidatures liées n'ont plus de sens sans l'annonce.
    await Application.deleteMany({ housing: listing._id });
    await Promise.all((listing.images || []).map((imagePath) => (
      unlink(path.join(uploadsDirectory, path.basename(imagePath))).catch(() => {})
    )));

    return res.json({ deletedId: listing._id });
  } catch (error) {
    console.error('Erreur lors de la suppression du logement :', error.message);
    return res.status(500).json({ message: 'Impossible de supprimer ce logement pour le moment.' });
  }
});

router.get('/:id', async (req, res) => {
  if (databaseUnavailable(res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Identifiant de logement invalide.' });
  }

  try {
    const listing = await Housing.findOne({ _id: req.params.id, status: 'published' })
      .select('title description propertyType location rent charges areaM2 bedrooms availableFrom amenities images createdAt');

    if (!listing) return res.status(404).json({ message: 'Logement introuvable.' });
    return res.json({ listing });
  } catch (error) {
    console.error('Erreur lors du chargement du logement :', error.message);
    return res.status(500).json({ message: 'Impossible de charger ce logement pour le moment.' });
  }
});

module.exports = router;

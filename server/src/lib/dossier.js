// Pièces du dossier locataire.
// Liste fondée sur le décret n° 2015-1437 du 5 novembre 2015, qui fixe les pièces qu'un bailleur peut demander.

const categories = {
  identity: { required: true },
  address: { required: true },
  activity: { required: true },
  income: { required: true },
  tax: { required: false },
  guarantor: { required: false }, // obligatoire seulement si le locataire déclare un garant
};

const categoryKeys = Object.keys(categories);
const maxFilesPerCategory = 5;
const maxFileBytes = 5 * 1024 * 1024;

const allowedTypes = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function matchesSignature(buffer, mimeType) {
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return false;
}

function requiredCategories(user) {
  const guarantorType = user?.tenantProfile?.guarantorType;
  const needsGuarantor = Boolean(guarantorType) && guarantorType !== 'none';
  return categoryKeys.filter((key) => categories[key].required || (key === 'guarantor' && needsGuarantor));
}

// Résumé de complétude : quelles pièces obligatoires sont fournies.
function dossierSummary(user, documents) {
  const required = requiredCategories(user);
  const provided = new Set(documents.map((document) => document.category));
  const missing = required.filter((key) => !provided.has(key));
  return {
    required,
    requiredCount: required.length,
    providedCount: required.length - missing.length,
    complete: missing.length === 0,
    missing,
    documentCount: documents.length,
  };
}

module.exports = {
  categoryKeys,
  maxFilesPerCategory,
  maxFileBytes,
  allowedTypes,
  matchesSignature,
  requiredCategories,
  dossierSummary,
};

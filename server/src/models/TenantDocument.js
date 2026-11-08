const mongoose = require('mongoose');
const { categoryKeys, allowedTypes } = require('../lib/dossier');

const tenantDocumentSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: { type: String, enum: categoryKeys, required: true },
    originalName: { type: String, trim: true, maxlength: 160, required: true },
    mimeType: { type: String, enum: Object.keys(allowedTypes), required: true },
    size: { type: Number, min: 1, required: true },
    // Nom du fichier dans server/private-uploads/dossiers. Jamais servi directement.
    storedName: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model('TenantDocument', tenantDocumentSchema);

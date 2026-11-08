const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    tenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    housing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Housing',
      required: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
      default: 'pending',
      index: true,
    },
    // Score de compatibilité figé au moment de l'envoi, pour l'analyse (le profil peut changer ensuite).
    matchScore: { type: Number, min: 0, max: 100 },
    // Date à laquelle le propriétaire a accepté ou refusé.
    decidedAt: Date,
  },
  { timestamps: true },
);

applicationSchema.index({ tenant: 1, housing: 1 }, { unique: true });

module.exports = mongoose.model('Application', applicationSchema);

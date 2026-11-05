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
  },
  { timestamps: true },
);

applicationSchema.index({ tenant: 1, housing: 1 }, { unique: true });

module.exports = mongoose.model('Application', applicationSchema);

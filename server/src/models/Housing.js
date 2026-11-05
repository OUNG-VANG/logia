const mongoose = require('mongoose');

const housingSchema = new mongoose.Schema(
  {
    landlord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },
    propertyType: {
      type: String,
      enum: ['room', 'studio', 'apartment', 'house'],
      required: true,
    },
    location: {
      city: { type: String, required: true, trim: true },
      postalCode: { type: String, required: true, trim: true },
      country: { type: String, default: 'France', trim: true },
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      precision: { type: String, enum: ['address', 'city'], default: 'city' },
    },
    rent: {
      type: Number,
      required: true,
      min: 0,
    },
    charges: {
      type: Number,
      min: 0,
      default: 0,
    },
    areaM2: {
      type: Number,
      min: 1,
    },
    bedrooms: {
      type: Number,
      min: 0,
      default: 0,
    },
    availableFrom: Date,
    amenities: [{ type: String, trim: true }],
    images: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ['draft', 'published', 'rented'],
      default: 'draft',
      index: true,
    },
  },
  { timestamps: true },
);

housingSchema.index({ 'location.city': 1, status: 1, rent: 1 });

module.exports = mongoose.model('Housing', housingSchema);

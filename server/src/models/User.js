const mongoose = require('mongoose');
const { genders, situations, guarantorTypes } = require('../lib/profile');

const tenantProfileSchema = new mongoose.Schema(
  {
    birthDate: Date,
    situation: { type: String, enum: situations },
    occupationDetail: { type: String, trim: true, maxlength: 120 },
    monthlyIncome: { type: Number, min: 0 },
    guarantorType: { type: String, enum: guarantorTypes },
    householdSize: { type: Number, min: 1, max: 20 },
    desiredMoveIn: Date,
    desiredCity: { type: String, trim: true, maxlength: 80 },
    maxBudget: { type: Number, min: 0 },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['tenant', 'landlord', 'admin'],
      required: true,
      default: 'tenant',
    },
    // Facultatifs dans le schéma pour ne pas bloquer les comptes créés avant leur ajout ;
    // l'inscription et la page profil les rendent obligatoires.
    firstName: { type: String, trim: true, maxlength: 60 },
    lastName: { type: String, trim: true, maxlength: 60 },
    gender: { type: String, enum: genders },
    tenantProfile: tenantProfileSchema,
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);

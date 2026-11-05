const mongoose = require('mongoose');

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
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);

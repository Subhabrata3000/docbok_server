// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  full_name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true, // Ensures no two users have the same email
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['patient', 'doctor'], // Role must be one of these
    required: true,
  },
  fcm_token: { // For push notifications
    type: String, 
  },
  // === Doctor-Specific Fields ===
  specialty: {
    type: String,
    default: 'General Practice',
  },
  bio: {
    type: String,
    default: '',
  }
});

// This line is the most important part!
module.exports = mongoose.model('User', UserSchema);
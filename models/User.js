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
        unique: true,
      },
      password: {
        type: String,
        required: true,
      },
      role: {
        type: String,
        // --- THIS IS THE UPDATE ---
        enum: ['patient', 'doctor', 'admin'], // Added 'admin'
        required: true,
      },
      fcm_token: {
        type: String, 
      },
      
      // ==========================================================
      // ===           DOCTOR-SPECIFIC FIELDS           ===
      // ==========================================================
      profile_image: { 
        type: String, 
        default: "" 
      },

      specialty: {
        type: String,
      },
      qualifications: {
        type: String,
      },
      experience: {
        type: Number, // Storing years as a number
      },
      location: {
        type: String,
      },
      phoneNumber: {
        type: String,
      },
      consultationFee: {
        type: Number,
      },
      // We will store the availability as a JSON string
      availability: {
        type: String,
      },
      // ==========================================================
    });

    module.exports = mongoose.model('User', UserSchema);

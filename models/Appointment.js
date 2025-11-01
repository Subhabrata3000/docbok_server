// models/Appointment.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema; // To make 'ref' easier

const AppointmentSchema = new Schema({
  patient: {
    type: Schema.Types.ObjectId, // This is the "foreign key"
    ref: 'User', // Links to the 'User' model
    required: true,
  },
  doctor: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  appointment_time: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected'],
    default: 'pending', // Status is 'pending' when created
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

// This is the most important line that was likely missing
module.exports = mongoose.model('Appointment', AppointmentSchema);
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
        type: String, 
        // ✅ UPDATED: Added 'system_alert' to this list
        enum: ['appointment', 'system', 'promo', 'system_alert'], 
        default: 'system' 
    },
    // Optional: Add relatedId and onModel if you want deep linking later (Safe to add now)
    relatedId: { type: mongoose.Schema.Types.ObjectId },
    onModel: { type: String },
    
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
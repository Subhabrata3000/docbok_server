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
        enum: ['appointment', 'system', 'promo'], 
        default: 'system' 
    },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// 👇 THIS LINE IS CRITICAL. WITHOUT IT, YOU GET "find is not a function"
module.exports = mongoose.model('Notification', notificationSchema);
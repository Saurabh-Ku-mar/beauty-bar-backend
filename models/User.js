const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Basic Info
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        default: ''
    },
    picture: {
        type: String,
        default: ''
    },
    
    // Google Auth (Optional)
    googleId: {
        type: String,
        sparse: true,
        unique: true
    },
    
    // Stats
    loyaltyPoints: {
        type: Number,
        default: 0
    },
    totalBookings: {
        type: Number,
        default: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    },
    
    // Status
    isActive: {
        type: Boolean,
        default: true
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);

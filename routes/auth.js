const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Google authentication endpoint
router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;
        
        console.log('📥 Received Google credential');
        
        if (!credential) {
            console.error('❌ No credential provided');
            return res.status(400).json({
                success: false,
                message: 'No credential provided'
            });
        }
        
        // Verify the Google token
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        console.log('✅ Google token verified for:', payload.email);
        
        // Validate email domain (only Gmail)
        if (!payload.email.endsWith('@gmail.com')) {
            console.error('❌ Non-Gmail account attempted:', payload.email);
            return res.status(400).json({
                success: false,
                message: 'Only Gmail accounts are allowed. Please use a Gmail account to sign in.'
            });
        }
        
        // Check if user exists, if not create new
        let user = await User.findOne({ googleId: payload.sub });
        
        if (!user) {
            user = new User({
                googleId: payload.sub,
                email: payload.email,
                name: payload.name,
                picture: payload.picture,
                lastLogin: new Date()
            });
            await user.save();
            console.log('✅ New user created:', user.email);
        } else {
            // Update last login
            user.lastLogin = new Date();
            await user.save();
            console.log('✅ Existing user logged in:', user.email);
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user._id, 
                email: user.email,
                name: user.name
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        console.log('✅ JWT token generated for user:', user.email);
        
        // Return user data
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                picture: user.picture,
                loyaltyPoints: user.loyaltyPoints || 0
            }
        });
        
    } catch (error) {
        console.error('❌ Google auth error:', error);
        
        // Handle specific errors
        if (error.message.includes('Invalid token')) {
            return res.status(401).json({
                success: false,
                message: 'Invalid Google token. Please try again.'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Authentication failed. Please try again later.',
            error: error.message
        });
    }
});

// Verify token endpoint
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                valid: false,
                message: 'No token provided'
            });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({
                valid: false,
                message: 'User not found'
            });
        }
        
        res.json({
            valid: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                picture: user.picture
            }
        });
        
    } catch (error) {
        console.error('❌ Token verification error:', error);
        res.status(401).json({
            valid: false,
            message: 'Invalid token'
        });
    }
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

module.exports = router;
module.exports.verifyToken = verifyToken;

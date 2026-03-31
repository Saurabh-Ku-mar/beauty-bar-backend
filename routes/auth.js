const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ============================================
// EMAIL/PASSWORD REGISTRATION
// ============================================
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, mobile } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered. Please login.'
            });
        }
        
        // Create new user
        const user = new User({
            name,
            email,
            password,
            mobile,
            lastLogin: new Date()
        });
        
        await user.save();
        
        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                loyaltyPoints: user.loyaltyPoints
            }
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
});

// ============================================
// EMAIL/PASSWORD LOGIN
// ============================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Check if user has password (Google users don't have password)
        if (!user.password) {
            return res.status(401).json({
                success: false,
                message: 'Please login with Google'
            });
        }
        
        // Verify password
        const isValid = await user.comparePassword(password);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        
        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                picture: user.picture,
                loyaltyPoints: user.loyaltyPoints
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
});

// ============================================
// MOBILE NUMBER LOGIN (OTP based)
// ============================================
// Store OTPs temporarily (use Redis in production)
const otpStore = {};

// Send OTP
router.post('/send-otp', async (req, res) => {
    try {
        const { mobile } = req.body;
        
        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Store OTP with expiry (5 minutes)
        otpStore[mobile] = {
            otp,
            expiresAt: Date.now() + 5 * 60 * 1000
        };
        
        console.log(`📱 OTP for ${mobile}: ${otp}`); // In production, send via SMS
        
        // In production, send SMS using Twilio or other service
        // await sendSMS(mobile, `Your Beauty Bar login OTP is: ${otp}`);
        
        res.json({
            success: true,
            message: 'OTP sent successfully'
        });
        
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP'
        });
    }
});

// Verify OTP and login
router.post('/verify-otp', async (req, res) => {
    try {
        const { mobile, otp, name } = req.body;
        
        // Check OTP
        const storedOtp = otpStore[mobile];
        if (!storedOtp || storedOtp.otp !== otp) {
            return res.status(401).json({
                success: false,
                message: 'Invalid OTP'
            });
        }
        
        if (Date.now() > storedOtp.expiresAt) {
            delete otpStore[mobile];
            return res.status(401).json({
                success: false,
                message: 'OTP expired'
            });
        }
        
        // Find or create user
        let user = await User.findOne({ mobile });
        
        if (!user) {
            // Create new user with mobile number
            user = new User({
                name: name || `User_${mobile.slice(-4)}`,
                email: `${mobile}@temp.com`,
                mobile: mobile,
                lastLogin: new Date()
            });
            await user.save();
        } else {
            user.lastLogin = new Date();
            await user.save();
        }
        
        // Clear OTP
        delete otpStore[mobile];
        
        // Generate JWT token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                loyaltyPoints: user.loyaltyPoints
            }
        });
        
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Verification failed'
        });
    }
});

// ============================================
// GOOGLE AUTH (Keep existing)
// ============================================
router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;
        
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        
        const payload = ticket.getPayload();
        
        if (!payload.email.endsWith('@gmail.com')) {
            return res.status(400).json({
                success: false,
                message: 'Only Gmail accounts are allowed'
            });
        }
        
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
        } else {
            user.lastLogin = Date.now();
            await user.save();
        }
        
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
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
        console.error('Google auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
});

// Verify token
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ valid: false, message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({ valid: false, message: 'User not found' });
        }
        
        res.json({
            valid: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                picture: user.picture,
                mobile: user.mobile
            }
        });
        
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(401).json({ valid: false, message: 'Invalid token' });
    }
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

module.exports = router;
module.exports.verifyToken = verifyToken;

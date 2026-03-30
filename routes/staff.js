const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const { verifyToken } = require('./auth');

// Get all staff (public)
router.get('/', async (req, res) => {
    try {
        const staff = await Staff.find({ isActive: true }).populate('services', 'name');
        res.json({
            success: true,
            staff
        });
    } catch (error) {
        console.error('Get staff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch staff'
        });
    }
});

// Get staff by service (public)
router.get('/service/:serviceId', async (req, res) => {
    try {
        const staff = await Staff.find({ 
            isActive: true,
            services: req.params.serviceId 
        }).populate('services', 'name');
        res.json({
            success: true,
            staff
        });
    } catch (error) {
        console.error('Get staff by service error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch staff'
        });
    }
});

// Create staff (admin only)
router.post('/', verifyToken, async (req, res) => {
    try {
        const staff = new Staff(req.body);
        await staff.save();
        res.json({
            success: true,
            staff
        });
    } catch (error) {
        console.error('Create staff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create staff'
        });
    }
});

// Update staff (admin only)
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const staff = await Staff.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'Staff not found'
            });
        }
        res.json({
            success: true,
            staff
        });
    } catch (error) {
        console.error('Update staff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update staff'
        });
    }
});

// Delete staff (admin only)
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const staff = await Staff.findByIdAndDelete(req.params.id);
        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'Staff not found'
            });
        }
        res.json({
            success: true,
            message: 'Staff deleted successfully'
        });
    } catch (error) {
        console.error('Delete staff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete staff'
        });
    }
});

module.exports = router;

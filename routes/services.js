const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const { verifyToken } = require('./auth');

// Get all services (public)
router.get('/', async (req, res) => {
    try {
        const services = await Service.find({ isActive: true }).sort({ order: 1, createdAt: -1 });
        res.json({
            success: true,
            services
        });
    } catch (error) {
        console.error('Get services error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch services'
        });
    }
});

// Get single service (public)
router.get('/:id', async (req, res) => {
    try {
        const service = await Service.findById(req.params.id);
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }
        res.json({
            success: true,
            service
        });
    } catch (error) {
        console.error('Get service error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch service'
        });
    }
});

// Create service (admin only)
router.post('/', verifyToken, async (req, res) => {
    try {
        const service = new Service(req.body);
        await service.save();
        res.json({
            success: true,
            service
        });
    } catch (error) {
        console.error('Create service error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create service'
        });
    }
});

// Update service (admin only)
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const service = await Service.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }
        res.json({
            success: true,
            service
        });
    } catch (error) {
        console.error('Update service error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update service'
        });
    }
});

// Delete service (admin only)
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const service = await Service.findByIdAndDelete(req.params.id);
        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Service not found'
            });
        }
        res.json({
            success: true,
            message: 'Service deleted successfully'
        });
    } catch (error) {
        console.error('Delete service error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete service'
        });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Staff = require('../models/Staff');
const User = require('../models/User');

// Admin login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find admin
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, admin.password);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate token
        const token = jwt.sign(
            { adminId: admin._id, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({
            success: true,
            token,
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

// Dashboard stats
router.get('/dashboard', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        // Get statistics
        const [
            totalBookings,
            todayBookings,
            monthlyBookings,
            totalRevenue,
            monthlyRevenue,
            recentBookings
        ] = await Promise.all([
            Booking.countDocuments(),
            Booking.countDocuments({ date: { $gte: today } }),
            Booking.countDocuments({ date: { $gte: monthStart } }),
            Booking.aggregate([
                { $match: { paymentStatus: 'completed' } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]),
            Booking.aggregate([
                { 
                    $match: { 
                        paymentStatus: 'completed',
                        date: { $gte: monthStart }
                    }
                },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]),
            Booking.find()
                .sort({ createdAt: -1 })
                .limit(10)
                .populate('user', 'name email')
                .populate('service', 'name price')
        ]);

        res.json({
            success: true,
            stats: {
                totalBookings,
                todayBookings,
                monthlyBookings,
                totalRevenue: totalRevenue[0]?.total || 0,
                monthlyRevenue: monthlyRevenue[0]?.total || 0,
                recentBookings
            }
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard data'
        });
    }
});

// Manage bookings
router.get('/bookings', async (req, res) => {
    try {
        const { status, startDate, endDate } = req.query;
        
        let query = {};
        
        if (status) {
            query.bookingStatus = status;
        }
        
        if (startDate && endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const bookings = await Booking.find(query)
            .populate('user', 'name email phone')
            .populate('service', 'name price')
            .populate('staff', 'name')
            .sort({ date: -1 });

        res.json({
            success: true,
            bookings
        });

    } catch (error) {
        console.error('Fetch bookings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch bookings'
        });
    }
});

// Update booking status
router.patch('/bookings/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const booking = await Booking.findByIdAndUpdate(
            req.params.id,
            { 
                bookingStatus: status,
                updatedAt: Date.now()
            },
            { new: true }
        );

        res.json({
            success: true,
            booking
        });

    } catch (error) {
        console.error('Update booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update booking'
        });
    }
});

// Service management
router.post('/services', async (req, res) => {
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

router.put('/services/:id', async (req, res) => {
    try {
        const service = await Service.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

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

router.delete('/services/:id', async (req, res) => {
    try {
        await Service.findByIdAndDelete(req.params.id);

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

// Staff management
router.post('/staff', async (req, res) => {
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

router.get('/staff', async (req, res) => {
    try {
        const staff = await Staff.find().populate('services');

        res.json({
            success: true,
            staff
        });

    } catch (error) {
        console.error('Fetch staff error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch staff'
        });
    }
});

module.exports = router;

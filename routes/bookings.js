const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Staff = require('../models/Staff');
const { verifyToken } = require('./auth');

// Get user's bookings (authenticated)
router.get('/my-bookings', verifyToken, async (req, res) => {
    try {
        const bookings = await Booking.find({ user: req.userId })
            .populate('service', 'name price duration image')
            .populate('staff', 'name image specialty')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            bookings
        });
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch bookings'
        });
    }
});

// Get single booking
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('service', 'name price duration image')
            .populate('staff', 'name image specialty');
        
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }
        
        // Check if user owns this booking
        if (booking.user.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }
        
        res.json({
            success: true,
            booking
        });
    } catch (error) {
        console.error('Get booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch booking'
        });
    }
});

// Create new booking (after payment)
router.post('/', verifyToken, async (req, res) => {
    try {
        const {
            serviceId,
            staffId,
            date,
            time,
            totalAmount,
            advanceAmount,
            customerName,
            customerEmail,
            customerPhone,
            notes,
            razorpayOrderId,
            razorpayPaymentId
        } = req.body;
        
        const booking = new Booking({
            user: req.userId,
            service: serviceId,
            staff: staffId,
            date,
            time,
            totalAmount,
            advanceAmount,
            paymentStatus: 'completed',
            bookingStatus: 'confirmed',
            razorpayOrderId,
            razorpayPaymentId,
            customerDetails: {
                name: customerName,
                email: customerEmail,
                phone: customerPhone,
                notes
            }
        });
        
        await booking.save();
        
        res.json({
            success: true,
            booking
        });
    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create booking'
        });
    }
});

// Cancel booking
router.put('/:id/cancel', verifyToken, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }
        
        // Check if user owns this booking
        if (booking.user.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized'
            });
        }
        
        // Check if booking can be cancelled (at least 24 hours before)
        const bookingDate = new Date(booking.date);
        const now = new Date();
        const hoursDiff = (bookingDate - now) / (1000 * 60 * 60);
        
        if (hoursDiff < 24) {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel booking less than 24 hours before appointment'
            });
        }
        
        booking.bookingStatus = 'cancelled';
        await booking.save();
        
        res.json({
            success: true,
            message: 'Booking cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel booking error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel booking'
        });
    }
});

// Get available time slots for a date
router.get('/available-slots/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const { serviceId, staffId } = req.query;
        
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        
        // Get all booked slots for that date
        const query = {
            date: { $gte: startDate, $lte: endDate },
            bookingStatus: { $in: ['confirmed', 'pending'] }
        };
        
        if (staffId) query.staff = staffId;
        
        const bookedBookings = await Booking.find(query);
        
        // Define all time slots
        const allSlots = [
            '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM',
            '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
            '6:00 PM', '7:00 PM'
        ];
        
        // Get booked slots
        const bookedSlots = bookedBookings.map(b => b.time);
        
        // Filter available slots
        const availableSlots = allSlots.filter(slot => !bookedSlots.includes(slot));
        
        res.json({
            success: true,
            availableSlots
        });
    } catch (error) {
        console.error('Get available slots error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available slots'
        });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const { verifyToken } = require('./auth');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create Razorpay order
router.post('/create-order', verifyToken, async (req, res) => {
    try {
        const { amount, bookingId } = req.body;

        const options = {
            amount: amount * 100, // Convert to paise
            currency: 'INR',
            receipt: `receipt_${bookingId}`,
            notes: {
                bookingId: bookingId,
                userId: req.userId
            }
        };

        const order = await razorpay.orders.create(options);

        // Update booking with Razorpay order ID
        await Booking.findByIdAndUpdate(bookingId, {
            razorpayOrderId: order.id
        });

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency
        });

    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create order'
        });
    }
});

// Verify payment signature
router.post('/verify', verifyToken, async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            bookingId
        } = req.body;

        // Generate signature for verification
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        // Verify signature
        if (expectedSignature === razorpay_signature) {
            // Update booking with payment details
            const booking = await Booking.findByIdAndUpdate(bookingId, {
                paymentStatus: 'completed',
                bookingStatus: 'confirmed',
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature
            }, { new: true });

            // Send confirmation emails/SMS here
            // await sendConfirmation(booking);

            res.json({
                success: true,
                message: 'Payment verified successfully',
                booking
            });
        } else {
            // Payment verification failed
            await Booking.findByIdAndUpdate(bookingId, {
                paymentStatus: 'failed',
                bookingStatus: 'pending'
            });

            res.status(400).json({
                success: false,
                message: 'Invalid signature'
            });
        }

    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed'
        });
    }
});

// Webhook for payment status updates
router.post('/webhook', async (req, res) => {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers['x-razorpay-signature'];

        // Verify webhook signature
        const shasum = crypto.createHmac('sha256', webhookSecret);
        shasum.update(JSON.stringify(req.body));
        const digest = shasum.digest('hex');

        if (signature === digest) {
            const event = req.body.event;
            const payment = req.body.payload.payment.entity;

            if (event === 'payment.captured') {
                // Update booking status
                const booking = await Booking.findOne({
                    razorpayOrderId: payment.order_id
                });

                if (booking)
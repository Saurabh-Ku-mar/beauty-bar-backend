// backend/routes/payments.js
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

// ============================================
// CREATE RAZORPAY ORDER
// ============================================
router.post('/create-order', verifyToken, async (req, res) => {
    try {
        const { amount, bookingId } = req.body;
        
        console.log('Creating Razorpay order for amount:', amount);
        
        const options = {
            amount: Math.round(amount * 100), // Convert to paise
            currency: 'INR',
            receipt: `receipt_${bookingId}_${Date.now()}`,
            notes: {
                bookingId: bookingId,
                userId: req.userId,
                timestamp: Date.now().toString()
            }
        };
        
        const order = await razorpay.orders.create(options);
        
        console.log('Order created:', order.id);
        
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
            message: 'Failed to create order',
            error: error.message
        });
    }
});

// ============================================
// VERIFY PAYMENT SIGNATURE
// ============================================
router.post('/verify', verifyToken, async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            bookingId
        } = req.body;
        
        console.log('Verifying payment for order:', razorpay_order_id);
        
        // Generate signature for verification
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');
        
        // Verify signature
        if (expectedSignature === razorpay_signature) {
            console.log('Payment verified successfully');
            
            // Create or update booking
            const booking = new Booking({
                user: req.userId,
                razorpayOrderId: razorpay_order_id,
                razorpayPaymentId: razorpay_payment_id,
                razorpaySignature: razorpay_signature,
                paymentStatus: 'completed',
                bookingStatus: 'confirmed',
                date: new Date(),
                totalAmount: 0,
                advanceAmount: 0,
                customerDetails: {
                    name: req.body.customerName || '',
                    email: req.body.customerEmail || '',
                    phone: req.body.customerPhone || ''
                }
            });
            
            await booking.save();
            
            res.json({
                success: true,
                message: 'Payment verified successfully',
                booking
            });
        } else {
            console.error('Invalid signature');
            res.status(400).json({
                success: false,
                message: 'Invalid signature'
            });
        }
        
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed',
            error: error.message
        });
    }
});

// ============================================
// WEBHOOK ENDPOINT - CRITICAL FOR PAYMENT UPDATES
// ============================================
router.post('/webhook', async (req, res) => {
    console.log('=== WEBHOOK RECEIVED ===');
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers['x-razorpay-signature'];
        
        if (!signature) {
            console.error('No signature in webhook request');
            return res.status(400).json({ error: 'No signature' });
        }
        
        // Verify webhook signature
        const shasum = crypto.createHmac('sha256', webhookSecret);
        shasum.update(JSON.stringify(req.body));
        const digest = shasum.toString('hex');
        
        if (signature === digest) {
            console.log('✅ Webhook signature verified');
            
            const event = req.body.event;
            const payment = req.body.payload?.payment?.entity;
            const order = req.body.payload?.order?.entity;
            
            console.log('Event:', event);
            console.log('Payment ID:', payment?.id);
            console.log('Order ID:', payment?.order_id || order?.id);
            
            switch(event) {
                case 'payment.captured':
                    console.log('✅ Payment captured:', payment.id);
                    await handlePaymentCaptured(payment);
                    break;
                    
                case 'payment.failed':
                    console.log('❌ Payment failed:', payment.id);
                    await handlePaymentFailed(payment);
                    break;
                    
                case 'payment.authorized':
                    console.log('🟡 Payment authorized:', payment.id);
                    await handlePaymentAuthorized(payment);
                    break;
                    
                case 'payment.dispute.created':
                    console.log('⚠️ Dispute created:', payment.id);
                    await handleDisputeCreated(payment);
                    break;
                    
                case 'payment.refunded':
                    console.log('💰 Payment refunded:', payment.id);
                    await handlePaymentRefunded(payment);
                    break;
                    
                default:
                    console.log('Unhandled event:', event);
            }
            
            // Always respond with 200 OK
            res.status(200).json({ 
                status: 'ok',
                received: true,
                event: event
            });
            
        } else {
            console.error('❌ Invalid webhook signature');
            console.error('Expected:', digest);
            console.error('Received:', signature);
            res.status(400).json({ 
                error: 'Invalid signature',
                expected: digest,
                received: signature
            });
        }
        
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ 
            error: 'Webhook processing failed',
            message: error.message
        });
    }
});

// ============================================
// WEBHOOK TEST ENDPOINT (for testing only)
// ============================================
router.get('/webhook-test', (req, res) => {
    res.json({
        success: true,
        message: 'Webhook endpoint is working',
        timestamp: new Date().toISOString(),
        config: {
            webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ? 'Set' : 'Not set',
            razorpayKey: process.env.RAZORPAY_KEY_ID ? 'Set' : 'Not set'
        }
    });
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function handlePaymentCaptured(payment) {
    try {
        const orderId = payment.order_id;
        const paymentId = payment.id;
        const amount = payment.amount / 100;
        
        console.log(`Processing captured payment: ${paymentId} for order: ${orderId}`);
        
        // Find or create booking
        let booking = await Booking.findOne({ razorpayOrderId: orderId });
        
        if (booking) {
            booking.paymentStatus = 'completed';
            booking.bookingStatus = 'confirmed';
            booking.razorpayPaymentId = paymentId;
            booking.totalAmount = amount;
            booking.advanceAmount = amount;
            booking.updatedAt = new Date();
            await booking.save();
            
            console.log(`✅ Booking ${booking._id} updated to confirmed`);
        } else {
            console.log(`No booking found for order ${orderId}, creating new...`);
            
            // Create new booking (fallback)
            booking = new Booking({
                razorpayOrderId: orderId,
                razorpayPaymentId: paymentId,
                paymentStatus: 'completed',
                bookingStatus: 'confirmed',
                totalAmount: amount,
                advanceAmount: amount,
                date: new Date(),
                customerDetails: {
                    name: payment.notes?.customerName || 'Customer',
                    email: payment.notes?.customerEmail || '',
                    phone: payment.notes?.customerPhone || ''
                }
            });
            await booking.save();
            console.log(`✅ New booking created: ${booking._id}`);
        }
        
        // TODO: Send confirmation email
        // await sendConfirmationEmail(booking);
        
    } catch (error) {
        console.error('Error handling captured payment:', error);
    }
}

async function handlePaymentFailed(payment) {
    try {
        const orderId = payment.order_id;
        
        console.log(`Processing failed payment for order: ${orderId}`);
        
        const booking = await Booking.findOne({ razorpayOrderId: orderId });
        
        if (booking) {
            booking.paymentStatus = 'failed';
            booking.bookingStatus = 'pending';
            booking.updatedAt = new Date();
            await booking.save();
            
            console.log(`❌ Booking ${booking._id} marked as failed`);
        }
        
    } catch (error) {
        console.error('Error handling failed payment:', error);
    }
}

async function handlePaymentAuthorized(payment) {
    try {
        console.log(`Payment authorized: ${payment.id}`);
        // Optionally store authorization status
    } catch (error) {
        console.error('Error handling authorized payment:', error);
    }
}

async function handleDisputeCreated(payment) {
    try {
        console.log(`Dispute created for payment: ${payment.id}`);
        
        // TODO: Send notification to admin
        // await notifyAdminAboutDispute(payment);
        
    } catch (error) {
        console.error('Error handling dispute:', error);
    }
}

async function handlePaymentRefunded(payment) {
    try {
        const orderId = payment.order_id;
        
        console.log(`Processing refund for order: ${orderId}`);
        
        const booking = await Booking.findOne({ razorpayOrderId: orderId });
        
        if (booking) {
            booking.paymentStatus = 'refunded';
            booking.bookingStatus = 'cancelled';
            booking.updatedAt = new Date();
            await booking.save();
            
            console.log(`💰 Booking ${booking._id} marked as refunded`);
        }
        
    } catch (error) {
        console.error('Error handling refund:', error);
    }
}

// ============================================
// REFUND ENDPOINT
// ============================================
router.post('/refund/:paymentId', verifyToken, async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { amount } = req.body;
        
        console.log(`Processing refund for payment: ${paymentId}`);
        
        const refundOptions = {
            payment_id: paymentId,
            amount: amount * 100
        };
        
        const refund = await razorpay.payments.refund(paymentId, refundOptions);
        
        console.log('Refund processed:', refund.id);
        
        // Update booking status
        const booking = await Booking.findOneAndUpdate(
            { razorpayPaymentId: paymentId },
            { 
                paymentStatus: 'refunded',
                bookingStatus: 'cancelled',
                updatedAt: new Date()
            }
        );
        
        res.json({
            success: true,
            refund: refund,
            booking: booking
        });
        
    } catch (error) {
        console.error('Refund error:', error);
        res.status(500).json({
            success: false,
            message: 'Refund failed',
            error: error.message
        });
    }
});

module.exports = router;
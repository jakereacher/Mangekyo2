/**
 * Razorpay Payment Controller
 *
 * This controller handles all Razorpay payment related operations.
 */

const { razorpay, razorpayKeySecret } = require('../../config/razorpay');
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const StatusCodes = require('../../utils/httpStatusCodes');
const crypto = require('crypto');

//=================================================================================================
// Create Razorpay Order
//=================================================================================================
// This function creates a new Razorpay order.
// It creates a new Razorpay order.
//=================================================================================================
/**
 * Create a new Razorpay order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createRazorpayOrder = async (req, res) => {
  // Ensure we always return JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    console.log('Creating Razorpay order with request body:', req.body);
    const { orderId } = req.body;

    if (!orderId) {
      console.log('Order ID is missing in the request');
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    // Find the order in the database
    console.log('Looking up order with ID:', orderId);
    const order = await Order.findById(orderId);
    if (!order) {
      console.log('Order not found with ID:', orderId);
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Order not found'
      });
    }
    console.log('Found order:', order._id, 'with amount:', order.finalAmount);

    // Check if the order belongs to the current user
    if (order.userId.toString() !== req.session.user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'Unauthorized access to this order'
      });
    }

    // Check if the order is already paid
    if (order.paymentStatus === 'Paid') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Order is already paid'
      });
    }

    // Get non-cancelled items
    const nonCancelledItems = order.orderedItems.filter(item => item.status !== 'Cancelled');

    // Calculate subtotal for non-cancelled items
    const subtotal = Math.round(nonCancelledItems.reduce((sum, item) => sum + (item.price * item.quantity), 0));

    // Add shipping and tax
    const shipping = Math.round(order.shippingCharge || 0);
    const tax = Math.round(order.taxAmount || (subtotal * 0.09)); // Default tax rate if not specified

    // Calculate final amount
    let finalAmount = Math.round(subtotal + shipping + tax);

    // Apply discount if applicable
    if (order.discount && order.discount > 0) {
      finalAmount = Math.round(finalAmount - Math.round(order.discount));
    }

    // Ensure amount is not negative
    finalAmount = Math.max(0, Math.round(finalAmount));

    // Razorpay requires amount in paise (smallest currency unit for INR)
    // Convert rupees to paise by multiplying by 100
    const amountInPaise = Math.max(100, Math.round(finalAmount * 100));

    console.log('Payment calculation for non-cancelled items:', {
      subtotal,
      shipping,
      tax,
      discount: order.discount || 0,
      finalAmountInRupees: finalAmount,
      amountInPaise: amountInPaise,
      note: 'Razorpay requires paise: ₹' + finalAmount + ' = ' + amountInPaise + ' paise'
    });

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: order._id.toString(),
      payment_capture: 1 // Auto-capture payment
    };

    console.log('Creating Razorpay order with options:', options);

    // Make sure we have a valid Razorpay instance
    if (!razorpay || typeof razorpay.orders.create !== 'function') {
      throw new Error('Razorpay instance is not properly initialized');
    }

    // Log Razorpay configuration
    console.log('Razorpay configuration:', {
      key_id: razorpay.key_id,
      // Don't log the full key_secret for security reasons
      key_secret_prefix: razorpay.key_secret ? razorpay.key_secret.substring(0, 4) + '...' : 'undefined'
    });

    try {
      const razorpayOrder = await razorpay.orders.create(options);
      console.log('Razorpay order created successfully:', razorpayOrder.id);

      // Update the order with Razorpay order ID
      order.razorpayOrderId = razorpayOrder.id;
      await order.save();

      // Format the response to match what the frontend expects
      res.status(StatusCodes.OK).json({
        success: true,
        order: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          receipt: razorpayOrder.receipt,
          status: razorpayOrder.status
        },
        orderId: order._id
      });
    } catch (razorpayError) {
      // Extract detailed error information
      const errorDetails = razorpayError.error || {};
      const errorDescription = errorDetails.description || razorpayError.message || 'Unknown error';

      throw new Error(`Razorpay API error: ${errorDescription}`);
    }
  } catch (error) {
    // Check if it's a Razorpay API error
    const errorMessage = error.error && error.error.description
      ? error.error.description
      : (error.message || 'Failed to create Razorpay order');

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to create Razorpay order',
      error: errorMessage
    });
  }
};

//=================================================================================================
// Verify Razorpay Payment
//=================================================================================================
// This function verifies a Razorpay payment.
// It verifies a Razorpay payment.
//=================================================================================================
/**
 * Verify Razorpay payment
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const verifyRazorpayPayment = async (req, res) => {
  // Ensure we always return JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

    // Validate required parameters
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_id) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Missing required parameters for payment verification'
      });
    }

    // Verify the payment signature
    const generatedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Find the order in the database
    const order = await Order.findById(order_id);
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if payment is already processed
    if (order.paymentStatus === 'Paid' && order.razorpayPaymentId) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Payment already verified',
        orderId: order._id
      });
    }

    // Update the order payment status
    order.paymentStatus = 'Paid';
    order.razorpayPaymentId = razorpay_payment_id;
    await order.save();
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Payment verified successfully',
      orderId: order._id
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
};

//=================================================================================================
// Module Exports
//=================================================================================================
// This exports the razorpay controller functions.
// It exports the razorpay controller functions to be used in the user routes.
//=================================================================================================
module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment
};

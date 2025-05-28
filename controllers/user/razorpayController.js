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

/**
 * Create a new Razorpay order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createRazorpayOrder = async (req, res) => {
  try {
    console.log('Creating Razorpay order with request body:', req.body);
    const { orderId } = req.body;

    if (!orderId) {
      console.log('Order ID is missing in the request');
      return res.status(StatusCodes.BAD_REQUEST)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: 'Order ID is required'
        });
    }

    // Find the order in the database
    console.log('Looking up order with ID:', orderId);
    const order = await Order.findById(orderId);
    if (!order) {
      console.log('Order not found with ID:', orderId);
      return res.status(StatusCodes.NOT_FOUND)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: 'Order not found'
        });
    }
    console.log('Found order:', order._id, 'with amount:', order.finalAmount);

    // Check if the order belongs to the current user
    if (order.userId.toString() !== req.session.user) {
      return res.status(StatusCodes.UNAUTHORIZED)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: 'Unauthorized access to this order'
        });
    }

    // Check if the order is already paid
    if (order.paymentStatus === 'Paid') {
      return res.status(StatusCodes.BAD_REQUEST)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: 'Order is already paid'
        });
    }

    // Get non-cancelled items
    const nonCancelledItems = order.orderedItems.filter(item => item.status !== 'Cancelled');

    // Calculate subtotal for non-cancelled items
    const subtotal = nonCancelledItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Add shipping and tax
    const shipping = order.shippingCharge || 0;
    const tax = order.taxAmount || (subtotal * 0.09); // Default tax rate if not specified

    // Calculate final amount
    let finalAmount = subtotal + shipping + tax;

    // Apply discount if applicable
    if (order.discount && order.discount > 0) {
      finalAmount -= order.discount;
    }

    // Ensure amount is not negative
    finalAmount = Math.max(0, finalAmount);

    // Convert to cents (smallest currency unit for USD)
    const amount = Math.max(100, Math.round(finalAmount * 100));

    console.log('Payment calculation for non-cancelled items:', {
      subtotal,
      shipping,
      tax,
      discount: order.discount || 0,
      finalAmount,
      finalAmountInCents: amount
    });

    const options = {
      amount: amount,
      currency: 'USD',
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
      res.status(StatusCodes.OK)
        .header('Content-Type', 'application/json')
        .json({
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
      console.error('Razorpay API error:', razorpayError);

      // Extract detailed error information
      const errorDetails = razorpayError.error || {};
      const errorDescription = errorDetails.description || razorpayError.message || 'Unknown error';

      throw new Error(`Razorpay API error: ${errorDescription}`);
    }
  } catch (error) {
    console.error('Error creating Razorpay order:', error);

    // Check if it's a Razorpay API error
    const errorMessage = error.error && error.error.description
      ? error.error.description
      : (error.message || 'Failed to create Razorpay order');

    console.error('Detailed error:', errorMessage);

    res.status(StatusCodes.INTERNAL_SERVER_ERROR)
      .header('Content-Type', 'application/json')
      .json({
        success: false,
        message: 'Failed to create Razorpay order',
        error: errorMessage
      });
  }
};

/**
 * Verify Razorpay payment
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const verifyRazorpayPayment = async (req, res) => {
  try {
    console.log('Verifying Razorpay payment with request body:', req.body);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

    // Validate required parameters
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_id) {
      console.error('Missing required parameters for payment verification');
      return res.status(StatusCodes.BAD_REQUEST)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: 'Missing required parameters for payment verification'
        });
    }

    // Verify the payment signature
    console.log('Generating signature for verification...');
    const generatedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    console.log('Signature verification:', {
      provided: razorpay_signature,
      generated: generatedSignature,
      match: generatedSignature === razorpay_signature
    });

    if (generatedSignature !== razorpay_signature) {
      return res.status(StatusCodes.BAD_REQUEST)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: 'Invalid payment signature'
        });
    }

    // Find the order in the database
    console.log('Looking up order with ID:', order_id);
    const order = await Order.findById(order_id);
    if (!order) {
      console.error('Order not found with ID:', order_id);
      return res.status(StatusCodes.NOT_FOUND)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: 'Order not found'
        });
    }

    // Check if payment is already processed
    if (order.paymentStatus === 'Paid' && order.razorpayPaymentId) {
      console.log('Payment already processed for order:', order_id);
      return res.status(StatusCodes.OK)
        .header('Content-Type', 'application/json')
        .json({
          success: true,
          message: 'Payment already verified',
          orderId: order._id
        });
    }

    // Update the order payment status
    console.log('Updating order payment status to Paid');
    order.paymentStatus = 'Paid';
    order.razorpayPaymentId = razorpay_payment_id;
    await order.save();

    console.log('Payment verified successfully for order:', order_id);
    res.status(StatusCodes.OK)
      .header('Content-Type', 'application/json')
      .json({
        success: true,
        message: 'Payment verified successfully',
        orderId: order._id
      });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR)
      .header('Content-Type', 'application/json')
      .json({
        success: false,
        message: 'Failed to verify payment',
        error: error.message
      });
  }
};

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment
};

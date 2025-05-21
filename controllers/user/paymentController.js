const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const { razorpayKeyId } = require("../../config/razorpay");

/**
 * Render the payment success page
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const renderPaymentSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentId } = req.query;
    const userId = req.session.user;

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).redirect('/orders');
    }

    // Check if the order belongs to the user
    if (order.userId.toString() !== userId) {
      return res.status(StatusCodes.UNAUTHORIZED).redirect('/orders');
    }

    // Render the payment success page
    res.render('payment-success', {
      orderId: order._id,
      paymentMethod: order.paymentMethod,
      paymentId: paymentId || order.razorpayPaymentId || (order.paymentDetails && order.paymentDetails.transactionId)
    });
  } catch (error) {
    console.error('Error rendering payment success page:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).redirect('/orders');
  }
};

/**
 * Render the payment failure page
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const renderPaymentFailure = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { error } = req.query;
    const userId = req.session.user;

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).redirect('/orders');
    }

    // Check if the order belongs to the user
    if (order.userId.toString() !== userId) {
      return res.status(StatusCodes.UNAUTHORIZED).redirect('/orders');
    }

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).redirect('/orders');
    }

    // Check if it's a wallet payment failure
    const isWalletFailure = order.paymentMethod === 'wallet' || (error && error.toLowerCase().includes('wallet'));

    // Update the order payment status to Failed if it's not already Paid
    if (order.paymentStatus !== 'Paid') {
      console.log(`Updating payment status to Failed for order ${orderId}`);
      order.paymentStatus = 'Failed';
      await order.save();
    }

    // Render the payment failure page
    res.render('payment-failure', {
      orderId: order._id,
      paymentMethod: order.paymentMethod,
      errorMessage: error || 'Payment failed. Please try again.',
      razorpayKeyId,
      userName: user.name,
      userEmail: user.email,
      userPhone: user.mobile || '',
      isWalletFailure: isWalletFailure,
      walletBalance: user.wallet || 0
    });
  } catch (error) {
    console.error('Error rendering payment failure page:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).redirect('/orders');
  }
};

module.exports = {
  renderPaymentSuccess,
  renderPaymentFailure
};

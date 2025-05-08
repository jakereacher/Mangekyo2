/**
 * Wallet Controller
 * Handles wallet-related operations such as adding money, verifying payments, and getting wallet balance.
 */

const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
const { razorpay, razorpayKeyId, razorpayKeySecret } = require("../../config/razorpay");
const StatusCodes = require("../../utils/httpStatusCodes");
const crypto = require("crypto");

/**
 * Create a Razorpay order for adding money to wallet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const addMoney = async (req, res) => {
  try {
    console.log("Add money request received:", req.body);

    // Check if user is authenticated
    if (!req.session || !req.session.user) {
      console.error("User not authenticated");
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const userId = req.session.user;
    console.log("User ID:", userId);

    const { amount } = req.body;
    console.log("Amount:", amount);

    // Validate amount
    if (!amount || amount < 1) {
      console.error("Invalid amount:", amount);
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Amount must be at least 1"
      });
    }

    // Find or create wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      console.log("Creating new wallet for user:", userId);
      wallet = new Wallet({
        user: userId,
        balance: 0
      });
      await wallet.save();
    }
    console.log("Wallet found/created:", wallet);

    // Check if Razorpay is initialized
    if (!razorpay) {
      console.error("Razorpay not initialized");
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Payment gateway not initialized"
      });
    }

    // Create a Razorpay order
    // Generate a shorter receipt ID (must be <= 40 characters)
    const shortUserId = userId.toString().slice(-6); // Use last 6 chars of user ID
    const timestamp = Date.now().toString().slice(-10); // Use last 10 digits of timestamp
    const receipt = `wallet_${shortUserId}_${timestamp}`;

    console.log("Generated receipt ID:", receipt, "Length:", receipt.length);

    const options = {
      amount: amount * 100, // amount in the smallest currency unit (paise)
      currency: "INR",
      receipt: receipt,
      payment_capture: 1 // Auto-capture payment
    };

    console.log("Creating Razorpay order with options:", options);

    const razorpayOrder = await razorpay.orders.create(options);
    console.log("Razorpay order created successfully:", razorpayOrder.id);

    // Create a pending wallet transaction
    const transaction = new WalletTransaction({
      user: userId,
      amount: amount,
      type: "credit",
      description: "Add money to wallet",
      status: "pending",
      razorpayOrderId: razorpayOrder.id
    });
    await transaction.save();
    console.log("Transaction created:", transaction._id);

    res.status(StatusCodes.OK).json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt
      },
      transactionId: transaction._id
    });
  } catch (error) {
    console.error("Error adding money to wallet:", error);

    // Provide more specific error messages based on the error type
    let errorMessage = "Failed to add money to wallet";
    let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;

    if (error.statusCode === 400) {
      statusCode = StatusCodes.BAD_REQUEST;
      if (error.error && error.error.description) {
        errorMessage = `Razorpay error: ${error.error.description}`;
      } else {
        errorMessage = "Invalid request to payment gateway";
      }
    } else if (error.name === "ValidationError") {
      statusCode = StatusCodes.BAD_REQUEST;
      errorMessage = "Validation error: " + error.message;
    } else if (error.name === "MongoError" || error.name === "MongoServerError") {
      errorMessage = "Database error occurred";
    }

    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: error.message,
      details: error.error || null
    });
  }
};

/**
 * Verify Razorpay payment for wallet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
    const userId = req.session.user;

    // Validate required parameters
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Missing required parameters for payment verification"
      });
    }

    // Verify the payment signature
    const generatedSignature = crypto
      .createHmac("sha256", razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid payment signature"
      });
    }

    // Find the transaction
    const transaction = await WalletTransaction.findOne({
      razorpayOrderId: razorpay_order_id,
      user: userId,
      status: "pending"
    });

    if (!transaction) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Transaction not found or already processed"
      });
    }

    // Update transaction status
    transaction.status = "completed";
    transaction.razorpayPaymentId = razorpay_payment_id;
    await transaction.save();

    // Update wallet balance
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Wallet not found"
      });
    }

    wallet.balance += transaction.amount;
    await wallet.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Payment verified and wallet updated successfully",
      balance: wallet.balance
    });
  } catch (error) {
    console.error("Error verifying wallet payment:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to verify payment",
      error: error.message
    });
  }
};

/**
 * Get wallet balance
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getWalletBalance = async (req, res) => {
  try {
    const userId = req.session.user;

    // Find or create wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = new Wallet({
        user: userId,
        balance: 0
      });
      await wallet.save();
    }

    res.status(StatusCodes.OK).json({
      success: true,
      balance: wallet.balance
    });
  } catch (error) {
    console.error("Error getting wallet balance:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to get wallet balance",
      error: error.message
    });
  }
};

/**
 * Get wallet transactions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getWalletTransactions = async (req, res) => {
  try {
    const userId = req.session.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const transactions = await WalletTransaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalTransactions = await WalletTransaction.countDocuments({ user: userId });

    res.status(StatusCodes.OK).json({
      success: true,
      transactions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalTransactions / limit),
        totalTransactions
      }
    });
  } catch (error) {
    console.error("Error getting wallet transactions:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to get wallet transactions",
      error: error.message
    });
  }
};

module.exports = {
  addMoney,
  verifyPayment,
  getWalletBalance,
  getWalletTransactions
};

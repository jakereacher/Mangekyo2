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

//=================================================================================================
// Add Money
//=================================================================================================
// This function creates a Razorpay order for adding money to a user's wallet.
// It creates a Razorpay order for adding money to a user's wallet.
//=================================================================================================
/**
 * Create a Razorpay order for adding money to wallet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const addMoney = async (req, res) => {
  // Ensure we always return JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    if (!req.session || !req.session.user) {
      console.error("User not authenticated");
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const userId = req.session.user;
    const { amount } = req.body;
    if (!amount || amount < 1) {
      console.error("Invalid amount:", amount);
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Amount must be at least 1"
      });
    }

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = new Wallet({
        user: userId,
        balance: 0
      });
      await wallet.save();
    }
    if (!razorpay) {
      console.error("Razorpay not initialized");
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Payment gateway not initialized"
      });
    }


    const shortUserId = userId.toString().slice(-6); // Use last 6 chars of user ID
    const timestamp = Date.now().toString().slice(-10); // Use last 10 digits of timestamp
    const receipt = `wallet_${shortUserId}_${timestamp}`;

    // Razorpay requires amount in paise (smallest currency unit for INR)
    // Convert rupees to paise by multiplying by 100
    const amountInPaise = Math.max(100, Math.round(amount * 100));

    console.log('Wallet add money - Payment calculation:', {
      requestedAmountInRupees: amount,
      amountInPaise: amountInPaise,
      note: 'Razorpay requires paise: ₹' + amount + ' = ' + amountInPaise + ' paise'
    });

    const options = {
      amount: amountInPaise, // amount in paise (required by Razorpay)
      currency: "INR",
      receipt: receipt,
      payment_capture: 1 // Auto-capture payment
    };

    console.log('Creating Razorpay order for wallet with options:', options);
    const razorpayOrder = await razorpay.orders.create(options);
    const transaction = new WalletTransaction({
      user: userId,
      amount: amount,
      type: "credit",
      description: "Add money to wallet",
      status: "pending",
      razorpayOrderId: razorpayOrder.id
    });
    await transaction.save();
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

//=================================================================================================
// Verify Razorpay Payment
//=================================================================================================
// This function verifies a Razorpay payment for a user's wallet.
// It verifies a Razorpay payment for a user's wallet.
//=================================================================================================
/**
 * Verify Razorpay payment for wallet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const verifyPayment = async (req, res) => {
  // Ensure we always return JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
    const userId = req.session.user;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Missing required parameters for payment verification"
      });
    }

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

    transaction.status = "completed";
    transaction.razorpayPaymentId = razorpay_payment_id;
    await transaction.save();

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found"
      });
    }

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {

      wallet = new Wallet({
        user: userId,
        balance: 0
      });
    }

    wallet.balance += transaction.amount;
    await wallet.save();
    if (typeof user.wallet === 'number') {
      user.wallet = wallet.balance;
      await user.save();
    }

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

//=================================================================================================
// Get Wallet Balance
//=================================================================================================
// This function gets the balance of a user's wallet.
// It gets the balance of a user's wallet.
//=================================================================================================
/**
 * Get wallet balance
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getWalletBalance = async (req, res) => {
  // Ensure we always return JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    const userId = req.session.user;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found"
      });
    }

    let wallet = await Wallet.findOne({ user: userId });
    let walletBalance = 0;

    if (wallet) {
      walletBalance = wallet.balance;
    } else {

      const initialBalance = typeof user.wallet === 'number' ? user.wallet : 0;
      wallet = new Wallet({
        user: userId,
        balance: initialBalance
      });
      walletBalance = initialBalance;
      await wallet.save();
    }

    if (typeof user.wallet === 'number' && user.wallet !== wallet.balance) {
      user.wallet = wallet.balance;
      await user.save();
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

//=================================================================================================
// Get Wallet Transactions
//=================================================================================================
// This function gets the transactions of a user's wallet.
// It gets the transactions of a user's wallet.
//=================================================================================================
/**
 * Get wallet transactions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getWalletTransactions = async (req, res) => {
  // Ensure we always return JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    const userId = req.session.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const transactions = await WalletTransaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const allWalletTransactions = await WalletTransaction.find({
      user: userId,
      status: "completed" // Only include completed transactions in summary
    });

    const totalCredits = allWalletTransactions
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDebits = allWalletTransactions
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalTransactions = await WalletTransaction.countDocuments({ user: userId });

    res.status(StatusCodes.OK).json({
      success: true,
      transactions,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalTransactions / limit),
        totalTransactions
      },
      summary: {
        totalCredits,
        totalDebits
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

//=================================================================================================
// Process Wallet Payment
//=================================================================================================
// This function processes a wallet payment for an order.
// It processes a wallet payment for an order.
//=================================================================================================
/**
 * Process wallet payment for an order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const processWalletPayment = async (userId, orderId, amount, description = "Order payment") => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    let wallet = await Wallet.findOne({ user: userId });
    let walletBalance = 0;

    if (wallet) {
      walletBalance = wallet.balance;
    } else {

      const initialBalance = typeof user.wallet === 'number' ? user.wallet : 0;
      wallet = new Wallet({
        user: userId,
        balance: initialBalance
      });
      walletBalance = initialBalance;
      await wallet.save();
    }

    if (walletBalance < amount) {
      throw new Error("Insufficient wallet balance. Please add money to your wallet and try again.");
    }

    const transaction = new WalletTransaction({
      user: userId,
      amount: amount,
      type: "debit",
      description: description,
      status: "completed",
      orderId: orderId
    });
    await transaction.save();
    wallet.balance -= amount;
    await wallet.save();
    if (typeof user.wallet === 'number') {
      user.wallet = wallet.balance;
      await user.save();
    }

    return {
      success: true,
      transaction: transaction,
      newBalance: wallet.balance
    };
  } catch (error) {
    console.error("Error processing wallet payment:", error);
    throw error;
  }
};

//=================================================================================================
// Module Exports
//=================================================================================================
// This exports the wallet controller functions.
// It exports the wallet controller functions to be used in the user routes.
//=================================================================================================
module.exports = {
  addMoney,
  verifyPayment,
  getWalletBalance,
  getWalletTransactions,
  processWalletPayment
};

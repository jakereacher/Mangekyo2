/**
 * Referral Controller
 * Handles user referral code generation, validation, and reward processing.
 */
//=================================================================================================
// Referral Controller
//=================================================================================================
// This controller handles user referral code generation, validation, and reward processing.
// It handles user referral code generation, validation, and reward processing.
//=================================================================================================

const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
const Offer = require("../../models/offerSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const crypto = require("crypto");

/**
 * Generate a unique referral code for a user
 * @param {String} userId - User ID to generate code for
 * @returns {String} Generated referral code
 */
//=================================================================================================
// Generate Referral Code
//=================================================================================================
// This function generates a unique referral code for a user.
// It generates a unique referral code for a user.
//=================================================================================================
const generateReferralCode = async (userId) => {
  try {

    const userIdPrefix = userId.toString().substring(0, 4);
    const randomChars = crypto.randomBytes(4).toString("hex").toUpperCase().substring(0, 4);
    const baseCode = `${userIdPrefix}${randomChars}`;

    const existingUser = await User.findOne({ referralCode: baseCode });
    if (existingUser) {

      return generateReferralCode(userId);
    }

    return baseCode;
  } catch (error) {
    console.error("Error generating referral code:", error);
    throw error;
  }
};

/**
 * Get or generate a referral code for the current user
 */
//=================================================================================================
// Get Referral Code
//=================================================================================================
// This function gets a referral code for the current user.
// It gets a referral code for the current user.
//=================================================================================================
exports.getReferralCode = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found"
      });
    }

    if (user.referralCode) {
      return res.status(StatusCodes.OK).json({
        success: true,
        referralCode: user.referralCode
      });
    }

    const referralCode = await generateReferralCode(userId);

    user.referralCode = referralCode;
    await user.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      referralCode: referralCode
    });
  } catch (error) {
    console.error("Error getting referral code:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to get referral code"
    });
  }
};

/**
 * Get active referral offer details
 */
//=================================================================================================
// Get Referral Offer Details
//=================================================================================================
// This function gets the active referral offer details.
// It gets the active referral offer details.
//=================================================================================================
exports.getReferralOfferDetails = async (req, res) => {
  try {
    const now = new Date();

    const referralOffer = await Offer.findOne({
      type: "referral",
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    if (!referralOffer) {
      return res.status(StatusCodes.OK).json({
        success: true,
        hasActiveOffer: false,
        message: "No active referral offer found"
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      hasActiveOffer: true,
      offer: {
        name: referralOffer.name,
        description: referralOffer.description,
        discountType: referralOffer.discountType,
        discountValue: referralOffer.discountValue,
        endDate: referralOffer.endDate
      }
    });
  } catch (error) {
    console.error("Error getting referral offer details:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to get referral offer details"
    });
  }
};

/**
 * Get referral statistics for the current user
 */
//=================================================================================================
// Get Referral Statistics
//=================================================================================================
// This function gets the referral statistics for the current user.
// It gets the referral statistics for the current user.
//=================================================================================================
exports.getReferralStats = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const referredUsersCount = await User.countDocuments({ referredBy: userId });

    const walletTransactions = await WalletTransaction.find({
      user: userId,
      description: { $regex: /referral/i }
    });

    const totalEarnings = walletTransactions.reduce((total, transaction) => {
      if (transaction.type === "credit") {
        return total + transaction.amount;
      }
      return total;
    }, 0);

    return res.status(StatusCodes.OK).json({
      success: true,
      stats: {
        referredUsers: referredUsersCount,
        totalEarnings: totalEarnings
      }
    });
  } catch (error) {
    console.error("Error getting referral statistics:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to get referral statistics"
    });
  }
};

/**
 * Apply a referral code for an existing user
 */
//=================================================================================================
// Apply Referral Code
//=================================================================================================
// This function applies a referral code for an existing user.
// It applies a referral code for an existing user.
//=================================================================================================
exports.applyReferralCode = async (req, res) => {
  try {
    const userId = req.session.user;
    const { referralCode } = req.body;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found"
      });
    }

    if (currentUser.referredBy) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "You have already used a referral code"
      });
    }

    if (!referralCode || referralCode.trim() === '') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Referral code is required"
      });
    }

    const referrer = await User.findOne({ referralCode: referralCode.trim() });
    if (!referrer) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid referral code"
      });
    }

    if (referrer._id.toString() === userId.toString()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "You cannot use your own referral code"
      });
    }

    currentUser.referredBy = referrer._id;
    await currentUser.save();

    const REWARD_AMOUNT = 50; // $50 reward for both users

    await addReferralReward(
      referrer._id,
      REWARD_AMOUNT,
      `Referral bonus for user ${currentUser.name || currentUser.email}`
    );

    await addReferralReward(
      userId,
      REWARD_AMOUNT,
      `Bonus for using referral code ${referralCode}`
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Referral code applied successfully! $50 has been added to your wallet."
    });
  } catch (error) {
    console.error("Error applying referral code:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to apply referral code"
    });
  }
};

/**
 * Add referral reward to user's wallet
 * @param {String} userId - User ID to reward
 * @param {Number} amount - Amount to add to wallet
 * @param {String} description - Description for the transaction
 */
//=================================================================================================
// Add Referral Reward
//=================================================================================================
// This function adds a referral reward to a user's wallet.
// It adds a referral reward to a user's wallet.
//=================================================================================================
async function addReferralReward(userId, amount, description) {
  try {

    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = new Wallet({
        user: userId,
        balance: 0
      });
    }

    wallet.balance += amount;
    await wallet.save();

    const transaction = new WalletTransaction({
      user: userId,
      amount: amount,
      type: "credit",
      description: description,
      status: "completed"
    });

    await transaction.save();

    await User.findByIdAndUpdate(userId, { wallet: wallet.balance });

    return true;
  } catch (error) {
    console.error(`Error adding referral reward to user ${userId}:`, error);
    return false;
  }
}

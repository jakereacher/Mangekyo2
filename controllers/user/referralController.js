/**
 * Referral Controller
 * Handles user referral code generation, validation, and reward processing.
 */

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
const generateReferralCode = async (userId) => {
  try {
    // Generate a base code using the first 4 characters of the user ID and 4 random characters
    const userIdPrefix = userId.toString().substring(0, 4);
    const randomChars = crypto.randomBytes(4).toString("hex").toUpperCase().substring(0, 4);
    const baseCode = `${userIdPrefix}${randomChars}`;

    // Check if the code already exists
    const existingUser = await User.findOne({ referralCode: baseCode });
    if (existingUser) {
      // If code exists, try again with different random characters
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

    // If user already has a referral code, return it
    if (user.referralCode) {
      return res.status(StatusCodes.OK).json({
        success: true,
        referralCode: user.referralCode
      });
    }

    // Generate a new referral code
    const referralCode = await generateReferralCode(userId);

    // Save the referral code to the user
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
exports.getReferralOfferDetails = async (req, res) => {
  try {
    const now = new Date();

    // Find active referral offer
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
exports.getReferralStats = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated"
      });
    }

    // Count users referred by this user
    const referredUsersCount = await User.countDocuments({ referredBy: userId });

    // Get wallet transactions related to referrals
    const walletTransactions = await WalletTransaction.find({
      user: userId,
      description: { $regex: /referral/i }
    });

    // Calculate total earnings from referrals
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

    // Get current user
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if user already has a referrer
    if (currentUser.referredBy) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "You have already used a referral code"
      });
    }

    // Validate referral code
    if (!referralCode || referralCode.trim() === '') {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Referral code is required"
      });
    }

    // Find referrer by code
    const referrer = await User.findOne({ referralCode: referralCode.trim() });
    if (!referrer) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid referral code"
      });
    }

    // Make sure user is not referring themselves
    if (referrer._id.toString() === userId.toString()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "You cannot use your own referral code"
      });
    }

    // Update user with referrer ID
    currentUser.referredBy = referrer._id;
    await currentUser.save();

    // Process referral rewards for both users
    const REWARD_AMOUNT = 50; // $50 reward for both users

    // Add reward to referrer
    await addReferralReward(
      referrer._id,
      REWARD_AMOUNT,
      `Referral bonus for user ${currentUser.name || currentUser.email}`
    );

    // Add reward to current user
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
async function addReferralReward(userId, amount, description) {
  try {
    // Find or create wallet for the user
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = new Wallet({
        user: userId,
        balance: 0
      });
    }

    // Add reward to wallet balance
    wallet.balance += amount;
    await wallet.save();

    // Create transaction record
    const transaction = new WalletTransaction({
      user: userId,
      amount: amount,
      type: "credit",
      description: description,
      status: "completed"
    });

    await transaction.save();

    // Update user's wallet field as well for backward compatibility
    await User.findByIdAndUpdate(userId, { wallet: wallet.balance });

    return true;
  } catch (error) {
    console.error(`Error adding referral reward to user ${userId}:`, error);
    return false;
  }
}

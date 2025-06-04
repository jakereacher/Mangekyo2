/**
 * Profile Controller
 * Handles user profile rendering, updates, email verification, and address management.
 */

const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const Wallet = require("../../models/walletSchema");
const Coupon = require("../../models/couponSchema");
const Offer = require("../../models/offerSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const { validateEmail, validateMobile, validateProfileName } = require('../../utils/helpers');
const multer = require("../../helpers/multer");
const fs = require("fs");
const path = require("path");
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { razorpayKeyId } = require("../../config/razorpay");

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Generate a unique referral code for a user
 * @param {String} userId - User ID to generate code for
 * @returns {String} Generated referral code
 */
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

const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Render the profile page with user details, wallet balance, order history, and available coupons.
 */
exports.renderProfilePage = async (req, res) => {
  try {
    const userId = req.session.user;

    const user = await User.findById(userId)
      .select('-googleId -forgotPasswordOtp -otpExpires -resetPasswordOtp')
      .populate('wishlist')
      .populate({
        path: 'orderHistory',
        options: { sort: { createdOn: -1 } },
        populate: {
          path: 'orderedItems.product',
          model: 'Product'
        }
      });

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).render('page-404');
    }

    const wallet = await Wallet.findOne({ user: userId });

    const walletTransactionsPage = parseInt(req.query.wallet_page) || 1;
    const walletTransactionsLimit = 5;
    const walletTransactionsSkip = (walletTransactionsPage - 1) * walletTransactionsLimit;

    const walletTransactions = await WalletTransaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(walletTransactionsSkip)
      .limit(walletTransactionsLimit);

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

    const totalWalletTransactions = await WalletTransaction.countDocuments({ user: userId });

    const userWithWallet = {
      ...user.toObject(),
      wallet: wallet?.balance || 0,
      walletTransactions: walletTransactions,
      walletTransactionsPagination: {
        currentPage: walletTransactionsPage,
        totalPages: Math.ceil(totalWalletTransactions / walletTransactionsLimit),
        totalTransactions: totalWalletTransactions
      },
      walletTotalCredits: totalCredits,
      walletTotalDebits: totalDebits
    };

    const formattedOrders = user.orderHistory.map(order => ({
      _id: order._id,
      status: getOverallOrderStatus(order.orderedItems),
      totalAmount: order.finalAmount,
      createdAt: order.createdOn,
      items: order.orderedItems.map(item => ({
        product: item.product,
        quantity: item.quantity,
        status: item.status,
        price: item.price
      }))
    }));

    const now = new Date();
    const availableCoupons = await Coupon.find({
      isActive: true,
      isDelete: false,
      startDate: { $lte: now },
      expiryDate: { $gte: now }
    });

    const userCoupons = availableCoupons.map(coupon => {
      const userUsage = coupon.users.find(u => u.userId.toString() === userId.toString());
      const usedCount = userUsage ? userUsage.usedCount : 0;
      const remainingUses = coupon.usageLimit - usedCount;

      return {
        _id: coupon._id,
        code: coupon.code,
        type: coupon.type,
        discountValue: coupon.discountValue,
        minPrice: coupon.minPrice,
        maxPrice: coupon.maxPrice,
        expiryDate: coupon.expiryDate,
        usageLimit: coupon.usageLimit,
        remainingUses: remainingUses > 0 ? remainingUses : 0,
        isUsable: remainingUses > 0 && coupon.totalUsedCount < coupon.totalUsageLimit
      };
    }).filter(coupon => coupon.isUsable);

    let referralCode = user.referralCode;
    if (!referralCode) {

      referralCode = await generateReferralCode(userId);
      await User.findByIdAndUpdate(userId, { referralCode });
    }

    const referredUsersCount = await User.countDocuments({ referredBy: userId });

    const referralTransactions = await WalletTransaction.find({
      user: userId,
      description: { $regex: /referral/i }
    });

    const totalReferralEarnings = referralTransactions.reduce((total, transaction) => {
      if (transaction.type === "credit") {
        return total + transaction.amount;
      }
      return total;
    }, 0);

    const activeReferralOffer = await Offer.findOne({
      type: "referral",
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    const referralData = {
      code: referralCode,
      referredUsers: referredUsersCount,
      totalEarnings: totalReferralEarnings,
      hasActiveOffer: !!activeReferralOffer,
      offer: activeReferralOffer ? {
        name: activeReferralOffer.name,
        description: activeReferralOffer.description,
        discountType: activeReferralOffer.discountType,
        discountValue: activeReferralOffer.discountValue,
        endDate: activeReferralOffer.endDate
      } : null
    };
    res.render('profile', {
      user: userWithWallet,
      orders: formattedOrders,
      coupons: userCoupons,
      referral: referralData,
      title: 'My Profile',
      currentPage: 'profile',
      success: req.flash('success'),
      error: req.flash('error'),
      razorpayKeyId // Pass Razorpay key ID to the frontend
    });

  } catch (error) {
    console.error('Error rendering profile page:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('page-404');
  }
};

/**
 * Determine the overall status of an order based on its items.
 */
function getOverallOrderStatus(orderedItems) {
  if (orderedItems.every(item => item.status === 'Delivered')) {
    return 'Delivered';
  }
  if (orderedItems.some(item => item.status === 'Shipped')) {
    return 'Shipped';
  }
  if (orderedItems.some(item => item.status === 'Processing')) {
    return 'Processing';
  }
  if (orderedItems.every(item => item.status === 'Cancelled')) {
    return 'Cancelled';
  }
  if (orderedItems.some(item => item.status === 'Cancelled')) {
    return 'Partially Cancelled';
  }
  return 'Processing';
}

/**
 * Handle profile updates, including name, email, and profile image.
 */
exports.handleProfileUpdate = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    const { name, email, currentEmail } = req.body;
    // Use helper for name validation
    if (!validateProfileName(name)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Name cannot be empty, only spaces, or contain multiple consecutive spaces.'
      });
    }
    const user = await User.findById(userId);

    let profileImagePath;
    if (req.file) {
      if (user.profileImage) {
        const oldImagePath = path.join(__dirname, '../../public', user.profileImage);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      profileImagePath = `/uploads/profile-pics/${req.file.filename}`;
      await User.findByIdAndUpdate(userId, { profileImage: profileImagePath });
      return res.json({
        success: true,
        message: 'Profile image updated successfully',
        profileImage: profileImagePath
      });
    }

    if (email && email !== currentEmail) {
      if (!validateEmail(email)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Invalid email format'
        });
      }

      const otp = generateOTP();
      const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

      user.emailVerificationOtp = otp;
      user.emailVerificationOtpExpires = otpExpires;
      user.isEmailVerified = false;
      await user.save();

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Verify Your New Email Address',
        html: `
          <h2>Email Verification</h2>
          <p>Your OTP to verify your new email address is: <strong>${otp}</strong></p>
          <p>This OTP will expire in 15 minutes.</p>
        `
      };

      await transporter.sendMail(mailOptions);

      return res.json({
        success: true,
        requiresVerification: true,
        message: 'Verification OTP sent to your new email address'
      });
    }

    const updatedData = { name };
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updatedData,
      { new: true }
    ).select('-password');

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error("Error in update profile:", error);
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to update profile'
    });
  }
};

/**
 * Verify the OTP sent to the user's email for email verification.
 */
exports.verifyEmailOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const userId = req.session.user;

    const user = await User.findOne({
      _id: userId,
      emailVerificationOtp: otp,
      emailVerificationOtpExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    user.email = email;
    user.isEmailVerified = true;
    user.emailVerificationOtp = undefined;
    user.emailVerificationOtpExpires = undefined;
    await user.save();

    return res.json({
      success: true,
      message: 'Email verified and updated successfully'
    });

  } catch (error) {
    console.error("Error verifying email OTP:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to verify email'
    });
  }
};

/**
 * Handle address-related actions such as adding, updating, deleting, and setting default addresses.
 */
exports.handleAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { action, addressId, ...addressData } = req.body;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    let updatedUser;

    switch (action) {
      case 'GET':
        const user = await User.findOne(
          { _id: userId, 'address._id': addressId },
          { 'address.$': 1 }
        );

        if (!user || !user.address || user.address.length === 0) {
          return res.status(StatusCodes.NOT_FOUND).json({
            success: false,
            message: 'Address not found'
          });
        }

        return res.json({
          success: true,
          data: user.address[0]
        });

      case 'ADD':
        if (!addressData.fullName || !addressData.mobile || !addressData.addressLine ||
            !addressData.city || !addressData.state || !addressData.pinCode) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Missing required address fields'
          });
        }

        const userDoc = await User.findById(userId);
        if (userDoc.address.length === 0) {
          addressData.isDefault = true;
        }

        if (addressData.city) {
          addressData.city = addressData.city.trim().toLowerCase();
        }

        updatedUser = await User.findByIdAndUpdate(
          userId,
          { $push: { address: addressData } },
          { new: true }
        );
        break;

      case 'UPDATE':
        if (!addressId) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Address ID is required for update'
          });
        }

        if (addressData.city) {
          addressData.city = addressData.city.trim().toLowerCase();
        }

        const updateObj = {};
        Object.keys(addressData).forEach(key => {
          if (key !== '_id' && addressData[key] !== undefined) {
            updateObj[`address.$.${key}`] = addressData[key];
          }
        });

        if (addressData.isDefault) {
          await User.updateOne(
            { _id: userId },
            { $set: { 'address.$[].isDefault': false } }
          );
        }

        updatedUser = await User.findOneAndUpdate(
          { _id: userId, 'address._id': addressId },
          { $set: updateObj },
          { new: true }
        );
        break;

      case 'DELETE':
        if (!addressId) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Address ID is required for deletion'
          });
        }

        const userWithAddress = await User.findOne(
          { _id: userId, 'address._id': addressId },
          { 'address.$': 1 }
        );

        if (!userWithAddress || !userWithAddress.address || userWithAddress.address.length === 0) {
          return res.status(StatusCodes.NOT_FOUND).json({
            success: false,
            message: 'Address not found'
          });
        }

        const wasDefault = userWithAddress.address[0].isDefault;

        updatedUser = await User.findByIdAndUpdate(
          userId,
          { $pull: { address: { _id: addressId } } },
          { new: true }
        );

        if (wasDefault && updatedUser.address.length > 0) {
          updatedUser = await User.findOneAndUpdate(
            { _id: userId, 'address._id': updatedUser.address[0]._id },
            { $set: { 'address.$.isDefault': true } },
            { new: true }
          );
        }
        break;

      case 'SET_DEFAULT':
        if (!addressId) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: 'Address ID is required to set default'
          });
        }

        await User.updateOne(
          { _id: userId },
          { $set: { 'address.$[].isDefault': false } }
        );

        updatedUser = await User.findOneAndUpdate(
          { _id: userId, 'address._id': addressId },
          { $set: { 'address.$.isDefault': true } },
          { new: true }
        );
        break;

      default:
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Invalid action'
        });
    }

    const addressesForFrontend = updatedUser.address.map(addr => ({
      _id: addr._id.toString(),
      fullName: addr.fullName,
      mobile: addr.mobile,
      pinCode: addr.pinCode,
      addressLine: addr.addressLine,
      landmark: addr.landmark,
      city: addr.city,
      state: addr.state,
      isDefault: addr.isDefault
    }));

    res.json({
      success: true,
      data: addressesForFrontend
    });

  } catch (error) {
    console.error("Error in address operation:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Retrieve a specific address by its ID.
 */
exports.getAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const address = user.address.id(addressId);
    if (!address) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Address not found'
      });
    }

    res.json({
      success: true,
      data: address
    });
  } catch (error) {
    console.error("Error getting address:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Update a specific address by its ID.
 */
exports.updateAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.params;
    const addressData = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const address = user.address.id(addressId);
    if (!address) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Address not found'
      });
    }

    Object.keys(addressData).forEach(key => {
      if (key !== '_id' && addressData[key] !== undefined) {
        address[key] = addressData[key];
      }
    });

    if (addressData.isDefault) {
      user.address.forEach(addr => {
        if (addr._id.toString() !== addressId) {
          addr.isDefault = false;
        }
      });
    }

    await user.save();

    res.json({
      success: true,
      message: 'Address updated successfully',
      data: user.address
    });
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Delete a specific address by its ID.
 */
exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const addressToDelete = user.address.find(addr => addr._id.toString() === addressId);
    if (!addressToDelete) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Address not found'
      });
    }

    const wasDefault = addressToDelete.isDefault;

    await User.updateOne(
      { _id: userId },
      { $pull: { address: { _id: addressId } } }
    );

    if (wasDefault) {
      const updatedUser = await User.findById(userId);
      if (updatedUser.address.length > 0) {
        updatedUser.address[0].isDefault = true;
        await updatedUser.save();
      }
    }

    const updatedUser = await User.findById(userId);

    res.json({
      success: true,
      message: 'Address deleted successfully',
      data: updatedUser.address
    });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Set a specific address as the default address.
 */
exports.setDefaultAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const address = user.address.id(addressId);
    if (!address) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Address not found'
      });
    }

    user.address.forEach(addr => {
      addr.isDefault = false;
    });

    address.isDefault = true;

    await user.save();

    res.json({
      success: true,
      message: 'Default address updated successfully',
      data: user.address
    });
  } catch (error) {
    console.error("Error setting default address:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

/**
 * Get current password for display
 */
exports.getCurrentPassword = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has a plaintext password stored
    if (user.plaintextPassword) {
      return res.json({
        success: true,
        password: user.plaintextPassword
      });
    }

    // If no plaintext password, return a helpful message
    return res.json({
      success: true,
      password: 'Set a new password below to enable password viewing'
    });

  } catch (error) {
    console.error("Error getting current password:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to retrieve password'
    });
  }
};

/**
 * Change user password
 */
exports.changePassword = async (req, res) => {
  try {
    const userId = req.session.user;
    const { newPassword } = req.body;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: 'Not authenticated'
      });
    }

    if (!newPassword) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'New password is required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password (both hashed for security and plaintext for display)
    await User.findByIdAndUpdate(userId, {
      password: hashedPassword,
      plaintextPassword: newPassword
    });

    return res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error("Error changing password:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message || 'Failed to change password'
    });
  }
};
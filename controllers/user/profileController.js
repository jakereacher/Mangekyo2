const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const { validateEmail, validateMobile } = require('../../utils/helpers');
const multer = require("../../helpers/multer");
const fs = require("fs");
const path = require("path");
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Generate OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Render profile page
exports.renderProfilePage = async (req, res) => {
  try {
    const userId = req.session.user;

    const user = await User.findById(userId)
      .select('-password -googleId -forgotPasswordOtp -otpExpires -resetPasswordOtp')
      .populate('wishlist')
      .populate('orderHistory');

    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).render('page-404');
    }

    res.render('profile', {
      user,
      title: 'My Profile',
      currentPage: 'profile',
      success: req.flash('success'),
      error: req.flash('error'),
      isDemo: user.email.endsWith('@demo.com')
    });

  } catch (error) {
    console.error('Error rendering profile page:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('page-404');
  }
};

// Handle profile update with email verification
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
    const user = await User.findById(userId);
    console.log(req.body, 'req.body');
    // Handle file upload
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
console.log(email,currentEmail,'email,currentEmail')
    // Check if email is being changed
    if (email && email !== currentEmail) {

      if (!validateEmail(email)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: 'Invalid email format'
        });
      }

      // Generate OTP
      const otp = generateOTP();
      const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Update user with OTP details
      user.emailVerificationOtp = otp;
      user.emailVerificationOtpExpires = otpExpires;
      user.isEmailVerified = false;
      await user.save();

      // Send verification email
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

    // If no email change or after verification, update profile
    const updatedData = { name };
    console.log(updatedData, 'updatedData');
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

// Verify Email OTP
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

    // Update user email and clear OTP
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
// Add these new methods for address handling
exports.handleAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { action, addressId, addressData } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'User not found' });
    }

    switch (action) {
      case 'ADD':
        user.address.push(addressData);
        break;
      case 'UPDATE':
        const addressIndex = user.address.findIndex(addr => addr._id.toString() === addressId);
        if (addressIndex === -1) {
          return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Address not found' });
        }
        user.address[addressIndex] = { ...user.address[addressIndex], ...addressData };
        break;
      case 'DELETE':
        user.address = user.address.filter(addr => addr._id.toString() !== addressId);
        break;
      case 'SET_DEFAULT':
        user.address.forEach(addr => {
          addr.isDefault = addr._id.toString() === addressId;
        });
        break;
      default:
        return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: 'Invalid action' });
    }

    await user.save();
    res.json({ success: true, data: user.address });

  } catch (error) {
    console.error("Error in address operation:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error' });
  }
};

exports.getAddress = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'User not found' });
    }

    const address = user.address.find(addr => addr._id.toString() === addressId);
    if (!address) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, message: 'Address not found' });
    }

    res.json({ success: true, data: address });

  } catch (error) {
    console.error("Error getting address:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Server error' });
  }
};
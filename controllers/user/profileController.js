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
      .populate({
        path: 'orderHistory',
        populate: {
          path: 'orderedItems.product',
          model: 'Product'
        }
      });

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
        // Get a specific address
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
        // Validate required fields
        if (!addressData.fullName || !addressData.mobile || !addressData.addressLine || 
            !addressData.city || !addressData.state || !addressData.pinCode) {
          return res.status(StatusCodes.BAD_REQUEST).json({ 
            success: false, 
            message: 'Missing required address fields' 
          });
        }

        // If this is the first address, set as default
        const userDoc = await User.findById(userId);
        if (userDoc.address.length === 0) {
          addressData.isDefault = true;
        }

        // Add new address using $push
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

        // Prepare update object
        const updateObj = {};
        Object.keys(addressData).forEach(key => {
          if (key !== '_id' && addressData[key] !== undefined) {
            updateObj[`address.$.${key}`] = addressData[key];
          }
        });

        // If setting as default, first unset all other defaults
        if (addressData.isDefault) {
          await User.updateOne(
            { _id: userId },
            { $set: { 'address.$[].isDefault': false } }
          );
        }

        // Update the specific address
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

        // First find the address to check if it's default
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

        // Remove the address using $pull
        updatedUser = await User.findByIdAndUpdate(
          userId,
          { $pull: { address: { _id: addressId } } },
          { new: true }
        );

        // If deleted address was default and there are other addresses, set the first one as default
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

        // First unset all defaults
        await User.updateOne(
          { _id: userId },
          { $set: { 'address.$[].isDefault': false } }
        );

        // Then set the specified address as default
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

    // Return the updated addresses
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

// Get single address
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

// Update address
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

    // Update address fields
    Object.keys(addressData).forEach(key => {
      if (key !== '_id' && addressData[key] !== undefined) {
        address[key] = addressData[key];
      }
    });

    // If setting as default, unset all others
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

// Delete address
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

    // Find the address first to check if it's default
    const addressToDelete = user.address.find(addr => addr._id.toString() === addressId);
    if (!addressToDelete) {
      return res.status(StatusCodes.NOT_FOUND).json({ 
        success: false, 
        message: 'Address not found' 
      });
    }

    const wasDefault = addressToDelete.isDefault;
    
    // Use pull to remove the address
    await User.updateOne(
      { _id: userId },
      { $pull: { address: { _id: addressId } } }
    );

    // If deleted address was default and there are other addresses
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

// Set default address
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

    // Set all addresses to non-default
    user.address.forEach(addr => {
      addr.isDefault = false;
    });

    // Set the specified address as default
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
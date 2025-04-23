const User = require("../../models/userSchema");
const { uploadProfileImage } = require("../../helpers/multer")
const { validateEmail, validateMobile } = require('../../utils/helpers');

// Get complete user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.session.user)
    console.log(user)  // Changed from req.user._id to req.session.user


    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.render('profile', {
      user,
      isDemo: null
    })
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Update basic profile info
exports.updateProfile = async (req, res) => {
  try {
    const { name } = req.body;
    const profileImage = req.file ? `/uploads/profile-pics/${req.file.filename}` : null; // Get the image URL
    console.log(profileImage)
    const updatedUser = await User.findByIdAndUpdate(
        req.session.user,  // Assuming you're using session for user identification
        {
            $set: {
                name, 
                profileImage: profileImage  || undefined,  // Save the image URL or null if no image uploaded
            },
        },
        { new: true, runValidators: true }
    ).select('-password -googleId');

    res.status(200).json({ success: true, data: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Manage addresses
exports.manageAddresses = async (req, res) => {
  try {
    const { action, addressData, addressId } = req.body;
    const user = await User.findById(req.session.user);  // Changed from req.user._id to req.session.user

    switch (action) {
      case 'ADD':
        user.address.push(addressData);
        break;
      case 'UPDATE':
        user.address = user.address.map(addr => 
          addr.id.toString() === addressId ? { ...addr, ...addressData } : addr
        );
        break;
      case 'DELETE':
        user.address = user.address.filter(addr => addr.id.toString() !== addressId);
        break;
      case 'SET_DEFAULT':
        user.address = user.address.map(addr => ({
          ...addr,
          isDefault: addr.id.toString() === addressId
        }));
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    await user.save();
    res.status(200).json({ success: true, data: user.address });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

exports.viewProfile = async (req, res) => {
    try {
      // User is already authenticated and attached by auth middleware
      if (!req.user) {
        return res.redirect('/login');
      }
  
      // Get fresh data with populated references
      const freshUser = await User.findById(req.user._id)
        .populate({
          path: 'orderHistory',
          select: 'status totalAmount createdAt',
          options: { sort: { createdAt: -1 }, limit: 10 }
        })
        .populate({
          path: 'Wishlist',
          select: 'name price images',
          options: { limit: 12 }
        })
        .lean();
  
      if (!freshUser) {
        req.session.destroy();
        return res.redirect('/login?error=user_not_found');
      }
  
      res.render('user/profile', {
        user: freshUser,
        isDemo: req.session.isDemo || false
      });
  
    } catch (error) {
      console.error('Profile Error:', error);
      res.status(500).render('user/error', {
        message: 'Failed to load profile',
        error: process.env.NODE_ENV === 'development' ? error : null
      });
    }
  };
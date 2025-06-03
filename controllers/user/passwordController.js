/**
 * Password Controller
 */

const User = require("../../models/userSchema");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { generateOtp, sendVerificationEmail } = require("./otpController");

//=================================================================================================
// Secure Password
//=================================================================================================
// This function hashes a password.
// It hashes a password.
//=================================================================================================
const securePassword = async (password) => {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.error("Error hashing password:", error);
  }
};

//=================================================================================================
// Load Forgot Password
//=================================================================================================
// This function loads the forgot password page.
// It loads the forgot password page.
//=================================================================================================
const loadForgotPassword = async (req, res) => {
  try {
    res.render("forgot-password", { message: "" });
  } catch (error) {
    console.log("Forgot password page not found", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

//=================================================================================================
// Reset Password
//=================================================================================================
// This function resets a password.
// It resets a password.
//=================================================================================================
const resetPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "No account found" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    const resetTokenExpiry = Date.now() + 3600000;
    const otp = generateOtp();

    user.forgotPasswordOtp = resetToken;
    user.otpExpires = resetTokenExpiry;
    user.resetPasswordOtp = otp;
    await user.save();

    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.status(500).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({
      success: true,
      message: "OTP sent to your email",
      token: resetToken,
      redirectUrl: `/newPassword?token=${resetToken}`
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};

//=================================================================================================
// Load New Password
//=================================================================================================
// This function loads the new password page.
// It loads the new password page.
//=================================================================================================
const loadNewPassword = async (req, res) => {
  try {
    const { token } = req.query;
    const user = await User.findOne({
      forgotPasswordOtp: token,
      otpExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.render("forgot-password", { message: "Invalid or expired reset token" });
    }

    res.render("new-password", { token: token, message: "" });
  } catch (error) {
    console.error("Load new password error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

//=================================================================================================
// New Password
//=================================================================================================
// This function resets a password.
// It resets a password.
//=================================================================================================
const newPassword = async (req, res) => {
  try {
    const { token, otp, password } = req.body;
    const user = await User.findOne({
      forgotPasswordOtp: token,
      otpExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired token" });
    }

    if (user.resetPasswordOtp !== otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    const hashedPassword = await securePassword(password);
    user.password = hashedPassword;
    user.plaintextPassword = password; // Store plaintext for display
    user.forgotPasswordOtp = null;
    user.otpExpires = null;
    user.resetPasswordOtp = null;
    await user.save();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("New password error:", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};

//=================================================================================================
// Module Exports
//=================================================================================================
// This exports the password controller functions.
// It exports the password controller functions to be used in the user routes.
//=================================================================================================
module.exports = {
  securePassword,
  loadForgotPassword,
  resetPassword,
  loadNewPassword,
  newPassword
};

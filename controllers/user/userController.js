/**
 * User Controller
 */

const User = require("../../models/userSchema");
const { securePassword } = require("./passwordController");
const { generateOtp, sendVerificationEmail } = require("./otpController");

//=================================================================================================
// Sign Up
//=================================================================================================
// This function handles user sign up.
// It handles user sign up.
//=================================================================================================


const signup = async (req, res) => {
  try {
    const { name, email, password, cPassword, referralCode } = req.body;

    if (!email || !password || !cPassword) {
      return res.render("signup", { message: "All fields are required" });
    }

    if (password.trim() !== cPassword.trim()) {
      return res.render("signup", {
        message: "Passwords do not match",
        previousInput: { name, email, referralCode }
      });
    }

    if (password.length < 8) {
      return res.render("signup", {
        message: "Password must be at least 8 characters",
        previousInput: { name, email, referralCode }
      });
    }

    const findUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (findUser) {
      return res.render("signup", {
        message: "User already exists",
        previousInput: { name, email, referralCode }
      });
    }

    if (referralCode && referralCode.trim() !== '') {
      const referrer = await User.findOne({ referralCode: referralCode.trim() });
      if (!referrer) {
        return res.render("signup", {
          message: "Invalid referral code",
          previousInput: { name, email, referralCode }
        });
      }
    }

    const otp = generateOtp();
    console.log("Generated OTP for signup:", otp, "for email:", email);

    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      console.log("Failed to send OTP email to:", email);
      return res.render("signup", {
        message: "Failed to send OTP. Check email settings.",
        previousInput: { name, email, referralCode }
      });
    }

    req.session.userOtp = otp;
    req.session.otpTimestamp = Date.now();
    req.session.userData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
      referralCode: referralCode ? referralCode.trim() : null
    };

    console.log("Session data stored:", {
      otp: req.session.userOtp,
      timestamp: req.session.otpTimestamp,
      userData: req.session.userData
    });

    const hasReferralCode = referralCode && referralCode.trim() !== '';
    res.render("verify-otp", {
      referralBonus: hasReferralCode
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.redirect("/pageNotFound");
  }
};

//=================================================================================================
// Module Exports
//=================================================================================================
// This exports the user controller functions.
// It exports the user controller functions to be used in the user routes.
//=================================================================================================
module.exports = {
  signup
};

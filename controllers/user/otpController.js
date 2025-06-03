/**
 * OTP Controller
 */

const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
const nodemailer = require("nodemailer");
require("dotenv").config();
const bcrypt = require("bcrypt");

async function securePassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Process referral reward for both referrer and new user
 * @param {String} referrerId - ID of the user who referred
 * @param {String} newUserId - ID of the newly registered user
 */
async function processReferralReward(referrerId, newUserId) {
  try {
    const REWARD_AMOUNT = 50; // $50 reward for both users

    await addReferralReward(referrerId, REWARD_AMOUNT, `Referral bonus for inviting a new user`);

    await addReferralReward(newUserId, REWARD_AMOUNT, `Welcome bonus for signing up with a referral code`);
  } catch (error) {
    console.error("Error processing referral reward:", error);
  }
}

/**
 * Add referral reward to user's wallet
 * @param {String} userId - User ID to reward
 * @param {Number} amount - Amount to add to wallet
 * @param {String} description - Description for the transaction
 */
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
    return false;
  }
}

async function sendVerificationEmail(email, otp) {
  try {
    console.log("Attempting to send OTP email to:", email, "with OTP:", otp);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify Your Mangekyo Account",
      text: `Your OTP for account verification is: ${otp}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #00ffff;">Verify Your Mangekyo Account</h2>
          <p>Thank you for signing up! Please use the following OTP to verify your account:</p>
          <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 3px; margin: 20px 0;">
            ${otp}
          </div>
          <p>This OTP will expire in 2 minutes.</p>
          <p>If you didn't request this verification, please ignore this email.</p>
        </div>
      `,
    });

    console.log("Email sent successfully:", info.messageId);
    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending verification email:", error);
    return false;
  }
}

const verifyOtp = async (req, res) => {
    // Ensure response is always JSON
    res.setHeader('Content-Type', 'application/json');

    try {
      const { otp } = req.body;

      // Validate input
      if (!otp || otp.trim() === '') {
        return res.status(400).json({ success: false, message: "OTP is required" });
      }

      // Check session data
      if (!req.session.userOtp || !req.session.userData || !req.session.otpTimestamp) {
        return res.status(400).json({
          success: false,
          message: "Session expired. Please try signing up again."
        });
      }

      const otpTimestamp = req.session.otpTimestamp;
      const currentTime = Date.now();
      const timeDifference = (currentTime - otpTimestamp) / 1000;

      console.log("OTP Verification Debug:", {
        receivedOtp: otp,
        receivedOtpType: typeof otp,
        sessionOtp: req.session.userOtp,
        sessionOtpType: typeof req.session.userOtp,
        otpTimestamp,
        currentTime,
        timeDifference,
        hasUserData: !!req.session.userData,
        userEmail: req.session.userData?.email
      });

      if (!otpTimestamp || timeDifference > 120) {
        console.log("OTP expired - timeDifference:", timeDifference);
        return res.status(400).json({ success: false, message: "OTP has expired" });
      }

      if (otp && req.session.userOtp && otp.toString().trim() === req.session.userOtp.toString().trim()) {
        console.log("OTP matched, proceeding with user creation");
        const user = req.session.userData;

        if (!user) {
          console.log("User data not found in session");
          return res.status(400).json({ success: false, message: "User data not found in session" });
        }

        const existingUser = await User.findOne({ email: user.email });
        if (existingUser) {
          console.log("User already exists with email:", user.email);
          return res.status(400).json({
            success: false,
            message: "A user with this email already exists",
          });
        }

        let referrerId = null;
        if (user.referralCode) {
          const referrer = await User.findOne({ referralCode: user.referralCode });
          if (referrer) {
            referrerId = referrer._id;
            console.log("Found referrer:", referrerId);
          } else {
            console.log("Referral code provided but referrer not found:", user.referralCode);
          }
        }

        console.log("Creating new user with data:", {
          name: user.name,
          email: user.email,
          referredBy: referrerId
        });

        const passwordHash = await securePassword(user.password);
        const saveUserData = new User({
          name: user.name,
          email: user.email,
          password: passwordHash,
          plaintextPassword: user.password, // Store plaintext for display
          referredBy: referrerId
        });

        await saveUserData.save();
        console.log("User saved successfully with ID:", saveUserData._id);

        req.session.user = saveUserData._id;

        if (referrerId) {
          console.log("Processing referral reward for referrer:", referrerId, "and new user:", saveUserData._id);
          try {
            await processReferralReward(referrerId, saveUserData._id);
            console.log("Referral reward processed successfully");
          } catch (referralError) {
            console.error("Error processing referral reward:", referralError);
            // Don't fail the entire registration for referral errors
          }
        }

        // Clear session data
        delete req.session.userOtp;
        delete req.session.otpTimestamp;
        delete req.session.userData;

        console.log("OTP verification completed successfully");
        res.json({ success: true, redirectUrl: "/home" });
      } else {
        console.log("OTP mismatch - received:", otp, "expected:", req.session.userOtp);
        res.status(400).json({ success: false, message: "Invalid OTP" });
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      console.error("Error stack:", error.stack);

      // Ensure we always return JSON even on error
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: "An error occurred during verification" });
      }
    }
  };

const resendOtp = async (req, res) => {
  // Ensure response is always JSON
  res.setHeader('Content-Type', 'application/json');

  try {
    const email = req.session.userData?.email;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email not found in session" });
    }

    const otp = generateOtp();
    req.session.userOtp = otp;
    req.session.otpTimestamp = Date.now();

    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      return res.status(200).json({ success: true, message: "OTP resent successfully" });
    } else {
      return res.status(500).json({ success: false, message: "Failed to resend OTP" });
    }
  } catch (error) {
    console.error("Error resending OTP:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  generateOtp,
  sendVerificationEmail,
  verifyOtp,
  resendOtp
};

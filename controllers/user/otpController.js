const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
const nodemailer = require("nodemailer");
const env = require("dotenv").config();

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

    // Process reward for referrer
    await addReferralReward(referrerId, REWARD_AMOUNT, `Referral bonus for inviting a new user`);

    // Process reward for new user
    await addReferralReward(newUserId, REWARD_AMOUNT, `Welcome bonus for signing up with a referral code`);

    console.log(`Referral rewards processed: $${REWARD_AMOUNT} added to both users' wallets`);
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

async function sendVerificationEmail(email, otp) {
  try {
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
      subject: "verify your account",
      text: `Your OTP is ${otp}`,
      html: `<b> Your OTP:${otp}</b>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending email", error);
    return false;
  }
}

const verifyOtp = async (req, res) => {
    try {
      const { otp } = req.body;
      const otpTimestamp = req.session.otpTimestamp;
      const currentTime = Date.now();
      const timeDifference = (currentTime - otpTimestamp) / 1000;

      console.log("Session OTP:", req.session.userOtp);
      console.log("Entered OTP:", otp);
      console.log("Time difference (s):", timeDifference);
      console.log("User data in session:", req.session.userData);

      if (!otpTimestamp || timeDifference > 120) {
        return res.status(400).json({ success: false, message: "OTP has expired" });
      }

      if (otp === req.session.userOtp) {
        const user = req.session.userData;

        if (!user) {
          return res.status(400).json({ success: false, message: "User data not found in session" });
        }

        const existingUser = await User.findOne({ email: user.email });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: "A user with this email already exists",
          });
        }

        // Check if referral code exists and is valid
        let referrerId = null;
        if (user.referralCode) {
          const referrer = await User.findOne({ referralCode: user.referralCode });
          if (referrer) {
            referrerId = referrer._id;
          }
        }

        const passwordHash = await securePassword(user.password);
        const saveUserData = new User({
          name: user.name,
          email: user.email,
          password: passwordHash,
          referredBy: referrerId
        });

        await saveUserData.save();
        req.session.user = saveUserData._id;

        // Process referral rewards if there's a valid referrer
        if (referrerId) {
          await processReferralReward(referrerId, saveUserData._id);
        }

        res.json({ success: true, redirectUrl: "/home" });
      } else {
        res.status(400).json({ success: false, message: "Invalid OTP" });
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ success: false, message: "An error occurred during verification" });
    }
  };

const resendOtp = async (req, res) => {
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
      console.log(' resend Otp in signup controller',otp);
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
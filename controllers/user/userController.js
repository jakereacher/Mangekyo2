const User = require("../../models/userSchema");
const { securePassword } = require("./passwordController");
const { generateOtp, sendVerificationEmail } = require("./otpController");

const signup = async (req, res) => {
  try {
    const { name, email, password, cPassword } = req.body;

    if (!email || !password || !cPassword) {
      return res.render("signup", { message: "All fields are required" });
    }

    if (password.trim() !== cPassword.trim()) {
      return res.render("signup", { 
        message: "Passwords do not match",
        previousInput: { name, email } 
      });
    }

    if (password.length < 8) {
      return res.render("signup", { 
        message: "Password must be at least 8 characters",
        previousInput: { name, email }
      });
    }

    const findUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (findUser) {
      return res.render("signup", { 
        message: "User already exists",
        previousInput: { name, email }
      });
    }

    const otp = generateOtp();
    const emailSent = await sendVerificationEmail(email, otp);

    if (!emailSent) {
      return res.render("signup", {
        message: "Failed to send OTP. Check email settings.",
        previousInput: { name, email }
      });
    }

    req.session.userOtp = otp;
    req.session.otpTimestamp = Date.now();
    req.session.userData = { 
      name: name.trim(), 
      email: email.trim().toLowerCase(), 
      password: password.trim()
    };
    res.render("verify-otp");
  } catch (error) {
    console.error("Signup error:", error);
    return res.redirect("/pageNotFound");
  }
};

module.exports = {
  signup
};
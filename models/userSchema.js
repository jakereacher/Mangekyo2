const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationOtp: String,
  emailVerificationOtpExpires: Date,
  googleId: { type: String, index: { unique: true, sparse: true } },
  password: { type: String, required: false },

 
  profileImage: { type: String, default: "/images/default-avatar.png" },

  address: [
    {
      _id: false,
      id: { type: mongoose.Types.ObjectId, default: new mongoose.Types.ObjectId() },
      fullName: { type: String, required: true },
      mobile: { type: String, required: true },
      pinCode: { type: String, required: true },
      addressLine: { type: String, required: true },
      landmark: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
      isDefault: { type: Boolean, default: false },
    },
  ],

  isBlocked: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  isDemo: { type: Boolean, default: false },

  cart: [{ type: mongoose.Schema.Types.ObjectId, ref: "Cart" }],
  wallet: { type: Number, default: 0 },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  orderHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
  createdOn: { type: Date, default: Date.now },

  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

  searchHistory: [
    {
      category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
      brand: { type: String },
      searchOne: { type: Date, default: Date.now },
    },
  ],


  forgotPasswordOtp: { type: String, default: null },
  otpExpires: { type: Date, default: null },
  resetPasswordOtp: { type: String, default: null },
});


const User = mongoose.model("User", userSchema);
module.exports = User;

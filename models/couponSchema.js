const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  type: {
    type: String,
    enum: ["percentage", "fixed"], // Use "fixed" if that's your intended name instead of "flat"
    required: true,
  },
  users: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      usedCount: {
        type: Number,
        default: 0,
      },
    },
  ],
  discountValue: {
    type: Number,
    required: true,
  },
  maxPrice: {
    type: Number,
    validate: {
      validator: function (value) {
        return this.type !== "percentage" || (value !== undefined && value !== null);
      },
      message: "maxPrice is required for percentage coupons.",
    },
  },
  minPrice: {
    type: Number,
    required: true,
  },
  startDate: {
    type: Date,
    required: true,
  },
  expiryDate: {
    type: Date,
    required: true,
  },
  usageLimit: {
    type: Number,
    default: 1, // Per-user usage limit
  },
  totalUsedCount: {
    type: Number,
    default: 0, // Tracks total usage across all users
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  isDelete: {
    type: Boolean,
    default: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

couponSchema.methods.canUserUseCoupon = function (userId) {
  const userUsage = this.users.find(user => user.userId.toString() === userId.toString());
  return !userUsage || userUsage.usedCount < this.usageLimit;
};

couponSchema.methods.incrementUserUsage = function (userId) {
  const userUsage = this.users.find(user => user.userId.toString() === userId.toString());
  if (userUsage) {
    if (userUsage.usedCount < this.usageLimit) {
      userUsage.usedCount += 1;
    } else {
      throw new Error("User has reached the usage limit for this coupon.");
    }
  } else {
    this.users.push({ userId, usedCount: 1 });
  }
  this.totalUsedCount += 1;
};

const Coupon = mongoose.model("Coupon", couponSchema);

module.exports = Coupon;

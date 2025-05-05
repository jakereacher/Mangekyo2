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
  // 👇 maxPrice is only required if type === "percentage"
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
    default: 1,
  },
  totalUsedCount: {
    type: Number,
    default: 0,
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

const Coupon = mongoose.model("Coupon", couponSchema);

module.exports = Coupon;

const mongoose = require("mongoose");
const { Schema } = mongoose;

const offerSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ["product", "category", "referral"],
      required: true
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function(value) {
          // If percentage type, ensure it's not greater than 100
          return this.discountType !== 'percentage' || value <= 100;
        },
        message: 'Percentage discount cannot exceed 100%'
      }
    },
    maxDiscountAmount: {
      type: Number,
      min: 0,
      default: null
    },
    minPurchaseAmount: {
      type: Number,
      min: 0,
      default: 0
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    applicableProducts: [{
      type: Schema.Types.ObjectId,
      ref: "Product"
    }],
    applicableCategories: [{
      type: Schema.Types.ObjectId,
      ref: "Category"
    }],
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }
);

// Middleware to update the updatedAt field and validate offer data on save
offerSchema.pre("save", function(next) {
  // Update timestamp
  this.updatedAt = Date.now();

  // Validate discount value for percentage type
  if (this.discountType === "percentage" && this.discountValue > 100) {
    this.discountValue = 100; // Cap at 100%
  }

  // Ensure discount value is positive
  if (this.discountValue < 0) {
    this.discountValue = 0;
  }

  // Ensure maxDiscountAmount is positive if provided
  if (this.maxDiscountAmount !== null && this.maxDiscountAmount < 0) {
    this.maxDiscountAmount = 0;
  }

  // Ensure minPurchaseAmount is non-negative
  if (this.minPurchaseAmount < 0) {
    this.minPurchaseAmount = 0;
  }

  // For fixed discount type, ensure minimum purchase amount is greater than the discount value
  if (this.discountType === "fixed" && this.minPurchaseAmount <= this.discountValue) {
    // Set minimum purchase amount to be slightly higher than the discount value
    this.minPurchaseAmount = this.discountValue + 1;
  }

  next();
});

// Method to check if offer is valid (not expired and active)
offerSchema.methods.isValid = function() {
  const now = new Date();
  return (
    this.isActive &&
    this.startDate <= now &&
    this.endDate >= now
  );
};

// Method to calculate discount amount for a given price
offerSchema.methods.calculateDiscount = function(price) {
  if (!this.isValid()) {
    return 0;
  }

  // Check if price meets minimum purchase requirement
  if (price < this.minPurchaseAmount) {
    return 0;
  }

  let discountAmount = 0;

  if (this.discountType === "percentage") {
    // Ensure percentage is not greater than 100%
    const validPercentage = Math.min(this.discountValue, 100);

    discountAmount = (price * validPercentage) / 100;

    // Apply max discount cap if specified
    if (this.maxDiscountAmount && discountAmount > this.maxDiscountAmount) {
      discountAmount = this.maxDiscountAmount;
    }
  } else if (this.discountType === "fixed") {
    // For fixed discount, ensure minimum purchase amount is greater than discount value
    if (this.minPurchaseAmount <= this.discountValue) {
      console.warn(`Invalid offer configuration: minimum purchase amount (${this.minPurchaseAmount}) should be greater than fixed discount value (${this.discountValue})`);
      return 0;
    }

    discountAmount = this.discountValue;

    // Ensure discount doesn't exceed the price
    if (discountAmount > price) {
      discountAmount = price;
    }
  }

  // Ensure discount amount is not negative
  discountAmount = Math.max(0, discountAmount);

  // Round to 2 decimal places to avoid floating point issues
  return Math.round(discountAmount * 100) / 100;
};

const Offer = mongoose.model("Offer", offerSchema);
module.exports = Offer;
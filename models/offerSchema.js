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
      min: 0
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

// Middleware to update the updatedAt field on save
offerSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
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

  if (price < this.minPurchaseAmount) {
    return 0;
  }

  let discountAmount = 0;

  if (this.discountType === "percentage") {
    discountAmount = (price * this.discountValue) / 100;

    // Apply max discount cap if specified
    if (this.maxDiscountAmount && discountAmount > this.maxDiscountAmount) {
      discountAmount = this.maxDiscountAmount;
    }
  } else if (this.discountType === "fixed") {
    discountAmount = this.discountValue;

    // Ensure discount doesn't exceed the price
    if (discountAmount > price) {
      discountAmount = price;
    }
  }

  return discountAmount;
};

const Offer = mongoose.model("Offer", offerSchema);
module.exports = Offer;
const mongoose = require('mongoose');
const { Schema } = mongoose;

const deliveryChargeSchema = new Schema({
  location: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  cityType: {
    type: String,
    enum: ['major', 'minor', 'tier1', 'tier2', 'tier3', 'tier4'],
    default: 'minor',
    required: true
  },
  charge: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    default: ''
  },
  cities: {
    type: [String],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
deliveryChargeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create compound index for tier-based charges
deliveryChargeSchema.index({ cityType: 1 }, {
  unique: true,
  partialFilterExpression: {
    cityType: { $in: ['tier1', 'tier2', 'tier3', 'tier4'] }
  }
});

const DeliveryCharge = mongoose.model('DeliveryCharge', deliveryChargeSchema);
module.exports = DeliveryCharge;

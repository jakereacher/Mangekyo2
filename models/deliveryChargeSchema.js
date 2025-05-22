const mongoose = require('mongoose');
const { Schema } = mongoose;

const deliveryChargeSchema = new Schema({
  location: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  cityType: {
    type: String,
    enum: ['major', 'minor'],
    default: 'minor',
    required: true
  },
  charge: {
    type: Number,
    required: true,
    min: 0
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

const DeliveryCharge = mongoose.model('DeliveryCharge', deliveryChargeSchema);
module.exports = DeliveryCharge;

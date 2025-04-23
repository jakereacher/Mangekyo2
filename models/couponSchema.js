const mongoose = require("mongoose");
const { Schema } = mongoose;

const couponSchema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true, 
    uppercase: true,
  },
  createdOn: {
    type: Date,
    default: Date.now,
    required: true,
  },
  startOn: {
    type: Date,
    required: true,
  },
  expireOn: {
    type: Date,
    required: true,
  },
  offerPrice: {
    type: Number,
    required: true,
  },
  minimumPrice: {
    type: Number,
    required: true,
  },
  maxUses: {  
    type: Number,
    default: 5,  
  },
  usesCount: {  
    type: Number,
    default: 0,
  },
  userUses: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    count: {
      type: Number,
      default: 0
    }
  }],
  isListed: {
    type: Boolean,
    default: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
});


const Coupon = mongoose.model("Coupon", couponSchema);

module.exports = Coupon;
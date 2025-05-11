const mongoose = require('mongoose');
const {Schema} = mongoose;


const productSchema = new Schema({
  productName : {
    type : String,
    required : true
  },
  description : {
    type : String,
    required : true
  },
  category:{
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  price:{
    type: Number,
    required: true
  },
  productOffer: {
    type: Boolean,
    required: true,
    default: false,
  },
  offer: {
    type: Schema.Types.ObjectId,
    ref: 'Offer',
    default: null
  },
  quantity:{
    type: Number,
    required: true
  },
  productImage:{
    type: [String],
    required: true
  },
  isBlocked:{
    type: Boolean,
    default: false
  },
  offerPercentage: {
    type: Number,
    default: 0,
  },
  offerEndDate: {
    type: Date,
    default: null,
  },
  popularityScore: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    default: 0
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  status:{
    type: String,
    enum:["Available","Out of Stock","Discontinued"],
    required: true,
    default: "Available"
  },
  },{timestamps:true});

// Virtual for final price after offer
productSchema.virtual('finalPrice').get(function() {
  if (this.offerPercentage > 0) {
    const discountAmount = (this.price * this.offerPercentage) / 100;
    return this.price - discountAmount;
  }
  return this.price;
});

// Method to calculate and update offer details
productSchema.methods.updateOfferDetails = async function() {
  const offerService = require('../services/offerService');

  // Get the best offer for this product
  const offerResult = await offerService.getBestOfferForProduct(this._id, this.price);

  if (offerResult.hasOffer) {
    // Calculate offer percentage
    const offerPercentage = (offerResult.discountAmount / this.price) * 100;

    // Update product with offer details
    this.offerPercentage = parseFloat(offerPercentage.toFixed(2));
    this.offer = offerResult.offer._id;
    this.productOffer = true;

    // Set offer end date
    if (offerResult.offer.endDate) {
      this.offerEndDate = offerResult.offer.endDate;
    }

    await this.save();
    return true;
  } else {
    // Clear offer details if no valid offer
    this.offerPercentage = 0;
    this.offer = null;
    this.productOffer = false;
    this.offerEndDate = null;

    await this.save();
    return false;
  }
};

// Pre-save hook to automatically update status based on quantity
productSchema.pre('save', function(next) {
  // Update status based on quantity
  if (this.isModified('quantity')) {
    if (this.quantity > 0) {
      this.status = "Available";
    } else {
      this.status = "Out of Stock";
    }
  }
  next();
});

// Set toJSON option to include virtuals
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

  module.exports = Product;
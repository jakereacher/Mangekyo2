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
  offerType: {
    type: String,
    enum: ['product', 'category', null],
    default: null
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
  reviewCount: {
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
    return Math.round(this.price - discountAmount);
  }
  return Math.round(this.price);
});

// Method to calculate and update offer details
productSchema.methods.updateOfferDetails = async function() {
  const offerService = require('../services/offerService');
  const Offer = require('./offerSchema');
  const now = new Date();

  // Check if current offer is expired
  if (this.offer) {
    const currentOffer = await Offer.findById(this.offer);
    if (currentOffer && (!currentOffer.isActive || currentOffer.endDate < now)) {
      console.log(`Clearing expired offer from product ${this._id}: Offer ${currentOffer._id} expired on ${currentOffer.endDate}`);
      this.offerPercentage = 0;
      this.offer = null;
      this.productOffer = false;
      this.offerType = null;
      this.offerEndDate = null;
      await this.save();
    }
  }

  // Get the best offer for this product
  const offerResult = await offerService.getBestOfferForProduct(this._id, this.price);

  if (offerResult.hasOffer) {
    // Double-check offer validity
    const offer = offerResult.offer;
    if (!offer.isActive || offer.startDate > now || offer.endDate < now) {
      // Clear offer details
      this.offerPercentage = 0;
      this.offer = null;
      this.productOffer = false;
      this.offerType = null;
      this.offerEndDate = null;
      await this.save();
      return false;
    }

    // Calculate offer percentage
    const offerPercentage = (offerResult.discountAmount / this.price) * 100;

    // Update product with offer details
    this.offerPercentage = parseFloat(offerPercentage.toFixed(2));
    this.offer = offerResult.offer._id;
    this.productOffer = true;
    this.offerType = offerResult.offer.type; // Store the type of offer (product or category)

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
    this.offerType = null;
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
const { name } = require('ejs');
const mongoose = require('mongoose');
const {Schema} = mongoose;

const categorySchema = new Schema({
  name  : {
    type : String,
    required : true,
    unique : true
  },
  description : {
    type : String,
    required : true
  },
  isListed:{
    type: Boolean,
    default: true
  },
  categoryOffer:{
    type: Number,
    default:0,
  },
  offer: {
    type: Schema.Types.ObjectId,
    ref: 'Offer',
    default: null
  },
  offerType: {
    type: String,
    enum: ['category', null],
    default: null
  },
  offerEndDate: {
    type: Date,
    default: null,
  },
},
  {timestamps:true}
);

// Method to calculate and update offer details
categorySchema.methods.updateOfferDetails = async function() {
  const Offer = require('./offerSchema');
  const Product = require('./productSchema');

  // Find active offers for this category
  const now = new Date();
  const categoryOffer = await Offer.findOne({
    type: 'category',
    applicableCategories: this._id,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).sort({ createdAt: -1 }); // Get the newest offer first

  if (categoryOffer) {
    // Update category with offer details
    this.offer = categoryOffer._id;
    this.offerType = 'category';

    // Calculate offer percentage based on discount type
    if (categoryOffer.discountType === 'percentage') {
      this.categoryOffer = categoryOffer.discountValue;
    } else {
      // For fixed discount, we'll use a sample price of 1000 to calculate a percentage
      const samplePrice = 1000;
      const discountAmount = Math.min(categoryOffer.discountValue, samplePrice);
      this.categoryOffer = (discountAmount / samplePrice) * 100;
    }

    // Set offer end date
    this.offerEndDate = categoryOffer.endDate;

    await this.save();

    // Update all products in this category to reflect the offer
    const products = await Product.find({ category: this._id });
    for (const product of products) {
      await product.updateOfferDetails();
    }

    return true;
  } else {
    // Clear offer details if no valid offer
    this.offer = null;
    this.categoryOffer = 0;
    this.offerType = null;
    this.offerEndDate = null;

    await this.save();

    // Update all products in this category to reflect the removal of the offer
    const products = await Product.find({ category: this._id });
    for (const product of products) {
      await product.updateOfferDetails();
    }

    return false;
  }
};



const category = mongoose.model('Category',categorySchema);

module.exports = category;
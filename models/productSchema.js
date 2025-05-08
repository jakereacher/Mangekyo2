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
  regularPrice:{
    type: Number,
    required: true
  },
  salePrice:{
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
    enum:["Available"," Out of Stock","Discont"],
    required: true,
    default: "Available"
  },
  },{timestamps:true});

  const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

  module.exports = Product;
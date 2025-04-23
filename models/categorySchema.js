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
  // createdAt:{
  //   type: Date,
  //   default: Date.now   
  // }
  offerEndDate: {
    type: Date,
    default: null,
  },
},
  {timestamps:true}
);



const category = mongoose.model('Category',categorySchema);

module.exports = category;
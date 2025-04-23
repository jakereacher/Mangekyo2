const mongoose = require('mongoose');
const { link } = require('../routes/userRouter');
const {Schema} = mongoose;

const bannerSchema = new Schema({
  image:{
    type: String,
    required: true
  },
  title:{
    type: String,
    required: true
  },
  description:{
    type: String,
    required: true
  },
  link:{
    type: String,
  },
  startDate:{
    type: Date,
    required: true
  },
  endDate:{
    type: Date,
    required: true
  }
})

const Banner = mongoose.model('Banner',bannerSchema);

module.exports = Banner;
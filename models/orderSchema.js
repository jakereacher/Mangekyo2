const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require("uuid");

const orderSchema = new Schema({
  orderId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  orderedItems: [
    {
      product: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
      },
      price: {
        type: Number,
        default: 0,
      },
      status: {
        type: String,
        required: true,
        enum: [
          "Processing",
          "Shipped",
          "Delivered",
          "Cancelled",
          "Return Request",
          "Returned",
        ],
        default: "Processing",
      },
      returnReason: {
        type: String,
        default: null,
      },
      adminResponse: {
        type: String,
        default: null,
      },
    },
  ],
  totalPrice: {
    type: Number,
    required: true,
  },
  shippingCharge: {
    type: Number,
    required: false,
  },
  discount: {
    type: Number,
    required: true,
  },
  finalAmount: {
    type: Number,
    required: true,
  },
  shippingAddress: {
    fullName: {
      type: String,
      required: true
    },
    addressType: {
      type: String,
      required: true
    },
    landmark: {
      type: String,
      default: ''
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    pincode: {
      type: String,
      required: true
    },
    phone: {
      type: Number,
      required: true
    },
  },
  paymentMethod: {
    type: String,
    enum: ["debitCredit", "bank", "upi", "wallet", "cod", "razorpay"],
    required: true,
  },
  paymentGateway: {
    type: String,
    enum: ["Razorpay", "Other"],
    default: "Razorpay",
  },
  invoiceDate: {
    type: Date,
    default: Date.now,
  },
  orderDate: {
    type: Date,
    required: true,
  },
  deliveryDate: {
    type: Date,
    required: true,
  },
  createdOn: {
    type: Date,
    default: Date.now,
    required: true,
  },
  couponApplied: {
    type: Boolean,
    default: false,
  },
  couponCode: {
    type: String,
    default: null,
  },
  cancellation_reason: {
    type: String,
    default: null,
  },
  return_reason: {
    type: String,
    default: null,
  },
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
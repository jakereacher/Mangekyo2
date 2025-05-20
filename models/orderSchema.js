const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require("uuid");

const orderSchema = new Schema({
  orderId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
  },
  orderNumber: {
    type: String,
    unique: true,
    sparse: true, // Allows null/undefined values (for existing orders)
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
      originalPrice: {
        type: Number,
        default: 0,
      },
      discountPercentage: {
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
          "Cancellation Pending",
          "Return Request",
          "Returned",
        ],
        default: "Processing",
      },
      order_place_date: {
        type: Date,
        default: Date.now,
      },
      order_processing_date: {
        type: Date,
        default: null,
      },
      order_shipped_date: {
        type: Date,
        default: null,
      },
      order_delivered_date: {
        type: Date,
        default: null,
      },
      order_cancelled_date: {
        type: Date,
        default: null,
      },
      order_returned_date: {
        type: Date,
        default: null,
      },
      order_return_request_date: {
        type: Date,
        default: null,
      },
      order_return_status: {
        type: String,
        enum: ["Pending", "Approved", "Rejected"],
        default: "Pending",
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
    enum: [ "wallet", "cod", "razorpay"],
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ["Pending", "Paid", "Failed"],
    default: "Pending",
  },
  paymentDetails: {
    method: {
      type: String,
      enum: ["wallet", "cod", "razorpay"],
      default: null
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: "WalletTransaction",
      default: null
    },
    paidAmount: {
      type: Number,
      default: 0
    },
    paidAt: {
      type: Date,
      default: null
    },
    error: {
      type: String,
      default: null
    }
  },
  razorpayOrderId: {
    type: String,
    default: null,
  },
  razorpayPaymentId: {
    type: String,
    default: null,
  },
  paymentGateway: {
    type: String,
    enum: ["Razorpay", "Wallet", "COD", "Other"],
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
  coupon: {
    code: { type: String },
    type: { type: String },
    discountValue: { type: Number },
    couponId: {
      type: Schema.Types.ObjectId,
      ref: 'Coupon'
    }
  },
  cancellation_reason: {
    type: String,
    default: null,
  },
  cancellation_status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: null,
  },
  cancellation_admin_response: {
    type: String,
    default: null,
  },
  cancellation_requested_at: {
    type: Date,
    default: null,
  },
  cancellation_processed_at: {
    type: Date,
    default: null,
  },
  return_reason: {
    type: String,
    default: null,
  },
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
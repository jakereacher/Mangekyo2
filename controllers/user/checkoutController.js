const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Coupon = require("../../models/couponSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const mongoose = require("mongoose");

exports.renderCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).render('page-404');
    }

    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !cart.products || cart.products.length === 0) {
      req.flash('error', 'Your cart is empty');
      return res.redirect('/cart');
    }

    const cartItems = await Promise.all(
      cart.products.map(async (item) => {
        const product = await Product.findById(item.productId).lean();
        if (!product) return null;

        const mainImage = product.productImage && product.productImage.length > 0 
          ? product.productImage[0] 
          : '/images/default-product.jpg';

        return {
          ...item,
          product: {
            ...product,
            mainImage
          }
        };
      })
    );

    const validCartItems = cartItems.filter(item => item !== null);

    const subtotal = validCartItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const shipping = 5.99;
    const tax = subtotal * 0.08;
    const total = subtotal + shipping + tax;

    let defaultAddress = null;
    if (Array.isArray(user.address) && user.address.length > 0) {
      defaultAddress = user.address.find((addr, idx) => addr && idx > 0 && addr.isDefault) || user.address[1];
    }

    res.render("checkout", {
      user,
      cartItems: validCartItems,
      cartCount: validCartItems.length,
      subtotal: subtotal.toFixed(2),
      shipping: shipping.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      addresses: user.address ? user.address.filter(addr => addr !== null) : [],
      defaultAddress,
      currentStep: 1
    });

  } catch (error) {
    console.error('Error rendering checkout page:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('page-404');
  }
};

exports.handleAddressSelection = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId } = req.body;

    if (!userId || !addressId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Invalid request'
      });
    }

    await User.updateMany(
      { _id: userId },
      { $set: { 'address.$[].isDefault': false } }
    );

    await User.updateOne(
      { _id: userId, 'address.id': addressId },
      { $set: { 'address.$.isDefault': true } }
    );

    res.json({
      success: true,
      message: 'Default address updated'
    });

  } catch (error) {
    console.error('Error updating default address:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Server error'
    });
  }
};

exports.placeOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { paymentMethod, addressId, couponCode } = req.body;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!["cod", "wallet"].includes(paymentMethod)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !cart.products || cart.products.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Your cart is empty",
        redirect: "/cart",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found",
      });
    }

    const selectedAddress = user.address.id(addressId);
    if (!selectedAddress) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Selected address not found",
      });
    }

    const orderedItems = await Promise.all(
      cart.products.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product || product.isBlocked || product.status !== "Available") {
          return null;
        }

        if (product.quantity < item.quantity) {
          return {
            product: item.productId,
            quantity: product.quantity,
            price: item.price,
            status: "Processing",
            stockIssue: true,
          };
        }

        return {
          product: item.productId,
          quantity: item.quantity,
          price: item.price,
          status: "Processing",
        };
      })
    );

    const validItems = orderedItems.filter((item) => item !== null);
    const stockIssues = validItems.filter((item) => item.stockIssue);

    if (validItems.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "No valid products in your cart",
        redirect: "/cart",
      });
    }

    if (stockIssues.length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Some items have insufficient stock",
        items: stockIssues,
        redirect: "/cart",
      });
    }

    const subtotal = validItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const shipping = 5.99;
    const tax = subtotal * 0.08;

    // Coupon validation if applied
    let coupon = null;
    let discount = 0;

    if (couponCode) {
      coupon = await Coupon.findOne({
        code: couponCode,
        isActive: true,
        isDelete: false,
        startDate: { $lte: new Date() },
        expiryDate: { $gte: new Date() },
      });

      if (!coupon) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Invalid or expired coupon code",
        });
      }

      // Check if user already used this coupon
      const userUsage = coupon.users.find((u) => u.userId.toString() === userId);
      if (userUsage && userUsage.usedCount >= coupon.perUserLimit) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "You've already used this coupon the maximum allowed times",
        });
      }

      // Check total usage limit
      if (coupon.totalUsedCount >= coupon.usageLimit) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "This coupon has reached its usage limit",
        });
      }

      // Calculate discount
      if (coupon.type === "percentage") {
        discount = (subtotal * coupon.discountValue) / 100;
        if (coupon.maxDiscount && discount > coupon.maxDiscount) {
          discount = coupon.maxDiscount;
        }
      } else {
        discount = coupon.discountValue;
      }
    }

    // Calculate final amount with discount
    const finalAmount = subtotal + shipping + tax - discount;

    if (paymentMethod === "wallet" && user.wallet < finalAmount) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    const order = new Order({
      userId,
      orderedItems: validItems,
      totalPrice: subtotal,
      shippingCharge: shipping,
      taxAmount: tax,
      discount,
      finalAmount,
      shippingAddress: {
        fullName: selectedAddress.fullName,
        addressType: selectedAddress.addressType || "Home",
        landmark: selectedAddress.landmark || "",
        city: selectedAddress.city,
        state: selectedAddress.state,
        pincode: selectedAddress.pinCode,
        phone: selectedAddress.mobile,
      },
      paymentMethod,
      paymentStatus: paymentMethod === "cod" ? "Pending" : "Paid",
      orderDate: new Date(),
      deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const newOrder = await order.save();

    try {
      await Promise.all(
        validItems.map(async (item) => {
          const product = await Product.findById(item.product);
          if (product.quantity >= item.quantity) {
            product.quantity -= item.quantity;
            await product.save();
          } else {
            throw new Error(`Insufficient stock for product ${item.product}`);
          }
        })
      );
    } catch (error) {
      await Order.deleteOne({ _id: newOrder._id });
      throw new Error("Failed to update product quantities: " + error.message);
    }

    try {
      const updateUser = {
        $push: { orderHistory: newOrder._id },
      };

      if (paymentMethod === "wallet") {
        updateUser.$inc = { wallet: -finalAmount };
      }

      await User.findByIdAndUpdate(userId, updateUser);
    } catch (error) {
      await Order.deleteOne({ _id: newOrder._id });
      await Promise.all(
        validItems.map(async (item) => {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { quantity: item.quantity },
          });
        })
      );
      throw new Error("Failed to update user: " + error.message);
    }

    // Update coupon usage after successful order creation
    if (coupon) {
      coupon.totalUsedCount += 1;

      const userUsageIndex = coupon.users.findIndex(
        (u) => u.userId.toString() === userId
      );
      if (userUsageIndex >= 0) {
        coupon.users[userUsageIndex].usedCount += 1;
      } else {
        coupon.users.push({ userId, usedCount: 1 });
      }

      await coupon.save();
    }

    try {
      await Cart.deleteOne({ userId });
    } catch (error) {
      console.error("Failed to clear cart:", error);
    }

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Order placed successfully",
      orderId: newOrder._id,
    });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to place order",
      error: error.message,
    });
  }
};

const applyCoupon = async (req, res) => {
  try {
    const { code, cartTotal, userId } = req.body;
    console.log("Received applyCoupon request:", req.body); // Debug log

    if (!code || !cartTotal || !userId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Coupon code, cart total, and user ID are required.",
        missingFields: {
          code: !code,
          cartTotal: !cartTotal,
          userId: !userId,
        },
      });
    }

    const numericCartTotal = Number(cartTotal);
    if (isNaN(numericCartTotal)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid cart total value",
      });
    }

    const coupon = await Coupon.findOne({
      code,
      isActive: true,
      isDelete: false,
      startDate: { $lte: new Date() },
      expiryDate: { $gte: new Date() },
    });

    if (!coupon) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Invalid or expired coupon code",
      });
    }

    if (numericCartTotal < coupon.minPrice) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `Minimum cart value for this coupon is ₹${coupon.minPrice}`,
      });
    }

    let discount = 0;
    if (coupon.type === "percentage") {
      discount = (numericCartTotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      discount = coupon.discountValue;
    }

    const finalAmount = numericCartTotal - discount;

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Coupon applied successfully",
      discount,
      finalAmount,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        discountValue: coupon.discountValue,
        maxDiscount: coupon.maxDiscount,
      },
    });
  } catch (error) {
    console.error("Error applying coupon:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};


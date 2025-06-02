/**
 * CheckoutController
 */

const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
const Wallet = require("../../models/walletSchema");
const WalletTransaction = require("../../models/walletTransactionSchema");
const Coupon = require("../../models/couponSchema");
const DeliveryCharge = require("../../models/deliveryChargeSchema");
const StatusCodes = require("../../utils/httpStatusCodes");
const { generateOrderNumber } = require("../../utils/orderNumberGenerator");
const mongoose = require("mongoose");
const { razorpayKeyId } = require("../../config/razorpay");
const { processWalletPayment } = require("./walletController");
const deliveryChargeController = require("../admin/deliveryChargeController");

//=================================================================================================
// Render Checkout Page
//=================================================================================================
// This function renders the checkout page.
// It renders the checkout page.
//=================================================================================================
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

    const wallet = await Wallet.findOne({ user: userId }).lean();

    if (wallet) {
      user.wallet = wallet.balance;
    } else {
      user.wallet = user.wallet || 0;
    }

    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !cart.products || cart.products.length === 0) {
      req.flash('error', 'Your cart is empty');
      return res.redirect('/cart');
    }

    const offerService = require('../../services/offerService');

    const cartItems = await Promise.all(
      cart.products.map(async (item) => {
        const product = await Product.findById(item.productId).lean();
        if (!product) return null;

        const mainImage = product.productImage && product.productImage.length > 0
          ? product.productImage[0]
          : '/images/default-product.jpg';

        const basePrice = product.price || 0;
        const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);


        const currentBestPrice = offerResult.finalPrice;


        const priceDifference = Math.abs(item.price - currentBestPrice);
        const shouldUpdatePrice = priceDifference > 0.01; // 1 cent threshold for floating point comparison

        if (shouldUpdatePrice) {
          item.price = currentBestPrice;
          item.totalPrice = currentBestPrice * item.quantity;

          await Cart.updateOne(
            { userId, "products.productId": item.productId },
            {
              $set: {
                "products.$.price": currentBestPrice,
                "products.$.totalPrice": currentBestPrice * item.quantity
              }
            }
          );
        }

        return {
          ...item,
          product: {
            ...product,
            mainImage,
            hasOffer: offerResult.hasOffer,
            discountAmount: offerResult.discountAmount,
            discountPercentage: offerResult.hasOffer ? (offerResult.discountAmount / basePrice) * 100 : 0,
            originalPrice: basePrice,
            finalPrice: currentBestPrice,
            offerType: offerResult.offer ? offerResult.offer.discountType : null,
            offerValue: offerResult.offer ? offerResult.offer.discountValue : null
          }
        };
      })
    );

    const validCartItems = cartItems.filter(item => item !== null);

    const subtotal = validCartItems.reduce((sum, item) => sum + item.totalPrice, 0);

    let defaultAddress = null;
    if (Array.isArray(user.address) && user.address.length > 0) {
      defaultAddress = user.address.find((addr, idx) => addr && idx > 0 && addr.isDefault) || user.address[1];
    }

    let shippingInfo = await deliveryChargeController.getDefaultDeliveryCharge(); // Default charge
    let shipping = shippingInfo.charge;
    let deliveryDescription = shippingInfo.description;

    if (defaultAddress && defaultAddress.city) {

      const normalizedCity = defaultAddress.city.trim().toLowerCase();

      const cityDeliveryInfo = await deliveryChargeController.getDeliveryChargeByLocation(normalizedCity);

      if (cityDeliveryInfo !== null) {
        shipping = cityDeliveryInfo.charge;
        deliveryDescription = cityDeliveryInfo.description || 'Standard Delivery';
      } else {

        const stateCharge = await deliveryChargeController.getDeliveryChargeByState(defaultAddress.state);
        if (stateCharge !== null) {
          shipping = stateCharge;
          deliveryDescription = 'State-based Delivery';
        }
      }
    }

    const tax = Math.round(subtotal * 0.09); // Using 9% tax rate consistently across the application
    const total = Math.round(subtotal + shipping + tax);

    const isCodAllowed = total <= 1000;

    const safeRazorpayKeyId = razorpayKeyId || 'rzp_test_UkVZCj9Q9Jy9Ja';

    // Get session message and clear it
    const sessionMessage = req.session.message;
    if (req.session.message) {
      delete req.session.message;
    }

    res.render("checkout", {
      user,
      cartItems: validCartItems,
      cartCount: validCartItems.length,
      subtotal: Math.round(subtotal),
      shipping: Math.round(shipping),
      tax: Math.round(tax),
      total: Math.round(total),
      addresses: user.address ? user.address.filter(addr => addr !== null) : [],
      defaultAddress,
      currentStep: 1,
      isCodAllowed, // Pass COD eligibility to the frontend
      deliveryDescription, // Pass delivery description to the frontend
      razorpayKeyId: safeRazorpayKeyId, // Pass Razorpay key ID to the frontend
      message: sessionMessage // Pass session message to the frontend
    });

  } catch (error) {
    console.error('Error rendering checkout page:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('page-404');
  }
};

//=================================================================================================
// Handle Address Selection
//=================================================================================================
// This function handles the address selection.
// It handles the address selection.
//=================================================================================================
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

    if (req.xhr || req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        message: 'Default address updated'
      });
    }

    req.flash('success', 'Default address updated');
    return res.redirect('/checkout');

  } catch (error) {
    console.error('Error updating default address:', error);

    if (req.xhr || req.headers.accept.includes('application/json')) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Server error'
      });
    }

    req.flash('error', 'Failed to update default address');
    return res.redirect('/checkout');
  }
};

//=================================================================================================
// Place Order
//=================================================================================================
// This function places an order.
// It places an order.
//=================================================================================================
exports.placeOrder = async (req, res) => {
  // Force JSON response for all requests to this endpoint
  res.setHeader('Content-Type', 'application/json');

  try {
    const userId = req.session.user;
    const { paymentMethod, addressId, couponCode } = req.body;

    // Check authentication
    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
        redirect: "/login"
      });
    }

    if (!["cod", "wallet", "razorpay"].includes(paymentMethod)) {
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

    const offerService = require('../../services/offerService');

    const orderedItems = await Promise.all(
      cart.products.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product || product.isBlocked || product.status !== "Available") {
          return null;
        }

        const basePrice = product.price || 0;
        const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);

        const currentBestPrice = offerResult.finalPrice;

        const discountPercentage = offerResult.hasOffer ? (offerResult.discountAmount / basePrice) * 100 : 0;

        if (product.quantity < item.quantity) {
          return {
            product: item.productId,
            quantity: product.quantity,
            price: currentBestPrice,
            originalPrice: basePrice,
            discountPercentage: discountPercentage,
            status: "Processing",
            stockIssue: true,
          };
        }

        return {
          product: item.productId,
          quantity: item.quantity,
          price: currentBestPrice,
          originalPrice: basePrice,
          discountPercentage: discountPercentage,
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

    const subtotal = Math.round(validItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    ));


    if (!selectedAddress) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Selected address not found",
        redirect: "/checkout"
      });
    }

    let shippingInfo = await deliveryChargeController.getDefaultDeliveryCharge(); // Default charge
    let shipping = shippingInfo.charge;
    let deliveryDescription = shippingInfo.description;

    if (selectedAddress && selectedAddress.city) {

      const normalizedCity = selectedAddress.city.trim().toLowerCase();

      const cityDeliveryInfo = await deliveryChargeController.getDeliveryChargeByLocation(normalizedCity);

      if (cityDeliveryInfo !== null) {
        shipping = cityDeliveryInfo.charge;
        deliveryDescription = cityDeliveryInfo.description || 'Standard Delivery';
      } else {

        const stateCharge = await deliveryChargeController.getDeliveryChargeByState(selectedAddress.state);
        if (stateCharge !== null) {
          shipping = stateCharge;
          deliveryDescription = 'State-based Delivery';
        }
      }
    }

    const tax = Math.round(subtotal * 0.09); // Using 9% tax rate consistently across the application

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
          errorType: "INVALID_COUPON"
        });
      }

      if (subtotal < coupon.minPrice) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: `Cart value must be at least ₹${coupon.minPrice} to use this coupon`,
          errorType: "MINIMUM_CART_VALUE_NOT_MET",
          details: {
            minPrice: coupon.minPrice,
            currentTotal: subtotal,
            difference: coupon.minPrice - subtotal
          }
        });
      }

      if (coupon.maxPrice && subtotal > coupon.maxPrice) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: `Cart value must be less than ₹${coupon.maxPrice} to use this coupon`,
          errorType: "MAXIMUM_CART_VALUE_EXCEEDED",
          details: {
            maxPrice: coupon.maxPrice,
            currentTotal: subtotal
          }
        });
      }

      const userCoupon = coupon.users.find(
        (u) => u.userId.toString() === userId.toString()
      );

      if (userCoupon && userCoupon.usedCount >= coupon.usageLimit) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "You have reached the usage limit for this coupon",
          errorType: "USAGE_LIMIT_REACHED",
          details: {
            usageLimit: coupon.usageLimit,
            usedCount: userCoupon.usedCount
          }
        });
      }

      if (coupon.totalUsedCount >= coupon.totalUsageLimit) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "This coupon has reached its maximum usage limit",
          errorType: "TOTAL_USAGE_LIMIT_REACHED",
          details: {
            totalUsageLimit: coupon.totalUsageLimit,
            totalUsedCount: coupon.totalUsedCount
          }
        });
      }

      if (coupon.type === "percentage") {
        discount = Math.round((subtotal * coupon.discountValue) / 100);
        if (coupon.maxDiscount && discount > coupon.maxDiscount) {
          discount = Math.round(coupon.maxDiscount);
        }
      } else {
        discount = Math.round(coupon.discountValue);
      }
    }

    const finalAmount = Math.round((subtotal + shipping + tax) - discount);

    const isCodAllowed = finalAmount <= 1000;

    if (paymentMethod === "cod" && !isCodAllowed) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Cash on Delivery is not available for orders above ₹1000. Please choose another payment method.",
        errorType: "COD_NOT_ALLOWED"
      });
    }

    if (paymentMethod === "wallet") {

      let wallet = await Wallet.findOne({ user: userId });
      let walletBalance = 0;

      if (wallet) {
        walletBalance = wallet.balance;
      } else if (typeof user.wallet === 'number' && user.wallet > 0) {

        wallet = new Wallet({
          user: userId,
          balance: user.wallet
        });
        walletBalance = user.wallet;
        await wallet.save();
      } else {

        wallet = new Wallet({
          user: userId,
          balance: 0
        });
        await wallet.save();
        walletBalance = 0;
      }
      if (walletBalance < finalAmount) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: "Insufficient wallet balance",
        });
      }
    }

    const orderData = {
      userId,
      orderedItems: validItems,
      totalPrice: subtotal,
      shippingCharge: shipping,
      deliveryDescription: deliveryDescription, // Add delivery description
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
      paymentStatus: paymentMethod === "wallet" ? "Paid" : "Pending", // Set both COD and Razorpay to Pending by default
      orderDate: new Date(),
      deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    if (coupon) {
      orderData.couponApplied = true;
      orderData.couponCode = couponCode;

      if (orderData.coupon === undefined) {
        orderData.coupon = {};
      }

      orderData.coupon.code = coupon.code;
      orderData.coupon.type = coupon.type;
      orderData.coupon.discountValue = coupon.discountValue;
      orderData.coupon.couponId = coupon._id;
    }

    try {
      const orderNumber = await generateOrderNumber();
      orderData.orderNumber = orderNumber;
    } catch (orderNumberError) {
      console.error("Error generating order number:", orderNumberError);

    }

    const order = new Order(orderData);

    let newOrder;
    try {
      newOrder = await order.save();
    } catch (saveError) {
      console.error("Error saving order:", saveError);
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Failed to create order",
        error: saveError.message
      });
    }

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
        try {

          const paymentResult = await processWalletPayment(
            userId,
            newOrder._id,
            finalAmount,
            `Payment for order ${newOrder.orderNumber || newOrder._id}`
          );
          await Order.findByIdAndUpdate(newOrder._id, {
            paymentStatus: "Paid",
            paymentDetails: {
              method: "wallet",
              transactionId: paymentResult.transaction._id,
              paidAmount: finalAmount,
              paidAt: new Date()
            }
          });

        } catch (walletError) {
          console.error("Wallet payment error:", walletError);

          await Order.findByIdAndUpdate(newOrder._id, {
            paymentStatus: "Failed",
            paymentDetails: {
              method: "wallet",
              error: walletError.message
            }
          });

          throw walletError;
        }
      }


      if (paymentMethod === "razorpay") {
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

    if (coupon) {
      const existingUserUsage = coupon.users.find(
        (u) => u.userId.toString() === userId.toString()
      );
      coupon.totalUsedCount += 1;

      const userUsageIndex = coupon.users.findIndex(
        (u) => u.userId.toString() === userId.toString()
      );
      if (userUsageIndex >= 0) {
        coupon.users[userUsageIndex].usedCount += 1;
      } else {
        coupon.users.push({ userId, usedCount: 1 });
      }

      await coupon.save();
      const updatedUserUsage = coupon.users.find(
        (u) => u.userId.toString() === userId.toString()
      );
    }

    try {
      await Cart.deleteOne({ userId });
    } catch (error) {
      console.error("Failed to clear cart:", error);
    }

    const isAjaxRequest = req.xhr || req.headers.accept.includes('application/json');

    if (isAjaxRequest) {
      return res.status(StatusCodes.OK)
        .header('Content-Type', 'application/json')
        .json({
          success: true,
          message: "Order placed successfully",
          orderId: newOrder._id,
        });
    }


    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Order placed successfully",
      orderId: newOrder._id,
      redirect: `/orders/${newOrder._id}`
    });
  } catch (error) {
    // Ensure JSON response
    res.setHeader('Content-Type', 'application/json');

    // Determine appropriate error message and redirect URL
    let errorMessage = "Failed to place order";
    let redirectUrl = '/cart';

    if (error.message && error.message.includes("wallet")) {
      errorMessage = `Wallet payment failed: ${error.message}`;
      redirectUrl = '/profile#wallet';
    } else if (error.message && error.message.includes("stock")) {
      errorMessage = "Some items in your cart are out of stock";
      redirectUrl = '/cart';
    } else if (error.message && error.message.includes("COD")) {
      errorMessage = error.message;
      redirectUrl = '/checkout';
    }

    // Always return JSON
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: errorMessage,
      error: error.message,
      redirect: redirectUrl
    });
  }
};



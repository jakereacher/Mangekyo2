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

exports.renderCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect("/login");
    }

    // Find user and populate wallet data
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).render('page-404');
    }

    // Find wallet for this user
    const wallet = await Wallet.findOne({ user: userId }).lean();

    // If wallet exists, use its balance, otherwise use the user.wallet value or default to 0
    if (wallet) {
      user.wallet = wallet.balance;
      console.log("Using wallet balance from Wallet collection:", wallet.balance);
    } else {
      user.wallet = user.wallet || 0;
      console.log("Using wallet balance from User document:", user.wallet);
    }

    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !cart.products || cart.products.length === 0) {
      req.flash('error', 'Your cart is empty');
      return res.redirect('/cart');
    }

    // Get the offerService to calculate best offer prices
    const offerService = require('../../services/offerService');

    const cartItems = await Promise.all(
      cart.products.map(async (item) => {
        const product = await Product.findById(item.productId).lean();
        if (!product) return null;

        const mainImage = product.productImage && product.productImage.length > 0
          ? product.productImage[0]
          : '/images/default-product.jpg';

        // Get the best offer for this product
        const basePrice = product.price || 0;
        const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);

        // Use the price from cart (which should already have the best offer applied)
        // but double-check it against the current best offer price
        const currentBestPrice = offerResult.finalPrice;

        // If there's a significant difference between cart price and current best price,
        // use the current best price (this handles cases where offers changed after adding to cart)
        const priceDifference = Math.abs(item.price - currentBestPrice);
        const shouldUpdatePrice = priceDifference > 0.01; // 1 cent threshold for floating point comparison

        if (shouldUpdatePrice) {
          console.log(`Price difference detected for ${product.productName}: Cart price: ${item.price}, Current best price: ${currentBestPrice}`);
          // Update the item price and total price
          item.price = currentBestPrice;
          item.totalPrice = currentBestPrice * item.quantity;

          // Also update the cart in the database
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
            finalPrice: currentBestPrice
          }
        };
      })
    );

    const validCartItems = cartItems.filter(item => item !== null);

    // Calculate subtotal based on the updated prices
    const subtotal = validCartItems.reduce((sum, item) => sum + item.totalPrice, 0);

    // Get default address for delivery charge calculation
    let defaultAddress = null;
    if (Array.isArray(user.address) && user.address.length > 0) {
      defaultAddress = user.address.find((addr, idx) => addr && idx > 0 && addr.isDefault) || user.address[1];
    }

    // Calculate delivery charge based on location
    let shippingInfo = deliveryChargeController.getDefaultDeliveryCharge(); // Default charge
    let shipping = shippingInfo.charge;
    let deliveryDescription = shippingInfo.description;

    if (defaultAddress && defaultAddress.city) {
      // Get delivery charge based on city
      const cityDeliveryInfo = await deliveryChargeController.getDeliveryChargeByLocation(defaultAddress.city);

      if (cityDeliveryInfo !== null) {
        shipping = cityDeliveryInfo.charge;
        deliveryDescription = cityDeliveryInfo.description || 'Standard Delivery';
      } else {
        // If no city-specific charge, try state
        const stateCharge = await deliveryChargeController.getDeliveryChargeByState(defaultAddress.state);
        if (stateCharge !== null) {
          shipping = stateCharge;
          deliveryDescription = 'State-based Delivery';
        }
      }
    }

    const tax = subtotal * 0.09; // Using 9% tax rate consistently across the application
    const total = subtotal + shipping + tax;

    // Check if order is eligible for COD (not allowed for orders above Rs 1000)
    const isCodAllowed = total <= 1000;

    // Make sure we have a valid Razorpay key ID
    const safeRazorpayKeyId = razorpayKeyId || 'rzp_test_UkVZCj9Q9Jy9Ja';

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
      currentStep: 1,
      isCodAllowed, // Pass COD eligibility to the frontend
      deliveryDescription, // Pass delivery description to the frontend
      razorpayKeyId: safeRazorpayKeyId // Pass Razorpay key ID to the frontend
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

    // Return JSON response for AJAX requests
    if (req.xhr || req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        message: 'Default address updated'
      });
    }

    // For non-AJAX requests, redirect back to checkout
    req.flash('success', 'Default address updated');
    return res.redirect('/checkout');

  } catch (error) {
    console.error('Error updating default address:', error);

    // Return JSON response for AJAX requests
    if (req.xhr || req.headers.accept.includes('application/json')) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Server error'
      });
    }

    // For non-AJAX requests, redirect back to checkout with error message
    req.flash('error', 'Failed to update default address');
    return res.redirect('/checkout');
  }
};

exports.placeOrder = async (req, res) => {
  // Set content type to JSON for all responses from this endpoint
  res.setHeader('Content-Type', 'application/json');
  try {
    const userId = req.session.user;
    const { paymentMethod, addressId, couponCode } = req.body;
    console.log("Order request body:", req.body);

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "User not authenticated",
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

    // Get the offerService to calculate best offer prices
    const offerService = require('../../services/offerService');

    const orderedItems = await Promise.all(
      cart.products.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product || product.isBlocked || product.status !== "Available") {
          return null;
        }

        // Get the best offer for this product
        const basePrice = product.price || 0;
        const offerResult = await offerService.getBestOfferForProduct(product._id, basePrice);

        // Use the current best price
        const currentBestPrice = offerResult.finalPrice;

        // Calculate discount percentage
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

    const subtotal = validItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // Get the selected address for delivery charge calculation
    // Use the already found selectedAddress or find it again if needed
    if (!selectedAddress) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Selected address not found",
        redirect: "/checkout"
      });
    }

    // Calculate delivery charge based on location
    let shippingInfo = deliveryChargeController.getDefaultDeliveryCharge(); // Default charge
    let shipping = shippingInfo.charge;
    let deliveryDescription = shippingInfo.description;

    if (selectedAddress && selectedAddress.city) {
      // Get delivery charge based on city
      const cityDeliveryInfo = await deliveryChargeController.getDeliveryChargeByLocation(selectedAddress.city);

      if (cityDeliveryInfo !== null) {
        shipping = cityDeliveryInfo.charge;
        deliveryDescription = cityDeliveryInfo.description || 'Standard Delivery';
      } else {
        // If no city-specific charge, try state
        const stateCharge = await deliveryChargeController.getDeliveryChargeByState(selectedAddress.state);
        if (stateCharge !== null) {
          shipping = stateCharge;
          deliveryDescription = 'State-based Delivery';
        }
      }
    }

    const tax = subtotal * 0.09; // Using 9% tax rate consistently across the application

    // Enhanced coupon validation logic
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

      // Check coupon usage limits
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
    const finalAmount = (subtotal + shipping + tax) - discount;

    // Check if order is eligible for COD (not allowed for orders above Rs 1000)
    const isCodAllowed = finalAmount <= 1000;

    // Validate payment method
    if (paymentMethod === "cod" && !isCodAllowed) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Cash on Delivery is not available for orders above ₹1000. Please choose another payment method.",
        errorType: "COD_NOT_ALLOWED"
      });
    }

    // Check wallet balance for wallet payment
    if (paymentMethod === "wallet") {
      // Get wallet balance from Wallet collection
      let wallet = await Wallet.findOne({ user: userId });
      let walletBalance = 0;

      if (wallet) {
        walletBalance = wallet.balance;
        console.log("Found wallet with balance:", walletBalance);
      } else if (typeof user.wallet === 'number' && user.wallet > 0) {
        // If no wallet document but user has wallet balance, create wallet document
        wallet = new Wallet({
          user: userId,
          balance: user.wallet
        });
        walletBalance = user.wallet;
        await wallet.save();
        console.log("Created new wallet with balance from user:", walletBalance);
      } else {
        // Create empty wallet
        wallet = new Wallet({
          user: userId,
          balance: 0
        });
        await wallet.save();
        walletBalance = 0;
        console.log("Created new empty wallet");
      }

      console.log("Wallet payment selected. Available balance:", walletBalance);
      console.log("Required amount:", finalAmount);

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

    // Add coupon information if a coupon was applied
    if (coupon) {
      orderData.couponApplied = true;
      orderData.couponCode = couponCode;

      // Set coupon details as individual properties
      if (orderData.coupon === undefined) {
        orderData.coupon = {};
      }

      orderData.coupon.code = coupon.code;
      orderData.coupon.type = coupon.type;
      orderData.coupon.discountValue = coupon.discountValue;
      orderData.coupon.couponId = coupon._id;

      console.log("Coupon data being saved:", orderData.coupon);
    }

    // Generate a user-friendly order number
    try {
      const orderNumber = await generateOrderNumber();
      orderData.orderNumber = orderNumber;
      console.log("Generated order number:", orderNumber);
    } catch (orderNumberError) {
      console.error("Error generating order number:", orderNumberError);
      // Continue without order number if there's an error
    }

    const order = new Order(orderData);

    let newOrder;
    try {
      newOrder = await order.save();
      console.log("Order saved successfully:", newOrder._id);
      console.log("Order number:", newOrder.orderNumber);
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

      // Handle wallet payment
      if (paymentMethod === "wallet") {
        try {
          // Process wallet payment
          const paymentResult = await processWalletPayment(
            userId,
            newOrder._id,
            finalAmount,
            `Payment for order ${newOrder.orderNumber || newOrder._id}`
          );

          console.log("Wallet payment processed:", paymentResult);

          // Update order payment status
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

          // Update order payment status to failed
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

      // For Razorpay, we'll handle the payment separately
      // This is just a placeholder for now
      if (paymentMethod === "razorpay") {
        // We'll update the order with Razorpay details later
        // For now, just create the order
        console.log("Razorpay payment method selected");
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
      console.log("Updating coupon usage for coupon:", coupon.code);
      console.log("Before update - Total used count:", coupon.totalUsedCount);

      // Get current user usage before update
      const existingUserUsage = coupon.users.find(
        (u) => u.userId.toString() === userId.toString()
      );
      console.log("Before update - User usage:", existingUserUsage ? existingUserUsage.usedCount : 0);

      // Increment total usage count
      coupon.totalUsedCount += 1;

      // Update or add user usage
      const userUsageIndex = coupon.users.findIndex(
        (u) => u.userId.toString() === userId.toString()
      );
      if (userUsageIndex >= 0) {
        coupon.users[userUsageIndex].usedCount += 1;
      } else {
        coupon.users.push({ userId, usedCount: 1 });
      }

      // Save the updated coupon
      await coupon.save();

      // Log the updated values
      console.log("After update - Total used count:", coupon.totalUsedCount);
      const updatedUserUsage = coupon.users.find(
        (u) => u.userId.toString() === userId.toString()
      );
      console.log("After update - User usage:", updatedUserUsage.usedCount);
    }

    try {
      await Cart.deleteOne({ userId });
    } catch (error) {
      console.error("Failed to clear cart:", error);
    }

    // Determine if this is an AJAX request
    const isAjaxRequest = req.xhr || req.headers.accept.includes('application/json');

    // For AJAX requests, return JSON response
    if (isAjaxRequest) {
      return res.status(StatusCodes.OK)
        .header('Content-Type', 'application/json')
        .json({
          success: true,
          message: "Order placed successfully",
          orderId: newOrder._id,
        });
    }

    // Since we've set the Content-Type to application/json for all responses,
    // we need to return a JSON response even for redirects
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Order placed successfully",
      orderId: newOrder._id,
      redirect: `/orders/${newOrder._id}`
    });
  } catch (error) {
    console.error("Error placing order:", error);

    // Determine if this is an AJAX request
    const isAjaxRequest = req.xhr || req.headers.accept.includes('application/json');

    // For AJAX requests, return JSON response
    if (isAjaxRequest) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR)
        .header('Content-Type', 'application/json')
        .json({
          success: false,
          message: "Failed to place order",
          error: error.message,
        });
    }

    // Since we've set the Content-Type to application/json for all responses,
    // we need to return JSON responses for all cases

    // For wallet payment errors
    if (error.message && error.message.includes("wallet")) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: `Wallet payment failed: ${error.message}`,
        error: error.message,
        redirect: '/profile#wallet'
      });
    }

    // For other errors
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to place order",
      error: error.message,
      redirect: '/cart'
    });
  }
};

// Note: This function is now handled in couponController.js


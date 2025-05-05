const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const Order = require("../../models/orderSchema");
const User = require("../../models/userSchema");
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
    const { paymentMethod, addressId } = req.body;

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
    const total = subtotal + shipping + tax;

    if (paymentMethod === "wallet" && user.wallet < total) {
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
      discount: 0,
      finalAmount: total,
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
        updateUser.$inc = { wallet: -total };
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


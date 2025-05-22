/**
 * User Delivery Controller
 * Handles delivery charge calculations for user checkout
 */

const StatusCodes = require("../../utils/httpStatusCodes");
const deliveryChargeController = require("../admin/deliveryChargeController");

// Calculate delivery charge for a given address
exports.calculateDeliveryCharge = async (req, res) => {
  try {
    const { city, state } = req.body;

    if (!city) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "City is required to calculate delivery charges"
      });
    }

    // Get default delivery charge info
    let shippingInfo = deliveryChargeController.getDefaultDeliveryCharge();
    let shipping = shippingInfo.charge;
    let deliveryDescription = shippingInfo.description;

    // Get delivery charge based on city
    const cityDeliveryInfo = await deliveryChargeController.getDeliveryChargeByLocation(city);

    console.log('City delivery info:', cityDeliveryInfo);

    if (cityDeliveryInfo !== null) {
      shipping = cityDeliveryInfo.charge;
      deliveryDescription = cityDeliveryInfo.description || 'Standard Delivery';
      console.log(`Delivery charge for ${city}: ₹${shipping} (${deliveryDescription})`);
    } else if (state) {
      // If no city-specific charge, try state
      const stateCharge = await deliveryChargeController.getDeliveryChargeByState(state);
      if (stateCharge !== null) {
        shipping = stateCharge;
        deliveryDescription = 'State-based Delivery';
        console.log(`State-based delivery charge for ${state}: ₹${shipping}`);
      }
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      shipping,
      deliveryDescription
    });
  } catch (error) {
    console.error('Error calculating delivery charge:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to calculate delivery charge'
    });
  }
};

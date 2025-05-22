/**
 * Delivery Charge Controller
 * Handles CRUD operations for delivery charges based on location
 */

const DeliveryCharge = require('../../models/deliveryChargeSchema');
const StatusCodes = require('../../utils/httpStatusCodes');

// Get all delivery charges
exports.getAllDeliveryCharges = async (req, res) => {
  try {
    const deliveryCharges = await DeliveryCharge.find().sort({ state: 1, location: 1 });

    res.render('admin/admin-delivery-charges', {
      deliveryCharges,
      activePage: 'delivery-charges'
    });
  } catch (error) {
    console.error('Error fetching delivery charges:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).render('admin/admin-error', {
      message: 'Failed to fetch delivery charges',
      activePage: 'delivery-charges'
    });
  }
};

// Add a new delivery charge
exports.addDeliveryCharge = async (req, res) => {
  try {
    const { location, state, charge, cityType } = req.body;

    // Validate input
    if (!location || !state || !charge) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if location already exists
    const existingCharge = await DeliveryCharge.findOne({ location });
    if (existingCharge) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: 'Delivery charge for this location already exists'
      });
    }

    // Determine if it's a major city
    const majorCities = ['Mumbai', 'Delhi', 'Bangalore', 'Kochi', 'Chennai', 'Hyderabad', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur'];
    const isMajorCity = majorCities.some(city =>
      location.toLowerCase().includes(city.toLowerCase())
    );

    // Create new delivery charge
    const newDeliveryCharge = new DeliveryCharge({
      location,
      state,
      cityType: cityType || (isMajorCity ? 'major' : 'minor'),
      charge: parseFloat(charge)
    });

    await newDeliveryCharge.save();

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Delivery charge added successfully',
      deliveryCharge: newDeliveryCharge
    });
  } catch (error) {
    console.error('Error adding delivery charge:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to add delivery charge'
    });
  }
};

// Update a delivery charge
exports.updateDeliveryCharge = async (req, res) => {
  try {
    const { id } = req.params;
    const { location, state, charge, isActive, cityType } = req.body;

    // Validate input
    if (!location || !state || !charge) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if delivery charge exists
    const deliveryCharge = await DeliveryCharge.findById(id);
    if (!deliveryCharge) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Delivery charge not found'
      });
    }

    // Determine if it's a major city if cityType not provided
    if (!cityType) {
      const majorCities = ['Mumbai', 'Delhi', 'Bangalore', 'Kochi', 'Chennai', 'Hyderabad', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur'];
      const isMajorCity = majorCities.some(city =>
        location.toLowerCase().includes(city.toLowerCase())
      );
      deliveryCharge.cityType = isMajorCity ? 'major' : 'minor';
    } else {
      deliveryCharge.cityType = cityType;
    }

    // Update delivery charge
    deliveryCharge.location = location;
    deliveryCharge.state = state;
    deliveryCharge.charge = parseFloat(charge);
    deliveryCharge.isActive = isActive === 'true' || isActive === true;
    deliveryCharge.updatedAt = Date.now();

    await deliveryCharge.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Delivery charge updated successfully',
      deliveryCharge
    });
  } catch (error) {
    console.error('Error updating delivery charge:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to update delivery charge'
    });
  }
};

// Delete a delivery charge
exports.deleteDeliveryCharge = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if delivery charge exists
    const deliveryCharge = await DeliveryCharge.findById(id);
    if (!deliveryCharge) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Delivery charge not found'
      });
    }

    // Delete delivery charge
    await DeliveryCharge.findByIdAndDelete(id);

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Delivery charge deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting delivery charge:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to delete delivery charge'
    });
  }
};

// Get delivery charge by location
exports.getDeliveryChargeByLocation = async (location) => {
  try {
    if (!location) return null;

    // Try to find an exact match first
    let deliveryCharge = await DeliveryCharge.findOne({
      location: { $regex: new RegExp(`^${location}$`, 'i') },
      isActive: true
    });

    if (deliveryCharge) {
      return {
        charge: deliveryCharge.charge,
        cityType: deliveryCharge.cityType,
        cityName: deliveryCharge.location
      };
    }

    // Define city tiers with corresponding delivery charges
    const cityTiers = [
      {
        tier: 'tier1',
        cities: ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Pune', 'Surat'],
        charge: 40,
        description: 'Tier 1 - Major Metropolitan City'
      },
      {
        tier: 'tier2',
        cities: ['Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Visakhapatnam', 'Indore', 'Thane', 'Bhopal', 'Patna',
                'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad'],
        charge: 60,
        description: 'Tier 2 - Emerging Metropolitan City'
      },
      {
        tier: 'tier3',
        cities: ['Meerut', 'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Navi Mumbai',
                'Allahabad', 'Prayagraj', 'Ranchi', 'Jabalpur', 'Coimbatore', 'Vijayawada', 'Jodhpur', 'Madurai',
                'Raipur', 'Guwahati', 'Chandigarh', 'Thiruvananthapuram', 'Kochi', 'Bhubaneswar', 'Dehradun',
                'Mysuru', 'Mysore', 'Gurugram', 'Gurgaon'],
        charge: 80,
        description: 'Tier 3 - Other Key City'
      }
    ];

    // Check which tier the city belongs to
    for (const tier of cityTiers) {
      // First check for exact match (case-insensitive)
      const exactMatch = tier.cities.some(city =>
        location.toLowerCase() === city.toLowerCase()
      );

      if (exactMatch) {
        console.log(`Exact match found for ${location} in tier ${tier.tier}`);
        return {
          charge: tier.charge,
          cityType: tier.tier,
          cityName: location,
          description: tier.description
        };
      }

      // Then check for partial match (city name contained in location)
      const partialMatch = tier.cities.some(city => {
        // Check if city name is contained in location
        const cityInLocation = location.toLowerCase().includes(city.toLowerCase());
        // Also check if location is contained in city name (for cases like "Navi Mumbai" when location is just "Mumbai")
        const locationInCity = city.toLowerCase().includes(location.toLowerCase()) && location.length >= 4;
        return cityInLocation || locationInCity;
      });

      if (partialMatch) {
        console.log(`Partial match found for ${location} in tier ${tier.tier}`);
        return {
          charge: tier.charge,
          cityType: tier.tier,
          cityName: location,
          description: tier.description
        };
      }
    }

    // If no match found, return higher charge for smaller cities/towns
    return {
      charge: 100,
      cityType: 'tier4',
      cityName: location,
      description: 'Small Town/Village'
    };
  } catch (error) {
    console.error('Error fetching delivery charge by location:', error);
    return null;
  }
};

// Get delivery charge by state
exports.getDeliveryChargeByState = async (state) => {
  try {
    // Find all delivery charges for the state
    const deliveryCharges = await DeliveryCharge.find({ state, isActive: true });

    // If no charges found, return null
    if (!deliveryCharges || deliveryCharges.length === 0) {
      return null;
    }

    // Check if there are any major cities in this state
    const majorCityCharges = deliveryCharges.filter(charge => charge.cityType === 'major');
    const minorCityCharges = deliveryCharges.filter(charge => charge.cityType === 'minor');

    // If we have both types, calculate separate averages
    if (majorCityCharges.length > 0 && minorCityCharges.length > 0) {
      const majorTotalCharge = majorCityCharges.reduce((sum, charge) => sum + charge.charge, 0);
      const majorAvgCharge = majorTotalCharge / majorCityCharges.length;

      const minorTotalCharge = minorCityCharges.reduce((sum, charge) => sum + charge.charge, 0);
      const minorAvgCharge = minorTotalCharge / minorCityCharges.length;

      // Return the average of both types
      return (majorAvgCharge + minorAvgCharge) / 2;
    }

    // Otherwise, calculate average charge for all cities in the state
    const totalCharge = deliveryCharges.reduce((sum, charge) => sum + charge.charge, 0);
    return totalCharge / deliveryCharges.length;
  } catch (error) {
    console.error('Error fetching delivery charge by state:', error);
    return null;
  }
};

// Get default delivery charge based on city tier
exports.getDefaultDeliveryCharge = (cityTier = null) => {
  switch (cityTier) {
    case 'tier1':
      return {
        charge: 40,
        description: 'Tier 1 - Major Metropolitan City'
      };
    case 'tier2':
      return {
        charge: 60,
        description: 'Tier 2 - Emerging Metropolitan City'
      };
    case 'tier3':
      return {
        charge: 80,
        description: 'Tier 3 - Other Key City'
      };
    case 'tier4':
    default:
      return {
        charge: 100,
        description: 'Tier 4 - Small Town/Village'
      };
  }
};

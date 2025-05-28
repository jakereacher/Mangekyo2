/**
 * Delivery Charge Controller
 * Handles CRUD operations for delivery charges based on location
 */

const DeliveryCharge = require('../../models/deliveryChargeSchema');
const StatusCodes = require('../../utils/httpStatusCodes');

// Get all delivery charges (show tier-based charges with city management)
exports.getAllDeliveryCharges = async (req, res) => {
  try {
    console.log('Fetching delivery charges...'); // Debug log

    // Get tier-based delivery charges from database or use defaults
    let tierCharges = await DeliveryCharge.find({ cityType: { $in: ['tier1', 'tier2', 'tier3', 'tier4'] } }).sort({ cityType: 1 });

    console.log('Found tier charges:', tierCharges.length); // Debug log

    // If no tier charges exist, create defaults
    if (tierCharges.length === 0) {
      console.log('Creating default tier charges...'); // Debug log

      const defaultTierCharges = [
        {
          location: 'Tier 1 Cities',
          state: 'All States',
          cityType: 'tier1',
          charge: 40,
          isActive: true,
          description: 'Major Metropolitan Cities',
          cities: ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Pune', 'Surat']
        },
        {
          location: 'Tier 2 Cities',
          state: 'All States',
          cityType: 'tier2',
          charge: 60,
          isActive: true,
          description: 'Emerging Metropolitan Cities',
          cities: ['Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Visakhapatnam', 'Indore', 'Thane', 'Bhopal', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad']
        },
        {
          location: 'Tier 3 Cities',
          state: 'All States',
          cityType: 'tier3',
          charge: 80,
          isActive: true,
          description: 'Other Key Cities',
          cities: ['Meerut', 'Rajkot', 'Varanasi', 'Kochi', 'Chandigarh', 'Mysuru', 'Gurgaon', 'Noida', 'Coimbatore', 'Madurai', 'Jalandhar', 'Durgapur']
        },
        {
          location: 'Tier 4 Cities',
          state: 'All States',
          cityType: 'tier4',
          charge: 100,
          isActive: true,
          description: 'Small Towns & Villages',
          cities: ['All other cities, towns and villages not listed in above tiers']
        }
      ];

      try {
        // Create default tier charges in database
        tierCharges = await DeliveryCharge.insertMany(defaultTierCharges);
        console.log('Default tier charges created successfully'); // Debug log
      } catch (insertError) {
        console.error('Error creating default tier charges:', insertError);
        // If insertion fails, use the default data for display
        tierCharges = defaultTierCharges.map((charge, index) => ({
          ...charge,
          _id: `temp_${index}` // Temporary ID for display
        }));
      }
    }

    // Format for frontend
    const formattedTierCharges = tierCharges.map(charge => ({
      _id: charge._id,
      location: charge.location,
      state: charge.state,
      cityType: charge.cityType,
      charge: charge.charge,
      isActive: charge.isActive,
      description: charge.description,
      cities: Array.isArray(charge.cities) ? charge.cities : (charge.cities ? charge.cities.split(', ').map(city => city.trim()) : [])
    }));

    console.log('Formatted tier charges:', formattedTierCharges); // Debug log

    res.render('admin/admin-delivery-charges', {
      deliveryCharges: formattedTierCharges,
      activePage: 'delivery-charges'
    });
  } catch (error) {
    console.error('Error fetching delivery charges:', error);

    // Fallback: provide default data if database fails
    const fallbackTierCharges = [
      {
        _id: 'fallback_tier1',
        location: 'Tier 1 Cities',
        state: 'All States',
        cityType: 'tier1',
        charge: 40,
        isActive: true,
        description: 'Major Metropolitan Cities',
        cities: ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Pune', 'Surat']
      },
      {
        _id: 'fallback_tier2',
        location: 'Tier 2 Cities',
        state: 'All States',
        cityType: 'tier2',
        charge: 60,
        isActive: true,
        description: 'Emerging Metropolitan Cities',
        cities: ['Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Visakhapatnam', 'Indore', 'Thane', 'Bhopal', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad']
      },
      {
        _id: 'fallback_tier3',
        location: 'Tier 3 Cities',
        state: 'All States',
        cityType: 'tier3',
        charge: 80,
        isActive: true,
        description: 'Other Key Cities',
        cities: ['Meerut', 'Rajkot', 'Varanasi', 'Kochi', 'Chandigarh', 'Mysuru', 'Gurgaon', 'Noida', 'Coimbatore', 'Madurai', 'Jalandhar', 'Durgapur']
      },
      {
        _id: 'fallback_tier4',
        location: 'Tier 4 Cities',
        state: 'All States',
        cityType: 'tier4',
        charge: 100,
        isActive: true,
        description: 'Small Towns & Villages',
        cities: ['All other cities, towns and villages not listed in above tiers']
      }
    ];

    res.render('admin/admin-delivery-charges', {
      deliveryCharges: fallbackTierCharges,
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

// Update a delivery charge with city management and validations
exports.updateDeliveryCharge = async (req, res) => {
  try {
    const { id } = req.params;
    const { charge, isActive, cities } = req.body;

    console.log('Update request received:', { id, charge, isActive, cities }); // Debug log

    // Validate charge amount
    if (!charge || isNaN(charge) || parseFloat(charge) <= 0) {
      console.log('Invalid charge amount:', charge); // Debug log
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Please enter a valid charge amount (numbers only, greater than 0)'
      });
    }

    // Validate cities if provided
    if (cities && Array.isArray(cities)) {
      for (const city of cities) {
        // Check if city name contains only letters, spaces, and common punctuation
        if (!/^[a-zA-Z\s\-'\.]+$/.test(city.trim())) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: `Invalid city name: "${city}". City names should contain only letters, spaces, hyphens, and apostrophes.`
          });
        }
      }
    }

    // Find the delivery charge to update
    const deliveryCharge = await DeliveryCharge.findById(id);
    if (!deliveryCharge) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Delivery charge not found'
      });
    }

    // Get all other tier charges to validate uniqueness
    const otherTierCharges = await DeliveryCharge.find({
      _id: { $ne: id },
      cityType: { $in: ['tier1', 'tier2', 'tier3', 'tier4'] }
    });

    // Validate that charge amounts are different across tiers
    const newCharge = parseFloat(charge);
    for (const otherCharge of otherTierCharges) {
      if (Math.abs(otherCharge.charge - newCharge) < 0.01) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: `Charge amount ₹${newCharge} is already used by another tier. Each tier must have a different charge amount.`
        });
      }
    }

    // Validate city uniqueness across tiers
    if (cities && Array.isArray(cities)) {
      const cleanCities = cities.map(city => city.trim().toLowerCase()).filter(city => city.length > 0);

      for (const otherCharge of otherTierCharges) {
        const otherCities = Array.isArray(otherCharge.cities) ? otherCharge.cities : [];

        for (const city of cleanCities) {
          const cityExists = otherCities.some(otherCity =>
            otherCity.toLowerCase().trim() === city.toLowerCase().trim()
          );

          if (cityExists) {
            return res.status(StatusCodes.BAD_REQUEST).json({
              success: false,
              message: `City "${city}" is already assigned to another tier. Each city can only belong to one tier.`
            });
          }
        }
      }

      // Update cities (store in lowercase)
      deliveryCharge.cities = cleanCities;
    }

    // Update delivery charge
    deliveryCharge.charge = newCharge;
    deliveryCharge.isActive = isActive === 'true' || isActive === true;
    deliveryCharge.updatedAt = Date.now();

    await deliveryCharge.save();

    res.status(StatusCodes.OK).json({
      success: true,
      message: `${deliveryCharge.location} updated successfully`,
      deliveryCharge: {
        _id: deliveryCharge._id,
        location: deliveryCharge.location,
        charge: deliveryCharge.charge,
        isActive: deliveryCharge.isActive,
        cities: deliveryCharge.cities
      }
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

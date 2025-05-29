/**
 * Delivery Charge Controller
 */

const DeliveryCharge = require('../../models/deliveryChargeSchema');
const StatusCodes = require('../../utils/httpStatusCodes');

//=================================================================================================
// Get All Delivery Charges
//=================================================================================================
// This function gets all the delivery charges.
// It displays the delivery charges in the delivery charges page.
//=================================================================================================

exports.getAllDeliveryCharges = async (req, res) => {
  try {
    let tierCharges = await DeliveryCharge.find({ cityType: { $in: ['tier1', 'tier2', 'tier3', 'tier4'] } }).sort({ cityType: 1 });

    if (tierCharges.length === 0) {

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

        tierCharges = await DeliveryCharge.insertMany(defaultTierCharges);
        console.log('Default tier charges created successfully'); // Debug log
      } catch (insertError) {
        console.error('Error creating default tier charges:', insertError);

        tierCharges = defaultTierCharges.map((charge, index) => ({
          ...charge,
          _id: `temp_${index}` // Temporary ID for display
        }));
      }
    }

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

//=================================================================================================
// Add Delivery Charge
//=================================================================================================
// This function adds a new delivery charge to the database.
// It validates the delivery charge data and creates a new delivery charge object.
//=================================================================================================

exports.addDeliveryCharge = async (req, res) => {
  try {
    const { location, state, charge, cityType } = req.body;

    if (!location || !state || !charge) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'All fields are required'
      });
    }

    const existingCharge = await DeliveryCharge.findOne({ location });
    if (existingCharge) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: 'Delivery charge for this location already exists'
      });
    }

    const majorCities = ['Mumbai', 'Delhi', 'Bangalore', 'Kochi', 'Chennai', 'Hyderabad', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur'];
    const isMajorCity = majorCities.some(city =>
      location.toLowerCase().includes(city.toLowerCase())
    );

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

//=================================================================================================
// Update Delivery Charge
//=================================================================================================
// This function updates the delivery charge.
// It updates the delivery charge in the database.
//=================================================================================================

exports.updateDeliveryCharge = async (req, res) => {
  try {
    const { id } = req.params;
    const { charge, isActive, cities } = req.body;

    console.log('Update request received:', { id, charge, isActive, cities }); // Debug log

    if (!charge || isNaN(charge) || parseFloat(charge) <= 0) {
      console.log('Invalid charge amount:', charge); // Debug log
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: 'Please enter a valid charge amount (numbers only, greater than 0)'
      });
    }

    if (cities && Array.isArray(cities)) {
      for (const city of cities) {

        if (!/^[a-zA-Z\s\-'\.]+$/.test(city.trim())) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            message: `Invalid city name: "${city}". City names should contain only letters, spaces, hyphens, and apostrophes.`
          });
        }
      }
    }

    const deliveryCharge = await DeliveryCharge.findById(id);
    if (!deliveryCharge) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Delivery charge not found'
      });
    }

    const otherTierCharges = await DeliveryCharge.find({
      _id: { $ne: id },
      cityType: { $in: ['tier1', 'tier2', 'tier3', 'tier4'] }
    });

    const newCharge = parseFloat(charge);
    for (const otherCharge of otherTierCharges) {
      if (Math.abs(otherCharge.charge - newCharge) < 0.01) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          message: `Charge amount ₹${newCharge} is already used by another tier. Each tier must have a different charge amount.`
        });
      }
    }

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

      deliveryCharge.cities = cleanCities;
    }

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

//=================================================================================================
// Delete Delivery Charge
//=================================================================================================
// This function deletes the delivery charge.
// It deletes the delivery charge from the database.
//=================================================================================================
exports.deleteDeliveryCharge = async (req, res) => {
  try {
    const { id } = req.params;

    const deliveryCharge = await DeliveryCharge.findById(id);
    if (!deliveryCharge) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Delivery charge not found'
      });
    }

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

//=================================================================================================
// Get Delivery Charge By Location
//=================================================================================================
// This function gets the delivery charge by location.
// It gets the delivery charge from the database.
//=================================================================================================

exports.getDeliveryChargeByLocation = async (location) => {
  try {
    if (!location) return null;

    // First, try to find exact location match
    let deliveryCharge = await DeliveryCharge.findOne({
      location: { $regex: new RegExp(`^${location}$`, 'i') },
      isActive: true
    });

    if (deliveryCharge) {
      return {
        charge: deliveryCharge.charge,
        cityType: deliveryCharge.cityType,
        cityName: deliveryCharge.location,
        description: deliveryCharge.description
      };
    }

    // Get tier charges from database
    const tierCharges = await DeliveryCharge.find({
      cityType: { $in: ['tier1', 'tier2', 'tier3', 'tier4'] },
      isActive: true
    }).sort({ cityType: 1 });

    // Create a map of tier charges from database
    const tierChargeMap = {};
    tierCharges.forEach(charge => {
      tierChargeMap[charge.cityType] = {
        charge: charge.charge,
        description: charge.description,
        cities: charge.cities || []
      };
    });

    // Define city tiers with their cities
    const cityTiers = [
      {
        tier: 'tier1',
        cities: ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Pune', 'Surat'],
        fallbackCharge: 40,
        fallbackDescription: 'Tier 1 - Major Metropolitan City'
      },
      {
        tier: 'tier2',
        cities: ['Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Visakhapatnam', 'Indore', 'Thane', 'Bhopal', 'Patna',
                'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad'],
        fallbackCharge: 60,
        fallbackDescription: 'Tier 2 - Emerging Metropolitan City'
      },
      {
        tier: 'tier3',
        cities: ['Meerut', 'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Navi Mumbai',
                'Allahabad', 'Prayagraj', 'Ranchi', 'Jabalpur', 'Coimbatore', 'Vijayawada', 'Jodhpur', 'Madurai',
                'Raipur', 'Guwahati', 'Chandigarh', 'Thiruvananthapuram', 'Kochi', 'Bhubaneswar', 'Dehradun',
                'Mysuru', 'Mysore', 'Gurugram', 'Gurgaon'],
        fallbackCharge: 80,
        fallbackDescription: 'Tier 3 - Other Key City'
      }
    ];

    // Check if location matches any tier cities
    for (const tier of cityTiers) {
      // Check database cities first
      const dbTierData = tierChargeMap[tier.tier];
      if (dbTierData && dbTierData.cities.length > 0) {
        const dbCityMatch = dbTierData.cities.some(city =>
          location.toLowerCase() === city.toLowerCase() ||
          location.toLowerCase().includes(city.toLowerCase()) ||
          city.toLowerCase().includes(location.toLowerCase())
        );

        if (dbCityMatch) {
          return {
            charge: dbTierData.charge,
            cityType: tier.tier,
            cityName: location,
            description: dbTierData.description
          };
        }
      }

      // Check predefined cities with database charge
      const exactMatch = tier.cities.some(city =>
        location.toLowerCase() === city.toLowerCase()
      );

      if (exactMatch) {
        const charge = dbTierData ? dbTierData.charge : tier.fallbackCharge;
        const description = dbTierData ? dbTierData.description : tier.fallbackDescription;

        return {
          charge: charge,
          cityType: tier.tier,
          cityName: location,
          description: description
        };
      }

      const partialMatch = tier.cities.some(city => {
        const cityInLocation = location.toLowerCase().includes(city.toLowerCase());
        const locationInCity = city.toLowerCase().includes(location.toLowerCase()) && location.length >= 4;
        return cityInLocation || locationInCity;
      });

      if (partialMatch) {
        const charge = dbTierData ? dbTierData.charge : tier.fallbackCharge;
        const description = dbTierData ? dbTierData.description : tier.fallbackDescription;

        return {
          charge: charge,
          cityType: tier.tier,
          cityName: location,
          description: description
        };
      }
    }

    // Default to tier4 charge from database or fallback
    const tier4Data = tierChargeMap['tier4'];
    const defaultCharge = tier4Data ? tier4Data.charge : 100;
    const defaultDescription = tier4Data ? tier4Data.description : 'Small Town/Village';

    return {
      charge: defaultCharge,
      cityType: 'tier4',
      cityName: location,
      description: defaultDescription
    };
  } catch (error) {
    console.error('Error fetching delivery charge by location:', error);
    return null;
  }
};

//=================================================================================================
// Get Delivery Charge By State
//=================================================================================================
// This function gets the delivery charge by state.
// It gets the delivery charge from the database.
//=================================================================================================

exports.getDeliveryChargeByState = async (state) => {
  try {

    const deliveryCharges = await DeliveryCharge.find({ state, isActive: true });

    if (!deliveryCharges || deliveryCharges.length === 0) {
      return null;
    }

    const majorCityCharges = deliveryCharges.filter(charge => charge.cityType === 'major');
    const minorCityCharges = deliveryCharges.filter(charge => charge.cityType === 'minor');

    if (majorCityCharges.length > 0 && minorCityCharges.length > 0) {
      const majorTotalCharge = majorCityCharges.reduce((sum, charge) => sum + charge.charge, 0);
      const majorAvgCharge = majorTotalCharge / majorCityCharges.length;

      const minorTotalCharge = minorCityCharges.reduce((sum, charge) => sum + charge.charge, 0);
      const minorAvgCharge = minorTotalCharge / minorCityCharges.length;

      return (majorAvgCharge + minorAvgCharge) / 2;
    }

    const totalCharge = deliveryCharges.reduce((sum, charge) => sum + charge.charge, 0);
    return totalCharge / deliveryCharges.length;
  } catch (error) {
    console.error('Error fetching delivery charge by state:', error);
    return null;
  }
};

//=================================================================================================
// Get Default Delivery Charge
//=================================================================================================
// This function gets the default delivery charge.
// It gets the default delivery charge from the database.
//=================================================================================================

exports.getDefaultDeliveryCharge = async (cityTier = null) => {
  try {
    // If a specific tier is requested, try to get it from database first
    if (cityTier) {
      const tierCharge = await DeliveryCharge.findOne({
        cityType: cityTier,
        isActive: true
      });

      if (tierCharge) {
        return {
          charge: tierCharge.charge,
          description: tierCharge.description
        };
      }
    }

    // Get tier4 (default) from database
    const defaultTierCharge = await DeliveryCharge.findOne({
      cityType: 'tier4',
      isActive: true
    });

    if (defaultTierCharge) {
      return {
        charge: defaultTierCharge.charge,
        description: defaultTierCharge.description
      };
    }

    // Fallback to hardcoded values if database doesn't have the data
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
  } catch (error) {
    console.error('Error fetching default delivery charge:', error);
    // Return fallback values in case of error
    return {
      charge: 100,
      description: 'Standard Delivery'
    };
  }
};

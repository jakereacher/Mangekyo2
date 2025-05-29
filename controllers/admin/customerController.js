/**
 * CustomerController
 */

const User=require("../../models/userSchema");

//=================================================================================================
// Customer Info
//=================================================================================================
// This function gets the customer information with pagination.
// It displays the customer information in the customer page.
//=================================================================================================
const customerInfo = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const searchQuery = {
      isAdmin: false
    };

    if (search) {
      searchQuery.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } }
      ];
    }

    const userData = await User.find(searchQuery)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const totalItems = await User.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalItems / limit);

    const searchParams = search ? `&search=${encodeURIComponent(search)}` : '';
    const searchParamsWithoutLimit = search ? `&search=${encodeURIComponent(search)}` : '';

    res.render("customers", {
      data: userData,
      totalPages: totalPages,
      currentPage: page,
      totalItems: totalItems,
      limit: limit,
      search: search,
      searchParams: searchParams + (limit !== 10 ? `&limit=${limit}` : ''),
      searchParamsWithoutLimit: searchParamsWithoutLimit
    });
  } catch (error) {
    console.error("Error in customerInfo:", error);
    res.redirect("/admin/pageerror");
  }
};

//=================================================================================================
// Customer Blocked
//=================================================================================================
// This function blocks a customer.
// It updates the customer's isBlocked field to true.
//=================================================================================================
const customerBlocked=async (req,res) => {
  try {
    let id=req.query.id;
    await User.updateOne({_id:id},{$set:{isBlocked:true}});

    if(req.session.user===id){
      req.session.destroy()
    }
    res.redirect("/admin/users")
  } catch (error) {
    res.redirect("/admin/pageerror");
  }
}

//=================================================================================================
// Customer Unblocked
//=================================================================================================
// This function unblocks a customer.
// It updates the customer's isBlocked field to false.
//=================================================================================================
const customerunBlocked= async (req,res) => {
  try {
    let id= req.query.id;
    await User.updateOne({_id:id},{$set:{isBlocked:false}});
    res.redirect("/admin/users")
  } catch (error) {
    res.redirect("/admin/pageerror");
  }
}

//=================================================================================================
// Module Exports
//=================================================================================================
// This exports the customer controller functions.
// It exports the customer controller functions to be used in the admin routes.
//=================================================================================================
module.exports = {
  customerInfo,
  customerBlocked,
  customerunBlocked,
};

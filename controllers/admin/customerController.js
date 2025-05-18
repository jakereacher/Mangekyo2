const User=require("../../models/userSchema");

const customerInfo = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Build search query
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

    // Fetch users with pagination
    const userData = await User.find(searchQuery)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    // Count total users for pagination
    const totalItems = await User.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalItems / limit);

    // Build search params for pagination links
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

const customerunBlocked= async (req,res) => {
  try {
    let id= req.query.id;
    await User.updateOne({_id:id},{$set:{isBlocked:false}});
    res.redirect("/admin/users")
  } catch (error) {
    res.redirect("/admin/pageerror");
  }
}














module.exports = {
  customerInfo,
  customerBlocked,
  customerunBlocked,
};
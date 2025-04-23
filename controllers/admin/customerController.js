const User=require("../../models/userSchema");

const customerInfo = async (req, res) => {
  try {
    let search = "";
    if (req.query.search) {
      search = req.query.search;
    }
    let page = 1;
    if (req.query.page) {
      page = req.query.page;
    }
    const limit = 3;

    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*" } },
        { email: { $regex: ".*" + search + ".*" } },
      ],
    })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*" } },
        { email: { $regex: ".*" + search + ".*" } },
      ],
    }).countDocuments();

    // Fix: Pass data, totalPages, and currentPage to the template
    res.render("customers", {
      data: userData,           // Pass userData as 'data'
      totalPages: Math.ceil(count / limit), // Calculate total pages
      currentPage: parseInt(page), // Convert page to integer
    });
  } catch (error) {
    // Empty catch block in original code; added basic error handling
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
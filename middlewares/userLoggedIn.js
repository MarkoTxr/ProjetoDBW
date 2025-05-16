const userLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    req.flash("error", "Faça login para acessar esta página!");
    res.redirect("/login");
};

export default userLoggedIn;

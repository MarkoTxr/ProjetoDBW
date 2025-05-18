const userLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    req.flash("error", "Faça login para acessar esta página!");
    res.redirect("/login");
};

export const ensureAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    // Disponibiliza dados do usuário para o WebSocket
    res.locals.user = req.user;
    return next();
  }
  res.redirect('/login');
};

export default userLoggedIn;

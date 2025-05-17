import passport from "passport";
import User from "../models/user.js";

const loginGet = async (req, res) => {
  res.render("login");
};

const registerGet = async (req, res) => {
  res.render("register");
};

const registerPost = async (req, res) => {
  const { email, nick, nome, password, confirmPassword } = req.body;

  // Validação de senha
  if (password !== confirmPassword) {
    req.flash("error", "As senhas não coincidem!");
    return res.redirect("/register");
  }

  try {
    const user = new User({ email, nick, nome });
    await User.register(user, password); // passport-local-mongoose
    res.redirect("/");
  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/register");
  }
};

const loginPostRedirect = (req, res, next) => {
  passport.authenticate("local", {
    successRedirect: "/profile",
    failureRedirect: "/login",
    failureFlash: true,
  })(req, res, next);
};

const logout = (req, res, next) => {
  req.logout(function (err) {
    if (err) return next(err);

    // Destrói a sessão no MongoDB
    req.session.destroy((err) => {
      if (err) return next(err);

      // Limpa o cookie da sessão
      res.clearCookie('connect.sid'); 
      res.redirect("/login");
    });
  });
};

export { 
  loginGet, 
  registerGet, 
  loginPostRedirect, 
  registerPost, 
  logout 
};

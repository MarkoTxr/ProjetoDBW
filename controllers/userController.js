import passport from "passport";
import userLoggedIn from "../middlewares/userLoggedIn.js";
import User from "../models/user.js";

const loginGet = async (req, res) => {
  res.render("login");
};

const registerGet = async (req, res) => {
  res.render("register");
};

const profileGet = async (req, res) => {
  const user = req.user;
  console.log(user);
  res.render("profile", { user }); // Passa o user para a view
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
    successRedirect: "/",
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


const profilePost = async (req, res) => {
  const { email, nick, nome } = req.body;
  const user = req.user;

  try {
    user.email = email;
    user.nick = nick;
    user.nome = nome;
    await user.save();
    res.redirect("/profile");
  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/profile");
  }
};







export { registerGet, loginGet, profileGet, loginPostRedirect, logout, registerPost };

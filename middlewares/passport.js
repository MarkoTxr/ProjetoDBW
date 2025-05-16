import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import User from "../models/user.js";

// Estratégia Local
passport.use(
  new LocalStrategy(
    {
      usernameField: "email", // Campo do formulário de login
      passwordField: "password",
    },
    User.authenticate() // Método do passport-local-mongoose
  )
);

// Serialização/Desserialização
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

export default passport;
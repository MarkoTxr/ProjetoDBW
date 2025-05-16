// routes/homeRoutes.js
import express from "express";
const router = express.Router();


router.get("/", (req, res) => {
  res.render("home"); // Renderiza login.ejs
});

export default router;
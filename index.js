import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import methodOverride from "method-override";
import flash from "connect-flash";
import passport from "passport";
import passportLocal from "passport-local";
import localStrategy from "passport-local";
import session from "express-session";
import MongoStore from "connect-mongo";

import "./middlewares/passport.js";
import sessionRoutes from "./routes/sessaoRoutes.js";
import homeRoutes from "./routes/homeRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import connectDB from "./config/database.js";
import apiRoute from "./routes/apiRoutes.js";
// Conexão à base de dados MongoDB
connectDB();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configuração de views
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(flash());

// Configuração da sessão com armazenamento em MongoDB
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      dbName: "dbw_brainstorm",
      collectionName: "user-sessions", // Nome da coleção onde as sessões serão guardadas
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // Sessão válida por 24 horas
      httpOnly: true,              
    },
  })
);

// Inicialização do Passport (autenticação)
app.use(passport.initialize());
app.use(passport.session());

// Adicionar no arquivo principal (index.js)
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).render('error', {
    titulo: 'Erro Interno',
    mensagem: 'Ocorreu um erro inesperado'
  });
});


// Torna dados úteis disponíveis globalmente nas views EJS
app.use((req, res, next) => {
  res.locals.user = req.user;              // Utilizador autenticado (se existir)
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

// Rotas principais da aplicação
app.use("/", homeRoutes);
app.use("/", userRoutes);
app.use("/", authRoutes);
app.use("/", sessionRoutes);
app.use("/api", apiRoute);


import axios from 'axios';

const LM_STUDIO_URL = "http://89.109.76.139:1234/v1/chat/completions";

async function testSimpleHello() {
  try {
    const response = await axios.post(LM_STUDIO_URL, {
      messages: [
        { role: "user", content: "Qual a capital de portugal?" }
      ],
      model: "llama-3.2-1b-claude-3.7-sonnet-reasoning-distilled",
      stream: false // Desativa streaming para resposta simples
    });

    console.log("Resposta completa:", response.data);
    console.log("\nResposta do modelo:", response.data.choices[0].message.content);

  } catch (error) {
    console.error("Erro:", error.response?.data || error.message);
  }
}

testSimpleHello();

// Início do servidor
const PORTA = 3000;
app.listen(PORTA, () => {
  console.log(`Servidor ativo em http://localhost:${PORTA}`);
});

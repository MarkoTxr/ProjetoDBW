/**
 * @file Servidor principal da aplicação MVC com suporte a Socket.IO,
 *       autenticação com Passport, sessões com MongoDB, e renderização com EJS.
 */

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

connectDB();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

import { inicializarWebSocket } from "./controllers/websocketController.js";
const io = inicializarWebSocket(server);

app.set('io', io);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use('/socket.io', express.static(path.join(__dirname, 'node_modules/socket.io/client-dist')));

import fs from 'fs';
const socketIoClientPath = path.join(__dirname, 'node_modules/socket.io/client-dist/socket.io.js');
const publicJsPath = path.join(__dirname, 'public/js');

if (!fs.existsSync(publicJsPath)) {
  fs.mkdirSync(publicJsPath, { recursive: true });
}

try {
  if (fs.existsSync(socketIoClientPath)) {
    fs.copyFileSync(socketIoClientPath, path.join(publicJsPath, 'socket.io.js'));
    console.log('Cliente Socket.IO copiado para public/js/socket.io.js');
  } else {
    console.error('Arquivo socket.io.js não encontrado em node_modules. Verifique se socket.io está instalado.');
  }
} catch (err) {
  console.error('Erro ao copiar cliente Socket.IO:', err);
}

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(flash());

/**
 * @description Configuração da sessão com armazenamento no MongoDB.
 */
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      dbName: "dbw_brainstorm",
      collectionName: "user-sessions",
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: true,
    },
  })
);

/**
 * @description Inicialização do sistema de autenticação com Passport.
 */
app.use(passport.initialize());
app.use(passport.session());

/**
 * @description Middleware para tratamento global de erros não tratados.
 */
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).render('error', {
    titulo: 'Erro Interno',
    mensagem: 'Ocorreu um erro inesperado'
  });
});

/**
 * @description Middleware para tornar dados úteis disponíveis globalmente nas views.
 */
app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

/**
 * @description Definição das rotas principais da aplicação.
 */
app.use("/", homeRoutes);
app.use("/", userRoutes);
app.use("/", authRoutes);
app.use("/", sessionRoutes);
app.use("/api", apiRoute);

/**
 * @description Inicialização do servidor HTTP com Socket.IO.
 */
const PORTA = 3000;
server.listen(PORTA, () => {
  console.log(`Servidor ativo em http://localhost:${PORTA}`);
  console.log(`Socket.IO inicializado e conectado ao servidor HTTP`);
  console.log(`Configuração CORS: Permitindo todas as origens para testes`);
});

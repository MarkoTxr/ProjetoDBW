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

// Criar servidor HTTP explicitamente para permitir integração com Socket.IO
const server = http.createServer(app);

// Inicializar Socket.IO diretamente (sem usar o controller por enquanto)
import { inicializarWebSocket } from "./controllers/websocketController.js";
const io = inicializarWebSocket(server);


// Disponibilizar a instância do io para os controllers
app.set('io', io);

// Configuração de views
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Servir o cliente socket.io diretamente do diretório public
app.use('/socket.io', express.static(path.join(__dirname, 'node_modules/socket.io/client-dist')));

// Copiar o arquivo socket.io.js para o diretório public/js para garantir acesso
import fs from 'fs';
const socketIoClientPath = path.join(__dirname, 'node_modules/socket.io/client-dist/socket.io.js');
const publicJsPath = path.join(__dirname, 'public/js');

// Criar diretório js se não existir
if (!fs.existsSync(publicJsPath)) {
  fs.mkdirSync(publicJsPath, { recursive: true });
}

// Copiar o arquivo socket.io.js
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
/*
import axios from 'axios';

const LM_STUDIO_URL = "http://89.109.76.139:1234/v1/chat/completions";

async function generateBrainmasterSolution(tema, ideias) {
  try {
    const response = await axios.post(LM_STUDIO_URL, {
      messages: [
        {
          role: "system",
          content: `Sua tarefa é combinar APENAS as ideias fornecidas em uma solução coerente. Regras estritas:
            
            1. USE EXCLUSIVAMENTE as ideias listadas pelo utilizador
            2. NÃO adicione novos elementos ou suposições
            3. Combine as ideias de forma lógica
            4. Formato obrigatório:
               ### Solução Integrada ###
               [Título]
               - [Ideia 1 integrada e adaptada]
               - [Ideia 2 integrada e adaptada]
               [...]`
        },
        {
          role: "user",
          content: `Tema: "${tema}"
          
          Ideias para integrar:
          ${ideias.map((ideia, index) => `${index + 1}. ${ideia.texto}`).join('\n') || "Nenhuma ideia submetida"}
          
          Forneça apenas a solução prática final.`
        }
      ],
      model: "llama-3.2-1b-claude-3.7-sonnet-reasoning-distilled",
      temperature: 0.5,
      max_tokens: 1500,
      stream: false
    });

    // Processamento para remover qualquer vestígio de raciocínio
    const rawResponse = response.data.choices[0].message.content;
    const cleanSolution = rawResponse
      .split('</think>').pop() // Remove tudo antes do fechamento do think
      .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove qualquer think remanescente
      .replace(/^[#]+.*?(?=### Solução Integrada ###)/ims, '') // Remove cabeçalhos anteriores
      .trim();

    return cleanSolution || "Solução não gerada";

  } catch (error) {
    console.error("Erro na síntese:", error.response?.data || error.message);
    throw error;
  }
}

// Exemplo de uso:
const temaExemplo = "Aumentar Produtividade Agrícola em Zonas Áridas";
const ideiasExemplo = [
  { texto: "Utilizar um sistema futuristico de fertilizacao" }

];
const solucao = await generateBrainmasterSolution(temaExemplo, ideiasExemplo);

console.log("\nProposta Final:\n", solucao);

*/

// Início do servidor (usando o servidor HTTP criado, não o app diretamente)
const PORTA = 3000;
server.listen(PORTA, () => {
  console.log(`Servidor ativo em http://localhost:${PORTA}`);
  console.log(`Socket.IO inicializado e conectado ao servidor HTTP`);
  console.log(`Configuração CORS: Permitindo todas as origens para testes`);
});

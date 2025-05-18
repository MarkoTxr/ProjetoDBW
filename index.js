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

// Configurar eventos básicos do Socket.IO
io.on('connection', (socket) => {
  console.log('Novo cliente conectado:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
  
  // Evento de teste
  socket.on('ping', (data) => {
    console.log('Ping recebido de', socket.id, 'com dados:', data);
    socket.emit('pong', { message: 'Pong do servidor!', timestamp: new Date().toISOString() });
  });
  
  // Entrar numa sala de sessão
  socket.on("entrarSessao", async ({ sessaoId }) => {
    console.log(`Cliente ${socket.id} tentando entrar na sessão ${sessaoId}`);
    try {
      // Entrar na sala da sessão
      socket.join(`sessao:${sessaoId}`);
      console.log(`Cliente ${socket.id} entrou na sala sessao:${sessaoId}`);
      
      // Notificar o cliente que entrou com sucesso
      socket.emit("entradaConfirmada", { 
        sessaoId,
        message: "Entrada na sessão confirmada" 
      });
      
      // Buscar dados atualizados da sessão e enviar para todos na sala
      try {
        const Sessao = await import('./models/sessao.js').then(m => m.default);
        const sessao = await Sessao.findById(sessaoId)
          .populate("host", "nome nick imagemPerfil")
          .populate("participantes", "nome nick imagemPerfil");
          
        if (sessao) {
          // Emitir evento de atualização para todos na sala
          io.to(`sessao:${sessaoId}`).emit("atualizarParticipantes", {
            participantes: sessao.participantes.map(p => ({
              _id: p._id,
              nome: p.nome,
              nick: p.nick,
              imagemPerfil: p.imagemPerfil
            }))
          });
          console.log(`Evento 'atualizarParticipantes' emitido para a sala sessao:${sessaoId}`);
        }
      } catch (err) {
        console.error("Erro ao buscar dados da sessão:", err);
      }
    } catch (err) {
      console.error("Erro ao entrar na sessão:", err);
      socket.emit("erro", { mensagem: "Erro ao entrar na sessão" });
    }
  });
  
  // Sair de uma sala de sessão
  socket.on("sairSessao", async ({ sessaoId, userId }) => {
    console.log(`Cliente ${socket.id} tentando sair da sessão ${sessaoId}`);
    try {
      // Sair da sala da sessão
      socket.leave(`sessao:${sessaoId}`);
      console.log(`Cliente ${socket.id} saiu da sala sessao:${sessaoId}`);
      
      // Se userId fornecido, remover da lista de participantes no banco de dados
      if (userId) {
        try {
          const Sessao = await import('./models/sessao.js').then(m => m.default);
          const sessao = await Sessao.findById(sessaoId);
          
          if (sessao && !sessao.host.equals(userId)) { // Não remover o host
            // Remover participante da sessão
            sessao.participantes = sessao.participantes.filter(p => !p.equals(userId));
            await sessao.save();
            
            // Buscar dados atualizados e enviar para todos
            const sessaoAtualizada = await Sessao.findById(sessaoId)
              .populate("host", "nome nick imagemPerfil")
              .populate("participantes", "nome nick imagemPerfil");
              
            if (sessaoAtualizada) {
              io.to(`sessao:${sessaoId}`).emit("atualizarParticipantes", {
                participantes: sessaoAtualizada.participantes
              });
              console.log(`Evento 'atualizarParticipantes' emitido após saída para a sala sessao:${sessaoId}`);
            }
          }
        } catch (err) {
          console.error("Erro ao remover participante da sessão:", err);
        }
      }
      
      // Notificar o cliente que saiu com sucesso
      socket.emit("saidaConfirmada", { 
        sessaoId,
        message: "Saída da sessão confirmada" 
      });
    } catch (err) {
      console.error("Erro ao sair da sessão:", err);
      socket.emit("erro", { mensagem: "Erro ao sair da sessão" });
    }
  });
  
  // Eventos de controle da sessão
  socket.on("iniciarSessao", async ({ sessaoId }) => {
    console.log(`Cliente ${socket.id} solicitou iniciar a sessão ${sessaoId}`);
    try {
      const Sessao = await import('./models/sessao.js').then(m => m.default);
      const sessao = await Sessao.findById(sessaoId);
      
      if (sessao) {
        sessao.status = "ativa";
        await sessao.save();
        
        io.to(`sessao:${sessaoId}`).emit("sessaoIniciada", {
          nivelAtual: 1,
          tempoRestante: sessao.configuracaoNiveis[0]?.segundos || 60,
          status: 'ativa'
        });
        console.log(`Evento 'sessaoIniciada' emitido para a sala sessao:${sessaoId}`);
      }
    } catch (err) {
      console.error("Erro ao iniciar sessão via socket:", err);
      socket.emit("erro", { mensagem: "Erro ao iniciar sessão" });
    }
  });
  
  socket.on("pausarSessao", async ({ sessaoId }) => {
    console.log(`Cliente ${socket.id} solicitou pausar a sessão ${sessaoId}`);
    try {
      const Sessao = await import('./models/sessao.js').then(m => m.default);
      const sessao = await Sessao.findById(sessaoId);
      
      if (sessao) {
        sessao.status = "pausada";
        await sessao.save();
        
        io.to(`sessao:${sessaoId}`).emit("sessaoPausada", {
          mensagem: "A sessão foi pausada pelo host",
          status: 'pausada'
        });
        console.log(`Evento 'sessaoPausada' emitido para a sala sessao:${sessaoId}`);
      }
    } catch (err) {
      console.error("Erro ao pausar sessão via socket:", err);
      socket.emit("erro", { mensagem: "Erro ao pausar sessão" });
    }
  });
  
  socket.on("concluirSessao", async ({ sessaoId }) => {
    console.log(`Cliente ${socket.id} solicitou concluir a sessão ${sessaoId}`);
    try {
      const Sessao = await import('./models/sessao.js').then(m => m.default);
      const sessao = await Sessao.findById(sessaoId);
      
      if (sessao) {
        sessao.status = "concluida";
        await sessao.save();
        
        io.to(`sessao:${sessaoId}`).emit("sessaoConcluida", {
          mensagem: "A sessão foi concluída pelo host",
          status: 'concluida'
        });
        console.log(`Evento 'sessaoConcluida' emitido para a sala sessao:${sessaoId}`);
      }
    } catch (err) {
      console.error("Erro ao concluir sessão via socket:", err);
      socket.emit("erro", { mensagem: "Erro ao concluir sessão" });
    }
  });
});

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

// Início do servidor (usando o servidor HTTP criado, não o app diretamente)
const PORTA = 3000;
server.listen(PORTA, () => {
  console.log(`Servidor ativo em http://localhost:${PORTA}`);
  console.log(`Socket.IO inicializado e conectado ao servidor HTTP`);
  console.log(`Configuração CORS: Permitindo todas as origens para testes`);
});

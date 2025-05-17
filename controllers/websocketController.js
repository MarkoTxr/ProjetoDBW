import { Server } from "socket.io";
import Sessao from "../models/sessao.js";
import User from "../models/user.js";

/**
 * Controller para WebSockets
 * Gerencia a comunicação em tempo real para as sessões de brainstorming
 */

// Armazenamento em memória para dados da sessão
const sessoesDados = new Map();

// Inicializa o WebSocket Server
const inicializarWebSocket = (server) => {
  const io = new Server(server);
  
  // Middleware para autenticação
  io.use(async (socket, next) => {
    const userId = socket.handshake.auth.userId;
    if (!userId) {
      return next(new Error("Autenticação necessária"));
    }
    
    try {
      const user = await User.findById(userId);
      if (!user) {
        return next(new Error("Utilizador não encontrado"));
      }
      
      socket.user = {
        _id: user._id,
        nome: user.nome,
        nick: user.nick,
        imagemPerfil: user.imagemPerfil
      };
      
      next();
    } catch (err) {
      next(new Error("Erro de autenticação"));
    }
  });
  
  // Conexão estabelecida
  io.on("connection", (socket) => {
    console.log(`Utilizador conectado: ${socket.user.nick || socket.user.nome}`);
    
    // Entrar numa sala de sessão
    socket.on("entrarSessao", async ({ sessaoId }) => {
      try {
        // Verificar se a sessão existe
        const sessao = await Sessao.findById(sessaoId)
          .populate("host", "nome nick imagemPerfil")
          .populate("participantes", "nome nick imagemPerfil");
        
        if (!sessao) {
          socket.emit("erro", { mensagem: "Sessão não encontrada" });
          return;
        }
        
        // Verificar se o utilizador é participante
        const isParticipante = sessao.participantes.some(p => 
          p._id.toString() === socket.user._id.toString()
        );
        
        if (!isParticipante) {
          socket.emit("erro", { mensagem: "Você não é participante desta sessão" });
          return;
        }
        
        // Entrar na sala da sessão
        socket.join(`sessao:${sessaoId}`);
        
        // Inicializar dados da sessão se ainda não existirem
        if (!sessoesDados.has(sessaoId)) {
          sessoesDados.set(sessaoId, {
            nivelAtual: 0,
            status: sessao.status,
            tempoRestante: 0,
            participantesPalavras: new Map(),
            ranking: []
          });
        }
        
        const dadosSessao = sessoesDados.get(sessaoId);
        
        // Inicializar contador de palavras para o utilizador
        if (!dadosSessao.participantesPalavras.has(socket.user._id.toString())) {
          dadosSessao.participantesPalavras.set(socket.user._id.toString(), []);
        }
        
        // Enviar estado atual da sessão para o utilizador
        socket.emit("estadoSessao", {
          nivelAtual: dadosSessao.nivelAtual,
          status: dadosSessao.status,
          tempoRestante: dadosSessao.tempoRestante,
          ranking: dadosSessao.ranking
        });
        
        // Notificar todos na sala que um novo participante entrou
        socket.to(`sessao:${sessaoId}`).emit("participanteEntrou", {
          participante: socket.user
        });
        
        console.log(`${socket.user.nick || socket.user.nome} entrou na sessão ${sessaoId}`);
      } catch (err) {
        console.error("Erro ao entrar na sessão:", err);
        socket.emit("erro", { mensagem: "Erro ao entrar na sessão" });
      }
    });
    
    // Submeter palavra
    socket.on("submeterPalavra", async ({ sessaoId, nivel, palavra }) => {
      try {
        if (!sessoesDados.has(sessaoId)) {
          socket.emit("erro", { mensagem: "Sessão não inicializada" });
          return;
        }
        
        const dadosSessao = sessoesDados.get(sessaoId);
        
        // Verificar se a sessão está ativa
        if (dadosSessao.status !== "ativa") {
          socket.emit("erro", { mensagem: "A sessão não está ativa" });
          return;
        }
        
        // Verificar se o nível corresponde ao nível atual
        if (nivel !== dadosSessao.nivelAtual) {
          socket.emit("erro", { mensagem: "Nível inválido" });
          return;
        }
        
        // Adicionar palavra à lista do utilizador
        const palavrasUtilizador = dadosSessao.participantesPalavras.get(socket.user._id.toString()) || [];
        palavrasUtilizador.push(palavra);
        dadosSessao.participantesPalavras.set(socket.user._id.toString(), palavrasUtilizador);
        
        // Atualizar ranking
        atualizarRanking(sessaoId);
        
        // Enviar confirmação ao utilizador
        socket.emit("palavraAceite", { palavra, nivel });
        
        // Enviar ranking atualizado para todos na sala
        io.to(`sessao:${sessaoId}`).emit("rankingAtualizado", {
          ranking: dadosSessao.ranking
        });
        
        console.log(`${socket.user.nick || socket.user.nome} submeteu palavra "${palavra}" no nível ${nivel}`);
      } catch (err) {
        console.error("Erro ao submeter palavra:", err);
        socket.emit("erro", { mensagem: "Erro ao submeter palavra" });
      }
    });
    
    // Iniciar sessão (apenas host)
    socket.on("iniciarSessao", async ({ sessaoId }) => {
      try {
        const sessao = await Sessao.findById(sessaoId);
        
        if (!sessao) {
          socket.emit("erro", { mensagem: "Sessão não encontrada" });
          return;
        }
        
        // Verificar se o utilizador é o host
        if (sessao.host.toString() !== socket.user._id.toString()) {
          socket.emit("erro", { mensagem: "Apenas o host pode iniciar a sessão" });
          return;
        }
        
        // Atualizar status da sessão
        sessao.status = "ativa";
        await sessao.save();
        
        // Inicializar ou atualizar dados da sessão
        if (!sessoesDados.has(sessaoId)) {
          sessoesDados.set(sessaoId, {
            nivelAtual: 1,
            status: "ativa",
            tempoRestante: sessao.configuracaoNiveis[0].segundos,
            participantesPalavras: new Map(),
            ranking: []
          });
        } else {
          const dadosSessao = sessoesDados.get(sessaoId);
          dadosSessao.nivelAtual = 1;
          dadosSessao.status = "ativa";
          dadosSessao.tempoRestante = sessao.configuracaoNiveis[0].segundos;
        }
        
        // Iniciar temporizador para o nível
        iniciarTemporizadorNivel(io, sessaoId, sessao);
        
        // Notificar todos na sala que a sessão foi iniciada
        io.to(`sessao:${sessaoId}`).emit("sessaoIniciada", {
          nivelAtual: 1,
          tempoRestante: sessao.configuracaoNiveis[0].segundos
        });
        
        console.log(`Sessão ${sessaoId} iniciada pelo host ${socket.user.nick || socket.user.nome}`);
      } catch (err) {
        console.error("Erro ao iniciar sessão:", err);
        socket.emit("erro", { mensagem: "Erro ao iniciar sessão" });
      }
    });
    
    // Pausar sessão (apenas host)
    socket.on("pausarSessao", async ({ sessaoId }) => {
      try {
        const sessao = await Sessao.findById(sessaoId);
        
        if (!sessao) {
          socket.emit("erro", { mensagem: "Sessão não encontrada" });
          return;
        }
        
        // Verificar se o utilizador é o host
        if (sessao.host.toString() !== socket.user._id.toString()) {
          socket.emit("erro", { mensagem: "Apenas o host pode pausar a sessão" });
          return;
        }
        
        // Atualizar status da sessão
        sessao.status = "pausada";
        await sessao.save();
        
        // Atualizar dados da sessão
        if (sessoesDados.has(sessaoId)) {
          const dadosSessao = sessoesDados.get(sessaoId);
          dadosSessao.status = "pausada";
        }
        
        // Notificar todos na sala que a sessão foi pausada
        io.to(`sessao:${sessaoId}`).emit("sessaoPausada", {
          mensagem: "A sessão foi pausada pelo host"
        });
        
        console.log(`Sessão ${sessaoId} pausada pelo host ${socket.user.nick || socket.user.nome}`);
      } catch (err) {
        console.error("Erro ao pausar sessão:", err);
        socket.emit("erro", { mensagem: "Erro ao pausar sessão" });
      }
    });
    
    // Concluir sessão (apenas host)
    socket.on("concluirSessao", async ({ sessaoId }) => {
      try {
        const sessao = await Sessao.findById(sessaoId);
        
        if (!sessao) {
          socket.emit("erro", { mensagem: "Sessão não encontrada" });
          return;
        }
        
        // Verificar se o utilizador é o host
        if (sessao.host.toString() !== socket.user._id.toString()) {
          socket.emit("erro", { mensagem: "Apenas o host pode concluir a sessão" });
          return;
        }
        
        // Atualizar status da sessão
        sessao.status = "concluida";
        await sessao.save();
        
        // Limpar dados da sessão
        sessoesDados.delete(sessaoId);
        
        // Notificar todos na sala que a sessão foi concluída
        io.to(`sessao:${sessaoId}`).emit("sessaoConcluida", {
          mensagem: "A sessão foi concluída pelo host"
        });
        
        console.log(`Sessão ${sessaoId} concluída pelo host ${socket.user.nick || socket.user.nome}`);
      } catch (err) {
        console.error("Erro ao concluir sessão:", err);
        socket.emit("erro", { mensagem: "Erro ao concluir sessão" });
      }
    });
    
    // Expulsar participante (apenas host)
    socket.on("expulsarParticipante", async ({ sessaoId, participanteId }) => {
      try {
        const sessao = await Sessao.findById(sessaoId);
        
        if (!sessao) {
          socket.emit("erro", { mensagem: "Sessão não encontrada" });
          return;
        }
        
        // Verificar se o utilizador é o host
        if (sessao.host.toString() !== socket.user._id.toString()) {
          socket.emit("erro", { mensagem: "Apenas o host pode expulsar participantes" });
          return;
        }
        
        // Verificar se o participante existe
        const participante = await User.findById(participanteId);
        if (!participante) {
          socket.emit("erro", { mensagem: "Participante não encontrado" });
          return;
        }
        
        // Verificar se o participante não é o host
        if (participanteId === sessao.host.toString()) {
          socket.emit("erro", { mensagem: "O host não pode ser expulso" });
          return;
        }
        
        // Remover participante da sessão
        sessao.participantes = sessao.participantes.filter(p => p.toString() !== participanteId);
        
        // Registrar ação no histórico
        sessao.historicoAcoes.push({
          tipo: "expulsao",
          executadoPor: socket.user._id,
          detalhes: `Participante ${participante.nick || participante.nome} expulso da sessão`
        });
        
        await sessao.save();
        
        // Notificar o participante expulso
        const participanteSockets = await io.in(`sessao:${sessaoId}`).fetchSockets();
        for (const s of participanteSockets) {
          if (s.user && s.user._id.toString() === participanteId) {
            s.emit("expulsado", {
              mensagem: "Você foi expulso da sessão pelo host"
            });
            s.leave(`sessao:${sessaoId}`);
          }
        }
        
        // Notificar todos na sala que um participante foi expulso
        io.to(`sessao:${sessaoId}`).emit("participanteExpulso", {
          participanteId,
          participanteNome: participante.nick || participante.nome
        });
        
        console.log(`Participante ${participante.nick || participante.nome} expulso da sessão ${sessaoId}`);
      } catch (err) {
        console.error("Erro ao expulsar participante:", err);
        socket.emit("erro", { mensagem: "Erro ao expulsar participante" });
      }
    });
    
    // Desconexão
    socket.on("disconnect", () => {
      console.log(`Utilizador desconectado: ${socket.user.nick || socket.user.nome}`);
    });
  });
  
  return io;
};

// Função para iniciar temporizador de nível
const iniciarTemporizadorNivel = (io, sessaoId, sessao) => {
  const dadosSessao = sessoesDados.get(sessaoId);
  if (!dadosSessao) return;
  
  const nivelAtual = dadosSessao.nivelAtual;
  const nivelConfig = sessao.configuracaoNiveis.find(n => n.ordem === nivelAtual);
  
  if (!nivelConfig) return;
  
  let tempoRestante = nivelConfig.segundos;
  dadosSessao.tempoRestante = tempoRestante;
  
  const intervalo = setInterval(() => {
    // Verificar se a sessão ainda existe e está ativa
    if (!sessoesDados.has(sessaoId) || dadosSessao.status !== "ativa") {
      clearInterval(intervalo);
      return;
    }
    
    tempoRestante--;
    dadosSessao.tempoRestante = tempoRestante;
    
    // Enviar atualização de tempo a cada segundo
    io.to(`sessao:${sessaoId}`).emit("tempoAtualizado", {
      nivel: nivelAtual,
      tempoRestante
    });
    
    // Verificar se o tempo acabou
    if (tempoRestante <= 0) {
      clearInterval(intervalo);
      
      // Verificar se há próximo nível
      const proximoNivel = nivelAtual + 1;
      const proximoNivelConfig = sessao.configuracaoNiveis.find(n => n.ordem === proximoNivel);
      
      if (proximoNivelConfig) {
        // Processar palavras do nível atual (placeholder para IA)
        processarPalavrasNivel(io, sessaoId, nivelAtual);
        
        // Avançar para o próximo nível
        dadosSessao.nivelAtual = proximoNivel;
        dadosSessao.tempoRestante = proximoNivelConfig.segundos;
        
        // Notificar todos sobre o novo nível
        io.to(`sessao:${sessaoId}`).emit("nivelAvancado", {
          nivelAnterior: nivelAtual,
          nivelAtual: proximoNivel,
          tempoRestante: proximoNivelConfig.segundos
        });
        
        // Iniciar temporizador para o próximo nível
        setTimeout(() => {
          iniciarTemporizadorNivel(io, sessaoId, sessao);
        }, 5000); // Pequena pausa entre níveis
      } else {
        // Processar palavras do último nível
        processarPalavrasNivel(io, sessaoId, nivelAtual);
        
        // Concluir sessão automaticamente
        finalizarSessao(io, sessaoId, sessao);
      }
    }
  }, 1000);
};

// Função para processar palavras de um nível (placeholder para IA)
const processarPalavrasNivel = async (io, sessaoId, nivel) => {
  try {
    const dadosSessao = sessoesDados.get(sessaoId);
    if (!dadosSessao) return;
    
    // Coletar todas as palavras do nível
    const todasPalavras = [];
    dadosSessao.participantesPalavras.forEach((palavras, participanteId) => {
      todasPalavras.push(...palavras);
    });
    
    // Placeholder para processamento de IA
    console.log(`Processando ${todasPalavras.length} palavras do nível ${nivel}`);
    
    // Simular resultado da IA
    const resultadoIA = {
      nivel,
      texto: `Análise das ${todasPalavras.length} palavras submetidas no nível ${nivel}. 
              Este é um placeholder para o resultado da IA que processaria as palavras 
              e geraria insights baseados nelas.`,
      palavrasProcessadas: todasPalavras.length
    };
    
    // Enviar resultado para todos na sala
    setTimeout(() => {
      io.to(`sessao:${sessaoId}`).emit("resultadoIA", resultadoIA);
    }, 2000); // Simular tempo de processamento
    
  } catch (err) {
    console.error("Erro ao processar palavras:", err);
  }
};

// Função para finalizar sessão
const finalizarSessao = async (io, sessaoId, sessao) => {
  try {
    // Atualizar status da sessão no banco de dados
    sessao.status = "concluida";
    await sessao.save();
    
    // Limpar dados da sessão
    sessoesDados.delete(sessaoId);
    
    // Notificar todos na sala que a sessão foi concluída
    io.to(`sessao:${sessaoId}`).emit("sessaoConcluida", {
      mensagem: "A sessão foi concluída automaticamente"
    });
    
    console.log(`Sessão ${sessaoId} concluída automaticamente`);
  } catch (err) {
    console.error("Erro ao finalizar sessão:", err);
  }
};

// Função para atualizar ranking
const atualizarRanking = (sessaoId) => {
  const dadosSessao = sessoesDados.get(sessaoId);
  if (!dadosSessao) return;
  
  // Criar array com contagem de palavras por participante
  const ranking = [];
  dadosSessao.participantesPalavras.forEach((palavras, participanteId) => {
    ranking.push({
      participanteId,
      palavrasCount: palavras.length
    });
  });
  
  // Ordenar por número de palavras (decrescente)
  ranking.sort((a, b) => b.palavrasCount - a.palavrasCount);
  
  // Atualizar ranking na sessão
  dadosSessao.ranking = ranking;
};

export { inicializarWebSocket };

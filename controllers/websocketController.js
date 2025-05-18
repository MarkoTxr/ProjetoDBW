import { Server } from "socket.io";
import Sessao from "../models/sessao.js";
import User from "../models/user.js";
import axios from "axios";
/**
 * Controller para WebSockets
 * Gerencia a comunicação em tempo real para as sessões de brainstorming
 */

// Armazenamento em memória para dados da sessão
const sessoesDados = new Map();

// Inicializa o WebSocket Server
const inicializarWebSocket = (server) => {
  const io = new Server(server);

  const chatGeral = io.of("/chat-geral");

  // Middleware de autenticação
  chatGeral.use(async (socket, next) => {
    try {
      const user = await User.findById(socket.handshake.auth.userId);
      if (!user) return next(new Error("Acesso não autorizado"));

      socket.userData = {
        id: user._id,
        nome: user.nome,
        nick: user.nick,
      };
      next();
    } catch (err) {
      next(new Error("Erro de autenticação"));
    }
  });

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
        imagemPerfil: user.imagemPerfil,
      };

      next();
    } catch (err) {
      next(new Error("Erro de autenticação"));
    }
  });

  // Conexão estabelecida
  io.on("connection", (socket) => {
    console.log(
      `Utilizador conectado: ${
        socket.user?.nick || socket.user?.nome || "Anônimo"
      } (ID: ${socket.user?._id || "desconhecido"})`
    );

    // Entrar numa sala de sessão
    socket.on("entrarSessao", async ({ sessaoId }) => {
      try {
        console.log(
          `Cliente ${socket.id} tentando entrar na sessão ${sessaoId}`
        );

        if (!socket.user || !socket.user._id) {
          socket.emit("erro", { mensagem: "Autenticação necessária" });
          return;
        }

        // Entrar na sala da sessão primeiro
        socket.join(`sessao:${sessaoId}`);
        console.log(`Cliente ${socket.id} entrou na sala sessao:${sessaoId}`);

        // Confirmar entrada para o cliente
        socket.emit("entradaConfirmada", {
          sessaoId,
          message: "Entrada na sessão confirmada",
        });

        // Buscar sessão com dados populados
        const sessao = await Sessao.findById(sessaoId)
          .populate("host", "nome nick imagemPerfil")
          .populate("participantes", "nome nick imagemPerfil");

        if (!sessao) {
          socket.emit("erro", { mensagem: "Sessão não encontrada" });
          return;
        }

        // Verificar se o utilizador é o host ou participante
        const isHost =
          sessao.host._id.toString() === socket.user._id.toString();
        const isParticipante = sessao.participantes.some(
          (p) => p._id.toString() === socket.user._id.toString()
        );

        // Notificar todos na sala que um novo participante entrou
        socket.to(`sessao:${sessaoId}`).emit("participanteEntrou", {
          participante: socket.user,
        });
        console.log(
          `Notificando que ${
            socket.user.nick || socket.user.nome
          } entrou na sessão ${sessaoId}`
        );

        // Inicializar dados da sessão se ainda não existirem
        if (!sessoesDados.has(sessaoId)) {
          sessoesDados.set(sessaoId, {
            nivelAtual: 0,
            status: sessao.status,
            tempoRestante: 0,
            participantesPalavras: new Map(),
            ranking: [],
          });
        }

        const dadosSessao = sessoesDados.get(sessaoId);

        // Inicializar contador de palavras para o utilizador
        if (
          !dadosSessao.participantesPalavras.has(socket.user._id.toString())
        ) {
          dadosSessao.participantesPalavras.set(socket.user._id.toString(), []);
        }

        // Enviar estado atual da sessão para o utilizador
        socket.emit("estadoSessao", {
          nivelAtual: dadosSessao.nivelAtual,
          status: dadosSessao.status,
          tempoRestante: dadosSessao.tempoRestante,
          ranking: dadosSessao.ranking,
        });

        // Buscar dados atualizados e enviar para todos
        const sessaoAtualizada = await Sessao.findById(sessaoId).populate(
          "participantes",
          "nome nick imagemPerfil"
        );

        if (sessaoAtualizada) {
          io.to(`sessao:${sessaoId}`).emit("atualizarParticipantes", {
            participantes: sessaoAtualizada.participantes,
          });
          console.log(
            `Evento 'atualizarParticipantes' emitido para a sala sessao:${sessaoId}`
          );
        }
      } catch (err) {
        console.error("Erro ao entrar na sessão:", err);
        socket.emit("erro", {
          mensagem: "Erro ao entrar na sessão: " + err.message,
        });
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

        const palavraTratada = palavra.trim();
        if (!palavraTratada || palavraTratada.length > 500) {
          socket.emit("erro", {
            mensagem: "Palavra inválida (máximo 500 caracteres e não vazia)",
          });
          return;
        }
        // Adicionar palavra à lista do utilizador
        const palavrasUtilizador =
          dadosSessao.participantesPalavras.get(socket.user._id.toString()) ||
          [];
        palavrasUtilizador.push(palavra);
        dadosSessao.participantesPalavras.set(
          socket.user._id.toString(),
          palavrasUtilizador
        );

        await Sessao.findByIdAndUpdate(
          sessaoId,
          {
            $push: {
              ideias: {
                texto: palavraTratada,
                autor: socket.user._id,
                timestamp: new Date(),
              },
            },
          },
          {
            new: true,
            runValidators: true, // Ativa validações do schema
          }
        );
        await User.findByIdAndUpdate(
          socket.user._id,
          {
            $inc: { "metricas.ideiasContribuidas": 1 },
          },
          { new: true }
        );
        console.log(
          "Palavra submetida com sucesso:",
          socket.user._id,
          palavraTratada
        );
        // Atualizar ranking
        atualizarRanking(sessaoId);

        // Enviar confirmação ao utilizador
        socket.emit("palavraAceite", { palavra, nivel });

        // Enviar ranking atualizado para todos na sala
        io.to(`sessao:${sessaoId}`).emit("rankingAtualizado", {
          ranking: dadosSessao.ranking,
        });

        console.log(
          `${
            socket.user.nick || socket.user.nome
          } submeteu palavra "${palavra}" no nível ${nivel}`
        );
      } catch (err) {
        console.error("Erro ao submeter palavra:", err);
        socket.emit("erro", { mensagem: "Erro ao submeter palavra" });
      }
    });

    // Iniciar sessão (apenas host)
    socket.on("iniciarSessao", async ({ sessaoId }) => {
      try {
        console.log(
          `Tentativa de iniciar sessão ${sessaoId} por ${
            socket.user?.nick || socket.user?.nome || "desconhecido"
          }`
        );

        const sessao = await Sessao.findById(sessaoId);

        if (!sessao) {
          socket.emit("erro", { mensagem: "Sessão não encontrada" });
          return;
        }

        // Verificar se o utilizador é o host
        if (sessao.host.toString() !== socket.user._id.toString()) {
          socket.emit("erro", {
            mensagem: "Apenas o host pode iniciar a sessão",
          });
          return;
        }

        // Atualizar status da sessão
        sessao.status = "ativa";
        await sessao.save();
        console.log(`Status da sessão ${sessaoId} atualizado para 'ativa'`);

        // Inicializar ou atualizar dados da sessão
        if (!sessoesDados.has(sessaoId)) {
          sessoesDados.set(sessaoId, {
            nivelAtual: 1,
            status: "ativa",
            tempoRestante: sessao.configuracaoNiveis[0]?.segundos || 60,
            participantesPalavras: new Map(),
            ranking: [],
          });
        } else {
          const dadosSessao = sessoesDados.get(sessaoId);
          dadosSessao.nivelAtual = 1;
          dadosSessao.status = "ativa";
          dadosSessao.tempoRestante =
            sessao.configuracaoNiveis[0]?.segundos || 60;
        }

        // Iniciar temporizador para o nível
        iniciarTemporizadorNivel(io, sessaoId, sessao);

        // Notificar todos na sala que a sessão foi iniciada
        io.to(`sessao:${sessaoId}`).emit("sessaoIniciada", {
          nivelAtual: 1,
          tempoRestante: sessao.configuracaoNiveis[0]?.segundos || 60,
          status: "ativa",
        });
        console.log(
          `Evento 'sessaoIniciada' emitido para a sala sessao:${sessaoId}`
        );

        console.log(
          `Sessão ${sessaoId} iniciada pelo host ${
            socket.user.nick || socket.user.nome
          }`
        );
      } catch (err) {
        console.error("Erro ao iniciar sessão:", err);
        socket.emit("erro", {
          mensagem: "Erro ao iniciar sessão: " + err.message,
        });
      }
    });

    // Pausar sessão (apenas host)
    socket.on("pausarSessao", async ({ sessaoId }) => {
      try {
        console.log(
          `Tentativa de pausar sessão ${sessaoId} por ${
            socket.user?.nick || socket.user?.nome || "desconhecido"
          }`
        );

        const sessao = await Sessao.findById(sessaoId);

        if (!sessao) {
          socket.emit("erro", { mensagem: "Sessão não encontrada" });
          return;
        }

        // Verificar se o utilizador é o host
        if (sessao.host.toString() !== socket.user._id.toString()) {
          socket.emit("erro", {
            mensagem: "Apenas o host pode pausar a sessão",
          });
          return;
        }

        // Atualizar status da sessão
        sessao.status = "pausada";
        await sessao.save();
        console.log(`Status da sessão ${sessaoId} atualizado para 'pausada'`);

        // Atualizar dados da sessão
        if (sessoesDados.has(sessaoId)) {
          const dadosSessao = sessoesDados.get(sessaoId);
          dadosSessao.status = "pausada";
        }

        // Notificar todos na sala que a sessão foi pausada
        io.to(`sessao:${sessaoId}`).emit("sessaoPausada", {
          mensagem: "A sessão foi pausada pelo host",
          status: "pausada",
        });
        console.log(
          `Evento 'sessaoPausada' emitido para a sala sessao:${sessaoId}`
        );

        console.log(
          `Sessão ${sessaoId} pausada pelo host ${
            socket.user.nick || socket.user.nome
          }`
        );
      } catch (err) {
        console.error("Erro ao pausar sessão:", err);
        socket.emit("erro", {
          mensagem: "Erro ao pausar sessão: " + err.message,
        });
      }
    });

    // Concluir sessão (apenas host)
    socket.on("concluirSessao", async ({ sessaoId }) => {
      try {
        console.log(
          `Tentativa de concluir sessão ${sessaoId} por ${
            socket.user?.nick || socket.user?.nome || "desconhecido"
          }`
        );

        const sessao = await Sessao.findById(sessaoId)
          .populate("ideias.autor", "nick") // Popula os nicks dos autores
          .populate("participantes", "nick")
          .select("+resultadosAI");

        if (!sessao) {
          socket.emit("erro", { mensagem: "Sessão não encontrada" });
          return;
        }

        if (sessao.host.toString() !== socket.user._id.toString()) {
          socket.emit("erro", {
            mensagem: "Apenas o host pode concluir a sessão",
          });
          return;
        }

        // 1. Gerar resultado da IA
        let resultadoIA = "Nenhuma solução gerada";
        try {
          resultadoIA = await generateBrainmasterSolution(
            sessao.tema,
            sessao.ideias
          );
          
          // Salvar resultado na sessão
          if (!sessao.resultadosAI) {
            sessao.resultadosAI = [];
          }

          sessao.resultadosAI.push({
            texto: resultadoIA,
            timestamp: new Date(),
          });
          await sessao.save();
        } catch (iaError) {
          console.error("Erro na IA:", iaError);
          resultadoIA = "Falha ao gerar solução automática";
        }

        // 2. Criar lista de ideias com nicknames
        const listaIdeias = sessao.ideias.map((ideia) => ({
          texto: ideia.texto,
          nick: ideia.autor.nick || "Anônimo",
          timestamp: ideia.timestamp,
        }));

        // 3. Atualizar status e salvar
        sessao.status = "concluida";
        await sessao.save();

        // 4. Atualizar métricas dos usuários
        await User.updateMany(
          { _id: { $in: sessao.participantes } },
          {
            $addToSet: { sessoesParticipadas: sessao._id },
            $inc: { "metricas.sessoesParticipadas": 1 },
          }
        );

        await User.findByIdAndUpdate(sessao.host, {
          $inc: { "metricas.sessoesCriadas": 1 },
        });
        console.log(listaIdeias);
        // 5. Notificar todos com dados completos

        
        
        // 6. Limpar dados da memória
        sessoesDados.delete(sessaoId);

        console.log(`Sessão ${sessaoId} concluída com resultados IA salvos`);
        io.to(`sessao:${sessaoId}`).emit("sessaoConcluida", {
          mensagem: "A sessão foi concluída pelo host",
          status: "concluida",
          resultadoSessao: resultadoIA,
          ideias:listaIdeias,
        });
      } catch (err) {
        console.error("Erro ao concluir sessão:", err);
        socket.emit("erro", {
          mensagem: "Erro ao concluir sessão: " + err.message,
        });
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
          socket.emit("erro", {
            mensagem: "Apenas o host pode expulsar participantes",
          });
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
        sessao.participantes = sessao.participantes.filter(
          (p) => p.toString() !== participanteId
        );

        // Registrar ação no histórico
        if (!sessao.historicoAcoes) {
          sessao.historicoAcoes = [];
        }
        sessao.historicoAcoes.push({
          tipo: "expulsao",
          executadoPor: socket.user._id,
          detalhes: `Participante ${
            participante.nick || participante.nome
          } expulso da sessão`,
        });

        await sessao.save();

        // Notificar todos na sala que um participante foi expulso
        io.to(`sessao:${sessaoId}`).emit("participanteExpulso", {
          participanteId,
          participanteNome: participante.nick || participante.nome,
        });
        console.log(
          `Evento 'participanteExpulso' emitido para a sala sessao:${sessaoId}`
        );

        // Buscar dados atualizados e enviar para todos
        const sessaoAtualizada = await Sessao.findById(sessaoId).populate(
          "participantes",
          "nome nick imagemPerfil"
        );

        if (sessaoAtualizada) {
          io.to(`sessao:${sessaoId}`).emit("atualizarParticipantes", {
            participantes: sessaoAtualizada.participantes,
          });
          console.log(
            `Evento 'atualizarParticipantes' emitido após expulsão para a sala sessao:${sessaoId}`
          );
        }

        console.log(
          `Participante ${
            participante.nick || participante.nome
          } expulso da sessão ${sessaoId}`
        );
      } catch (err) {
        console.error("Erro ao expulsar participante:", err);
        socket.emit("erro", {
          mensagem: "Erro ao expulsar participante: " + err.message,
        });
      }
    });

    // Sair da sessão
    socket.on("sairSessao", async ({ sessaoId, userId }) => {
      try {
        console.log(`Cliente ${socket.id} tentando sair da sessão ${sessaoId}`);

        // Sair da sala da sessão
        socket.leave(`sessao:${sessaoId}`);
        console.log(`Cliente ${socket.id} saiu da sala sessao:${sessaoId}`);

        // Se userId fornecido, remover da lista de participantes no banco de dados
        if (userId) {
          const sessao = await Sessao.findById(sessaoId);

          if (sessao && !sessao.host.equals(userId)) {
            // Não remover o host
            // Remover participante da sessão
            sessao.participantes = sessao.participantes.filter(
              (p) => !p.equals(userId)
            );
            await sessao.save();

            // Buscar dados atualizados e enviar para todos
            const sessaoAtualizada = await Sessao.findById(sessaoId)
              .populate("host", "nome nick imagemPerfil")
              .populate("participantes", "nome nick imagemPerfil");

            if (sessaoAtualizada) {
              io.to(`sessao:${sessaoId}`).emit("atualizarParticipantes", {
                participantes: sessaoAtualizada.participantes,
              });
              console.log(
                `Evento 'atualizarParticipantes' emitido após saída para a sala sessao:${sessaoId}`
              );
            }
          }
        }

        // Notificar o cliente que saiu com sucesso
        socket.emit("saidaConfirmada", {
          sessaoId,
          message: "Saída da sessão confirmada",
        });
      } catch (err) {
        console.error("Erro ao sair da sessão:", err);
        socket.emit("erro", {
          mensagem: "Erro ao sair da sessão: " + err.message,
        });
      }
    });

    socket.on("atualizarStatus", async ({ sessaoId, novoStatus }) => {
      try {
        await Sessao.findByIdAndUpdate(sessaoId, { status: novoStatus });
        io.to(`sessao:${sessaoId}`).emit("atualizarStatus", { novoStatus });
        console.log(
          `Evento 'atualizarStatus' emitido para a sala sessao:${sessaoId}`
        );
      } catch (err) {
        console.error("Erro ao atualizar status:", err);
        socket.emit("erro", {
          mensagem: "Erro ao atualizar status: " + err.message,
        });
      }
    });

    // Desconexão
    socket.on("disconnect", async () => {
      if (!socket.user) return;

      console.log(
        `Utilizador desconectado: ${socket.user.nick || socket.user.nome}`
      );

      // Atualizar todas as salas que o usuário estava
      const salas = Array.from(socket.rooms).filter((room) =>
        room.startsWith("sessao:")
      );

      for (const sala of salas) {
        const sessaoId = sala.split(":")[1];
        const sessao = await Sessao.findById(sessaoId);

        if (sessao) {
          // Não remover o host automaticamente ao desconectar
          if (sessao.host.toString() !== socket.user._id.toString()) {
            // Remover o usuário da sessão
            sessao.participantes = sessao.participantes.filter(
              (p) => p.toString() !== socket.user._id.toString()
            );
            await sessao.save();
          }

          // Buscar dados atualizados e enviar para todos
          const sessaoAtualizada = await Sessao.findById(sessaoId).populate(
            "participantes",
            "nome nick imagemPerfil"
          );

          if (sessaoAtualizada) {
            io.to(sala).emit("atualizarParticipantes", {
              participantes: sessaoAtualizada.participantes,
            });
            console.log(
              `Evento 'atualizarParticipantes' emitido após desconexão para a sala ${sala}`
            );
          }
        }
      }
    });
  });
  chatGeral.on("connection", (socket) => {
    console.log(`Usuário conectado ao chat: ${socket.userData.nick}`);

    // Evento para receber mensagens
    socket.on("enviarMensagem", async ({ mensagem }) => {
      try {
        // Gerar resposta IA
        const resposta = await gerarRespostaIA(mensagem);
        console.log("Resposta IA gerada:", resposta);
        // Construir objeto da mensagem
        const msgCompleta = {
          usuario: socket.userData,
          conteudo: mensagem,
          respostaIA: resposta,
          timestamp: new Date(),
        };

        // Broadcast para todos os usuários
        console.log("Enviando broadcast:", msgCompleta);
        chatGeral.emit("novaMensagem", msgCompleta);
      } catch (err) {
        console.error("Erro no chat:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Usuário desconectado: ${socket.userData.nick}`);
    });
  });
  return io;
};

// Função para iniciar temporizador de nível
const iniciarTemporizadorNivel = (io, sessaoId, sessao) => {
  const dadosSessao = sessoesDados.get(sessaoId);
  if (!dadosSessao) return;

  const nivelAtual = dadosSessao.nivelAtual;
  const nivelConfig = sessao.configuracaoNiveis.find(
    (n) => n.ordem === nivelAtual
  );

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
      tempoRestante,
    });

    // Verificar se o tempo acabou
    if (tempoRestante <= 0) {
      clearInterval(intervalo);

      // Verificar se há próximo nível
      const proximoNivel = nivelAtual + 1;
      const proximoNivelConfig = sessao.configuracaoNiveis.find(
        (n) => n.ordem === proximoNivel
      );

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
          tempoRestante: proximoNivelConfig.segundos,
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
    console.log(
      `Processando ${todasPalavras.length} palavras do nível ${nivel}`
    );

    // Simular resultado da IA
    const resultadoIA = {
      nivel,
      texto: `Análise das ${todasPalavras.length} palavras submetidas no nível ${nivel}. 
              Este é um placeholder para o resultado da IA que processaria as palavras 
              e geraria insights baseados nelas.`,
      palavrasProcessadas: todasPalavras.length,
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
    // Buscar sessão com dados populados para processamento
    const sessaoCompleta = await Sessao.findById(sessaoId)
      .populate("ideias.autor", "nick")
      .populate("participantes", "nick")
      .select("+resultadosAI");
    
    if (!sessaoCompleta) {
      console.error(`Sessão ${sessaoId} não encontrada para finalização`);
      return;
    }
    
    // 1. Gerar resultado da IA
    let resultadoIA = "Nenhuma solução gerada";
    try {
      resultadoIA = await generateBrainmasterSolution(
        sessaoCompleta.tema,
        sessaoCompleta.ideias
      );
      
      // Salvar resultado na sessão
      if (!sessaoCompleta.resultadosAI) {
        sessaoCompleta.resultadosAI = [];
      }

      sessaoCompleta.resultadosAI.push({
        texto: resultadoIA,
        timestamp: new Date(),
      });
    } catch (iaError) {
      console.error("Erro na IA durante finalização automática:", iaError);
      resultadoIA = "Falha ao gerar solução automática";
    }

    // 2. Criar lista de ideias com nicknames
    const listaIdeias = sessaoCompleta.ideias.map((ideia) => ({
      texto: ideia.texto,
      nick: ideia.autor.nick || "Anônimo",
      timestamp: ideia.timestamp,
    }));

    // 3. Atualizar status e salvar
    sessaoCompleta.status = "concluida";
    await sessaoCompleta.save();

    // 4. Atualizar métricas dos utilizadores
    await User.updateMany(
      { _id: { $in: sessaoCompleta.participantes } },
      {
        $addToSet: { sessoesParticipadas: sessaoCompleta._id },
        $inc: { "metricas.sessoesParticipadas": 1 },
      }
    );

    if (sessaoCompleta.host) {
      await User.findByIdAndUpdate(sessaoCompleta.host, {
        $inc: { "metricas.sessoesCriadas": 1 },
      });
    }
    
    console.log(listaIdeias);
    
    // 5. Limpar dados da memória
    sessoesDados.delete(sessaoId);

    // 6. Notificar todos com dados completos
    io.to(`sessao:${sessaoId}`).emit("sessaoConcluida", {
      mensagem: "A sessão foi concluída automaticamente",
      status: "concluida",
      resultadoSessao: resultadoIA,
      ideias: listaIdeias,
    });

    console.log(`Sessão ${sessaoId} concluída automaticamente com resultados IA salvos`);
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
      palavrasCount: palavras.length,
    });
  });

  // Ordenar por número de palavras (decrescente)
  ranking.sort((a, b) => b.palavrasCount - a.palavrasCount);

  // Atualizar ranking na sessão
  dadosSessao.ranking = ranking;
};

async function gerarRespostaIA(mensagem) {
  try {
    let LM_STUDIO_URL = "http://89.109.76.139:1234/v1/chat/completions";
    const response = await axios.post(LM_STUDIO_URL, {
      messages: [
        {
          role: "system",
          content:
            "Responda em português de forma curta (máximo 2 frases). Formato proibido: markdown, listas.",
        },
        {
          role: "user",
          content: mensagem,
        },
      ],
      temperature: 0.3,
      max_tokens: 80,
    });

    return response.data.choices[0].message.content
      .replace(/<think>.*<\/think>/gs, "")
      .trim();
  } catch (err) {
    return "Estou aprendendo ainda, pergunte outra coisa!";
  }
}

async function generateBrainmasterSolution(tema, ideias) {
  let LM_STUDIO_URL = "http://89.109.76.139:1234/v1/chat/completions";
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
               [...]`,
        },
        {
          role: "user",
          content: `Tema: "${tema}"
          
          Ideias para integrar:
          ${
            ideias
              .map((ideia, index) => `${index + 1}. ${ideia.texto}`)
              .join("\n") || "Nenhuma ideia submetida"
          }
          
          Forneça apenas a solução prática final.`,
        },
      ],
      model: "llama-3.2-1b-claude-3.7-sonnet-reasoning-distilled",
      temperature: 0.5,
      max_tokens: 1500,
      stream: false,
    });

    // Processamento para remover qualquer vestígio de raciocínio
    const rawResponse = response.data.choices[0].message.content;
    const cleanSolution = rawResponse
      .split("</think>")
      .pop() // Remove tudo antes do fechamento do think
      .replace(/<think>[\s\S]*?<\/think>/g, "") // Remove qualquer think remanescente
      .replace(/^[#]+.*?(?=### Solução Integrada ###)/ims, "") // Remove cabeçalhos anteriores
      .trim();

    return cleanSolution || "Solução não gerada";
  } catch (error) {
    console.error("Erro na síntese:", error.response?.data || error.message);
    throw error;
  }
}
export { inicializarWebSocket };

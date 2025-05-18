import Sessao from "../models/sessao.js";
import User from "../models/user.js";

/**
 * Controller para gestão de sessões
 */

// Listar todas as sessões disponíveis
const listarSessoes = async (req, res) => {
  try {
    // Adicionado log para depuração
    console.log("Buscando sessões disponíveis...");
    
    const sessoes = await Sessao.find({ status: { $ne: "concluida" } })
      .populate("host", "nome nick imagemPerfil")
      .populate("participantes", "nome nick imagemPerfil");
    
    // Log para verificar se sessões foram encontradas
    console.log(`Encontradas ${sessoes.length} sessões disponíveis`);
    
    res.render("sessoes/listar", { 
      sessoes,
      titulo: "Sessões Disponíveis"
    });
  } catch (err) {
    console.error("Erro ao listar sessões:", err);
    req.flash("error", "Erro ao carregar sessões: " + err.message);
    res.redirect("/");
  }
};

// Exibir detalhes de uma sessão específica
const detalhesSessao = async (req, res) => {
  
  try {
    const { id } = req.params;
    const sessao = await Sessao.findById(id)
      .populate("host", "nome nick imagemPerfil")
      .populate({
        path: "participantes",
        select: "nome nick imagemPerfil",
        options: { strictPopulate: false } // Garante compatibilidade
      });
    
    if (!sessao) {
      req.flash("error", "Sessão não encontrada");
      return res.redirect("/sessoes");
    }
    
    // Verificar se o usuário é o host ou participante
    const isHost = sessao.host._id.toString() === req.user._id.toString();
    const isParticipante = sessao.participantes.some(p => 
      p._id.toString() === req.user._id.toString()
    );
    
    res.render("sessoes/detalhes", { 
      sessao,
      isHost,
      isParticipante,
      titulo: `Sessão: ${sessao.tema}`
    });
  } catch (err) {
    req.flash("error", "Erro ao carregar detalhes da sessão: " + err.message);
    res.redirect("/sessoes");
  }
};

// Renderizar formulário para criar nova sessão
const formCriarSessao = (req, res) => {
  res.render("sessoes/criar", { 
    titulo: "Criar Nova Sessão",
    errors: req.flash("errors")[0] || {} // Captura erros do flash
  });
};

// Processar criação de nova sessão
const criarSessao = async (req, res) => {
  try {
    const { tema, codigoSala, salaProtegida, senhaSala, niveis } = req.body;

    // Validação do código
    if (!codigoSala?.match(/^[A-Z0-9-]{6,20}$/)) {
      throw new Error("Formato de código inválido");
    }

    // Converter níveis para números
    const configuracaoNiveis = niveis.map((segundos, index) => ({
      ordem: index + 1,
      segundos: Math.min(Math.max(parseInt(segundos), 5), 300)
    }));

    // Criar nova sessão com o host como único participante inicial
    const novaSessao = new Sessao({
      tema,
      codigoSala: codigoSala.toUpperCase(),
      host: req.user._id,
      participantes: [req.user._id], // O host é o único participante inicial
      configuracaoNiveis,
      salaProtegida: salaProtegida === 'on',
      senhaSala: salaProtegida === 'on' ? senhaSala : undefined
    });

    // Salvar no banco de dados
    await novaSessao.save();

    req.flash('success', 'Sessão criada com sucesso!');
    res.redirect(`/sessoes/${novaSessao._id}/participar`);
    
  } catch (err) {
    console.error('Erro na criação:', err);
    
    // Tratamento de erros específicos
    let errorMessage = 'Erro ao criar sessão';
    if (err.code === 11000) {
      errorMessage = 'Código da sala já está em uso';
    } else if (err.name === 'ValidationError') {
      // Extrair mensagens de erro de validação
      const validationErrors = Object.values(err.errors || {}).map(e => e.message);
      if (validationErrors.length > 0) {
        errorMessage = validationErrors.join('. ');
      }
    }

    req.flash('error', errorMessage);
    
    req.flash('errors', {
      geral: errorMessage,
      codigoSala: err.code === 11000 ? 'Código da sala já está em uso' : null,
      tema: err.errors?.tema?.message,
      niveis: err.errors?.configuracaoNiveis?.message
    });
    
    // Corrigido: redirecionar para a página de criação em caso de erro
    // em vez de tentar acessar o ID de uma sessão que não foi criada
    res.redirect('/sessoes/criar');
  }
};

// Entrar em uma sessão existente
const entrarSessao = async (req, res) => {
  try {
    const { codigoSala, senha } = req.body;
    
    // Buscar sessão pelo código
    const sessao = await Sessao.findOne({ codigoSala });
    
    if (!sessao) {
      req.flash("error", "Sessão não encontrada");
      return res.redirect("/sessoes");
    }
    
    // Verificar se a sessão está concluída
    if (sessao.status === "concluida") {
      req.flash("error", "Esta sessão já foi concluída");
      return res.redirect("/sessoes");
    }
    
    // Verificar senha se a sala for protegida
    if (sessao.salaProtegida && sessao.senhaSala !== senha) {
      req.flash("error", "Senha incorreta");
      return res.redirect("/sessoes");
    }
    
    // Verificar se o usuário já é participante
    const isParticipante = sessao.participantes.some(p => 
      p.toString() === req.user._id.toString()
    );
    
    if (!isParticipante) {
      // Verificar se adicionar este participante excederia o limite
      if (sessao.participantes.length >= 50) {
        req.flash("error", "Esta sessão já atingiu o limite máximo de 50 participantes");
        return res.redirect("/sessoes");
      }
      
      // Adicionar usuário como participante
      sessao.participantes.push(req.user._id);
      await sessao.save();
    }
    
    res.redirect(`/sessoes/${sessao._id}/participar`);
  } catch (err) {
    req.flash("error", "Erro ao entrar na sessão: " + err.message);
    res.redirect("/sessoes");
  }
};

// Renderizar página de participação na sessão
const participarSessao = async (req, res) => {
  try {
    const { id } = req.params;
    const sessao = await Sessao.findById(id)
      .populate("host", "nome nick imagemPerfil")
      .populate({
        path: "participantes",
        select: "nome nick imagemPerfil",
        options: { strictPopulate: false } // Garante compatibilidade
      });
    
    if (!sessao) {
      req.flash("error", "Sessão não encontrada");
      return res.redirect("/sessoes");
    }
    
    // Verificar se o usuário é o host
    const isHost = sessao.host._id.equals(req.user._id);
    
    // Verificar se o usuário é participante
    const isParticipante = sessao.participantes.some(p => p._id.equals(req.user._id));
    
    // Se não for participante, adicionar automaticamente (exceto se a sessão estiver concluída)
    if (!isParticipante && !isHost && sessao.status !== "concluida") {
      // Verificar se adicionar este participante excederia o limite
      if (sessao.participantes.length >= 50) {
        req.flash("error", "Esta sessão já atingiu o limite máximo de 50 participantes");
        return res.redirect("/sessoes");
      }
      
      // Adicionar usuário como participante
      sessao.participantes.push(req.user._id);
      await sessao.save();
      
      // Recarregar a sessão com os dados atualizados
      const sessaoAtualizada = await Sessao.findById(id)
        .populate("host", "nome nick imagemPerfil")
        .populate({
          path: "participantes",
          select: "nome nick imagemPerfil",
          options: { strictPopulate: false }
        });
      
      if (sessaoAtualizada) {
        // Emitir evento via socket para todos os participantes
        const io = req.app.get('io');
        if (io) {
          io.to(`sessao:${id}`).emit('atualizarParticipantes', { 
            participantes: sessaoAtualizada.participantes
          });
        }
      }
    } else if (sessao.status === "concluida" && !isParticipante && !isHost) {
      req.flash("error", "Esta sessão já foi concluída");
      return res.redirect("/sessoes");
    }
    
    res.render("sessoes/participar", { 
      sessao,
      isHost: isHost || false,
      user: req.user,
      titulo: `Participando: ${sessao.tema}`
    });
  } catch (err) {
    req.flash("error", "Erro ao carregar sessão: " + err.message);
    res.redirect("/sessoes");
  }
};

// Iniciar sessão (apenas host)
const iniciarSessao = async (req, res) => {
  try {
    const { id } = req.params;
    const sessao = await Sessao.findById(id);
    
    if (!sessao) {
      req.flash("error", "Sessão não encontrada");
      return res.redirect("/sessoes");
    }
    
    // Verificar se o usuário é o host
    if (!sessao.host.equals(req.user._id)) {
      req.flash("error", "Apenas o host pode iniciar a sessão");
      return res.redirect(`/sessoes/${id}/participar`);
    }
    
    // Verificar se a sessão pode ser iniciada
    if (sessao.status !== "aguardando_inicio" && sessao.status !== "pausada") {
      req.flash("error", "A sessão não pode ser iniciada neste momento");
      return res.redirect(`/sessoes/${id}/participar`);
    }
    
    // Atualizar status da sessão
    sessao.status = "ativa";
    await sessao.save();
    
    // Emitir evento via socket para todos os participantes
    const io = req.app.get('io');
    if (io) {
      io.to(`sessao:${id}`).emit('sessaoIniciada', { 
        nivelAtual: 1, 
        tempoRestante: sessao.configuracaoNiveis[0]?.segundos || 60,
        status: 'ativa'
      });
      console.log(`Evento 'sessaoIniciada' emitido para a sala sessao:${id}`);
    } else {
      console.error('Instância do Socket.IO não encontrada no app');
      req.flash("error", "Erro ao iniciar sessão: Socket.IO não disponível");
      return res.redirect(`/sessoes/${id}/participar`);
    }
    
    req.flash('success', 'Sessão iniciada com sucesso!');
    return res.redirect(`/sessoes/${id}/participar`);
  } catch (err) {
    console.error('Erro ao iniciar sessão:', err);
    req.flash("error", "Erro ao iniciar sessão: " + err.message);
    return res.redirect(`/sessoes/${req.params.id}/participar`);
  }
};

// Pausar sessão (apenas host)
const pausarSessao = async (req, res) => {
  try {
    const { id } = req.params;
    const sessao = await Sessao.findById(id);
    
    if (!sessao) {
      req.flash("error", "Sessão não encontrada");
      return res.redirect("/sessoes");
    }
    
    // Verificar se o usuário é o host
    if (!sessao.host.equals(req.user._id)) {
      req.flash("error", "Apenas o host pode pausar a sessão");
      return res.redirect(`/sessoes/${id}/participar`);
    }
    
    // Verificar se a sessão pode ser pausada
    if (sessao.status !== "ativa") {
      req.flash("error", "A sessão não pode ser pausada neste momento");
      return res.redirect(`/sessoes/${id}/participar`);
    }
    
    // Atualizar status da sessão
    sessao.status = "pausada";
    
    // Registrar ação no histórico (com verificação defensiva)
    if (!sessao.historicoAcoes) {
      sessao.historicoAcoes = [];
    }
    sessao.historicoAcoes.push({
      tipo: "pausa",
      executadoPor: req.user._id,
      detalhes: "Sessão pausada pelo host"
    });
    
    await sessao.save();
    
    // Emitir evento via socket para todos os participantes
    const io = req.app.get('io');
    if (io) {
      io.to(`sessao:${id}`).emit('sessaoPausada', { 
        mensagem: "A sessão foi pausada pelo host",
        status: 'pausada'
      });
      console.log(`Evento 'sessaoPausada' emitido para a sala sessao:${id}`);
    } else {
      console.error('Instância do Socket.IO não encontrada no app');
      req.flash("error", "Erro ao pausar sessão: Socket.IO não disponível");
      return res.redirect(`/sessoes/${id}/participar`);
    }
    
    req.flash('success', 'Sessão pausada com sucesso!');
    return res.redirect(`/sessoes/${id}/participar`);
  } catch (err) {
    console.error('Erro ao pausar sessão:', err);
    req.flash("error", "Erro ao pausar sessão: " + err.message);
    return res.redirect(`/sessoes/${req.params.id}/participar`);
  }
};

// Concluir sessão (apenas host)
const concluirSessao = async (req, res) => {
  try {
    const { id } = req.params;
    const sessao = await Sessao.findById(id);
    
    if (!sessao) {
      req.flash("error", "Sessão não encontrada");
      return res.redirect("/sessoes");
    }

    // Verificar se o usuário é o host
    if (!sessao.host.equals(req.user._id)) {
      req.flash("error", "Apenas o host pode concluir a sessão");
      return res.redirect(`/sessoes/${id}/participar`);
    }

    // 1. Atualizar participantes
    await User.updateMany(
      { _id: { $in: sessao.participantes } },
      {
        $addToSet: { sessoesParticipadas: sessao._id }, // Adiciona sessão à lista
        $inc: { "metricas.sessoesParticipadas": 1 }      // Incrementa contador
      }
    );

    // 2. Atualizar host (sessões criadas)
    await User.findByIdAndUpdate(
      sessao.host,
      { $inc: { "metricas.sessoesCriadas": 1 } }
    );

    // 3. Atualizar status da sessão
    sessao.status = "concluida";
    await sessao.save();
    
    // Emitir evento via socket para todos os participantes
    const io = req.app.get('io');
    if (io) {
      io.to(`sessao:${id}`).emit('sessaoConcluida', { 
        mensagem: "A sessão foi concluída pelo host",
        status: 'concluida'
      });
      console.log(`Evento 'sessaoConcluida' emitido para a sala sessao:${id}`);
    } else {
      console.error('Instância do Socket.IO não encontrada no app');
      req.flash("error", "Erro ao concluir sessão: Socket.IO não disponível");
      return res.redirect(`/sessoes/${id}/participar`);
    }

    req.flash('success', 'Sessão concluída com sucesso!');
    return res.redirect(`/sessoes/${id}/participar`);
  } catch (err) {
    console.error('Erro ao concluir sessão:', err);
    req.flash("error", "Erro ao concluir sessão: " + err.message);
    return res.redirect(`/sessoes/${req.params.id}/participar`);
  }
};

// Expulsar participante (apenas host)
const expulsarParticipante = async (req, res) => {
  try {
    const { id, participanteId } = req.params;
    const sessao = await Sessao.findById(id);
    
    if (!sessao) {
      return res.status(404).json({ success: false, message: "Sessão não encontrada" });
    }
    
    // Verificar se o usuário é o host
    if (!sessao.host.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: "Apenas o host pode expulsar participantes" });
    }
    
    // Verificar se o participante existe
    const participante = await User.findById(participanteId);
    if (!participante) {
      return res.status(404).json({ success: false, message: "Participante não encontrado" });
    }
    
    // Verificar se o participante não é o host
    if (participanteId === sessao.host.toString()) {
      return res.status(400).json({ success: false, message: "O host não pode ser expulso" });
    }
    
    // Remover participante da sessão
    sessao.participantes = sessao.participantes.filter(p => !p.equals(participanteId));
    
    // Registrar ação no histórico (com verificação defensiva)
    if (!sessao.historicoAcoes) {
      sessao.historicoAcoes = [];
    }
    sessao.historicoAcoes.push({
      tipo: "expulsao",
      executadoPor: req.user._id,
      detalhes: `Participante ${participante.nick || participante.nome} expulso da sessão`
    });
    
    await sessao.save();
    
    // Emitir evento via socket para todos os participantes
    const io = req.app.get('io');
    if (io) {
      io.to(`sessao:${id}`).emit('participanteExpulso', { 
        participanteId,
        participanteNome: participante.nick || participante.nome
      });
      console.log(`Evento 'participanteExpulso' emitido para a sala sessao:${id}`);
    } else {
      console.error('Instância do Socket.IO não encontrada no app');
    }
    
    // Resposta para AJAX (mantida para compatibilidade)
    return res.json({ 
      success: true, 
      message: `Participante ${participante.nick || participante.nome} expulso com sucesso` 
    });
  } catch (err) {
    console.error('Erro ao expulsar participante:', err);
    return res.status(500).json({ success: false, message: "Erro ao expulsar participante: " + err.message });
  }
};

// Submeter palavras para um nível
const submeterPalavras = async (req, res) => {
  try {
    const { id } = req.params;
    const { nivel, palavras } = req.body;
    
    const sessao = await Sessao.findById(id);
    
    if (!sessao) {
      return res.status(404).json({ success: false, message: "Sessão não encontrada" });
    }
    
    // Verificar se o usuário é participante
    const isParticipante = sessao.participantes.some(p => p.equals(req.user._id));
    
    if (!isParticipante) {
      return res.status(403).json({ success: false, message: "Você não é participante desta sessão" });
    }
    
    // Verificar se a sessão está ativa
    if (sessao.status !== "ativa") {
      return res.status(400).json({ success: false, message: "A sessão não está ativa" });
    }

    // Adicionar cada palavra como nova ideia
    const novasIdeias = palavras.map(palavra => ({
      texto: palavra,
      autor: req.user._id,
      timestamp: new Date()
    }));

    // Atualizar array de ideias usando operador MongoDB $push
    await Sessao.findByIdAndUpdate(
      id,
      {
        $push: { 
          ideias: { 
            $each: novasIdeias.filter(ideia => ideia.texto.trim().length > 0)
          } 
        }
      },
      { new: true }
    );

    return res.json({ 
      success: true, 
      message: "Palavras submetidas com sucesso",
      palavrasCount: novasIdeias.length
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Erro ao submeter palavras: " + err.message });
  }
};

export {
  listarSessoes,
  detalhesSessao,
  formCriarSessao,
  criarSessao,
  entrarSessao,
  participarSessao,
  iniciarSessao,
  pausarSessao,
  concluirSessao,
  expulsarParticipante,
  submeterPalavras
};

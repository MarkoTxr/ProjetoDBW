import express from "express";
import userLoggedIn from "../middlewares/userLoggedIn.js";
import { normalizarNiveis } from "../middlewares/sessaoMiddlewares.js";
import {
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
} from "../controllers/sessaoController.js";

const router = express.Router();

// Middleware para garantir que todas as rotas de sessão exigem autenticação
router.use("/sessoes", userLoggedIn);

// Rotas para visualização e gestão de sessões
router.get("/sessoes", listarSessoes);
router.get("/sessoes/criar", formCriarSessao);
router.post('/sessoes/criar', 
  userLoggedIn,
  normalizarNiveis, 
  criarSessao
);
router.post("/sessoes/entrar", entrarSessao);
router.get("/sessoes/:id/participar", participarSessao);

router.get("/sessoes/:id", detalhesSessao);
router.get("/sessoes/:id/participar", participarSessao);

// Rotas para ações do host (protegidas por verificação no controller)
router.post("/sessoes/:id/iniciar", iniciarSessao);
router.post("/sessoes/:id/pausar", pausarSessao);
router.post("/sessoes/:id/concluir", concluirSessao);
router.post("/sessoes/:id/expulsar/:participanteId", expulsarParticipante);

// Rota para submissão de palavras
router.post("/sessoes/:id/submeter-palavras", submeterPalavras);

export default router;

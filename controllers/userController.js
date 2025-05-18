/**
 * @file Controlador de utilizador: gestão de perfil e leaderboard.
 */

import User from "../models/user.js";
import fs from "fs";
import path from "path";

/**
 * Renderiza a página de perfil do utilizador autenticado.
 * 
 * @param {Request} req - Objeto da requisição Express.
 * @param {Response} res - Objeto da resposta Express.
 */
const profileGet = async (req, res) => {
  const user = req.user;
  res.render("profile", { user });
};

/**
 * Renderiza a página de edição de perfil.
 * 
 * @param {Request} req 
 * @param {Response} res 
 */
const profileEditGet = async (req, res) => {
  const user = req.user;
  res.render("edit-profile", { user });
};

/**
 * Processa a atualização do perfil, incluindo alteração de imagem e password.
 * 
 * @param {Request} req 
 * @param {Response} res 
 */
const profilePost = async (req, res) => {
  const { email, nick, nome, currentPassword, newPassword, confirmPassword } = req.body;
  const user = req.user;

  try {
    user.email = email;
    user.nick = nick;
    user.nome = nome;

    if (req.file) {
      if (user.imagemPerfil && user.imagemPerfil !== "/images/default-profile.png") {
        try {
          const oldImagePath = path.join("public", user.imagemPerfil);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        } catch (error) {
          console.error("Erro ao remover imagem antiga:", error);
        }
      }

      user.imagemPerfil = `/images/pfp/${req.file.filename}`;
    }

    if (newPassword && newPassword.trim() !== "") {
      if (newPassword !== confirmPassword) {
        req.flash("error", "As novas passwords não coincidem!");
        return res.redirect("/editar-perfil");
      }

      await user.changePassword(currentPassword, newPassword);
      req.flash("success", "Perfil e password atualizados com sucesso!");
    } else {
      await user.save();
      req.flash("success", "Perfil atualizado com sucesso!");
    }

    res.redirect("/profile");
  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/editar-perfil");
  }
};

/**
 * Renderiza a página de leaderboard (classificações).
 * 
 * @param {Request} req 
 * @param {Response} res 
 */
const leaderboardGet = async (req, res) => {
  try {
    res.render("leaderboard");
  } catch (err) {
    req.flash("error", "Erro ao carregar leaderboard");
    res.redirect("/");
  }
};

/**
 * Retorna dados paginados para o leaderboard, ordenados por métrica.
 * 
 * @param {Request} req 
 * @param {Response} res 
 * @returns {JSON} Dados do leaderboard com sucesso ou erro.
 */
const getLeaderboard = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const metrica = req.query.metrica || 'ideias';

    let sortField, projectFields;
    
    switch (metrica) {
      case 'ideias':
        sortField = 'metricas.ideiasContribuidas';
        projectFields = {
          nick: 1,
          metricas: 1,
          valorMetrica: '$metricas.ideiasContribuidas'
        };
        break;
      case 'sessoes':
        sortField = 'metricas.sessoesParticipadas';
        projectFields = {
          nick: 1,
          metricas: 1,
          valorMetrica: '$metricas.sessoesParticipadas'
        };
        break;
      default:
        return res.status(400).json({ 
          success: false,
          message: "Métrica inválida"
        });
    }

    const result = await User.aggregate([
      { $project: projectFields },
      { $sort: { [sortField]: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ]);

    const totalUsers = await User.countDocuments();

    res.status(200).json({
      success: true,
      data: result,
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      metrica: metrica
    });

  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: "Erro ao carregar leaderboard",
      error: err.message
    });
  }
};

export { 
  profileGet, 
  profileEditGet, 
  profilePost,
  leaderboardGet,
  getLeaderboard  
};

import User from "../models/user.js";
import fs from "fs";
import path from "path";

const profileGet = async (req, res) => {
  const user = req.user;
  console.log(user);
  res.render("profile", { user }); // Passa o user para a view
};

const profileEditGet = async (req, res) => {
  const user = req.user;
  res.render("edit-profile", { user });
};

const profilePost = async (req, res) => {
  const { email, nick, nome, currentPassword, newPassword, confirmPassword } = req.body;
  const user = req.user;

  try {
    // Atualizar dados básicos do perfil
    user.email = email;
    user.nick = nick;
    user.nome = nome;

    // Processar upload de imagem se existir
    if (req.file) {
      // Se já existir uma imagem de perfil que não seja a padrão, remover a antiga
      if (user.imagemPerfil && user.imagemPerfil !== "/images/default-profile.png") {
        try {
          // Extrair o caminho do ficheiro a partir do URL
          const oldImagePath = path.join("public", user.imagemPerfil);
          // Verificar se o ficheiro existe antes de tentar remover
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        } catch (error) {
          console.error("Erro ao remover imagem antiga:", error);
          // Continuar mesmo se houver erro ao remover a imagem antiga
        }
      }

      // Atualizar com o caminho da nova imagem
      user.imagemPerfil = `/images/pfp/${req.file.filename}`;
    }

    // Verificar se o utilizador quer alterar a password
    if (newPassword && newPassword.trim() !== "") {
      // Verificar se as novas passwords coincidem
      if (newPassword !== confirmPassword) {
        req.flash("error", "As novas passwords não coincidem!");
        return res.redirect("/editar-perfil");
      }

      // Verificar a password atual e alterar para a nova
      await user.changePassword(currentPassword, newPassword);
      req.flash("success", "Perfil e password atualizados com sucesso!");
    } else {
      // Guardar apenas as alterações do perfil sem alterar a password
      await user.save();
      req.flash("success", "Perfil atualizado com sucesso!");
    }

    res.redirect("/profile");
  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/editar-perfil");
  }
};

export { 
  profileGet, 
  profileEditGet, 
  profilePost 
};

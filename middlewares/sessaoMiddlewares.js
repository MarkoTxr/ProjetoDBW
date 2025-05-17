

export const normalizarNiveis = (req, res, next) => {
  if (!Array.isArray(req.body.niveis)) {
    req.body.niveis = [req.body.niveis];
  }
  next();
};

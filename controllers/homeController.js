import Book from "../models/book.js";

const getIndex = async function (req, res) {
    const books = await Book.find({}); //Encontra todos os livros na BD
    res.render("index", { info: books });
};

export { getIndex };

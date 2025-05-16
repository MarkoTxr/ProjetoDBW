import { mensagem, output } from "./ui.js";

const socket = io();

export function submitUserInputToServer() {
    if (mensagem.value) {
        socket.emit("chat", mensagem.value);
        mensagem.value = "";
    }
}

export function receiveFromServer() {
    socket.on("clientChat", function (paraCliente) {
        output.insertAdjacentHTML(
            "afterbegin",
            "ID: " +
                paraCliente.socketID +
                " <br>" +
                "Message: " +
                paraCliente.mensagem +
                " <br><br>"
        );
    });
}

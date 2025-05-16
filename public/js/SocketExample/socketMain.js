console.log("SocketMain.js loaded");
import { submitUserInputToServer, receiveFromServer } from "./socketHandler.js";

import { form } from "./ui.js";

form[0].addEventListener("submit", function (event) {
    // envia as mensagens do cliente para o servidor
    event.preventDefault();
    submitUserInputToServer();
});

receiveFromServer();

import mongoose from "mongoose";
import passportLocalMongoose from "passport-local-mongoose";

const Schema = mongoose.Schema;

const SessaoSchema = new Schema({
    tema: {
        type: String,
        required: "O tema da sessão é obrigatório",
        trim: true
    },
    codigoSala: {
        type: String,
        required: "O código da sala é obrigatório",
        unique: true,
        trim: true
    },
    criador: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    participantes: [{
        type: Schema.Types.ObjectId,
        ref: "User"
    }],
    ideias: [{
        type: Schema.Types.ObjectId,
        ref: "Ideia"
    }],
    // Exemplo de configuração de tempo, pode ser mais complexo
    configuracaoTempo: {
        nivel1_segundos: { type: Number, default: 10 },
        nivel2_segundos: { type: Number, default: 6 } // Exemplo, pode não ser usado
    },
    status: {
        type: String,
        enum: ["aguardando_inicio", "ativa", "pausada", "concluida"],
        default: "aguardando_inicio"
    },
    resultadoAI: {
        type: String, // Texto coerente gerado pela AI no final
        trim: true
    },
    salaProtegida: {
        type: Boolean,
        default: false
    },
    // passwordSala: String, // Apenas se salaProtegida for true e se optar por senha em vez de apenas código
}, { timestamps: true });


export default mongoose.model("Sessao", SessaoSchema); 
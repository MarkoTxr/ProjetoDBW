import mongoose from "mongoose";
import passportLocalMongoose from "passport-local-mongoose";

const Schema = mongoose.Schema;

const UserSchema = new Schema({
    nome: {
        type: String,
        required: [true, "O nome completo é obrigatório"],
        trim: true
    },
    nick: {
        type: String,
        required: [true, "O nickname é obrigatório"],
        unique: true,
        trim: true,
        minlength: [3, "Nickname deve ter pelo menos 3 caracteres"]
    },
    email: {
        type: String,
        required: [true, "O email é obrigatório"],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, "Por favor insira um email válido"]
    },
    metricas: {
        sessoesCriadas: { 
            type: Number, 
            default: 0 
        },
        ideiasContribuidas: { 
            type: Number, 
            default: 0 
        },
        sessoesParticipadas: { 
            type: Number, 
            default: 0 
        },
    },
    imagemPerfil: {
        type: String, 
        default: "/images/default-profile.png"
    },
    sessoesParticipadas: [{ 
        type: Schema.Types.ObjectId, 
        ref: "Sessao" 
    }],
    sessoesCriadasOwner: [{ 
        type: Schema.Types.ObjectId, 
        ref: "Sessao" 
    }]
}, { 
    timestamps: true 
});

// Configuração do passport-local-mongoose
UserSchema.plugin(passportLocalMongoose, {
    usernameField: "email",
    errorMessages: {
        UserExistsError: "Já existe um utilizador com este email"
    }
});

export default mongoose.model("User", UserSchema);
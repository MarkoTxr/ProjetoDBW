import mongoose from "mongoose";

const Schema = mongoose.Schema;

// Subdocumento para configuração de níveis
const NivelSchema = new Schema({
  ordem: {
    type: Number,
    required: [true, "A ordem do nível é obrigatória"],
    min: [1, "A ordem mínima é 1"],
  },
  segundos: {
    type: Number,
    required: [true, "A duração em segundos é obrigatória"],
    min: [5, "O tempo mínimo por nível é 5 segundos"],
    max: [300, "O tempo máximo por nível é 300 segundos (5 minutos)"],
  },
});

// Subdocumento para resultados da AI
const ResultadoAISchema = new Schema({
  texto: {
    type: String,
    required: [true, "O texto gerado pela AI é obrigatório"],
  },
  participante: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: [true, "O participante relacionado é obrigatório"],
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  nivel: {
    type: Number,
    required: [true, "O nível associado é obrigatório"],
  },
});

// Schema principal da sessão
const SessaoSchema = new Schema(
  {
    tema: {
      type: String,
      required: [true, "O tema da sessão é obrigatório"],
      trim: true,
      maxlength: [120, "O tema não pode exceder 120 caracteres"],
    },

    codigoSala: {
      type: String,
      required: [true, "O código da sala é obrigatório"],
      unique: {
        message: "Este código já está em uso",
      },
      trim: true,
      validate: {
        validator: (v) => /^[A-Z0-9-]{6,20}$/.test(v),
        message:
          "Formato inválido! Use apenas letras maiúsculas, números e hífens",
      },
    },
    host: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "O host da sessão é obrigatório"],
    },
    participantes: {
      type: [{
        type: Schema.Types.ObjectId,
        ref: "User"
      }],
      validate: {
        validator: function(participantes) {
          return participantes.length <= 50;
        },
        message: "Máximo de 50 participantes por sessão"
      }
    },
    ideias: [
      {
        type: Schema.Types.ObjectId,
        ref: "Ideia",
      },
    ],
    configuracaoNiveis: {
      type: [NivelSchema],
      required: [true, "A configuração de níveis é obrigatória"],
      validate: {
        validator: function (niveis) {
          const ordens = niveis.map((n) => n.ordem);
          return new Set(ordens).size === ordens.length; // Verifica ordens únicas
        },
        message: "Níveis devem ter ordens únicas",
      },
    },
    status: {
      type: String,
      enum: {
        values: ["aguardando_inicio", "ativa", "pausada", "concluida"],
        message: "Status inválido",
      },
      default: "aguardando_inicio",
    },
    resultadosAI: {
      type: [ResultadoAISchema],
      select: false, // 👈 Não retornar por padrão em queries
    },
    salaProtegida: {
      type: Boolean,
      default: false,
    },
    senhaSala: {
      type: String,
      validate: {
        validator: function (senha) {
          if (!this.salaProtegida) return true;
          return senha && senha.length >= 6;
        },
        message: "Senha deve ter pelo menos 6 caracteres para salas protegidas",
      },
    },
    historicoAcoes: {
      type: [
        {
          tipo: {
            type: String,
            enum: ["pausa", "reinicio", "expulsao"],
          },
          executadoPor: {
            type: Schema.Types.ObjectId,
            ref: "User",
          },
          timestamp: {
            type: Date,
            default: Date.now,
          },
          detalhes: String,
        },
      ],
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

SessaoSchema.virtual("tempoTotalEstimado").get(function () {
  return this.configuracaoNiveis.reduce(
    (acc, nivel) => acc + nivel.segundos,
    0
  );
});

export default mongoose.model("Sessao", SessaoSchema);

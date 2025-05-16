
import mongoose from "mongoose";
import { ServerApiVersion } from "mongodb"; 
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: "dbw_brainstorm"
    });
    
    console.log("✅ Conectado ao MongoDB Atlas");
    const ping = await mongoose.connection.db.admin().ping();
    console.log(`📊 Ping bem-sucedido: ${JSON.stringify(ping)}`);

  } catch (error) {
    console.error("❌ Falha na conexão:", error.message);
    process.exit(1);
  }
};


mongoose.connection.on("connected", () => console.log("🔗 Conexão estabelecida"));
mongoose.connection.on("error", (err) => console.error("🔥 Erro:", err));
mongoose.connection.on("disconnected", () => console.log("⚠️  Conexão perdida"));

export default connectDB;
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

interface Planilla {
  id: string;
  nombre: string;
  fechaExcel: string;
  fechaCreacion: string;
  creadoPor: string;
  creadoPorEmail: string;
  archivoNombre: string;
  locales: string[];
  productos: any;
  saboresCategorizados: any;
}

interface Despacho {
  id: string;
  planillaId: string;
  nombreDespacho: string;
  fechaExcel: string;
  fechaCreacion: string;
  creadoPor: string;
  creadoPorEmail: string;
  localesSeleccionados: string[];
  empanadas?: any;
  pastelitos?: any;
  pizzas?: any;
  carrosExclusivos?: any;
  carrosCompartidos?: any;
  totales?: any;
  margenesConfig?: any;
}

interface DatabaseSchema {
  planillas: Planilla[];
  despachos: Despacho[];
  adminPin: string;
}

// 1. Setup persistent file path (Support Render Persistent Disk)
const dataDir = fs.existsSync("/data") ? "/data" : ".";
const dbPath = path.join(dataDir, "db.json");

// Define a stable helper to load and save database synchronous
function getDb(): DatabaseSchema {
  const defaultDb: DatabaseSchema = {
    planillas: [],
    despachos: [],
    adminPin: process.env.ADMIN_PIN || "1234",
  };

  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify(defaultDb, null, 2), "utf-8");
      return defaultDb;
    }
    const raw = fs.readFileSync(dbPath, "utf-8");
    const data = JSON.parse(raw) as DatabaseSchema;
    // Ensure structure is correct
    if (!Array.isArray(data.planillas)) data.planillas = [];
    if (!Array.isArray(data.despachos)) data.despachos = [];
    if (!data.adminPin) data.adminPin = process.env.ADMIN_PIN || "1234";
    return data;
  } catch (error) {
    console.error("Error reading database file, returning defaults:", error);
    return defaultDb;
  }
}

function saveDb(data: DatabaseSchema): void {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing database file:", error);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to support large JSON body uploads (from spreadsheet objects)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Initialize DB immediately
  getDb();

  // API Endpoints: Auth
  app.post("/api/auth/verify-pin", (req, res) => {
    const { pin } = req.body;
    const db = getDb();
    if (!pin) {
      res.status(400).json({ error: "PIN no ingresado." });
      return;
    }
    const isValid = db.adminPin === String(pin);
    if (isValid) {
      res.json({ success: true, message: "PIN verificado correctamente." });
    } else {
      res.status(401).json({ success: false, error: "El PIN ingresado es incorrecto." });
    }
  });

  app.post("/api/auth/change-pin", (req, res) => {
    const { currentPin, newPin } = req.body;
    const db = getDb();
    if (db.adminPin !== String(currentPin)) {
      res.status(401).json({ error: "El PIN actual es incorrecto." });
      return;
    }
    if (!newPin || String(newPin).length < 4) {
      res.status(400).json({ error: "El nuevo PIN debe tener al menos 4 caracteres." });
      return;
    }
    db.adminPin = String(newPin);
    saveDb(db);
    res.json({ success: true, message: "PIN de administrador cambiado con éxito." });
  });

  // API Endpoints: Planillas (Spreadsheets)
  app.get("/api/planillas", (req, res) => {
    const db = getDb();
    res.json(db.planillas);
  });

  app.post("/api/planillas", (req, res) => {
    const { id, nombre, fechaExcel, fechaCreacion, creadoPor, creadoPorEmail, archivoNombre, locales, productos, saboresCategorizados } = req.body;
    if (!id || !nombre) {
      res.status(400).json({ error: "Faltan campos obligatorios para guardar la planilla." });
      return;
    }
    const db = getDb();
    // Delete existing with same id if any, then insert
    db.planillas = db.planillas.filter(p => p.id !== id);
    db.planillas.unshift({
      id,
      nombre,
      fechaExcel,
      fechaCreacion,
      creadoPor,
      creadoPorEmail,
      archivoNombre,
      locales,
      productos,
      saboresCategorizados,
    });
    saveDb(db);
    res.json({ success: true, message: "Planilla guardada correctamente." });
  });

  app.delete("/api/planillas/:id", (req, res) => {
    const { id } = req.params;
    const db = getDb();
    db.planillas = db.planillas.filter(p => p.id !== id);
    saveDb(db);
    res.json({ success: true, message: "Planilla eliminada." });
  });

  // API Endpoints: Despachos
  app.get("/api/despachos", (req, res) => {
    const db = getDb();
    res.json(db.despachos);
  });

  app.post("/api/despachos", (req, res) => {
    const despacho = req.body;
    if (!despacho.id || !despacho.planillaId) {
      res.status(400).json({ error: "Faltan campos obligatorios para guardar el despacho." });
      return;
    }
    const db = getDb();
    db.despachos = db.despachos.filter(d => d.id !== despacho.id);
    db.despachos.unshift(despacho);
    saveDb(db);
    res.json({ success: true, message: "Despacho guardado correctamente." });
  });

  app.delete("/api/despachos/:id", (req, res) => {
    const { id } = req.params;
    const db = getDb();
    db.despachos = db.despachos.filter(d => d.id !== id);
    saveDb(db);
    res.json({ success: true, message: "Despacho archivado eliminado." });
  });

  // API Endpoints: Full Database backup export and restore
  app.get("/api/backup/export", (req, res) => {
    const db = getDb();
    res.json(db);
  });

  app.post("/api/backup/import", (req, res) => {
    const backup = req.body;
    if (!backup || !Array.isArray(backup.planillas) || !Array.isArray(backup.despachos)) {
      res.status(400).json({ error: "Formato de respaldo inválido." });
      return;
    }
    const db = getDb();
    db.planillas = backup.planillas;
    db.despachos = backup.despachos;
    if (backup.adminPin) {
      db.adminPin = backup.adminPin;
    }
    saveDb(db);
    res.json({ success: true, message: "Copia de seguridad restaurada correctamente." });
  });

  // Vite middleware setup for Development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Storing local files at database path: ${dbPath}`);
  });
}

startServer();

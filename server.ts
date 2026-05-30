import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import pg from "pg"; // <-- Reemplazamos 'fs' por el cliente de PostgreSQL

const { Pool } = pg;

// 1. Inicialización del Pool de conexiones a Neon usando la variable de Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Obligatorio para la conexión segura con Neon
  }
});

// Función auxiliar para asegurarse de que las tablas existan en Neon al arrancar
async function inicializarBaseDeDatos() {
  try {
    // Crear tabla de planillas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS planillas (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        fecha_excel TEXT,
        fecha_creacion TEXT,
        creado_por TEXT,
        creado_por_email TEXT,
        archivo_nombre TEXT,
        locales JSONB,
        productos JSONB,
        sabores_categorizados JSONB
      );
    `);

    // Crear tabla de despachos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS despachos (
        id TEXT PRIMARY KEY,
        planilla_id TEXT REFERENCES planillas(id) ON DELETE CASCADE,
        nombre_despacho TEXT,
        fecha_excel TEXT,
        fecha_creacion TEXT,
        creado_por TEXT,
        creado_por_email TEXT,
        locales_seleccionados JSONB,
        empanadas JSONB,
        pastelitos JSONB,
        pizzas JSONB,
        carros_exclusivos JSONB,
        carros_compartidos JSONB,
        totales JSONB,
        margenes_config JSONB
      );
    `);

    // Crear tabla de configuración global (para el PIN de administrador)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS config_global (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      );
    `);

    // Insertar PIN por defecto si no existe
    const pinPorDefecto = process.env.ADMIN_PIN || "1234";
    await pool.query(`
      INSERT INTO config_global (clave, valor) 
      VALUES ('adminPin', $1) 
      ON CONFLICT (clave) DO NOTHING;
    `, [pinPorDefecto]);

    console.log("🔒 Tablas verificadas y listas en Neon PostgreSQL.");
  } catch (error) {
    console.error("❌ Error al inicializar las tablas en Neon:", error);
  }
}

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

async function startServer() {
  const app = express();
  // Render define el puerto dinámicamente mediante la variable PORT
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Ejecutar la creación de tablas de forma asíncrona en Neon
  await inicializarBaseDeDatos();

  // API Endpoints: Auth
  app.post("/api/auth/verify-pin", async (req, res) => {
    const { pin } = req.body;
    if (!pin) {
      res.status(400).json({ error: "PIN no ingresado." });
      return;
    }
    try {
      const resultado = await pool.query("SELECT valor FROM config_global WHERE clave = 'adminPin'");
      const dbPin = resultado.rows[0]?.valor || process.env.ADMIN_PIN || "1234";
      
      if (dbPin === String(pin)) {
        res.json({ success: true, message: "PIN verificado correctamente." });
      } else {
        res.status(401).json({ success: false, error: "El PIN ingresado es incorrecto." });
      }
    } catch (error) {
      res.status(500).json({ error: "Error en el servidor de base de datos." });
    }
  });

  app.post("/api/auth/change-pin", async (req, res) => {
    const { currentPin, newPin } = req.body;
    try {
      const resultado = await pool.query("SELECT valor FROM config_global WHERE clave = 'adminPin'");
      const dbPin = resultado.rows[0]?.valor || process.env.ADMIN_PIN || "1234";

      if (dbPin !== String(currentPin)) {
        res.status(401).json({ error: "El PIN actual es incorrecto." });
        return;
      }
      if (!newPin || String(newPin).length < 4) {
        res.status(400).json({ error: "El nuevo PIN debe tener al menos 4 caracteres." });
        return;
      }

      await pool.query("UPDATE config_global SET valor = $1 WHERE clave = 'adminPin'", [String(newPin)]);
      res.json({ success: true, message: "PIN de administrador cambiado con éxito." });
    } catch (error) {
      res.status(500).json({ error: "Error al actualizar el PIN." });
    }
  });

  // API Endpoints: Planillas (Spreadsheets)
  app.get("/api/planillas", async (req, res) => {
    try {
      const resultado = await pool.query("SELECT * FROM planillas ORDER BY fecha_creacion DESC");
      
      // Mapeamos los nombres snake_case de Postgres al formato CamelCase de tus interfaces de TypeScript
      const planillas: Planilla[] = resultado.rows.map(row => ({
        id: row.id,
        nombre: row.nombre,
        fechaExcel: row.fecha_excel,
        fechaCreacion: row.fecha_creacion,
        creadoPor: row.creado_por,
        creadoPorEmail: row.creado_por_email,
        archivoNombre: row.archivo_nombre,
        locales: row.locales,
        productos: row.productos,
        saboresCategorizados: row.sabores_categorizados
      }));
      
      res.json(planillas);
    } catch (error) {
      res.status(500).json({ error: "Error al obtener las planillas." });
    }
  });

  app.post("/api/planillas", async (req, res) => {
    const { id, nombre, fechaExcel, fechaCreacion, creadoPor, creadoPorEmail, archivoNombre, locales, productos, saboresCategorizados } = req.body;
    if (!id || !nombre) {
      res.status(400).json({ error: "Faltan campos obligatorios para guardar la planilla." });
      return;
    }
    try {
      // El operador ON CONFLICT hace el trabajo de borrar/actualizar si ya existía el ID (Upsert)
      const query = `
        INSERT INTO planillas (id, nombre, fecha_excel, fecha_creacion, creado_por, creado_por_email, archivo_nombre, locales, productos, sabores_categorizados)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          fecha_excel = EXCLUDED.fecha_excel,
          fecha_creacion = EXCLUDED.fecha_creacion,
          creado_por = EXCLUDED.creado_por,
          creado_por_email = EXCLUDED.creado_por_email,
          archivo_nombre = EXCLUDED.archivo_nombre,
          locales = EXCLUDED.locales,
          productos = EXCLUDED.productos,
          sabores_categorizados = EXCLUDED.sabores_categorizados;
      `;
      
      await pool.query(query, [
        id, nombre, fechaExcel, fechaCreacion, creadoPor, creadoPorEmail, archivoNombre,
        JSON.stringify(locales), JSON.stringify(productos), JSON.stringify(saboresCategorizados)
      ]);
      
      res.json({ success: true, message: "Planilla guardada correctamente en Neon." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error al guardar la planilla." });
    }
  });

  app.delete("/api/planillas/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query("DELETE FROM planillas WHERE id = $1", [id]);
      res.json({ success: true, message: "Planilla eliminada." });
    } catch (error) {
      res.status(500).json({ error: "Error al eliminar la planilla." });
    }
  });

  // API Endpoints: Despachos
  app.get("/api/despachos", async (req, res) => {
    try {
      const resultado = await pool.query("SELECT * FROM despachos ORDER BY fecha_creacion DESC");
      
      const despachos: Despacho[] = resultado.rows.map(row => ({
        id: row.id,
        planillaId: row.planilla_id,
        nombreDespacho: row.nombre_despacho,
        fechaExcel: row.fecha_excel,
        fechaCreacion: row.fecha_creacion,
        creadoPor: row.creado_por,
        creadoPorEmail: row.creado_por_email,
        localesSeleccionados: row.locales_seleccionados,
        empanadas: row.empanadas,
        pastelitos: row.pastelitos,
        pizzas: row.pizzas,
        carrosExclusivos: row.carros_exclusivos,
        carrosCompartidos: row.carros_compartidos,
        totales: row.totales,
        margenesConfig: row.margenes_config
      }));
      
      res.json(despachos);
    } catch (error) {
      res.status(500).json({ error: "Error al obtener los despachos." });
    }
  });

  app.post("/api/despachos", async (req, res) => {
    const d = req.body;
    if (!d.id || !d.planillaId) {
      res.status(400).json({ error: "Faltan campos obligatorios para guardar el despacho." });
      return;
    }
    try {
      const query = `
        INSERT INTO despachos (id, planilla_id, nombre_despacho, fecha_excel, fecha_creacion, creado_por, creado_por_email, locales_seleccionados, empanadas, pastelitos, pizzas, carros_exclusivos, carros_compartidos, totales, margenes_config)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          planilla_id = EXCLUDED.planilla_id,
          nombre_despacho = EXCLUDED.nombre_despacho,
          fecha_excel = EXCLUDED.fecha_excel,
          fecha_creacion = EXCLUDED.fecha_creacion,
          creado_por = EXCLUDED.creado_por,
          creado_por_email = EXCLUDED.creado_por_email,
          locales_seleccionados = EXCLUDED.locales_seleccionados,
          empanadas = EXCLUDED.empanadas,
          pastelitos = EXCLUDED.pastelitos,
          pizzas = EXCLUDED.pizzas,
          carros_exclusivos = EXCLUDED.carros_exclusivos,
          carros_compartidos = EXCLUDED.carros_compartidos,
          totales = EXCLUDED.totales,
          margenes_config = EXCLUDED.margenes_config;
      `;

      await pool.query(query, [
        d.id, d.planillaId, d.nombreDespacho, d.fechaExcel, d.fechaCreacion, d.creadoPor, d.creadoPorEmail,
        JSON.stringify(d.localesSeleccionados), JSON.stringify(d.empanadas), JSON.stringify(d.pastelitos),
        JSON.stringify(d.pizzas), JSON.stringify(d.carrosExclusivos), JSON.stringify(d.carrosCompartidos),
        JSON.stringify(d.totales), JSON.stringify(d.margenesConfig)
      ]);

      res.json({ success: true, message: "Despacho guardado correctamente." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error al guardar el despacho." });
    }
  });

  app.delete("/api/despachos/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await pool.query("DELETE FROM despachos WHERE id = $1", [id]);
      res.json({ success: true, message: "Despacho archivado eliminado." });
    } catch (error) {
      res.status(500).json({ error: "Error al eliminar el despacho." });
    }
  });

  // API Endpoints: Copias de seguridad completas (Mantenemos la compatibilidad)
  app.get("/api/backup/export", async (req, res) => {
    try {
      const planillasRes = await pool.query("SELECT * FROM planillas");
      const despachosRes = await pool.query("SELECT * FROM despachos");
      const pinRes = await pool.query("SELECT valor FROM config_global WHERE clave = 'adminPin'");

      // Transformación estructural inversa para exportación limpia
      const planillas = planillasRes.rows.map(row => ({
        id: row.id, nombre: row.nombre, fechaExcel: row.fecha_excel, fechaCreacion: row.fecha_creacion,
        creadoPor: row.creado_por, creadoPorEmail: row.creado_por_email, archivoNombre: row.archivo_nombre,
        locales: row.locales, productos: row.productos, saboresCategorizados: row.sabores_categorizados
      }));

      const despachos = despachosRes.rows.map(row => ({
        id: row.id, planillaId: row.planilla_id, nombreDespacho: row.nombre_despacho, fechaExcel: row.fecha_excel,
        fechaCreacion: row.fecha_creacion, creadoPor: row.creado_por, creadoPorEmail: row.creado_por_email,
        localesSeleccionados: row.locales_seleccionados, empanadas: row.empanadas, pastelitos: row.pastelitos,
        pizzas: row.pizzas, carrosExclusivos: row.carros_exclusivos, carrosCompartidos: row.carros_compartidos,
        totales: row.totales, margenesConfig: row.margenes_config
      }));

      res.json({
        planillas,
        despachos,
        adminPin: pinRes.rows[0]?.valor || "1234"
      });
    } catch (error) {
      res.status(500).json({ error: "Error al exportar copia de seguridad." });
    }
  });

  app.post("/api/backup/import", async (req, res) => {
    const backup = req.body;
    if (!backup || !Array.isArray(backup.planillas) || !Array.isArray(backup.despachos)) {
      res.status(400).json({ error: "Formato de respaldo inválido." });
      return;
    }
    
    try {
      // Limpiamos datos actuales de forma controlada
      await pool.query("BEGIN");
      await pool.query("TRUNCATE TABLE despachos, planillas RESTART IDENTITY CASCADE;");

      // Importar Planillas
      for (const p of backup.planillas) {
        await pool.query(`
          INSERT INTO planillas (id, nombre, fecha_excel, fecha_creacion, creado_por, creado_por_email, archivo_nombre, locales, productos, sabores_categorizados)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [p.id, p.nombre, p.fechaExcel, p.fechaCreacion, p.creadoPor, p.creadoPorEmail, p.archivoNombre, JSON.stringify(p.locales), JSON.stringify(p.productos), JSON.stringify(p.saboresCategorizados)]);
      }

      // Importar Despachos
      for (const d of backup.despachos) {
        await pool.query(`
          INSERT INTO despachos (id, planilla_id, nombre_despacho, fecha_excel, fecha_creacion, creado_por, creado_por_email, locales_seleccionados, empanadas, pastelitos, pizzas, carros_exclusivos, carros_compartidos, totales, margenes_config)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [d.id, d.planillaId, d.nombreDespacho, d.fechaExcel, d.fechaCreacion, d.creadoPor, d.creadoPorEmail, JSON.stringify(d.localesSeleccionados), JSON.stringify(d.empanadas), JSON.stringify(d.pastelitos), JSON.stringify(d.pizzas), JSON.stringify(d.carrosExclusivos), JSON.stringify(d.carrosCompartidos), JSON.stringify(d.totales), JSON.stringify(d.margenesConfig)]);
      }

      if (backup.adminPin) {
        await pool.query("INSERT INTO config_global (clave, valor) VALUES ('adminPin', $1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor", [String(backup.adminPin)]);
      }

      await pool.query("COMMIT");
      res.json({ success: true, message: "Copia de seguridad restaurada correctamente en la nube." });
    } catch (error) {
      await pool.query("ROLLBACK");
      console.error(error);
      res.status(500).json({ error: "Fallo crítico al importar copia de seguridad." });
    }
  });

  // Configuración del Frontend / Entorno de compilación (Vite vs Dist)
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

  // Escuchamos en el puerto asignado por Render en el host de red universal (0.0.0.0)
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor en producción corriendo en el puerto: ${PORT}`);
  });
}

startServer();

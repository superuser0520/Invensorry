import express from "express";
console.log("Server process starting at " + new Date().toISOString());
import { sql } from "@vercel/postgres";
import { Resend } from "resend";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Handle unhandled rejections and exceptions to prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

if (!process.env.POSTGRES_URL) {
  console.warn("POSTGRES_URL is missing. Database operations will fail. Please set it in the AI Studio Secrets panel.");
} else if (process.env.POSTGRES_URL.includes("sslmode=require")) {
  console.warn("SECURITY WARNING: Using 'sslmode=require' is deprecated for future 'pg' versions. Consider using 'sslmode=verify-full' for better security.");
}

const app = express();
const PORT = 3000;

app.use(express.json());

// Middleware to check for database connection
const checkDb = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!process.env.POSTGRES_URL && req.path.startsWith('/api/') && req.path !== '/api/health' && req.path !== '/api/init-db') {
    return res.status(503).json({ error: "Database not configured. Please set POSTGRES_URL in Secrets." });
  }
  next();
};

app.use(checkDb);

// Initialize Resend
let resend: Resend | null = null;
function getResend() {
  if (!resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY environment variable is required");
    }
    resend = new Resend(key);
  }
  return resend;
}

// API Routes

// Health check
app.get("/api/health", async (req, res) => {
  const hasPostgres = !!process.env.POSTGRES_URL;
  const hasResend = !!process.env.RESEND_API_KEY;
  const isDeprecatedSsl = process.env.POSTGRES_URL?.includes("sslmode=require") || false;
  res.json({ 
    status: "ok", 
    config: { 
      postgres: hasPostgres, 
      resend: hasResend,
      isDeprecatedSsl
    } 
  });
});

// Initialize database table
app.post("/api/init-db", async (req, res) => {
  try {
    console.log("Initializing database... POSTGRES_URL present:", !!process.env.POSTGRES_URL);
    
    if (!process.env.POSTGRES_URL) {
      console.warn("POSTGRES_URL is missing. Database operations will fail.");
      return res.status(500).json({ error: "POSTGRES_URL is missing" });
    }
    
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS inv_items (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          category VARCHAR(255) NOT NULL,
          status VARCHAR(50) NOT NULL
        );
      `;
      console.log("Inventory table checked/created");
    } catch (e) {
      console.error("Error creating inventory table:", e);
    }

    try {
      await sql`
        CREATE TABLE IF NOT EXISTS inv_settings (
          key VARCHAR(255) PRIMARY KEY,
          value VARCHAR(255) NOT NULL
        );
      `;
      console.log("Settings table checked/created");
    } catch (e) {
      console.error("Error creating settings table:", e);
    }

    try {
      await sql`
        CREATE TABLE IF NOT EXISTS inv_orders (
          id VARCHAR(255) PRIMARY KEY,
          "itemName" VARCHAR(255) NOT NULL,
          "itemId" VARCHAR(255) NOT NULL,
          date VARCHAR(255) NOT NULL,
          status VARCHAR(50) NOT NULL,
          "supplierName" VARCHAR(255),
          cost NUMERIC
        );
      `;
      console.log("Orders table checked/created");
    } catch (e) {
      console.error("Error creating orders table:", e);
    }

    res.json({ message: "Database initialization attempt completed" });
  } catch (error) {
    console.error("Database initialization error (outer):", error);
    res.status(500).json({ error: "Failed to initialize database" });
  }
});

// Get inventory
app.get("/api/inventory", async (req, res) => {
  try {
    console.log("Fetching inventory...");
    const { rows } = await sql`SELECT * FROM inv_items`;
    console.log(`Fetched ${rows.length} items`);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).json({ error: "Failed to fetch inventory" });
  }
});

// Add inventory item
app.post("/api/inventory", async (req, res) => {
  try {
    const { id, name, category, status } = req.body;
    console.log(`Adding/Updating item: ${id} (${name})`);
    await sql`
      INSERT INTO inv_items (id, name, category, status)
      VALUES (${id}, ${name}, ${category}, ${status})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        status = EXCLUDED.status;
    `;
    res.json({ message: "Item added/updated successfully" });
  } catch (error) {
    console.error("Error adding item:", error);
    res.status(500).json({ error: "Failed to add item" });
  }
});

// Delete inventory item
app.delete("/api/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await sql`DELETE FROM inv_items WHERE id = ${id}`;
    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

// Get settings
app.get("/api/settings", async (req, res) => {
  try {
    const { rows } = await sql`SELECT * FROM inv_settings`;
    const settings = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    res.json(settings);
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// Update setting
app.post("/api/settings", async (req, res) => {
  try {
    const { key, value } = req.body;
    console.log(`Updating setting: ${key} = ${value}`);
    await sql`
      INSERT INTO inv_settings (key, value)
      VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    `;
    res.json({ message: "Setting updated successfully" });
  } catch (error) {
    console.error("Error updating setting:", error);
    res.status(500).json({ error: "Failed to update setting" });
  }
});

// Get orders
app.get("/api/orders", async (req, res) => {
  try {
    console.log("Fetching orders...");
    const { rows } = await sql`SELECT * FROM inv_orders ORDER BY date DESC LIMIT 3`;
    console.log(`Fetched ${rows.length} orders`);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// Add order
app.post("/api/orders", async (req, res) => {
  try {
    const { id, itemName, itemId, date, status, supplierName, cost } = req.body;
    console.log(`Adding order: ${id} for ${itemName}`);
    await sql`
      INSERT INTO inv_orders (id, "itemName", "itemId", date, status, "supplierName", cost)
      VALUES (${id}, ${itemName}, ${itemId}, ${date}, ${status}, ${supplierName}, ${cost})
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;
    `;
    res.json({ message: "Order added/updated successfully" });
  } catch (error) {
    console.error("Error adding order:", error);
    res.status(500).json({ error: "Failed to add order" });
  }
});

// Send email report
app.post("/api/send-report", async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    
    const resendClient = getResend();
    
    const data = await resendClient.emails.send({
      from: "InvenSorry <onboarding@resend.dev>",
      to: [to],
      subject: subject,
      html: html,
    });

    res.json({ message: "Email sent successfully", data });
  } catch (error: any) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: error.message || "Failed to send email" });
  }
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "An unexpected server error occurred" });
});

async function startServer() {
  try {
    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
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
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Critical error during server startup:", error);
    process.exit(1);
  }
}

startServer().catch(err => {
  console.error("Failed to start server (outer):", err);
  process.exit(1);
});

export default app;

import express from "express";
console.log("Server process starting at " + new Date().toISOString());
import { sql } from "@vercel/postgres";
import { Resend } from "resend";
import cron from "node-cron";
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

if (!process.env.RESEND_API_KEY) {
  console.warn("RESEND_API_KEY is missing. Email alerts and test emails will not function. Please set it in the AI Studio Secrets panel.");
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

// Scheduled Weekly Report (Monday 8 AM)
cron.schedule("0 8 * * 1", async () => {
  console.log("Running scheduled weekly low stock report...");
  try {
    if (!process.env.POSTGRES_URL || !process.env.RESEND_API_KEY) {
      console.warn("Skipping scheduled report: Database or Email service not configured.");
      return;
    }

    // Fetch low stock items
    const { rows: lowStockItems } = await sql`SELECT * FROM inv_items WHERE status = 'Low Stock'`;
    
    // Fetch admin email
    const { rows: settings } = await sql`SELECT value FROM inv_settings WHERE key = 'adminEmail'`;
    const adminEmail = settings[0]?.value;

    if (lowStockItems.length > 0 && adminEmail) {
      const dateStr = new Date().toLocaleDateString();
      const emailHtml = `
        <div style="font-family: sans-serif; border: 1px solid #e2e8f0; padding: 20px; max-width: 600px;">
          <div style="background-color: #0055A4; padding: 15px; text-align: center; margin-bottom: 20px;">
            <h1 style="color: white; margin: 0; text-transform: uppercase; letter-spacing: 3px; font-size: 20px; font-style: italic;">Invensorry Control</h1>
            <p style="color: rgba(255,255,255,0.7); margin: 5px 0 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 2px;">Precision Engineering Ecosystem</p>
          </div>
          <h2 style="color: #0f172a; text-transform: uppercase; letter-spacing: 1px; font-size: 16px;">Weekly Low Stock Telemetry</h2>
          <p style="color: #64748b; font-size: 14px;">The following items are currently marked as <strong>Low Stock</strong> as of ${dateStr}:</p>
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px; border: 1px solid #e2e8f0;">
            <thead>
              <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                <th style="text-align: left; padding: 12px; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 1px;">ID</th>
                <th style="text-align: left; padding: 12px; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 1px;">Description</th>
                <th style="text-align: left; padding: 12px; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 1px;">Category</th>
              </tr>
            </thead>
            <tbody>
              ${lowStockItems.map(i => `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 12px; font-size: 13px; font-family: monospace; color: #0055A4; font-weight: bold;">${i.id}</td>
                  <td style="padding: 12px; font-size: 13px; color: #0f172a;">${i.name}</td>
                  <td style="padding: 12px; font-size: 13px; color: #64748b;">${i.category}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Shimano Style Precision Inventory Control - Automated System</p>
          </div>
        </div>
      `;

      const resendClient = getResend();
      await resendClient.emails.send({
        from: "InvenSorry <onboarding@resend.dev>",
        to: [adminEmail],
        subject: `Weekly Low Stock Report - ${dateStr}`,
        html: emailHtml,
      });
      console.log("Scheduled weekly report sent successfully.");
    } else {
      console.log("No low stock items or admin email found. Skipping report.");
    }
  } catch (error) {
    console.error("Error running scheduled report:", error);
  }
});

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

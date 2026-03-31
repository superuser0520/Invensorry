import express from "express";
import http from "http";
import { Server } from "socket.io";
console.log("Server process starting at " + new Date().toISOString());
import { sql } from "@vercel/postgres";

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
const httpServer = http.createServer(app);
const io = new Server(httpServer);

io.on("connection", (socket) => {
  console.log("A user connected");
  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

const PORT = 3000;

app.use(express.json());

// Simple in-memory rate limiter to prevent repetitive submissions
const requestCounts = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds
const MAX_REQUESTS_PER_WINDOW = 5;

app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    
    let record = requestCounts.get(ip);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
      requestCounts.set(ip, record);
    } else {
      record.count++;
      if (record.count > MAX_REQUESTS_PER_WINDOW) {
        return res.status(429).json({ error: "Too many requests, please try again later." });
      }
    }
  }
  next();
});

// Middleware to check for database connection
const checkDb = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!process.env.POSTGRES_URL && req.path.startsWith('/api/') && req.path !== '/api/health' && req.path !== '/api/init-db') {
    return res.status(503).json({ error: "Database not configured. Please set POSTGRES_URL in Secrets." });
  }
  next();
};

app.use(checkDb);

// Initialize Resend
// Resend functionality removed

// Scheduled Weekly Report (Monday 8 AM)
// Weekly report functionality removed

// API Routes

// Health check
app.get("/api/health", async (req, res) => {
  const hasPostgres = !!process.env.POSTGRES_URL;
  const isDeprecatedSsl = process.env.POSTGRES_URL?.includes("sslmode=require") || false;
  res.json({ 
    status: "ok", 
    config: { 
      postgres: hasPostgres, 
    },
    isDeprecatedSsl
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
        CREATE TABLE IF NOT EXISTS inv_price_reference (
          "itemId" VARCHAR(255) NOT NULL,
          "supplierName" VARCHAR(255) NOT NULL,
          price NUMERIC NOT NULL,
          PRIMARY KEY ("itemId", "supplierName")
        );
      `;
      console.log("Price reference table checked/created");
    } catch (e) {
      console.error("Error creating price reference table:", e);
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

    try {
      await sql`
        CREATE TABLE IF NOT EXISTS inv_suppliers (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL
        );
      `;
      console.log("Suppliers table checked/created");
    } catch (e) {
      console.error("Error creating suppliers table:", e);
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
    io.emit('inventory-updated');
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
    io.emit('inventory-updated');
    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

// Bulk delete inventory items
app.post("/api/inventory/bulk-delete", async (req, res) => {
  try {
    const { ids } = req.body;
    if (Array.isArray(ids) && ids.length > 0) {
      for (const id of ids) {
        await sql`DELETE FROM inv_items WHERE id = ${id}`;
      }
    }
    io.emit('inventory-updated');
    res.json({ message: "Items deleted successfully" });
  } catch (error) {
    console.error("Error bulk deleting items:", error);
    res.status(500).json({ error: "Failed to delete items" });
  }
});

app.post("/api/inventory/bulk-add", async (req, res) => {
  try {
    const { items } = req.body;
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        await sql`
          INSERT INTO inv_items (id, name, status, category)
          VALUES (${item.id}, ${item.name}, ${item.status}, ${item.category})
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            category = EXCLUDED.category
        `;
      }
    }
    res.json({ message: "Items added successfully" });
  } catch (error) {
    console.error("Error bulk adding items:", error);
    res.status(500).json({ error: "Failed to add items" });
  }
});

// Quick Report Endpoint (Fast QR Scan)
app.get("/api/quick-report/:id", async (req, res) => {
  try {
    const { id } = req.params;
    res.redirect(`/?scan=${id}`);
  } catch (error) {
    console.error("Quick report error:", error);
    res.status(500).send("An error occurred.");
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
    const { rows } = await sql`SELECT * FROM inv_orders ORDER BY date DESC`;
    console.log(`Fetched ${rows.length} orders`);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

// API for Power Automate to retrieve inventory and orders
app.get("/api/power-automate/data", async (req, res) => {
  try {
    console.log("Fetching data for Power Automate...");
    const { rows: inventory } = await sql`SELECT * FROM inv_items`;
    const { rows: orders } = await sql`SELECT * FROM inv_orders ORDER BY date DESC`;
    res.json({ inventory, orders });
  } catch (error) {
    console.error("Error fetching data for Power Automate:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// Delete order
app.delete("/api/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Deleting order: ${id}`);
    await sql`DELETE FROM inv_orders WHERE id = ${id}`;
    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ error: "Failed to delete order" });
  }
});

// Bulk delete orders
app.post("/api/orders/bulk-delete", async (req, res) => {
  try {
    const { ids } = req.body;
    if (Array.isArray(ids) && ids.length > 0) {
      for (const id of ids) {
        await sql`DELETE FROM inv_orders WHERE id = ${id}`;
      }
    }
    res.json({ message: "Orders deleted successfully" });
  } catch (error) {
    console.error("Error bulk deleting orders:", error);
    res.status(500).json({ error: "Failed to delete orders" });
  }
});

// Add order
app.post("/api/orders", async (req, res) => {
  try {
    const { id, itemName, itemId, date, status, supplierName, cost } = req.body;
    console.log(`Adding order: ${id} for ${itemName}`);
    await sql`
      INSERT INTO inv_orders (id, "itemName", "itemId", date, status, "supplierName", cost)
      VALUES (${id}, ${itemName}, ${itemId}, ${date}, ${status}, ${supplierName || null}, ${cost ?? null})
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
  res.status(501).json({ error: "Resend functionality has been removed. Please implement your own email service." });
});

// Price Reference API
app.get("/api/price-reference", async (req, res) => {
  try {
    const { rows } = await sql`SELECT * FROM inv_price_reference`;
    res.json(rows);
  } catch (error) {
    console.error("Error fetching all price references:", error);
    res.status(500).json({ error: "Failed to fetch all price references" });
  }
});

// Supplier API
app.get("/api/suppliers", async (req, res) => {
  try {
    const { rows } = await sql`SELECT * FROM inv_suppliers`;
    res.json(rows);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).json({ error: "Failed to fetch suppliers" });
  }
});

app.post("/api/suppliers", async (req, res) => {
  try {
    const { id, name, email } = req.body;
    await sql`
      INSERT INTO inv_suppliers (id, name, email)
      VALUES (${id}, ${name}, ${email})
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email;
    `;
    res.json({ message: "Supplier saved successfully" });
  } catch (error) {
    console.error("Error saving supplier:", error);
    res.status(500).json({ error: "Failed to save supplier" });
  }
});

app.delete("/api/suppliers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await sql`DELETE FROM inv_suppliers WHERE id = ${id}`;
    res.json({ message: "Supplier deleted successfully" });
  } catch (error) {
    console.error("Error deleting supplier:", error);
    res.status(500).json({ error: "Failed to delete supplier" });
  }
});

app.get("/api/price-reference/:itemId", async (req, res) => {
  try {
    const { itemId } = req.params;
    const { rows } = await sql`SELECT * FROM inv_price_reference WHERE "itemId" = ${itemId}`;
    res.json(rows);
  } catch (error) {
    console.error("Error fetching price references:", error);
    res.status(500).json({ error: "Failed to fetch price references" });
  }
});

app.post("/api/price-reference", async (req, res) => {
  try {
    const { itemId, supplierName, price } = req.body;
    
    // Delete existing references for this item to ensure only one is kept
    await sql`DELETE FROM inv_price_reference WHERE "itemId" = ${itemId}`;
    
    await sql`
      INSERT INTO inv_price_reference ("itemId", "supplierName", price)
      VALUES (${itemId}, ${supplierName}, ${price})
    `;
    res.json({ message: "Price reference saved successfully" });
  } catch (error) {
    console.error("Error saving price reference:", error);
    res.status(500).json({ error: "Failed to save price reference" });
  }
});
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

    httpServer.listen(PORT, "0.0.0.0", () => {
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

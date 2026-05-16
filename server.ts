import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import * as dotenv from "dotenv";

dotenv.config();

import os from "os";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Real Infrastructure Monitoring API (Host System)
  app.get("/api/metrics/nodes", async (req, res) => {
    // Collect real metrics from the os module
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    
    const memoryUsed = totalMemory - freeMemory;
    const memoryUsagePercent = (memoryUsed / totalMemory) * 100;
    
    // Calculate simple CPU load using loadavg (1 minute avg) normalized by core count
    const loadavg = os.loadavg();
    let cpuLoadPercent = (loadavg[0] / cpus.length) * 100;
    if (cpuLoadPercent > 100) cpuLoadPercent = 100;
    
    // Use the max of CPU and Memory load as the "load" metric
    const overallLoad = Math.max(cpuLoadPercent, memoryUsagePercent);
    
    let status = 'healthy';
    if (overallLoad > 85) status = 'critical';
    else if (overallLoad > 65) status = 'warning';

    const hostname = os.hostname();
    
    const nodes = [
      { 
        name: `host-${hostname}`, 
        load: Math.round(overallLoad), 
        cpuLoad: Math.round(cpuLoadPercent),
        ramLoad: Math.round(memoryUsagePercent),
        status: status, 
        provider: 'Local/Host' 
      }
    ];
    
    res.json(nodes);
  });

  // Automated Alerting API (Slack Webhook)
  app.post("/api/alerts/slack", async (req, res) => {
    const { message } = req.body;
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    
    if (!webhookUrl) {
      return res.status(500).json({ status: "error", message: "SLACK_WEBHOOK_URL not configured in environment" });
    }

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message })
      });
      
      if (!response.ok) throw new Error("Slack API responded with error");
      res.json({ status: "success", message: "Alert sent to Slack" });
    } catch (e) {
      res.status(500).json({ status: "error", message: "Failed to send Slack alert" });
    }
  });

  // Automated Alerting API (Email via SendGrid/Nodemailer)
  app.post("/api/alerts/email", async (req, res) => {
    const { to, subject, text } = req.body;
    
    // Ready for integration with SendGrid or other SMTP
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return res.status(500).json({ status: "error", message: "SMTP credentials not configured" });
    }

    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: 587,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      await transporter.sendMail({
        from: '"Cloud Monitor" <alerts@cloudmonitor.local>',
        to,
        subject,
        text
      });

      res.json({ status: "success", message: "Email alert sent" });
    } catch (e) {
      res.status(500).json({ status: "error", message: "Failed to send Email alert" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

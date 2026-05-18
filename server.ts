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

  // AI-Powered Dataset Analysis (Power BI Blueprint & Inference)
  app.post("/api/analyze-dataset", async (req, res) => {
    const { dataDump } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ status: "error", message: "GEMINI_API_KEY not configured" });
    }

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const systemPrompt = `You are a machine learning data analyst and Power BI expert. 
The user will provide a sample of evaluation metrics or dataset data. The data contains evaluation metrics for four pillars, specifically including Root Mean Square Error (RMSE), Accuracy (%), and Predicted operational states.

### 2. Processing & Predictive Logic
Analyze the data and determine a final status for the system deployment based on the metrics. Classify the final result into exactly one of these three categories:
- SUCCESS: High accuracy, low RMSE, and strong pillar metrics.
- RUN: Marginal metrics; the system can operate but requires monitoring.
- FAIL: High RMSE, low accuracy, or critical failures in any of the four pillars.

### 3. Power BI Dashboard Blueprint
Provide a clear, human-readable blueprint and instructions for building a Power BI dashboard. Do not use complex raw JSON. Instead, use a structured list format explaining the visuals, data fields, and underlying DAX logic in plain English. Include:
- KPI Cards: How to display overall Accuracy and RMSE (e.g., Target vs Actual).
- 4-Quadrant Matrix: Mapping Data Protection, Site Recovery, Flexibility, and Network. Detail what goes in rows, columns, and values.
- Prediction Gauge: A visual indicator showing the status (RUN, FAIL, SUCCESS). Define the target thresholds.
- Essential DAX Measures: Provide 2-3 clear, readable DAX formulas needed for the dashboard.

### 4. Automated Inference Generation
Directly below the Power BI virtualization blueprint, you must generate a comprehensive "Final Inference Report". Use this exact format:

#### FINAL INFERENCE REPORT
- *Overall System Status*: [SUCCESS / RUN / FAIL]
- *Key Driver*: [Identify which of the 4 pillars or metrics impacted the status the most]
- *Data Protection Assessment*: [Brief analysis of data protection RMSE/Accuracy]
- *Site Recovery Assessment*: [Brief analysis of recovery readiness]
- *Flexibility & Network Analysis*: [Brief analysis of scalability and network metrics]
- *Actionable Recommendation*: [Provide 1-2 concrete next steps based on the final status]

Structure your response with distinct markdown headers for the Data Analysis, the Power BI Blueprint, and the Final Inference Report. Do not truncate the inference section.
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { role: "user", parts: [{ text: `Here is the data snippet:\n\n${dataDump.substring(0, 3000)}` }] }
        ],
        config: {
            systemInstruction: systemPrompt,
        }
      });

      res.json({ status: "success", markdown: response.text });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ status: "error", message: error.message });
    }
  });

  // AI-Powered Chat Assistant
  app.post("/api/chat", async (req, res) => {
    const { message } = req.body;
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ status: "error", message: "GEMINI_API_KEY not configured" });
    }

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: "You are GRUardian AI Assistant, an expert in cloud task prediction and infrastructure modeling. Provide a helpful, concise answer to: " + message }] }
        ],
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ status: "error", message: error.message });
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

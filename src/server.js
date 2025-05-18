import express from "express";
import { callAPI } from "./apiCaller.js";
import { lookupVRWithRetry } from "./vrApiCaller.js";

const app = express();
const port = 3000;

app.get("/api", async (req, res) => {
  const { licensePlate } = req.query;

  if (!licensePlate) {
    return res.status(400).json({ error: "License plate is required" });
  }

  try {
    const violations = await callAPI(licensePlate);
    if (violations) {
      res.json({ licensePlate, violations });
    } else {
      res.status(404).json({ error: "No violations found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/vr", async (req, res) => {
  const { bienSo, soTem } = req.query;
  if (!bienSo) {
    return res.status(400).json({ error: "Thiếu tham số biển số" });
  }
  try {
    const result = await lookupVR({ bienSo, soTem });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

import { Router } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { QUESTIONS, computeScores } from "../lib/scoring.js";

const router = Router();

// Admins may export any client's scorecard via ?userId=; everyone else gets their own.
async function resolveTargetUser(req) {
  const requestedId = req.query.userId ? Number(req.query.userId) : null;
  if (requestedId && req.user.role === "admin") {
    const { rows } = await pool.query(
      "SELECT id, email, name, company, role FROM users WHERE id = $1",
      [requestedId]
    );
    return rows[0] || null;
  }
  return { id: req.user.id, email: req.user.email, name: req.user.name, company: req.user.company, role: req.user.role };
}

async function loadResponses(userId) {
  const { rows } = await pool.query(
    "SELECT question_id, maturity, evidence FROM responses WHERE user_id = $1",
    [userId]
  );
  const responses = {};
  rows.forEach((r) => { responses[r.question_id] = { maturity: r.maturity, evidence: r.evidence }; });
  return responses;
}

router.get("/excel", requireAuth, async (req, res, next) => {
  try {
  const target = await resolveTargetUser(req);
  if (!target) return res.status(404).json({ error: "Client not found." });
  const responses = await loadResponses(target.id);
  const scores = computeScores(responses);
  const showEvidence = req.user.role === "admin";

  const wb = new ExcelJS.Workbook();
  wb.creator = "RIOS Discover";
  wb.created = new Date();

  // --- Diagnostic Scorecard sheet ---
  const ws = wb.addWorksheet("Diagnostic Scorecard");
  const headerRow = ["Sl. No.", "Module", "Submodule", "Retailer / Maturity Question", "AI Opportunity Weight (1-3)", "Client Maturity Score (0-4)", "AI-Weighted Score"];
  if (showEvidence) headerRow.push("Evidence / Source");
  headerRow.push("Est. Revenue Impact ($)", "Est. Cost Savings ($)");
  ws.addRow(headerRow);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEF4C4F" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  QUESTIONS.forEach((q) => {
    const r = responses[q.id];
    const maturity = r && r.maturity != null ? r.maturity : null;
    const row = [q.id, q.module, q.submodule, q.q, q.weight, maturity, maturity != null ? maturity * q.weight : null];
    if (showEvidence) row.push((r && r.evidence) || "");
    row.push(q.hasDollar ? `${Math.round(q.revLow)} – ${Math.round(q.revHigh)}` : "N/A");
    row.push(q.hasDollar ? `${Math.round(q.costLow)} – ${Math.round(q.costHigh)}` : "N/A");
    ws.addRow(row);
  });
  ws.columns.forEach((col, i) => { col.width = [8, 26, 24, 46, 14, 14, 14, 34, 20, 20][i] || 16; });
  ws.getColumn(4).alignment = { wrapText: true, vertical: "top" };
  if (showEvidence) ws.getColumn(8).alignment = { wrapText: true, vertical: "top" };

  // --- Module Summary sheet ---
  const ms = wb.addWorksheet("Module Summary");
  ms.addRow(["Module", "Score (0-100)", "Tier", "Questions Answered", "Questions Total"]).font = { bold: true };
  ms.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEF4C4F" } };
  ms.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  scores.moduleScores.forEach((m) => {
    ms.addRow([m.module, Number(m.score.toFixed(1)), m.tier.name, m.answered, m.total]);
  });
  ms.columns.forEach((col, i) => { col.width = [30, 16, 20, 18, 16][i] || 16; });

  // --- Overall Scorecard sheet ---
  const os = wb.addWorksheet("Overall Scorecard");
  os.addRow(["Overall Score (0-100)", Number(scores.overallScore.toFixed(1))]);
  os.addRow(["Overall Tier", scores.overallTier.name]);
  os.addRow(["Questions Answered", `${scores.answeredAll} / ${scores.totalAll}`]);
  os.addRow(["Account", target.company || target.name]);
  os.addRow(["Generated", new Date().toISOString()]);
  os.addRow([]);
  os.addRow(["Top 5 Innovation Opportunities"]).font = { bold: true };
  os.addRow(["Rank", "Module", "Question", "Maturity", "Est. Benefit Midpoint ($)"]).font = { bold: true };
  scores.opportunities.forEach((o, i) => {
    os.addRow([i + 1, o.module, o.q, o.maturity, Math.round(o.midpoint)]);
  });
  os.addRow([]);
  os.addRow(["Priority AI-Maturity Gaps (no $ data)"]).font = { bold: true };
  os.addRow(["Rank", "Module", "Question", "Maturity", "Weighted Severity"]).font = { bold: true };
  scores.priorityGaps.forEach((o, i) => {
    os.addRow([i + 1, o.module, o.q, o.maturity, o.severity]);
  });
  os.columns.forEach((col) => { col.width = 30; });

  const filename = `RIOS-Scorecard-${(target.company || target.name || "client").replace(/[^a-z0-9]+/gi, "-")}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
  } catch (err) {
    next(err);
  }
});

router.get("/pdf", requireAuth, async (req, res, next) => {
  try {
  const target = await resolveTargetUser(req);
  if (!target) return res.status(404).json({ error: "Client not found." });
  const responses = await loadResponses(target.id);
  const scores = computeScores(responses);
  const showEvidence = req.user.role === "admin";

  const filename = `RIOS-Scorecard-${(target.company || target.name || "client").replace(/[^a-z0-9]+/gi, "-")}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  doc.pipe(res);

  const coral = "#EF4C4F";
  const ink = "#272525";
  const gray = "#7A746F";

  doc.fillColor(coral).fontSize(11).text("RIOS DISCOVER", { characterSpacing: 1 });
  doc.moveDown(0.2);
  doc.fillColor(ink).fontSize(22).text("AI & Innovation Diagnostic Scorecard", { continued: false });
  doc.moveDown(0.3);
  doc.fillColor(gray).fontSize(11).text(`${target.company || target.name}  ·  Generated ${new Date().toLocaleDateString()}`);
  doc.moveDown(1);

  doc.fillColor(ink).fontSize(15).text(`Overall Score: ${scores.overallScore.toFixed(1)} / 100`);
  doc.fillColor(coral).fontSize(13).text(`Tier: ${scores.overallTier.name}`);
  doc.fillColor(gray).fontSize(10).text(`${scores.answeredAll} of ${scores.totalAll} questions scored`);
  doc.moveDown(1);

  doc.fillColor(ink).fontSize(14).text("Module Breakdown");
  doc.moveDown(0.3);
  doc.fontSize(9.5);
  scores.moduleScores.forEach((m) => {
    doc.fillColor(ink).text(`${m.module}`, { continued: true, width: 300 });
    doc.fillColor(gray).text(`   ${m.score.toFixed(1)} / 100   ·   ${m.tier.name}`, { align: "right" });
  });
  doc.moveDown(1);

  doc.fillColor(ink).fontSize(14).text("Top 5 Innovation Opportunities");
  doc.moveDown(0.3);
  doc.fontSize(9.5);
  if (scores.opportunities.length === 0) {
    doc.fillColor(gray).text("No opportunities ranked yet — score more questions with revenue/cost data attached.");
  }
  scores.opportunities.forEach((o, i) => {
    doc.fillColor(coral).text(`${i + 1}. `, { continued: true });
    doc.fillColor(ink).text(`${o.q}`, { width: 480 });
    doc.fillColor(gray).text(`   ${o.module} · Maturity ${o.maturity}/4 · Est. benefit ~$${Math.round(o.midpoint).toLocaleString()}`);
    if (showEvidence && o.evidence) doc.fillColor(gray).fontSize(8.5).text(`   Evidence: ${o.evidence}`, { italics: true });
    doc.fontSize(9.5);
    doc.moveDown(0.4);
  });
  doc.moveDown(0.6);

  doc.fillColor(ink).fontSize(14).text("Priority AI-Maturity Gaps");
  doc.moveDown(0.3);
  doc.fontSize(9.5);
  if (scores.priorityGaps.length === 0) {
    doc.fillColor(gray).text("No priority gaps yet.");
  }
  scores.priorityGaps.forEach((o, i) => {
    doc.fillColor(coral).text(`${i + 1}. `, { continued: true });
    doc.fillColor(ink).text(`${o.q}`, { width: 480 });
    doc.fillColor(gray).text(`   ${o.module} · Maturity ${o.maturity}/4 · Severity ${o.severity}`);
    doc.moveDown(0.4);
  });

  doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;

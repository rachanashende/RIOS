import { Router } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  QUESTIONS, SECTIONS, INDEX_DIMENSIONS, computeIndexScore,
  cohortAverage, cohortDimensionAverages, stageForScore,
} from "../lib/indexScoring.js";

const router = Router();
const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label]));

// Same access rule as GET /api/index/campaigns/:id/report (routes/index.js):
// admin can export any campaign; a respondent can only export a campaign
// they participated in, and only once it's closed.
async function resolveCampaignForExport(req, campaignId) {
  const { rows: campaignRows } = await pool.query("SELECT * FROM index_campaigns WHERE id = $1", [campaignId]);
  const campaign = campaignRows[0];
  if (!campaign) return { error: "Campaign not found.", status: 404 };

  if (req.user.role !== "admin") {
    if (campaign.is_open) return { error: "The report isn't published yet — it becomes visible once this campaign closes.", status: 403 };
    const { rows: mine } = await pool.query(
      "SELECT id FROM index_entries WHERE campaign_id = $1 AND user_id = $2",
      [campaignId, req.user.id]
    );
    if (!mine.length) return { error: "This report is only visible to respondents who participated in this campaign.", status: 403 };
  }
  return { campaign };
}

// Shared aggregate + per-entry computation, reused by both the Excel and
// PDF export below so the two documents can never drift out of sync with
// each other on the numbers they show.
async function loadReportData(campaignId) {
  const { rows: entries } = await pool.query(
    "SELECT respondent_name, company, answers, score, created_at FROM index_entries WHERE campaign_id = $1 ORDER BY score DESC NULLS LAST",
    [campaignId]
  );
  const scoredEntries = entries.map((r) => ({
    respondent_name: r.respondent_name,
    company: r.company,
    score: r.score != null ? Number(r.score) : null,
    stage: stageForScore(r.score),
    dimensionScores: computeIndexScore(r.answers || {}).dimensionScores,
    created_at: r.created_at,
  }));
  const { average, count } = cohortAverage(entries.map((r) => r.score));
  const dimensionAverages = cohortDimensionAverages(scoredEntries.map((e) => e.dimensionScores));
  return { scoredEntries, average, count, dimensionAverages };
}

router.get("/excel", requireAuth, async (req, res, next) => {
  try {
    const campaignId = Number(req.query.campaignId);
    if (!campaignId) return res.status(400).json({ error: "campaignId is required." });

    const resolved = await resolveCampaignForExport(req, campaignId);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
    const { campaign } = resolved;
    const showIndividualScores = req.user.role === "admin";

    const { scoredEntries, average, count, dimensionAverages } = await loadReportData(campaignId);

    const wb = new ExcelJS.Workbook();
    wb.creator = "RIOS R-Index";
    wb.created = new Date();

    const summary = wb.addWorksheet("Index Summary");
    summary.addRow(["Campaign", campaign.name]);
    summary.addRow(["Geo", campaign.geo || "—"]);
    summary.addRow(["Quarter", campaign.quarter_label || "—"]);
    summary.addRow(["Status", campaign.is_open ? "Open" : "Closed"]);
    summary.addRow(["Overall Index Score (1-5)", average != null ? Number(average.toFixed(2)) : "—"]);
    summary.addRow(["Maturity Stage", stageForScore(average) || "—"]);
    summary.addRow(["Cohort Size", count]);
    summary.addRow(["Generated", new Date().toISOString()]);
    summary.addRow([]);
    summary.addRow(["Five Dimensions", "Average (1-5)"]).font = { bold: true };
    INDEX_DIMENSIONS.forEach((dim) => {
      const v = dimensionAverages[dim];
      summary.addRow([dim, v != null ? Number(v.toFixed(2)) : "Not yet measurable"]);
    });
    summary.columns.forEach((col) => { col.width = 34; });

    if (showIndividualScores) {
      const es = wb.addWorksheet("Entries");
      const header = ["Respondent", "Company", "Overall Score (1-5)", "Stage", ...INDEX_DIMENSIONS, "Submitted"];
      es.addRow(header).font = { bold: true };
      es.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEF4C4F" } };
      es.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      scoredEntries.forEach((e) => {
        es.addRow([
          e.respondent_name, e.company || "",
          e.score != null ? Number(e.score).toFixed(2) : "",
          e.stage || "",
          ...INDEX_DIMENSIONS.map((dim) => (e.dimensionScores[dim] != null ? Number(e.dimensionScores[dim]).toFixed(2) : "")),
          e.created_at,
        ]);
      });
      es.columns.forEach((col) => { col.width = 22; });
    }

    const qs = wb.addWorksheet("Questions");
    qs.addRow(["ID", "Section", "Type", "Index Dimension", "Question"]).font = { bold: true };
    QUESTIONS.forEach((q) => qs.addRow([q.id, SECTION_LABEL[q.section] || q.section, q.type, q.indexDimension || "", q.text]));
    qs.columns.forEach((col, i) => { col.width = [10, 26, 14, 26, 60][i] || 18; });

    const filename = `RIndex-${campaign.name.replace(/[^a-z0-9]+/gi, "-")}.xlsx`;
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
    const campaignId = Number(req.query.campaignId);
    if (!campaignId) return res.status(400).json({ error: "campaignId is required." });

    const resolved = await resolveCampaignForExport(req, campaignId);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
    const { campaign } = resolved;
    const showIndividualScores = req.user.role === "admin";

    const { scoredEntries, average, count, dimensionAverages } = await loadReportData(campaignId);

    const filename = `RIndex-${campaign.name.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);

    const coral = "#EF4C4F";
    const ink = "#272525";
    const gray = "#7A746F";

    doc.fillColor(coral).fontSize(11).text("R-INDEX", { characterSpacing: 1 });
    doc.moveDown(0.2);
    doc.fillColor(ink).fontSize(22).text(campaign.name);
    doc.moveDown(0.3);
    doc.fillColor(gray).fontSize(11).text(`${campaign.geo || ""}  ${campaign.quarter_label ? "· " + campaign.quarter_label : ""}  ·  Generated ${new Date().toLocaleDateString()}`);
    doc.moveDown(1);

    doc.fillColor(ink).fontSize(15).text(`Overall Index Score: ${average != null ? average.toFixed(2) : "—"} / 5  ·  ${stageForScore(average) || "—"}`);
    doc.fillColor(gray).fontSize(10).text(`Based on ${count} scored ${count === 1 ? "response" : "responses"}`);
    doc.moveDown(1);

    doc.fillColor(ink).fontSize(14).text("Five Dimensions");
    doc.moveDown(0.3);
    doc.fontSize(10);
    INDEX_DIMENSIONS.forEach((dim) => {
      const v = dimensionAverages[dim];
      doc.fillColor(ink).text(dim, { continued: true, width: 380 });
      doc.fillColor(gray).text(v != null ? `   ${v.toFixed(2)} / 5` : "   Not yet measurable", { align: "right" });
    });
    doc.moveDown(1);

    if (showIndividualScores) {
      doc.fillColor(ink).fontSize(14).text("Respondents");
      doc.moveDown(0.3);
      doc.fontSize(9.5);
      scoredEntries.forEach((e) => {
        doc.fillColor(ink).text(`${e.respondent_name}${e.company ? " — " + e.company : ""}`, { continued: true, width: 340 });
        doc.fillColor(gray).text(`   ${e.score != null ? e.score.toFixed(2) : "—"} / 5  ·  ${e.stage || "—"}`, { align: "right" });
      });
      doc.moveDown(1);
    }

    doc.fillColor(ink).fontSize(14).text("Instrument");
    doc.moveDown(0.3);
    doc.fontSize(9.5);
    let currentSection = null;
    QUESTIONS.forEach((q) => {
      if (q.section !== currentSection) {
        currentSection = q.section;
        doc.moveDown(0.4);
        doc.fillColor(coral).fontSize(10).text(SECTION_LABEL[q.section] || q.section);
        doc.fontSize(9.5);
      }
      doc.fillColor(ink).text(q.text, { width: 480 });
      doc.moveDown(0.2);
    });

    doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;

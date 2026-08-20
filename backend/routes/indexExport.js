import { Router } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { QUESTIONS, cohortAverage } from "../lib/indexScoring.js";

const router = Router();

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

router.get("/excel", requireAuth, async (req, res, next) => {
  try {
    const campaignId = Number(req.query.campaignId);
    if (!campaignId) return res.status(400).json({ error: "campaignId is required." });

    const resolved = await resolveCampaignForExport(req, campaignId);
    if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
    const { campaign } = resolved;

    const showIndividualScores = req.user.role === "admin";
    const { rows: entries } = await pool.query(
      "SELECT respondent_name, company, score, created_at FROM index_entries WHERE campaign_id = $1 ORDER BY score DESC NULLS LAST",
      [campaignId]
    );
    const { average, count } = cohortAverage(entries.map((r) => r.score));

    const wb = new ExcelJS.Workbook();
    wb.creator = "RIOS R-Index";
    wb.created = new Date();

    const summary = wb.addWorksheet("Index Summary");
    summary.addRow(["Campaign", campaign.name]);
    summary.addRow(["Geo", campaign.geo || "—"]);
    summary.addRow(["Quarter", campaign.quarter_label || "—"]);
    summary.addRow(["Status", campaign.is_open ? "Open" : "Closed"]);
    summary.addRow(["Cohort Average Score (1-5)", average != null ? Number(average.toFixed(2)) : "—"]);
    summary.addRow(["Cohort Size", count]);
    summary.addRow(["Generated", new Date().toISOString()]);
    summary.columns.forEach((col) => { col.width = 34; });

    if (showIndividualScores) {
      const es = wb.addWorksheet("Entries");
      es.addRow(["Respondent", "Company", "Score (1-5)", "Submitted"]).font = { bold: true };
      es.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEF4C4F" } };
      es.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      entries.forEach((e) => {
        es.addRow([e.respondent_name, e.company || "", e.score != null ? Number(e.score).toFixed(2) : "", e.created_at]);
      });
      es.columns.forEach((col, i) => { col.width = [28, 24, 14, 22][i] || 18; });
    }

    const qs = wb.addWorksheet("Questions");
    qs.addRow(["ID", "Category", "Question"]).font = { bold: true };
    QUESTIONS.forEach((q) => qs.addRow([q.id, q.category, q.text]));
    qs.columns.forEach((col, i) => { col.width = [10, 22, 60][i] || 18; });

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
    const { rows: entries } = await pool.query(
      "SELECT respondent_name, company, score FROM index_entries WHERE campaign_id = $1 ORDER BY score DESC NULLS LAST",
      [campaignId]
    );
    const { average, count } = cohortAverage(entries.map((r) => r.score));

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

    doc.fillColor(ink).fontSize(15).text(`Cohort Average: ${average != null ? average.toFixed(2) : "—"} / 5`);
    doc.fillColor(gray).fontSize(10).text(`Based on ${count} scored ${count === 1 ? "response" : "responses"}`);
    doc.moveDown(1);

    if (showIndividualScores) {
      doc.fillColor(ink).fontSize(14).text("Respondents");
      doc.moveDown(0.3);
      doc.fontSize(9.5);
      entries.forEach((e) => {
        doc.fillColor(ink).text(`${e.respondent_name}${e.company ? " — " + e.company : ""}`, { continued: true, width: 380 });
        doc.fillColor(gray).text(`   ${e.score != null ? Number(e.score).toFixed(2) : "—"} / 5`, { align: "right" });
      });
      doc.moveDown(1);
    }

    doc.fillColor(ink).fontSize(14).text("Instrument");
    doc.moveDown(0.3);
    doc.fontSize(9.5);
    QUESTIONS.forEach((q) => {
      doc.fillColor(coral).text(`${q.category}: `, { continued: true });
      doc.fillColor(ink).text(q.text, { width: 480 });
      doc.moveDown(0.3);
    });

    doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;

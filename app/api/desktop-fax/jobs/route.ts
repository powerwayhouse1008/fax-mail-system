import { NextRequest, NextResponse } from "next/server";
import { supabaseRestRequest } from "../../../lib/server/supabase-rest";
import { AUTH_COOKIE_NAME } from "../../../lib/auth";
import { verifySessionToken } from "../../../lib/server/session";
import { auth } from "../../../../auth";
import { PDFDocument } from "pdf-lib";

type Job = { id: string; agent_id: string; fax_number: string; subject: string | null; body_text: string | null; document_url: string | null; document_name: string | null; document_base64: string | null; document_mime_type: string | null; status: string };
type Attachment = { filename?: unknown; content?: unknown; type?: unknown; mimeType?: unknown };
const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
// Keep raster documents sharp for the local PC-Fax driver. 200 DPI is a
// practical fax-quality target and avoids downsampling images to a blurry A4
// canvas. The API fax path is separate and remains unchanged.
const DESKTOP_IMAGE_DPI = 200;

function authorized(request: NextRequest) {
  const expected = process.env.DESKTOP_FAX_AGENT_KEY;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && actual && actual === expected);
}

async function userAuthorized(request: NextRequest) {
  if (verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value)) return true;
  const session = await auth();
  return Boolean(session?.user);
}

async function firstDocument(body: { attachments?: unknown; documentUrl?: unknown; documentName?: unknown }) {
  const attachment = Array.isArray(body.attachments) ? body.attachments[0] as Attachment | undefined : undefined;
  const rawContent = typeof attachment?.content === "string" ? attachment.content.trim() : "";
  const mimeType = String(attachment?.type || attachment?.mimeType || "application/octet-stream").toLowerCase();
  const filename = String(attachment?.filename || body.documentName || "fax-document");
  if (!rawContent) {
    return {
      document_url: typeof body.documentUrl === "string" ? body.documentUrl : null,
      document_name: filename,
      document_base64: null,
      document_mime_type: null,
    };
  }

  const base64 = rawContent.replace(/^data:[^;]+;base64,/i, "");
  const binary = Buffer.from(base64, "base64");
  if (!binary.length || binary.length > MAX_DOCUMENT_BYTES) throw new Error("FAX document must be between 1 byte and 12 MB.");
  if (mimeType === "image/jpeg" || mimeType === "image/jpg" || mimeType === "image/png") {
    const pdf = await PDFDocument.create();
    const image = mimeType === "image/png" ? await pdf.embedPng(binary) : await pdf.embedJpg(binary);
    const pageWidth = (image.width / DESKTOP_IMAGE_DPI) * 72;
    const pageHeight = (image.height / DESKTOP_IMAGE_DPI) * 72;
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    const pdfBytes = await pdf.save();
    return { document_url: null, document_name: `${filename.replace(/\.[^.]+$/, "")}.pdf`, document_base64: Buffer.from(pdfBytes).toString("base64"), document_mime_type: "application/pdf" };
  }
  if (mimeType !== "application/pdf" && !binary.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    throw new Error("Desktop fax supports PDF, JPEG, or PNG documents.");
  }
  return { document_url: null, document_name: filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`, document_base64: binary.toString("base64"), document_mime_type: "application/pdf" };
}

export async function POST(request: NextRequest) {
  const sameOrigin = !request.headers.get("origin") || request.headers.get("origin") === request.nextUrl.origin;
  if (!sameOrigin || !(await userAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json() as { agentId?: string; faxNumbers?: string[]; subject?: string; text?: string; documentUrl?: string; documentName?: string; attachments?: unknown };
  const agentId = body.agentId?.trim();
  const numbers = body.faxNumbers?.map(String).map((value) => value.trim()).filter(Boolean) ?? [];
  if (!agentId || !numbers.length) return NextResponse.json({ error: "agentId と faxNumbers は必須です。" }, { status: 400 });
  let document;
  try { document = await firstDocument(body); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid fax document" }, { status: 400 }); }
  if (!document.document_base64 && !document.document_url) return NextResponse.json({ error: "FAX document is required." }, { status: 400 });
  const jobs = await supabaseRestRequest<Job[]>("/desktop_fax_jobs", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify(numbers.map((faxNumber) => ({ agent_id: agentId, fax_number: faxNumber, subject: body.subject || null, body_text: body.text || null, ...document }))),
  });
  return NextResponse.json({ total: jobs.length, jobs }, { status: 202 });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const agentId = request.nextUrl.searchParams.get("agentId")?.trim();
  if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  const jobs = await supabaseRestRequest<Job[]>(`/desktop_fax_jobs?agent_id=eq.${encodeURIComponent(agentId)}&status=eq.pending&order=created_at.asc&limit=1`);
  if (!jobs[0]) return new NextResponse(null, { status: 204 });
  const claimed = await supabaseRestRequest<Job[]>(`/desktop_fax_jobs?id=eq.${encodeURIComponent(jobs[0].id)}&status=eq.pending`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "processing", claimed_at: new Date().toISOString() }),
  });
  return claimed[0] ? NextResponse.json({ job: claimed[0] }) : new NextResponse(null, { status: 204 });
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { id?: string; status?: "sent" | "failed"; error?: string };
  if (!body.id || !["sent", "failed"].includes(body.status ?? "")) return NextResponse.json({ error: "Invalid result" }, { status: 400 });
  await supabaseRestRequest(`/desktop_fax_jobs?id=eq.${encodeURIComponent(body.id)}`, { method: "PATCH", body: JSON.stringify({ status: body.status, error: body.error?.slice(0, 2000) || null, completed_at: new Date().toISOString() }) });
  return NextResponse.json({ ok: true });
}

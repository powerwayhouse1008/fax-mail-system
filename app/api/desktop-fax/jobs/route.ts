import { NextRequest, NextResponse } from "next/server";
import { supabaseRestRequest } from "../../../lib/server/supabase-rest";
import { AUTH_COOKIE_NAME } from "../../../lib/auth";
import { verifySessionToken } from "../../../lib/server/session";
import { auth } from "../../../../auth";

type Job = { id: string; agent_id: string; fax_number: string; subject: string | null; body_text: string | null; document_url: string | null; document_name: string | null; status: string };

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

export async function POST(request: NextRequest) {
  const sameOrigin = !request.headers.get("origin") || request.headers.get("origin") === request.nextUrl.origin;
  if (!sameOrigin || !(await userAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json() as { agentId?: string; faxNumbers?: string[]; subject?: string; text?: string; documentUrl?: string; documentName?: string };
  const agentId = body.agentId?.trim();
  const numbers = body.faxNumbers?.map(String).map((value) => value.trim()).filter(Boolean) ?? [];
  if (!agentId || !numbers.length) return NextResponse.json({ error: "agentId と faxNumbers は必須です。" }, { status: 400 });
  const jobs = await supabaseRestRequest<Job[]>("/desktop_fax_jobs", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify(numbers.map((faxNumber) => ({ agent_id: agentId, fax_number: faxNumber, subject: body.subject || null, body_text: body.text || null, document_url: body.documentUrl || null, document_name: body.documentName || null }))),
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

import { supabaseRestRequest } from "../supabase-rest";

export type DataSpiderContact = {
  id: string;
  company_name: string | null;
  person_name: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website_url: string | null;
  source_url: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type DataSpiderContactInput = {
  company_name?: string;
  person_name?: string;
  address?: string;
  phone?: string;
  fax?: string;
  email?: string;
  website_url?: string;
  source_url?: string;
  memo?: string;
};

const normalize = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function listDataSpiderContacts() {
  return supabaseRestRequest<DataSpiderContact[]>(
    "/data_spider_contacts?select=*&order=created_at.desc",
  );
}

export async function createDataSpiderContacts(inputs: DataSpiderContactInput[]) {
  const rows = inputs.map((input) => ({
    company_name: normalize(input.company_name) || null,
    person_name: normalize(input.person_name) || null,
    address: normalize(input.address) || null,
    phone: normalize(input.phone) || null,
    fax: normalize(input.fax) || null,
    email: normalize(input.email) || null,
    website_url: normalize(input.website_url) || null,
    source_url: normalize(input.source_url) || null,
    memo: normalize(input.memo) || null,
  }));

  if (rows.length === 0) return [];

  return supabaseRestRequest<DataSpiderContact[]>("/data_spider_contacts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
}

export async function deleteDataSpiderContactsByIds(ids: string[]) {
  if (ids.length === 0) return;
  const inClause = ids.map((id) => `\"${id.replace(/\"/g, "")}\"`).join(",");
  await supabaseRestRequest(`/data_spider_contacts?id=in.(${inClause})`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

export async function updateDataSpiderContact(id: string, input: DataSpiderContactInput) {
  const payload = {
    company_name: normalize(input.company_name) || null,
    person_name: normalize(input.person_name) || null,
    address: normalize(input.address) || null,
    phone: normalize(input.phone) || null,
    fax: normalize(input.fax) || null,
    email: normalize(input.email) || null,
    website_url: normalize(input.website_url) || null,
    source_url: normalize(input.source_url) || null,
    memo: normalize(input.memo) || null,
    updated_at: new Date().toISOString(),
  };

  const rows = await supabaseRestRequest<DataSpiderContact[]>(
    `/data_spider_contacts?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    },
  );

  return rows[0] ?? null;
}

export async function deleteDataSpiderContactById(id: string) {
  await supabaseRestRequest(`/data_spider_contacts?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

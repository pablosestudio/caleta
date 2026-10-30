import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://pablosestudio.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]!));

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const siteUrl = (Deno.env.get("CALETA_SITE_URL") || "https://pablosestudio.github.io/caleta").replace(/\/$/, "");

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: "Inicia sesión para continuar.", status: 401 as const };
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!publicKey) return { error: "Falta configurar la clave pública de Supabase en la función.", status: 500 as const };
  const caller = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser(token);
  if (userError || !userData.user) return { error: "La sesión no es válida.", status: 401 as const };
  const { data: adminRow, error: adminError } = await adminClient.from("caleta_admins").select("user_id,role").eq("user_id", userData.user.id).maybeSingle();
  if (adminError || !adminRow) return { error: "Esta cuenta no tiene permisos de administración.", status: 403 as const };
  return { user: userData.user, admin: adminRow, status: 200 as const };
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !from) throw new Error("Falta configurar Resend y un remitente verificado en Supabase.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result?.message === "string" ? result.message : "El proveedor de correo rechazó el mensaje.");
  return result;
}

async function listAdmins() {
  const { data: roleRows, error: roleError } = await adminClient.from("caleta_admins").select("user_id,role,created_at").order("created_at", { ascending: true });
  if (roleError) throw roleError;
  const { data: users, error: usersError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw usersError;
  const byId = new Map(users.users.map((user) => [user.id, user]));
  return (roleRows || []).map((row) => {
    const user = byId.get(row.user_id);
    return { id: row.user_id, role: row.role, email: user?.email || "Cuenta sin correo", created_at: row.created_at, last_sign_in_at: user?.last_sign_in_at || null };
  });
}

async function inviteAdmin(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) return { error: "Escribe un correo válido.", status: 400 };
  const { data: userPage, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = userPage.users.find((user) => user.email?.toLowerCase() === normalized);
  if (existing) {
    if (!existing.email_confirmed_at) return { error: "Ya existe una invitación pendiente para ese correo. Revisa Auth → Users en Supabase.", status: 409 };
    const { error } = await adminClient.from("caleta_admins").insert({ user_id: existing.id, role: "admin" });
    if (error?.code === "23505") return { error: "Ese usuario ya es administrador.", status: 409 };
    if (error) throw error;
    return { ok: true, message: "Cuenta existente añadida como administradora. Ya puede entrar con su contraseña." };
  }

  if (!Deno.env.get("RESEND_API_KEY") || !Deno.env.get("RESEND_FROM_EMAIL")) {
    return { error: "No se puede invitar todavía a un correo nuevo: falta configurar Resend y un remitente verificado en la función segura. Si esa persona ya tiene una cuenta confirmada en Supabase, puede añadirse igualmente.", status: 503 };
  }

  const redirectTo = `${siteUrl}/admin.html?set-password=1`;
  const { data: invite, error: inviteError } = await adminClient.auth.admin.generateLink({ type: "invite", email: normalized, options: { redirectTo } });
  if (inviteError || !invite.user || !invite.properties?.action_link) throw inviteError || new Error("No se pudo generar la invitación segura.");
  const { error: roleError } = await adminClient.from("caleta_admins").insert({ user_id: invite.user.id, role: "admin" });
  if (roleError) {
    await adminClient.auth.admin.deleteUser(invite.user.id);
    if (roleError.code === "23505") return { error: "Ese usuario ya es administrador.", status: 409 };
    throw roleError;
  }
  try {
    const link = escapeHtml(invite.properties.action_link);
    await sendEmail(normalized, "Invitación al panel de Espacio Caleta", `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#514941;line-height:1.6"><h1 style="font-family:Georgia,serif">Te han invitado al panel de Caleta</h1><p>Usa este enlace seguro para confirmar tu acceso y crear tu propia contraseña.</p><p><a href="${link}" style="display:inline-block;background:#514941;color:white;padding:13px 20px;text-decoration:none">Aceptar invitación</a></p><p>Si no esperabas esta invitación, puedes ignorar este mensaje.</p></div>`);
  } catch (error) {
    await adminClient.from("caleta_admins").delete().eq("user_id", invite.user.id);
    await adminClient.auth.admin.deleteUser(invite.user.id);
    throw error;
  }
  return { ok: true, message: `Invitación enviada a ${normalized}. La persona definirá su contraseña desde el enlace.` };
}

async function removeAdmin(id: string, actorRole: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Cuenta no válida.", status: 400 };
  const { data: target, error: targetError } = await adminClient.from("caleta_admins").select("user_id,role").eq("user_id", id).maybeSingle();
  if (targetError) throw targetError;
  if (!target) return { error: "La cuenta ya no figura como administradora.", status: 404 };
  if (target.role === "owner" && actorRole !== "owner") return { error: "Solo la persona titular puede retirar su cuenta.", status: 403 };
  const { count, error: countError } = await adminClient.from("caleta_admins").select("user_id", { count: "exact", head: true });
  if (countError) throw countError;
  if ((count || 0) <= 1) return { error: "Debe quedar al menos una cuenta administradora.", status: 409 };
  const { error } = await adminClient.from("caleta_admins").delete().eq("user_id", id);
  if (error) throw error;
  return { ok: true, message: "Se han retirado los permisos de administración. La cuenta de inicio de sesión no se ha eliminado." };
}

async function newsletterOverview() {
  const [{ count: active, error: activeError }, { count: pending, error: pendingError }, { data: subscribers, error: listError }, { data: campaigns, error: campaignError }] = await Promise.all([
    adminClient.from("newsletter_subscribers").select("id", { count: "exact", head: true }).eq("status", "active"),
    adminClient.from("newsletter_subscribers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    adminClient.from("newsletter_subscribers").select("id,email,status,consented_at,confirmed_at").order("consented_at", { ascending: false }).limit(300),
    adminClient.from("newsletter_campaigns").select("id,subject,status,recipient_count,sent_count,failed_count,created_at,finished_at").order("created_at", { ascending: false }).limit(20),
  ]);
  if (activeError || pendingError || listError || campaignError) throw activeError || pendingError || listError || campaignError;
  return { active: active || 0, pending: pending || 0, subscribers: subscribers || [], campaigns: campaigns || [], emailConfigured: Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL")) };
}

async function sendCampaign(actorId: string, subject: string, body: string) {
  const cleanSubject = subject.trim(), cleanBody = body.trim();
  if (cleanSubject.length < 3 || cleanSubject.length > 160 || cleanBody.length < 5 || cleanBody.length > 6000) return { error: "Revisa el asunto y el texto (máximo 6.000 caracteres).", status: 400 };
  const { data: subscribers, error: listError } = await adminClient.from("newsletter_subscribers").select("id,email,unsubscribe_token").eq("status", "active").order("consented_at", { ascending: true }).limit(1000);
  if (listError) throw listError;
  if (!subscribers?.length) return { error: "Todavía no hay personas con el correo confirmado y permiso activo.", status: 409 };
  const { data: campaign, error: campaignError } = await adminClient.from("newsletter_campaigns").insert({ subject: cleanSubject, body: cleanBody, created_by: actorId, recipient_count: subscribers.length, status: "sending" }).select("id").single();
  if (campaignError) throw campaignError;

  const apiKey = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !from) {
    await adminClient.from("newsletter_campaigns").update({ status: "failed", failed_count: subscribers.length, finished_at: new Date().toISOString() }).eq("id", campaign.id);
    return { error: "El envío de noticias aún no está activado. Falta configurar Resend y un remitente verificado.", status: 503 };
  }
  const safeSubject = escapeHtml(cleanSubject);
  const safeBody = escapeHtml(cleanBody).replace(/\r?\n/g, "<br>");
  let sent = 0, failed = 0;
  for (let offset = 0; offset < subscribers.length; offset += 100) {
    const recipients = subscribers.slice(offset, offset + 100);
    const emails = recipients.map((subscriber) => {
      const unsubscribe = `${siteUrl}/?caleta_newsletter=unsubscribe&token=${subscriber.unsubscribe_token}`;
      return { from, to: [subscriber.email], subject: cleanSubject, html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#514941;line-height:1.7"><p style="letter-spacing:.2em">CALETA ~</p><h1 style="font-family:Georgia,serif">${safeSubject}</h1><p>${safeBody}</p><hr style="border:0;border-top:1px solid #e5ddd4;margin:32px 0"><p style="font-size:12px;color:#81766d">Recibes este correo porque aceptaste recibir novedades de Espacio Caleta. <a href="${unsubscribe}" style="color:#9b6b52">Cancelar suscripción</a>.</p></div>`, headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } };
    });
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `caleta-campaign-${campaign.id}-${offset / 100}` }, body: JSON.stringify(emails),
    });
    const result = await response.json().catch(() => ({}));
    const ids = Array.isArray(result?.data) ? result.data : [];
    const batchOk = response.ok && ids.length === recipients.length;
    const rows = recipients.map((subscriber, index) => ({ campaign_id: campaign.id, subscriber_id: subscriber.id, status: batchOk ? "sent" : "failed", provider_message_id: batchOk ? ids[index]?.id || null : null, error_code: batchOk ? null : String(result?.name || "provider_error").slice(0, 80) }));
    const { error: deliveryError } = await adminClient.from("newsletter_campaign_deliveries").insert(rows);
    if (!deliveryError && batchOk) sent += recipients.length; else failed += recipients.length;
  }
  const status = failed === 0 ? "sent" : sent > 0 ? "partial" : "failed";
  const { error: finishError } = await adminClient.from("newsletter_campaigns").update({ status, sent_count: sent, failed_count: failed, finished_at: new Date().toISOString() }).eq("id", campaign.id);
  if (finishError) throw finishError;
  return { ok: failed === 0, message: `Envío terminado: ${sent} enviados y ${failed} con error.`, sent, failed };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("origin");
    if (origin !== corsHeaders["Access-Control-Allow-Origin"]) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST" || request.headers.get("origin") !== corsHeaders["Access-Control-Allow-Origin"]) return json(403, { error: "Solicitud no permitida." });
  const auth = await requireAdmin(request);
  if ("error" in auth) return json(auth.status, { error: auth.error });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json(400, { error: "Solicitud no válida." }); }
  try {
    let result: Record<string, unknown>;
    switch (body.action) {
      case "list_admins": result = { admins: await listAdmins(), currentRole: auth.admin.role, emailConfigured: Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL")) }; break;
      case "invite_admin": result = await inviteAdmin(String(body.email || "")); break;
      case "remove_admin": result = await removeAdmin(String(body.user_id || ""), auth.admin.role); break;
      case "newsletter_overview": result = await newsletterOverview(); break;
      case "send_campaign": result = await sendCampaign(auth.user.id, String(body.subject || ""), String(body.body || "")); break;
      default: return json(400, { error: "Acción desconocida." });
    }
    return json(typeof result.status === "number" ? result.status as number : 200, result);
  } catch (error) {
    console.error("Caleta management request failed", error);
    return json(500, { error: "No se pudo completar la acción. Revisa los registros de la función." });
  }
});

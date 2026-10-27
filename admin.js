import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { copyFields, imageFields, themeFields } from "./content-fields.js";

const config = window.CALETA_SUPABASE || {};
const configured = Boolean(config.url && config.publishableKey);
const supabase = configured ? createClient(config.url, config.publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const message = document.querySelector("#login-message");
const status = document.querySelector("#dashboard-status");
const monthCursor = new Date();
let currentUser = null;
let contentDraft = { copy: { es: {}, en: {} }, images: {} };

const fmtDate = (value, options = { day: "numeric", month: "short", year: "numeric" }) =>
  new Intl.DateTimeFormat("es-ES", options).format(new Date(value));
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
function setMessage(text, target = message) { target.textContent = text; }
function showLogin() { loginView.classList.remove("is-hidden"); dashboardView.classList.add("is-hidden"); document.querySelector("#recovery-view").classList.add("is-hidden"); }
function showRecovery() { loginView.classList.add("is-hidden"); dashboardView.classList.add("is-hidden"); document.querySelector("#recovery-view").classList.remove("is-hidden"); }
function showDashboard(user) {
  currentUser = user;
  loginView.classList.add("is-hidden"); document.querySelector("#recovery-view").classList.add("is-hidden"); dashboardView.classList.remove("is-hidden");
  document.querySelector("#admin-email").textContent = user.email || "Administración";
  loadDashboard();
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!configured) return setMessage("El acceso seguro aún no está conectado. Falta configurar el proyecto privado de Caleta.");
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true; setMessage("Comprobando acceso…");
  const data = new FormData(event.currentTarget);
  const { data: auth, error } = await supabase.auth.signInWithPassword({
    email: data.get("email"), password: data.get("password")
  });
  button.disabled = false;
  if (error || !auth.user) return setMessage("No se pudo iniciar sesión. Revisa tus datos o solicita un restablecimiento.");
  const { data: authorized, error: roleError } = await supabase.rpc("is_caleta_admin");
  if (roleError || authorized !== true) {
    await supabase.auth.signOut();
    return setMessage("Esta cuenta no tiene acceso al panel.");
  }
  event.currentTarget.reset(); setMessage(""); showDashboard(auth.user);
});

document.querySelector("#forgot-password").addEventListener("click", async () => {
  if (!configured) return setMessage("El acceso aún no está conectado. Cuando se active, podrás solicitar el cambio aquí.");
  const email = document.querySelector('#login-form [name="email"]').value.trim();
  if (!email) return setMessage("Escribe primero el correo de administración.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}${location.pathname}` });
  setMessage(error ? "No se pudo iniciar el restablecimiento. Contacta con soporte." : "Si el correo pertenece a la cuenta autorizada, recibirá instrucciones para cambiar la contraseña.");
});
document.querySelector("#recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const password = fields.get("password");
  if (password !== fields.get("confirmation")) return setMessage("Las contraseñas no coinciden.", document.querySelector("#recovery-message"));
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return setMessage("No se pudo cambiar la contraseña. Comprueba que tenga al menos 12 caracteres.", document.querySelector("#recovery-message"));
  await supabase.auth.signOut();
  document.querySelector("#recovery-view").classList.add("is-hidden"); showLogin();
  setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
});

document.querySelector("#logout").addEventListener("click", async () => {
  await supabase?.auth.signOut(); currentUser = null; showLogin();
});
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session?.user) return showRecovery();
    if (!session?.user) return showLogin();
    window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("is_caleta_admin");
      if (!error && data === true) showDashboard(session.user);
      else { await supabase.auth.signOut(); showLogin(); }
    }, 0);
  });
}

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("is-active", item === tab));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("is-hidden", panel.id !== tab.dataset.panel));
}));
document.querySelector("#previous-month").addEventListener("click", () => { monthCursor.setMonth(monthCursor.getMonth() - 1); loadCalendar(); });
document.querySelector("#next-month").addEventListener("click", () => { monthCursor.setMonth(monthCursor.getMonth() + 1); loadCalendar(); });
document.querySelector("#today-button").addEventListener("click", () => { monthCursor.setTime(Date.now()); loadCalendar(); });

function openDialog(id) { document.querySelector(id).showModal(); }
document.querySelector("#new-block").addEventListener("click", () => openDialog("#block-dialog"));
document.querySelector("#new-availability").addEventListener("click", () => openDialog("#availability-dialog"));
document.querySelector("#new-workshop").addEventListener("click", () => {
  const form = document.querySelector("#workshop-form"); form.reset(); delete form.dataset.existingImage;
  document.querySelector("#workshop-dialog-title").textContent = "Nuevo taller";
  document.querySelector("#workshop-save-button").innerHTML = "Crear taller <span>↗</span>";
  document.querySelector("#workshop-image-note").textContent = "Imagen opcional; JPG, PNG, WebP o AVIF, máximo 5 MB.";
  openDialog("#workshop-dialog");
});
document.querySelector("#new-rate").addEventListener("click", () => openDialog("#rate-dialog"));
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

async function loadDashboard() {
  if (!supabase || !currentUser) return;
  setMessage("Cargando agenda…", status);
  await Promise.all([loadCalendar(), loadRequests(), loadWorkshops(), loadRates(), loadContentEditor()]);
  setMessage("", status);
}

async function loadCalendar() {
  if (!supabase || !currentUser) return;
  const year = monthCursor.getFullYear(), month = monthCursor.getMonth();
  const first = new Date(year, month, 1), last = new Date(year, month + 1, 0);
  document.querySelector("#month-label").textContent = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(first);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const end = new Date(year, month + 1, 7 - ((last.getDay() + 6) % 7));
  const from = start.toISOString(), to = end.toISOString();
  const [bookingRes, blockRes, availabilityRes, workshopRes] = await Promise.all([
    supabase.from("booking_requests").select("id,booking_type,title,starts_at,ends_at,status,places,customer_name").lt("starts_at", to).gt("ends_at", from).not("status", "in", "(rejected,expired,cancelled)"),
    supabase.from("calendar_blocks").select("id,title,starts_at,ends_at,block_type").lt("starts_at", to).gt("ends_at", from),
    supabase.from("calendar_availability").select("id,title,starts_at,ends_at").lt("starts_at", to).gt("ends_at", from),
    supabase.from("workshops").select("id,title,starts_at,ends_at,status").lt("starts_at", to).gt("ends_at", from).eq("status", "published")
  ]);
  const error = bookingRes.error || blockRes.error || availabilityRes.error || workshopRes.error;
  if (error) { setMessage("No se pudo cargar la agenda. Revisa la conexión y los permisos de la base de datos.", status); return; }
  const events = [
    ...bookingRes.data.map((item) => ({ ...item, kind: "booking", label: `${item.booking_type === "workshop" ? "Taller" : "Reserva"}: ${item.title || item.customer_name || "Solicitud"}`, className: `status-${item.status}` })),
    ...blockRes.data.map((item) => ({ ...item, kind: "block", label: item.title, className: "status-blocked" })),
    ...availabilityRes.data.map((item) => ({ ...item, kind: "availability", label: item.title, className: "status-available" })),
    ...workshopRes.data.map((item) => ({ ...item, kind: "workshop", label: `Taller: ${item.title}`, className: "status-confirmed" }))
  ];
  renderCalendar(events, start, end, month);
}

function renderCalendar(events, start, end, month) {
  const grid = document.querySelector("#calendar-grid");
  const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const cells = weekdays.map((day) => `<div class="calendar-weekday" role="columnheader">${day}</div>`);
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = new Date(cursor);
    const dayEvents = events.filter((event) => { const date = new Date(event.starts_at); return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate(); });
    const outside = day.getMonth() !== month, today = day.toDateString() === new Date().toDateString();
    cells.push(`<div class="calendar-cell${outside ? " is-outside" : ""}${today ? " is-today" : ""}" role="gridcell" aria-label="${escapeHtml(fmtDate(day, { weekday: "long", day: "numeric", month: "long" }))}"><span class="day-number">${day.getDate()}</span>${dayEvents.map((item) => item.kind === "availability" ? `<button class="calendar-event ${item.className}" data-delete-availability="${item.id}" title="Pulsa para retirar disponibilidad" type="button">${escapeHtml(item.label)}</button>` : `<span class="calendar-event ${item.className}" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>`).join("")}</div>`);
    cursor.setDate(cursor.getDate() + 1);
  }
  grid.innerHTML = cells.join("");
  grid.querySelectorAll("[data-delete-availability]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("¿Retirar esta franja de disponibilidad?")) return;
    const { error } = await supabase.from("calendar_availability").delete().eq("id", button.dataset.deleteAvailability);
    setMessage(error ? "No se pudo retirar la disponibilidad." : "Disponibilidad retirada.", status); await loadCalendar();
  }));
}

async function loadRequests() {
  const target = document.querySelector("#requests-list");
  const { data, error } = await supabase.from("booking_requests").select("id,booking_type,title,starts_at,ends_at,status,places,customer_name,customer_email,customer_phone,notes,created_at").order("created_at", { ascending: false }).limit(100);
  if (error) return target.innerHTML = `<p class="empty-state">No se pudieron consultar las solicitudes.</p>`;
  if (!data.length) return target.innerHTML = `<p class="empty-state">Aún no hay solicitudes. Cuando lleguen, aparecerán aquí.</p>`;
  target.innerHTML = data.map((item) => `<article class="record-row"><div><h3>${escapeHtml(item.title || (item.booking_type === "workshop" ? "Solicitud de taller" : "Solicitud del espacio"))}</h3><p>${escapeHtml(item.customer_name)} · ${escapeHtml(fmtDate(item.starts_at))} · ${escapeHtml(item.status)}${item.places ? ` · ${item.places} plazas` : ""}</p><p>${escapeHtml(item.customer_email)} · ${escapeHtml(item.customer_phone || "Sin teléfono")}</p>${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}</div><div class="record-actions">${item.status === "pending_review" ? `<button class="small-button positive" data-action="approve" data-id="${item.id}" type="button">Aceptar</button><button class="small-button danger" data-action="reject" data-id="${item.id}" type="button">Rechazar</button>` : ""}</div></article>`).join("");
  target.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => decideRequest(button.dataset.id, button.dataset.action)));
}

async function decideRequest(id, action) {
  let patch;
  if (action === "approve") {
    const value = window.prompt("Importe de la señal para este caso (€):");
    if (value === null) return;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return setMessage("Indica una señal válida mayor que 0 €.", status);
    patch = { status: "awaiting_payment", deposit_amount: amount, payment_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
  } else if (!window.confirm("¿Rechazar esta solicitud y liberar la disponibilidad?")) return;
  else patch = { status: "rejected" };
  const { error } = await supabase.from("booking_requests").update(patch).eq("id", id).eq("status", "pending_review");
  if (error) return setMessage("No se pudo actualizar la solicitud. Comprueba que no haya cambiado de estado.", status);
  setMessage(action === "approve" ? "Solicitud aceptada. El aviso y el enlace de pago aún se deben enviar al cliente." : "Solicitud rechazada; disponibilidad liberada.", status);
  await Promise.all([loadRequests(), loadCalendar()]);
}

async function loadWorkshops() {
  const target = document.querySelector("#workshops-list");
  const { data, error } = await supabase.from("workshops").select("id,title,description,starts_at,ends_at,capacity,age_range,indicative_price,image_url,status").order("starts_at", { ascending: true }).limit(100);
  if (error) return target.innerHTML = `<p class="empty-state">No se pudo cargar la programación.</p>`;
  target.innerHTML = data.length ? data.map((item) => `<article class="record-row"><div>${item.image_url ? `<img class="record-thumbnail" src="${escapeHtml(item.image_url)}" alt="">` : ""}<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(fmtDate(item.starts_at, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }))} · ${item.capacity} plazas · ${escapeHtml(item.age_range || "Edad por definir")}</p><p>${item.indicative_price == null ? "Precio a consultar" : `${Number(item.indicative_price).toFixed(2)} € orientativos`} · ${escapeHtml(item.status)}</p>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}</div><div class="record-actions"><button class="small-button" data-edit-workshop="${item.id}" type="button">Editar</button><button class="small-button" data-delete-workshop="${item.id}" type="button">Retirar</button></div></article>`).join("") : `<p class="empty-state">Todavía no hay talleres publicados.</p>`;
  target.querySelectorAll("[data-edit-workshop]").forEach((button) => button.addEventListener("click", () => {
    const item = data.find((workshop) => workshop.id === button.dataset.editWorkshop); if (!item) return;
    const form = document.querySelector("#workshop-form");
    form.elements.id.value = item.id; form.elements.title.value = item.title; form.elements.description.value = item.description || "";
    const start = new Date(item.starts_at); form.elements.starts_at.value = new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    form.elements.duration_minutes.value = Math.max(15, Math.round((new Date(item.ends_at) - start) / 60000));
    form.elements.capacity.value = item.capacity; form.elements.age_range.value = item.age_range || ""; form.elements.indicative_price.value = item.indicative_price ?? "";
    form.elements.image_file.value = ""; form.dataset.existingImage = item.image_url || "";
    document.querySelector("#workshop-dialog-title").textContent = "Editar taller"; document.querySelector("#workshop-save-button").innerHTML = "Guardar cambios <span>↗</span>";
    document.querySelector("#workshop-image-note").textContent = item.image_url ? "Hay una imagen guardada. Selecciona otra solo si quieres sustituirla." : "Imagen opcional; JPG, PNG, WebP o AVIF, máximo 5 MB.";
    openDialog("#workshop-dialog");
  }));
  target.querySelectorAll("[data-delete-workshop]").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("¿Retirar este taller de la programación?")) return;
    const { error: updateError } = await supabase.from("workshops").update({ status: "cancelled" }).eq("id", button.dataset.deleteWorkshop);
    setMessage(updateError ? "No se pudo retirar el taller." : "Taller retirado.", status); await loadWorkshops(); await loadCalendar();
  }));
}

async function loadRates() {
  const target = document.querySelector("#rates-list");
  const { data, error } = await supabase.from("indicative_rates").select("id,label,amount,valid_from,note,is_active").order("valid_from", { ascending: false, nullsFirst: false });
  if (error) return target.innerHTML = `<p class="empty-state">No se pudieron cargar las tarifas.</p>`;
  target.innerHTML = data.length ? data.map((item) => `<article class="record-row"><div><h3>${escapeHtml(item.label)}</h3><p>${Number(item.amount).toFixed(2)} € orientativos${item.valid_from ? ` · desde ${escapeHtml(fmtDate(item.valid_from))}` : ""} · ${item.is_active ? "Activa" : "Archivada"}</p>${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}</div><div class="record-actions"><button class="small-button" data-toggle-rate="${item.id}" data-active="${item.is_active}" type="button">${item.is_active ? "Archivar" : "Reactivar"}</button></div></article>`).join("") : `<p class="empty-state">Aún no hay tarifas. Añádelas cuando Caleta confirme sus importes.</p>`;
  target.querySelectorAll("[data-toggle-rate]").forEach((button) => button.addEventListener("click", async () => {
    const { error: updateError } = await supabase.from("indicative_rates").update({ is_active: button.dataset.active !== "true" }).eq("id", button.dataset.toggleRate);
    setMessage(updateError ? "No se pudo actualizar la tarifa." : "Tarifa actualizada.", status); await loadRates();
  }));
}

async function saveDialogForm(event, table, values, done) {
  event.preventDefault();
  const { error } = await supabase.from(table).insert(values(new FormData(event.currentTarget)));
  if (error) return setMessage("No se pudo guardar. Revisa los campos y la conexión.", status);
  event.currentTarget.closest("dialog").close(); event.currentTarget.reset(); setMessage("Cambios guardados.", status); await done();
}
document.querySelector("#block-form").addEventListener("submit", (event) => saveDialogForm(event, "calendar_blocks", (form) => {
  const day = form.get("date"), period = form.get("period");
  const hours = period === "morning" ? ["09:30", "14:00"] : period === "afternoon" ? ["16:00", "21:30"] : ["09:30", "21:30"];
  return { title: form.get("title"), block_type: "admin", starts_at: new Date(`${day}T${hours[0]}:00`).toISOString(), ends_at: new Date(`${day}T${hours[1]}:00`).toISOString() };
}, loadCalendar));
document.querySelector("#availability-form").addEventListener("submit", (event) => saveDialogForm(event, "calendar_availability", (form) => {
  const day = form.get("date"), period = form.get("period");
  const hours = period === "morning" ? ["09:30", "14:00"] : period === "afternoon" ? ["16:00", "21:30"] : ["09:30", "21:30"];
  return { title: "Espacio disponible", starts_at: new Date(`${day}T${hours[0]}:00`).toISOString(), ends_at: new Date(`${day}T${hours[1]}:00`).toISOString() };
}, loadCalendar));
document.querySelector("#workshop-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget, values = new FormData(form), imageFile = values.get("image_file");
  let imageUrl = form.dataset.existingImage || null;
  if (imageFile?.size) {
    if (!/^image\/(jpeg|png|webp|avif)$/.test(imageFile.type) || imageFile.size > 5 * 1024 * 1024) return setMessage("La imagen debe ser JPG, PNG, WebP o AVIF y pesar hasta 5 MB.", status);
    const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[imageFile.type];
    const path = `workshops/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("caleta-content").upload(path, imageFile, { contentType: imageFile.type, cacheControl: "3600", upsert: false });
    if (uploadError) return setMessage("No se pudo subir la imagen del taller. Comprueba la migración de imágenes.", status);
    imageUrl = supabase.storage.from("caleta-content").getPublicUrl(path).data.publicUrl;
  }
  const start = new Date(values.get("starts_at"));
  const patch = { title: values.get("title"), description: values.get("description") || null, starts_at: start.toISOString(), ends_at: new Date(start.getTime() + Number(values.get("duration_minutes")) * 60000).toISOString(), capacity: Number(values.get("capacity")), age_range: values.get("age_range") || null, indicative_price: values.get("indicative_price") ? Number(values.get("indicative_price")) : null, image_url: imageUrl, status: "published" };
  const id = values.get("id");
  const result = id ? await supabase.from("workshops").update(patch).eq("id", id) : await supabase.from("workshops").insert(patch);
  if (result.error) return setMessage("No se pudo guardar el taller. Revisa que sus datos sean válidos.", status);
  form.reset(); delete form.dataset.existingImage; form.closest("dialog").close();
  document.querySelector("#workshop-dialog-title").textContent = "Nuevo taller"; document.querySelector("#workshop-save-button").innerHTML = "Crear taller <span>↗</span>";
  setMessage(id ? "Taller actualizado." : "Taller creado y publicado.", status); await loadWorkshops(); await loadCalendar();
});
document.querySelector("#rate-form").addEventListener("submit", (event) => saveDialogForm(event, "indicative_rates", (form) => ({
  label: form.get("label"), amount: Number(form.get("amount")), valid_from: form.get("valid_from") || null, note: form.get("note") || null
}), loadRates));

async function loadContentEditor() {
  const { data, error } = await supabase.from("site_content").select("content").eq("id", "homepage").maybeSingle();
  if (error) {
    document.querySelector("#content-fields").innerHTML = `<p class="empty-state">No se puede cargar el editor. Ejecuta la migración <code>202610270001_site_content_manager.sql</code> en Supabase y vuelve a entrar.</p>`;
    return;
  }
  contentDraft = data?.content || { copy: { es: {}, en: {} }, images: {} };
  contentDraft.copy ||= { es: {}, en: {} }; contentDraft.copy.es ||= {}; contentDraft.copy.en ||= {}; contentDraft.images ||= {};
  const editors = copyFields.map((field) => {
    const es = contentDraft.copy.es[field.key] ?? field.es;
    const en = contentDraft.copy.en[field.key] ?? field.en;
    const control = (locale, value) => field.type === "textarea"
      ? `<textarea name="${field.key}-${locale}" data-copy-key="${field.key}" data-locale="${locale}" rows="3" maxlength="600">${escapeHtml(value)}</textarea>`
      : `<input name="${field.key}-${locale}" data-copy-key="${field.key}" data-locale="${locale}" maxlength="180" value="${escapeHtml(value)}">`;
    return `<fieldset class="copy-editor"><legend>${escapeHtml(field.label)}</legend><label>Castellano${control("es", es)}</label><label>English${control("en", en)}</label></fieldset>`;
  }).join("");
  document.querySelector("#content-fields").innerHTML = `<div class="copy-editor-grid">${editors}</div>`;
  document.querySelector("#image-fields").innerHTML = imageFields.map((field) => {
    const url = contentDraft.images[field.key] || "";
    return `<div class="image-editor-card"><strong>${escapeHtml(field.label)}</strong><div class="image-preview" data-image-preview="${field.key}">${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(field.alt)}">` : `<span>Imagen actual del diseño</span>`}</div><label class="upload-control">Seleccionar imagen<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-upload-image="${field.key}"></label><button class="text-button clear-image" type="button" data-clear-image="${field.key}">Usar imagen original</button><p class="upload-status" data-upload-status="${field.key}" role="status"></p></div>`;
  }).join("");
  document.querySelector("#theme-fields").innerHTML = themeFields.map((field) => `<label class="theme-color-field">${escapeHtml(field.label)}<input type="color" name="theme-${field.key}" data-theme-key="${field.key}" value="${/^#[\da-f]{6}$/i.test(contentDraft.theme?.[field.key] || "") ? contentDraft.theme[field.key] : field.fallback}"></label>`).join("");
  document.querySelectorAll("[data-upload-image]").forEach((input) => input.addEventListener("change", () => uploadContentImage(input)));
  document.querySelectorAll("[data-clear-image]").forEach((button) => button.addEventListener("click", () => {
    delete contentDraft.images[button.dataset.clearImage];
    document.querySelector(`[data-image-preview="${button.dataset.clearImage}"]`).innerHTML = "<span>Se usará la imagen original del diseño</span>";
    document.querySelector(`[data-upload-status="${button.dataset.clearImage}"]`).textContent = "Guarda los cambios para retirar la imagen personalizada.";
  }));
}

async function uploadContentImage(input) {
  const file = input.files?.[0]; if (!file) return;
  const statusNode = document.querySelector(`[data-upload-status="${input.dataset.uploadImage}"]`);
  if (!/image\/(jpeg|png|webp|avif)/.test(file.type) || file.size > 5 * 1024 * 1024) {
    statusNode.textContent = "Elige JPG, PNG, WebP o AVIF de hasta 5 MB."; input.value = ""; return;
  }
  statusNode.textContent = "Subiendo imagen…"; input.disabled = true;
  const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" })[file.type];
  const path = `public/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("caleta-content").upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
  input.disabled = false;
  if (error) { statusNode.textContent = "No se pudo subir. Comprueba que la migración esté aplicada."; return; }
  const { data: publicData } = supabase.storage.from("caleta-content").getPublicUrl(path);
  contentDraft.images[input.dataset.uploadImage] = publicData.publicUrl;
  document.querySelector(`[data-image-preview="${input.dataset.uploadImage}"]`).innerHTML = `<img src="${escapeHtml(publicData.publicUrl)}" alt="Vista previa">`;
  statusNode.textContent = "Imagen cargada. Guarda los cambios para publicarla.";
}

document.querySelector("#content-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const copy = { es: {}, en: {} };
  document.querySelectorAll("[data-copy-key]").forEach((field) => { copy[field.dataset.locale][field.dataset.copyKey] = field.value.trim(); });
  const theme = {};
  document.querySelectorAll("[data-theme-key]").forEach((field) => { theme[field.dataset.themeKey] = field.value; });
  for (const locale of ["es", "en"]) {
    if (copy[locale].instagramUrl && !/^https:\/\/www\.instagram\.com\/[\w.]+\/?$/i.test(copy[locale].instagramUrl)) return setMessage("El enlace de Instagram debe ser una dirección válida de instagram.com.", status);
  }
  const { error } = await supabase.from("site_content").upsert({ id: "homepage", content: { copy, images: contentDraft.images, theme } }, { onConflict: "id" });
  setMessage(error ? "No se pudieron guardar los cambios. Comprueba los permisos y la migración." : "Contenido guardado. La web pública lo mostrará al actualizarse.", status);
});

document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
if (!configured) setMessage("El panel está listo, pero aún no se ha conectado la base de datos segura. No se guardan datos aquí.");
else supabase.auth.getSession().then(({ data: { session } }) => { if (session) showDashboard(session.user); });

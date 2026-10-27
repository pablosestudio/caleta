import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

async function initPublicContent() {
const config = window.CALETA_SUPABASE || {};
if (!config.url || !config.publishableKey) return;

const client = createClient(config.url, config.publishableKey);
const { data, error } = await client.from("site_content").select("content").eq("id", "homepage").maybeSingle();
if (error || !data?.content) return;

const content = data.content;
window.CALETA_SITE_COPY = { es: content.copy?.es || {}, en: content.copy?.en || {} };
window.CALETA_APPLY_LANGUAGE?.();

const themeVariables = { paper: "--paper", white: "--white", ink: "--ink", clay: "--clay", clayDark: "--clay-dark" };
for (const [key, variable] of Object.entries(themeVariables)) {
  const value = content.theme?.[key];
  if (typeof value === "string" && /^#[\da-f]{6}$/i.test(value)) document.documentElement.style.setProperty(variable, value);
}

const locale = () => document.documentElement.lang === "en" ? "en" : "es";
function safeImageUrl(value) {
  try {
    const url = new URL(value, location.href);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}
function applyCustomCopy() {
  const title = content.copy?.[locale()]?.seoTitle;
  const description = content.copy?.[locale()]?.seoDescription;
  if (typeof title === "string") document.title = title;
  if (typeof description === "string") document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  for (const node of document.querySelectorAll("[data-site-copy]")) {
    const key = node.dataset.siteCopy;
    if (key === "instagramUrl") {
      const value = content.copy?.[locale()]?.instagramUrl;
      if (typeof value === "string" && /^https:\/\/www\.instagram\.com\/[\w.]+\/?$/i.test(value)) node.href = value;
      continue;
    }
    if (key === "phone-link") {
      const phone = content.copy?.[locale()]?.phone;
      if (typeof phone === "string") {
        node.textContent = phone;
        const digits = phone.replace(/[^+\d]/g, "");
        node.href = `tel:${digits}`;
      }
      continue;
    }
    const value = content.copy?.[locale()]?.[key];
    if (typeof value === "string") { node.textContent = value; node.style.whiteSpace = "pre-line"; }
  }
}
function applyImages() {
  const images = content.images || {};
  for (const node of document.querySelectorAll("[data-site-image]")) {
    const url = safeImageUrl(images[node.dataset.siteImage]);
    if (!url) continue;
    if (node instanceof HTMLImageElement) node.src = url;
    else {
      node.classList.add("has-custom-image");
      const image = document.createElement("img");
      image.className = "workshop-photo";
      image.src = url;
      image.alt = node.getAttribute("aria-label") || "Imagen de un taller de Caleta";
      image.loading = "lazy";
      node.prepend(image);
      node.querySelectorAll(".sensory-art,.paint-art,.play-artwork").forEach((art) => art.hidden = true);
    }
  }
}
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));
async function renderWorkshopSessions() {
  const grid = document.querySelector(".workshop-grid");
  const { data: sessions, error: sessionsError } = await client.rpc("public_workshop_cards");
  if (!grid || sessionsError || !sessions?.length) return;
  const language = locale();
  grid.innerHTML = sessions.map((item) => {
    const start = new Date(item.starts_at), end = new Date(item.ends_at);
    const date = new Intl.DateTimeFormat(language === "en" ? "en-GB" : "es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(start);
    const duration = Math.max(1, Math.round((end - start) / 60000));
    const durationLabel = duration >= 60 ? `${Math.floor(duration / 60)} h${duration % 60 ? ` ${duration % 60} min` : ""}` : `${duration} min`;
    const img = safeImageUrl(item.image_url);
    return `<article class="workshop-card"><div class="workshop-image has-custom-image">${img ? `<img class="workshop-photo" src="${escapeHtml(img)}" alt="Imagen del taller ${escapeHtml(item.title)}" loading="lazy">` : `<span class="session-image-placeholder">✳</span>`}<span class="image-label">${escapeHtml(date)}</span></div><div class="workshop-info"><div class="workshop-meta"><span>${escapeHtml(item.age_range || (language === "en" ? "ALL AGES" : "TODAS LAS EDADES"))}</span><span>${escapeHtml(durationLabel)}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || (language === "en" ? "A creative activity at Caleta." : "Una actividad creativa en Caleta."))}</p><p class="session-price">${item.indicative_price == null ? (language === "en" ? "Price on request" : "Precio a consultar") : `${Number(item.indicative_price).toFixed(2)} €`}${item.remaining_places != null ? ` · ${item.remaining_places} ${language === "en" ? "places left" : "plazas disponibles"}` : ""}</p><a href="#reservar" data-book-workshop="${item.item_id}" data-starts-at="${escapeHtml(item.starts_at)}" data-title="${escapeHtml(item.title)}">${language === "en" ? "Book a place" : "Solicitar plaza"} <span>↗</span></a></div></article>`;
  }).join("");
  grid.querySelectorAll("[data-book-workshop]").forEach((link) => link.addEventListener("click", () => {
    const form = document.querySelector("#booking-form"), start = new Date(link.dataset.startsAt);
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(start).map((part) => [part.type, part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    document.querySelector("#booking-type").value = "workshop"; document.querySelector("#booking-type").dispatchEvent(new Event("change"));
    form.elements.date.value = date; form.elements.workshop_id.value = link.dataset.bookWorkshop;
    const value = `workshop:${link.dataset.bookWorkshop}`, time = form.elements.time;
    let option = time.querySelector(`[value="${CSS.escape(value)}"]`);
    if (!option) { option = document.createElement("option"); option.value = value; time.append(option); }
    option.textContent = link.dataset.title; time.value = value;
  }));
}
applyCustomCopy();
applyImages();
renderWorkshopSessions();
document.querySelector(".language-toggle")?.addEventListener("click", () => {
  window.setTimeout(() => { applyCustomCopy(); renderWorkshopSessions(); }, 0);
});
}

initPublicContent();

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const root = document.querySelector("#public-calendar-grid");
if (root) {
  const config = window.CALETA_SUPABASE || {};
  const month = new Date();
  month.setDate(1);
  let options = [];
  let selectedDate = "";
  const label = document.querySelector("#public-month-label");
  const message = document.querySelector("#public-calendar-message");
  const dayOptions = document.querySelector("#public-day-options");
  const dateField = document.querySelector('#booking-form [name="date"]');
  const client = config.url && config.publishableKey ? createClient(config.url, config.publishableKey) : null;
  document.querySelector('#booking-form [name="date"]').min = new Date().toLocaleDateString("en-CA");

  document.querySelector("#public-prev").addEventListener("click", () => { month.setMonth(month.getMonth() - 1); load(); });
  document.querySelector("#public-next").addEventListener("click", () => { month.setMonth(month.getMonth() + 1); load(); });
  dateField.addEventListener("change", () => { selectedDate = dateField.value; render(); showOptions(selectedDate); });

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  async function load() {
    label.textContent = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(month);
    if (!client) {
      options = []; message.textContent = "El calendario se activará al conectar el sistema seguro de reservas."; render(); return;
    }
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const from = dateKey(first), to = dateKey(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
    message.textContent = "Consultando disponibilidad…";
    const { data, error } = await client.rpc("public_calendar_options", { p_from: from, p_to: to });
    if (error) {
      options = []; message.textContent = "No se ha podido consultar la disponibilidad. Escríbenos y te ayudaremos.";
    } else {
      options = data || [];
      message.textContent = options.length ? "Selecciona un día para consultar horarios o talleres disponibles." : "Todavía no hay fechas disponibles publicadas para este mes. Contacta con Caleta.";
    }
    render();
    if (selectedDate) showOptions(selectedDate);
  }
  function render() {
    const weekdays = ["L", "M", "X", "J", "V", "S", "D"];
    const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = weekdays.map((day) => `<span aria-hidden="true">${day}</span>`);
    for (let i = 0; i < offset; i++) cells.push(`<button type="button" disabled aria-hidden="true"></button>`);
    for (let day = 1; day <= daysInMonth; day++) {
      const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
      const available = options.some((item) => item.date === key && item.available);
      const disabled = !available || key < dateField.min;
      cells.push(`<button type="button" data-date="${key}" class="${available ? "has-availability" : ""}${key === selectedDate ? " is-selected" : ""}" ${disabled ? "disabled" : ""} aria-label="${day}${available ? ", disponible" : ", no disponible"}">${day}</button>`);
    }
    root.innerHTML = cells.join("");
    root.querySelectorAll("[data-date]:not(:disabled)").forEach((button) => button.addEventListener("click", () => {
      selectedDate = button.dataset.date; dateField.value = selectedDate; render(); showOptions(selectedDate);
    }));
  }
  function showOptions(date) {
    const rows = options.filter((item) => item.date === date && item.available);
    dayOptions.innerHTML = rows.map((item, index) => `<button type="button" data-option="${index}">${item.item_type === "workshop" ? `Taller: ${item.label} · ${item.remaining_places} plazas` : `Espacio · ${item.label}`}</button>`).join("");
    dayOptions.querySelectorAll("[data-option]").forEach((button) => button.addEventListener("click", () => {
      const item = rows[Number(button.dataset.option)];
      document.querySelector("#booking-type").value = item.item_type;
      document.querySelector("#booking-type").dispatchEvent(new Event("change"));
      document.querySelector('#booking-form [name="workshop_id"]').value = item.item_type === "workshop" ? item.item_id : "";
      const time = document.querySelector('#booking-form [name="time"]');
      if (item.item_type === "workshop") {
        const value = `workshop:${item.item_id}`;
        let workshopOption = time.querySelector(`[value="${CSS.escape(value)}"]`);
        if (!workshopOption) { workshopOption = document.createElement("option"); workshopOption.value = value; time.append(workshopOption); }
        workshopOption.textContent = `${item.label} · ${new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.starts_at))}`;
        time.value = value;
      } else time.value = item.period;
      message.textContent = item.item_type === "workshop" ? `Has seleccionado ${item.label}.` : `Has seleccionado ${item.label}. Envía la solicitud para que Caleta confirme.`;
    }));
  }
  load();
}

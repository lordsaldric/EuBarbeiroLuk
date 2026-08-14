"use strict";

const database = window.appDatabase;
const timeZone = window.APP_CONFIG.TIME_ZONE;

const fallbackServices = [
  { category: "Cortes", title: "Corte masculino", description: "Corte pensado para o formato do rosto, estilo e preferência de acabamento.", duration_minutes: 40 },
  { category: "Cortes", title: "Corte infantil masculino", description: "Atendimento cuidadoso e corte adequado para o público infantil.", duration_minutes: 40 },
  { category: "Cortes", title: "Corte na máquina", description: "Visual uniforme ou graduado com acabamento preciso na máquina.", duration_minutes: 30 },
  { category: "Cortes", title: "Pezinho masculino", description: "Contornos e acabamento para manter o corte sempre alinhado.", duration_minutes: 20 },
  { category: "Cortes", title: "Corte feminino", description: "Corte personalizado de acordo com o estilo e o movimento dos fios.", duration_minutes: 60 },
  { category: "Cortes", title: "Corte de franja feminino", description: "Ajuste e desenho da franja com atenção ao formato do rosto.", duration_minutes: 30 },
  { category: "Barba", title: "Barba e acabamento", description: "Desenho, alinhamento e contornos definidos para valorizar o rosto.", duration_minutes: 30 },
  { category: "Barba", title: "Bigode", description: "Aparo e acabamento do bigode para um visual limpo e equilibrado.", duration_minutes: 20 },
  { category: "Barba", title: "Corte + barba", description: "Experiência completa para harmonizar cabelo, barba e acabamento.", duration_minutes: 60 },
  { category: "Cor e transformação", title: "Luzes masculinas", description: "Iluminação dos fios com resultado adaptado ao estilo desejado.", duration_minutes: 120 },
  { category: "Cor e transformação", title: "Platinado masculino", description: "Transformação completa para um visual marcante e moderno.", duration_minutes: 180 },
  { category: "Cor e transformação", title: "Coloração", description: "Mudança ou renovação da cor com avaliação prévia dos fios.", duration_minutes: 90 },
  { category: "Cor e transformação", title: "Progressiva masculina", description: "Redução de volume e alinhamento dos fios masculinos.", duration_minutes: 120 },
  { category: "Cor e transformação", title: "Luzes femininas", description: "Iluminação personalizada para criar contraste e movimento.", duration_minutes: 180 },
  { category: "Cor e transformação", title: "Morena iluminada", description: "Pontos de luz para valorizar a cor natural com suavidade.", duration_minutes: 180 },
  { category: "Cor e transformação", title: "Mechas coloridas", description: "Cores criativas aplicadas em mechas selecionadas do cabelo.", duration_minutes: 150 },
  { category: "Tratamentos", title: "Hidratação", description: "Reposição de água para devolver maciez e brilho aos fios.", duration_minutes: 40 },
  { category: "Tratamentos", title: "Matização", description: "Correção e manutenção do tom de cabelos claros ou descoloridos.", duration_minutes: 50 },
  { category: "Tratamentos", title: "Nutrição profunda", description: "Reposição de nutrientes para fios mais alinhados e protegidos.", duration_minutes: 50 },
  { category: "Tratamentos", title: "Reconstrução", description: "Cuidado intensivo para fortalecer cabelos fragilizados.", duration_minutes: 60 },
  { category: "Tratamentos", title: "Selagem dos fios", description: "Tratamento para alinhamento, brilho e controle do frizz.", duration_minutes: 90 },
  { category: "Tratamentos", title: "Relaxamento", description: "Redução de volume com avaliação das condições do cabelo.", duration_minutes: 120 }
];

let catalogueItems = fallbackServices;
let activeCategory = "Cortes";
let activeBarbers = [];
let lastFocusedElement = null;

const booking = { service: null, barber: null, date: "", time: "" };

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function addDays(dateString, amount) {
  const date = new Date(dateString + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function minutesFromTime(time) {
  const parts = String(time).slice(0, 5).split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function timeFromMinutes(minutes) {
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}

function nowMinutesInBarberShop() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const hour = Number(parts.find(function (part) { return part.type === "hour"; }).value);
  const minute = Number(parts.find(function (part) { return part.type === "minute"; }).value);
  return hour * 60 + minute;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date(dateString + "T12:00:00Z"));
}

function showToast(message, kind = "success") {
  const toast = document.getElementById("site-toast");
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(function () { toast.hidden = true; }, 4300);
}

document.getElementById("ano-atual").textContent = new Date().getFullYear();

const header = document.getElementById("cabecalho");
const menuButton = document.querySelector(".menu-button");
const navigation = document.querySelector(".nav");

function updateHeader() {
  header.classList.toggle("is-compact", window.scrollY > 70);
}

updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });
menuButton.addEventListener("click", function () {
  const open = navigation.classList.toggle("is-open");
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
});
navigation.querySelectorAll("a").forEach(function (link) {
  link.addEventListener("click", function () {
    navigation.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Abrir menu");
  });
});

const video = document.querySelector(".showcase-video");
const playButton = document.querySelector(".custom-play");
playButton.addEventListener("click", function () {
  video.play().catch(function () { playButton.hidden = false; });
});
video.addEventListener("play", function () { playButton.hidden = true; });
video.addEventListener("pause", function () { playButton.hidden = false; });
video.addEventListener("ended", function () { playButton.hidden = false; });
video.addEventListener("error", function () {
  video.classList.remove("is-ready");
  playButton.hidden = true;
});

const catalogueGrid = document.querySelector(".catalogue-grid");
const filterButtons = Array.from(document.querySelectorAll(".catalogue-filters button"));

function renderCatalogue() {
  const visibleItems = activeCategory === "Todos"
    ? catalogueItems
    : catalogueItems.filter(function (item) { return item.category === activeCategory; });
  catalogueGrid.innerHTML = "";
  visibleItems.forEach(function (item, index) {
    const card = document.createElement("article");
    card.className = "catalogue-card";
    card.innerHTML = [
      '<div class="catalogue-card-top"><small>' + escapeHtml(item.category) + '</small><span>' + String(index + 1).padStart(2, "0") + "</span></div>",
      "<h3>" + escapeHtml(item.title) + "</h3>",
      "<p>" + escapeHtml(item.description) + "</p>",
      '<button class="catalogue-card-action" type="button" data-service-id="' + escapeHtml(item.id || "") + '" data-service-title="' + escapeHtml(item.title) + '">Agendar este serviço <span aria-hidden="true">↗</span></button>'
    ].join("");
    catalogueGrid.appendChild(card);
  });
}

filterButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    activeCategory = button.dataset.category;
    filterButtons.forEach(function (item) {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderCatalogue();
  });
});

const modalBackdrop = document.getElementById("booking-modal-backdrop");
const modal = modalBackdrop.querySelector(".booking-modal");
const modalCloseButton = modal.querySelector(".barber-modal-close");
const serviceLabel = document.getElementById("servico-escolhido");
const barberGrid = document.getElementById("barber-grid");
const continueButton = modal.querySelector("[data-action='show-details']");
const selectionHint = modal.querySelector(".barber-selection-hint");
const bookingForm = document.getElementById("booking-form");
const dateInput = document.getElementById("appointment-date");
const timeGrid = document.getElementById("time-grid");
const timeHelper = document.getElementById("time-helper");
const bookingMessage = document.getElementById("booking-message");
const confirmButton = document.getElementById("confirm-booking");

function showBookingStep(step) {
  modal.querySelectorAll("[data-booking-step]").forEach(function (section) {
    section.hidden = section.dataset.bookingStep !== step;
  });
  modal.scrollTop = 0;
}

function renderBarbers() {
  const entries = activeBarbers.slice();
  while (entries.length < 4) entries.push(null);
  barberGrid.innerHTML = "";
  entries.forEach(function (barber) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "barber-card";
    if (!barber) {
      card.disabled = true;
      card.setAttribute("aria-disabled", "true");
      card.innerHTML = '<span class="barber-avatar" aria-hidden="true">○</span><span class="barber-card-copy"><strong>Vazio</strong><small>Indisponível</small></span><span class="barber-card-status" aria-hidden="true">×</span>';
    } else {
      card.dataset.barberId = barber.id;
      card.setAttribute("aria-pressed", "false");
      card.innerHTML = '<span class="barber-avatar" aria-hidden="true">' + escapeHtml(barber.initials) + '</span><span class="barber-card-copy"><strong>' + escapeHtml(barber.name) + '</strong><small>Disponível para seleção</small></span><span class="barber-card-status" aria-hidden="true">✓</span>';
      card.addEventListener("click", function () { selectBarber(barber, card); });
    }
    barberGrid.appendChild(card);
  });
}

function selectBarber(barber, card) {
  booking.barber = barber;
  barberGrid.querySelectorAll(".barber-card[data-barber-id]").forEach(function (item) {
    const selected = item === card;
    item.classList.toggle("is-selected", selected);
    item.setAttribute("aria-pressed", String(selected));
  });
  selectionHint.hidden = true;
  continueButton.hidden = false;
  continueButton.innerHTML = "Continuar com " + escapeHtml(barber.name) + ' <span aria-hidden="true">↗</span>';
}

async function openBooking(service, origin) {
  if (!service || !service.id) {
    showToast("A agenda está carregando. Tente novamente em alguns segundos.", "error");
    return;
  }
  booking.service = service;
  booking.barber = null;
  booking.date = "";
  booking.time = "";
  lastFocusedElement = origin;
  serviceLabel.textContent = service.title;
  bookingForm.reset();
  dateInput.min = localDateString();
  dateInput.max = addDays(localDateString(), 90);
  timeGrid.innerHTML = "";
  timeHelper.textContent = "Escolha uma data";
  bookingMessage.textContent = "";
  confirmButton.disabled = true;
  continueButton.hidden = true;
  selectionHint.hidden = false;
  renderBarbers();
  showBookingStep("barber");
  modalBackdrop.hidden = false;
  requestAnimationFrame(function () { modalBackdrop.classList.add("is-open"); });
  document.body.style.overflow = "hidden";
  modalCloseButton.focus();
}

function closeBooking() {
  modalBackdrop.classList.remove("is-open");
  modalBackdrop.hidden = true;
  document.body.style.overflow = "";
  if (lastFocusedElement) lastFocusedElement.focus();
}

function showDetails() {
  if (!booking.barber) return;
  document.getElementById("booking-summary").textContent = booking.service.title + " com " + booking.barber.name + " · duração aproximada de " + booking.service.duration_minutes + " minutos";
  showBookingStep("details");
  document.getElementById("customer-name").focus();
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

async function loadAvailableTimes() {
  booking.date = dateInput.value;
  booking.time = "";
  confirmButton.disabled = true;
  timeGrid.innerHTML = '<span class="time-loading">Consultando a agenda...</span>';
  timeHelper.textContent = "Carregando";
  bookingMessage.textContent = "";
  if (!booking.date || !booking.barber) return;

  const weekday = new Date(booking.date + "T12:00:00Z").getUTCDay();
  const requests = await Promise.all([
    database.from("work_schedules").select("shift_start,shift_end,slot_interval_minutes").eq("barber_id", booking.barber.id).eq("weekday", weekday).eq("active", true).order("shift_start"),
    database.from("blocked_slots").select("start_time,end_time").eq("barber_id", booking.barber.id).eq("block_date", booking.date),
    database.from("appointment_slots").select("start_time,end_time").eq("barber_id", booking.barber.id).eq("appointment_date", booking.date)
  ]);
  const failed = requests.find(function (result) { return result.error; });
  if (failed) {
    timeGrid.innerHTML = '<span class="time-empty">Não foi possível consultar os horários agora.</span>';
    timeHelper.textContent = "Tente novamente";
    return;
  }

  const schedules = requests[0].data || [];
  const blocked = requests[1].data || [];
  const occupied = requests[2].data || [];
  const duration = Number(booking.service.duration_minutes);
  const isToday = booking.date === localDateString();
  const currentMinutes = nowMinutesInBarberShop();
  const available = [];

  schedules.forEach(function (schedule) {
    const shiftStart = minutesFromTime(schedule.shift_start);
    const shiftEnd = minutesFromTime(schedule.shift_end);
    const interval = Number(schedule.slot_interval_minutes);
    for (let start = shiftStart; start + duration <= shiftEnd; start += interval) {
      const end = start + duration;
      const unavailable = blocked.some(function (item) {
        return rangesOverlap(start, end, minutesFromTime(item.start_time), minutesFromTime(item.end_time));
      }) || occupied.some(function (item) {
        return rangesOverlap(start, end, minutesFromTime(item.start_time), minutesFromTime(item.end_time));
      });
      if (!unavailable && (!isToday || start > currentMinutes)) available.push(start);
    }
  });

  const uniqueTimes = Array.from(new Set(available)).sort(function (a, b) { return a - b; });
  timeGrid.innerHTML = "";
  timeHelper.textContent = uniqueTimes.length ? uniqueTimes.length + " opções" : "Sem horários livres";
  if (!uniqueTimes.length) {
    timeGrid.innerHTML = '<span class="time-empty">Não há horários livres nesta data. Escolha outro dia.</span>';
    return;
  }
  uniqueTimes.forEach(function (minutes) {
    const value = timeFromMinutes(minutes);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-option";
    button.textContent = value;
    button.addEventListener("click", function () {
      booking.time = value;
      timeGrid.querySelectorAll(".time-option").forEach(function (item) {
        item.classList.toggle("is-selected", item === button);
      });
      confirmButton.disabled = false;
    });
    timeGrid.appendChild(button);
  });
}

function bookingErrorMessage(error) {
  const detail = String(error && (error.message || error.details || error.code) || "");
  if (error && error.code === "23P01") return "Esse horário acabou de ser reservado. Escolha outra opção.";
  if (detail.includes("BLOCKED_APPOINTMENT")) return "Esse horário foi bloqueado pelo profissional. Escolha outro.";
  if (detail.includes("OUTSIDE_WORK_SCHEDULE")) return "Esse horário não faz mais parte da agenda disponível.";
  if (detail.includes("PAST_APPOINTMENT")) return "O horário escolhido já passou. Atualize a data e tente novamente.";
  return "Não foi possível confirmar agora. Verifique os dados e tente novamente.";
}

async function submitBooking(event) {
  event.preventDefault();
  const customerName = document.getElementById("customer-name").value.trim();
  const customerPhone = document.getElementById("customer-phone").value.trim();
  if (customerName.length < 2 || !booking.date || !booking.time) {
    bookingMessage.textContent = "Preencha seu nome, a data e escolha um horário livre.";
    bookingMessage.dataset.kind = "error";
    return;
  }

  confirmButton.disabled = true;
  confirmButton.classList.add("is-loading");
  bookingMessage.textContent = "Confirmando seu horário...";
  bookingMessage.dataset.kind = "info";
  const result = await database.from("appointments").insert({
    customer_name: customerName,
    customer_phone: customerPhone || null,
    service_id: booking.service.id,
    barber_id: booking.barber.id,
    appointment_date: booking.date,
    appointment_time: booking.time,
    status: "pending"
  });

  confirmButton.classList.remove("is-loading");
  if (result.error) {
    bookingMessage.textContent = bookingErrorMessage(result.error);
    bookingMessage.dataset.kind = "error";
    confirmButton.disabled = false;
    if (result.error.code === "23P01") await loadAvailableTimes();
    return;
  }

  document.getElementById("booking-success-copy").textContent = customerName + ", seu pedido para " + formatDate(booking.date) + " às " + booking.time + ", com " + booking.barber.name + ", foi enviado aos donos da barbearia.";
  showBookingStep("success");
}

catalogueGrid.addEventListener("click", function (event) {
  const button = event.target.closest("[data-service-title]");
  if (!button) return;
  const service = catalogueItems.find(function (item) {
    return item.id === button.dataset.serviceId || item.title === button.dataset.serviceTitle;
  });
  openBooking(service, button);
});

modal.addEventListener("click", function (event) {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  if (action.dataset.action === "close-booking") closeBooking();
  if (action.dataset.action === "show-details") showDetails();
  if (action.dataset.action === "show-barbers") showBookingStep("barber");
});
modalCloseButton.addEventListener("click", closeBooking);
dateInput.addEventListener("change", loadAvailableTimes);
bookingForm.addEventListener("submit", submitBooking);
modalBackdrop.addEventListener("mousedown", function (event) {
  if (event.target === modalBackdrop) closeBooking();
});
window.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !modalBackdrop.hidden) closeBooking();
});

async function loadPublicData() {
  const results = await Promise.all([
    database.from("services").select("id,category,title,description,duration_minutes,sort_order").eq("active", true).order("sort_order"),
    database.from("barbers").select("id,name,initials,sort_order").eq("active", true).order("sort_order")
  ]);
  if (!results[0].error && results[0].data && results[0].data.length) catalogueItems = results[0].data;
  if (!results[1].error) activeBarbers = results[1].data || [];
  renderCatalogue();
  renderBarbers();
  if (results.some(function (result) { return result.error; })) {
    showToast("O catálogo abriu, mas a agenda online está temporariamente indisponível.", "error");
  }
}

renderCatalogue();
loadPublicData();

"use strict";

const database = window.appDatabase;
const timeZone = window.APP_CONFIG.TIME_ZONE;
const weekdayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const statusLabels = { pending: "Pendente", accepted: "Aceito", denied: "Negado", completed: "Concluído" };
const viewTitles = {
  overview: "Visão <em>geral.</em>",
  appointments: "Todos os <em>agendamentos.</em>",
  schedule: "Agenda <em>organizada.</em>",
  barbers: "Equipe de <em>barbeiros.</em>",
  settings: "Horários e <em>bloqueios.</em>"
};

const state = {
  user: null,
  admin: null,
  appointments: [],
  barbers: [],
  services: [],
  schedules: [],
  blocks: [],
  appointmentStatus: "all",
  search: "",
  refreshPromise: null,
  realtimeChannel: null,
  realtimeTimer: null,
  activeOperations: new Set()
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addDays(dateString, amount) {
  const date = new Date(dateString + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateString, short = false) {
  return new Intl.DateTimeFormat("pt-BR", short
    ? { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }
    : { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" }
  ).format(new Date(dateString + "T12:00:00Z")).replaceAll(".", "");
}

function trimTime(value) {
  return String(value || "").slice(0, 5);
}

function showToast(message, kind = "success") {
  const toast = document.getElementById("admin-toast");
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(function () { toast.hidden = true; }, 4200);
}

function setButtonsBusy(buttons, busy, waitingLabel = "Aguarde...") {
  buttons.forEach(function (button) {
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.innerHTML;
      button.innerHTML = waitingLabel;
    } else if (button.dataset.originalLabel) {
      button.innerHTML = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
  });
}

async function runLocked(key, buttons, task) {
  if (state.activeOperations.has(key)) return false;
  state.activeOperations.add(key);
  const list = Array.from(buttons || []).filter(Boolean);
  setButtonsBusy(list, true);
  try {
    await task();
    return true;
  } finally {
    state.activeOperations.delete(key);
    setButtonsBusy(list.filter(function (button) { return button.isConnected; }), false);
  }
}

function setFormBusy(form, busy) {
  const controls = Array.from(form.querySelectorAll("button, input, select"));
  controls.forEach(function (control) {
    control.disabled = busy;
    control.setAttribute("aria-busy", String(busy));
  });
  form.classList.toggle("is-busy", busy);
}

function emptyState(title, copy) {
  return '<div class="admin-empty"><span>✦</span><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(copy) + "</p></div>";
}

function barberName(appointment) {
  return appointment.barbers && appointment.barbers.name || "Barbeiro removido";
}

function serviceName(appointment) {
  return appointment.services && appointment.services.title || "Serviço indisponível";
}

async function requireAdmin() {
  const sessionResult = await database.auth.getSession();
  const session = sessionResult.data.session;
  if (!session) {
    window.location.replace("/admin/login");
    return false;
  }
  const adminResult = await database.from("admin_users").select("display_name,active").eq("user_id", session.user.id).maybeSingle();
  if (adminResult.error || !adminResult.data || !adminResult.data.active) {
    await database.auth.signOut();
    window.location.replace("/admin/login?reason=unauthorized");
    return false;
  }
  state.user = session.user;
  state.admin = adminResult.data;
  return true;
}

async function loadAllData() {
  const results = await Promise.all([
    database.from("appointments").select("id,customer_name,customer_phone,appointment_date,appointment_time,duration_minutes,status,created_at,services(title),barbers(id,name)").order("appointment_date", { ascending: false }).order("appointment_time", { ascending: true }),
    database.from("barbers").select("id,name,initials,active,sort_order,created_at").order("sort_order"),
    database.from("services").select("id,title,category,duration_minutes,active").order("sort_order"),
    database.from("work_schedules").select("id,barber_id,weekday,shift_start,shift_end,slot_interval_minutes,active").order("weekday").order("shift_start"),
    database.from("blocked_slots").select("id,barber_id,block_date,start_time,end_time,reason,created_at").gte("block_date", localDateString()).order("block_date").order("start_time")
  ]);

  const failed = results.find(function (result) { return result.error; });
  if (failed) throw failed.error;
  state.appointments = results[0].data || [];
  state.barbers = results[1].data || [];
  state.services = results[2].data || [];
  state.schedules = results[3].data || [];
  state.blocks = results[4].data || [];
}

async function refreshDashboard(showSuccess = false) {
  if (state.refreshPromise) return state.refreshPromise;
  const indicator = document.getElementById("online-indicator");
  const refreshButton = document.getElementById("refresh-button");
  indicator.classList.add("is-syncing");
  indicator.lastChild.textContent = " Sincronizando";
  if (refreshButton) setButtonsBusy([refreshButton], true, "Atualizando...");
  state.refreshPromise = (async function () {
    try {
      await loadAllData();
      renderAll();
      indicator.classList.remove("is-offline");
      indicator.lastChild.textContent = " Agenda online";
      if (showSuccess) showToast("Painel atualizado com os dados do Supabase.");
    } catch (error) {
      indicator.classList.add("is-offline");
      indicator.lastChild.textContent = " Falha de conexão";
      showToast("Não foi possível atualizar os dados. Tente novamente.", "error");
      return false;
    } finally {
      indicator.classList.remove("is-syncing");
      if (refreshButton) setButtonsBusy([refreshButton], false);
      state.refreshPromise = null;
    }
  })();
  return state.refreshPromise;
}

function scheduleRealtimeRefresh() {
  window.clearTimeout(state.realtimeTimer);
  state.realtimeTimer = window.setTimeout(function () { refreshDashboard(false); }, 250);
}

function subscribeToAppointments() {
  if (state.realtimeChannel) return;
  const indicator = document.getElementById("online-indicator");
  state.realtimeChannel = database
    .channel("admin-appointments-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, scheduleRealtimeRefresh)
    .subscribe(function (status) {
      if (status === "SUBSCRIBED") {
        indicator.classList.remove("is-offline");
        indicator.lastChild.textContent = " Agenda online";
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        indicator.classList.add("is-offline");
        indicator.lastChild.textContent = " Reconectando";
      }
    });
}

function renderProfile() {
  const name = state.admin.display_name || "Administrador";
  document.getElementById("profile-name").textContent = name;
  document.getElementById("profile-email").textContent = state.user.email || "";
  document.getElementById("profile-avatar").textContent = name.charAt(0).toUpperCase();
}

function renderMetrics() {
  const today = localDateString();
  const weekEnd = addDays(today, 7);
  const pending = state.appointments.filter(function (item) { return item.status === "pending"; });
  const acceptedToday = state.appointments.filter(function (item) { return item.appointment_date === today && item.status === "accepted"; });
  const week = state.appointments.filter(function (item) {
    return item.appointment_date >= today && item.appointment_date <= weekEnd && ["pending", "accepted"].includes(item.status);
  });
  const completed = state.appointments.filter(function (item) { return item.status === "completed"; });
  document.getElementById("metric-pending").textContent = pending.length;
  document.getElementById("metric-today").textContent = acceptedToday.length;
  document.getElementById("metric-week").textContent = week.length;
  document.getElementById("metric-completed").textContent = completed.length;
  const badge = document.getElementById("pending-badge");
  badge.textContent = pending.length;
  badge.hidden = !pending.length;
}

function compactAppointment(item, actionRequired) {
  const action = actionRequired
    ? '<div class="compact-actions"><button type="button" data-appointment-action="accepted" data-appointment-id="' + item.id + '">Aceitar</button><button type="button" data-appointment-action="denied" data-appointment-id="' + item.id + '">Negar</button></div>'
    : '<span class="status-pill ' + item.status + '">' + statusLabels[item.status] + "</span>";
  return '<article class="compact-appointment"><time><strong>' + trimTime(item.appointment_time) + '</strong><small>' + formatDate(item.appointment_date, true) + '</small></time><div><strong>' + escapeHtml(item.customer_name) + '</strong><small>' + escapeHtml(serviceName(item)) + " · " + escapeHtml(barberName(item)) + "</small></div>" + action + "</article>";
}

function renderOverview() {
  const today = localDateString();
  const todayItems = state.appointments
    .filter(function (item) { return item.appointment_date === today && item.status !== "denied"; })
    .sort(function (a, b) { return a.appointment_time.localeCompare(b.appointment_time); });
  const pendingItems = state.appointments
    .filter(function (item) { return item.status === "pending"; })
    .sort(function (a, b) { return (a.appointment_date + a.appointment_time).localeCompare(b.appointment_date + b.appointment_time); });
  document.getElementById("today-list").innerHTML = todayItems.length
    ? todayItems.slice(0, 6).map(function (item) { return compactAppointment(item, false); }).join("")
    : emptyState("Agenda livre hoje", "Nenhum atendimento está marcado para este dia.");
  document.getElementById("pending-list").innerHTML = pendingItems.length
    ? pendingItems.slice(0, 6).map(function (item) { return compactAppointment(item, true); }).join("")
    : emptyState("Tudo em dia", "Não há pedidos aguardando aprovação.");
}

function appointmentActions(item) {
  const actions = [];
  if (item.status === "pending") {
    actions.push('<button class="action-accept" type="button" data-appointment-action="accepted" data-appointment-id="' + item.id + '">Aceitar</button>');
    actions.push('<button class="action-deny" type="button" data-appointment-action="denied" data-appointment-id="' + item.id + '">Negar</button>');
  }
  if (item.status === "accepted") {
    actions.push('<button class="action-complete" type="button" data-appointment-action="completed" data-appointment-id="' + item.id + '">Concluir</button>');
    actions.push('<button class="action-deny" type="button" data-appointment-action="denied" data-appointment-id="' + item.id + '">Negar</button>');
  }
  if (item.status === "denied") actions.push('<button type="button" data-appointment-action="pending" data-appointment-id="' + item.id + '">Reabrir</button>');
  return actions.join("");
}

function renderAppointments() {
  const table = document.getElementById("appointment-table");
  const search = state.search.toLocaleLowerCase("pt-BR");
  const items = state.appointments.filter(function (item) {
    const matchesStatus = state.appointmentStatus === "all" || item.status === state.appointmentStatus;
    const haystack = [item.customer_name, item.customer_phone, barberName(item), serviceName(item), item.appointment_date].join(" ").toLocaleLowerCase("pt-BR");
    return matchesStatus && (!search || haystack.includes(search));
  });
  if (!items.length) {
    table.innerHTML = emptyState("Nenhum agendamento encontrado", "Altere os filtros ou aguarde novos pedidos.");
    return;
  }
  table.innerHTML = '<div class="table-header"><span>Cliente</span><span>Serviço</span><span>Profissional</span><span>Data e hora</span><span>Status</span><span>Ações</span></div>' + items.map(function (item) {
    return '<article class="table-row"><div data-label="Cliente"><strong>' + escapeHtml(item.customer_name) + '</strong><small>' + escapeHtml(item.customer_phone || "Sem telefone") + '</small></div><div data-label="Serviço"><strong>' + escapeHtml(serviceName(item)) + '</strong><small>' + item.duration_minutes + ' minutos</small></div><div data-label="Profissional"><strong>' + escapeHtml(barberName(item)) + '</strong></div><div data-label="Data e hora"><strong>' + formatDate(item.appointment_date, true) + '</strong><small>' + trimTime(item.appointment_time) + '</small></div><div data-label="Status"><span class="status-pill ' + item.status + '">' + statusLabels[item.status] + '</span></div><div class="row-actions" data-label="Ações">' + appointmentActions(item) + "</div></article>";
  }).join("");
}

function renderSchedule() {
  const date = document.getElementById("schedule-date").value || localDateString();
  const barberFilter = document.getElementById("schedule-barber").value || "all";
  const barbers = state.barbers.filter(function (barber) { return barber.active && (barberFilter === "all" || barber.id === barberFilter); });
  const board = document.getElementById("schedule-board");
  if (!barbers.length) {
    board.innerHTML = emptyState("Nenhum barbeiro selecionado", "Adicione ou ative um profissional para visualizar a agenda.");
    return;
  }
  board.innerHTML = barbers.map(function (barber) {
    const items = state.appointments
      .filter(function (item) { return item.appointment_date === date && item.barbers && item.barbers.id === barber.id && item.status !== "denied"; })
      .sort(function (a, b) { return a.appointment_time.localeCompare(b.appointment_time); });
    const content = items.length ? items.map(function (item) {
      return '<article class="schedule-item ' + item.status + '"><time>' + trimTime(item.appointment_time) + '</time><div><strong>' + escapeHtml(item.customer_name) + '</strong><small>' + escapeHtml(serviceName(item)) + '</small></div><span class="status-pill ' + item.status + '">' + statusLabels[item.status] + "</span></article>";
    }).join("") : '<div class="schedule-free">Nenhum atendimento neste dia</div>';
    return '<section class="schedule-column"><header><span class="barber-initial">' + escapeHtml(barber.initials) + '</span><div><strong>' + escapeHtml(barber.name) + '</strong><small>' + formatDate(date) + "</small></div></header>" + content + "</section>";
  }).join("");
}

function renderBarbers() {
  const list = document.getElementById("barber-admin-list");
  list.innerHTML = state.barbers.length ? state.barbers.map(function (barber) {
    const appointmentCount = state.appointments.filter(function (item) { return item.barbers && item.barbers.id === barber.id; }).length;
    return '<article class="barber-admin-card"><span class="barber-initial">' + escapeHtml(barber.initials) + '</span><div><strong>' + escapeHtml(barber.name) + '</strong><small>' + (barber.active ? "Disponível no site" : "Desativado") + " · " + appointmentCount + ' agendamentos</small></div><span class="status-dot ' + (barber.active ? "active" : "inactive") + '"></span><div class="barber-admin-actions"><button type="button" data-edit-barber="' + barber.id + '">Editar</button><button type="button" data-remove-barber="' + barber.id + '">Remover</button></div></article>';
  }).join("") : emptyState("Nenhum barbeiro cadastrado", "Adicione o primeiro profissional da equipe.");
}

function renderSelects() {
  const active = state.barbers.filter(function (barber) { return barber.active; });
  const options = active.map(function (barber) { return '<option value="' + barber.id + '">' + escapeHtml(barber.name) + "</option>"; }).join("");
  document.getElementById("schedule-barber").innerHTML = '<option value="all">Todos os barbeiros</option>' + options;
  document.getElementById("shift-barber").innerHTML = options;
  document.getElementById("block-barber").innerHTML = options;
}

function renderSettings() {
  const shifts = state.schedules.slice().sort(function (a, b) {
    return (a.barber_id + a.weekday + a.shift_start).localeCompare(b.barber_id + b.weekday + b.shift_start);
  });
  document.getElementById("shift-list").innerHTML = shifts.length ? shifts.map(function (shift) {
    const barber = state.barbers.find(function (item) { return item.id === shift.barber_id; });
    return '<article><div><strong>' + escapeHtml(barber ? barber.name : "Barbeiro removido") + " · " + weekdayNames[shift.weekday] + '</strong><small>' + trimTime(shift.shift_start) + " às " + trimTime(shift.shift_end) + " · intervalos de " + shift.slot_interval_minutes + ' min</small></div><button type="button" data-delete-shift="' + shift.id + '" aria-label="Remover turno">×</button></article>';
  }).join("") : emptyState("Nenhum turno configurado", "Adicione dias e horários de trabalho.");

  document.getElementById("block-list").innerHTML = state.blocks.length ? state.blocks.map(function (block) {
    const barber = state.barbers.find(function (item) { return item.id === block.barber_id; });
    return '<article><div><strong>' + escapeHtml(barber ? barber.name : "Barbeiro removido") + " · " + formatDate(block.block_date, true) + '</strong><small>' + trimTime(block.start_time) + " às " + trimTime(block.end_time) + (block.reason ? " · " + escapeHtml(block.reason) : "") + '</small></div><button type="button" data-delete-block="' + block.id + '" aria-label="Remover bloqueio">×</button></article>';
  }).join("") : emptyState("Nenhum bloqueio futuro", "Os horários configurados estão livres para agendamento.");
}

function renderAll() {
  renderMetrics();
  renderOverview();
  renderAppointments();
  renderSelects();
  renderSchedule();
  renderBarbers();
  renderSettings();
}

function showView(view) {
  document.querySelectorAll("[data-admin-view]").forEach(function (section) {
    const active = section.dataset.adminView === view;
    section.classList.toggle("is-active", active);
    section.hidden = !active;
  });
  document.querySelectorAll("[data-view]").forEach(function (button) {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  document.getElementById("view-title").innerHTML = viewTitles[view];
  document.querySelector(".admin-sidebar").classList.remove("is-open");
  if (view === "schedule") renderSchedule();
}

async function updateAppointmentStatus(id, status, sourceButton) {
  const buttons = document.querySelectorAll('[data-appointment-id="' + CSS.escape(id) + '"]');
  await runLocked("appointment:" + id, buttons.length ? buttons : [sourceButton], async function () {
    const result = await database.from("appointments").update({ status }).eq("id", id).select("id,status").single();
    if (result.error) {
      const conflict = result.error.code === "23P01";
      showToast(conflict ? "Esse horário entra em conflito com outro agendamento." : "Não foi possível atualizar o status.", "error");
      return;
    }
    await refreshDashboard(false);
    showToast("Agendamento marcado como " + statusLabels[status].toLowerCase() + ".");
  });
}

document.addEventListener("click", function (event) {
  const statusButton = event.target.closest("[data-appointment-action]");
  if (statusButton) updateAppointmentStatus(statusButton.dataset.appointmentId, statusButton.dataset.appointmentAction, statusButton);
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) showView(viewButton.dataset.view);
  const goButton = event.target.closest("[data-go-view]");
  if (goButton) showView(goButton.dataset.goView);
});

document.querySelectorAll("[data-status]").forEach(function (button) {
  button.addEventListener("click", function () {
    state.appointmentStatus = button.dataset.status;
    document.querySelectorAll("[data-status]").forEach(function (item) { item.classList.toggle("is-active", item === button); });
    renderAppointments();
  });
});

document.getElementById("appointment-search").addEventListener("input", function (event) {
  state.search = event.target.value.trim();
  renderAppointments();
});
document.getElementById("schedule-date").addEventListener("change", renderSchedule);
document.getElementById("schedule-barber").addEventListener("change", renderSchedule);
document.querySelector(".sidebar-toggle").addEventListener("click", function () { document.querySelector(".admin-sidebar").classList.toggle("is-open"); });
document.getElementById("refresh-button").addEventListener("click", function () { refreshDashboard(true); });
document.getElementById("logout-button").addEventListener("click", async function () {
  const button = document.getElementById("logout-button");
  await runLocked("logout", [button], async function () {
    const result = await database.auth.signOut();
    if (result.error) {
      showToast("Não foi possível sair da conta. Tente novamente.", "error");
      return;
    }
    window.location.replace("/admin/login");
  });
});

function resetBarberForm() {
  document.getElementById("barber-form").reset();
  document.getElementById("barber-id").value = "";
  document.getElementById("barber-active").checked = true;
  document.getElementById("barber-form-kicker").textContent = "Novo profissional";
  document.getElementById("barber-form-title").textContent = "Adicionar barbeiro";
  document.getElementById("barber-message").textContent = "";
}

document.getElementById("new-barber-button").addEventListener("click", resetBarberForm);
document.getElementById("barber-admin-list").addEventListener("click", async function (event) {
  const edit = event.target.closest("[data-edit-barber]");
  if (edit) {
    const barber = state.barbers.find(function (item) { return item.id === edit.dataset.editBarber; });
    if (!barber) return;
    document.getElementById("barber-id").value = barber.id;
    document.getElementById("barber-name").value = barber.name;
    document.getElementById("barber-initials").value = barber.initials;
    document.getElementById("barber-active").checked = barber.active;
    document.getElementById("barber-form-kicker").textContent = "Editar profissional";
    document.getElementById("barber-form-title").textContent = barber.name;
  }

  const remove = event.target.closest("[data-remove-barber]");
  if (remove) {
    const barber = state.barbers.find(function (item) { return item.id === remove.dataset.removeBarber; });
    if (!barber || !window.confirm("Remover " + barber.name + " da equipe?")) return;
    await runLocked("remove-barber:" + barber.id, [remove], async function () {
      const result = await database.from("barbers").delete().eq("id", barber.id);
      if (result.error) {
        const deactivated = await database.from("barbers").update({ active: false }).eq("id", barber.id);
        if (deactivated.error) {
          showToast("Não foi possível remover o barbeiro.", "error");
          return;
        }
        showToast("O barbeiro possui histórico e foi desativado.");
      } else showToast("Barbeiro removido.");
      await refreshDashboard(false);
      resetBarberForm();
    });
  }
});

document.getElementById("barber-form").addEventListener("submit", async function (event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (state.activeOperations.has("save-barber")) return;
  const id = document.getElementById("barber-id").value;
  const payload = {
    name: document.getElementById("barber-name").value.trim(),
    initials: document.getElementById("barber-initials").value.trim().toUpperCase(),
    active: document.getElementById("barber-active").checked
  };
  const message = document.getElementById("barber-message");
  state.activeOperations.add("save-barber");
  setFormBusy(form, true);
  try {
    const result = id
      ? await database.from("barbers").update(payload).eq("id", id)
      : await database.from("barbers").insert({ ...payload, sort_order: state.barbers.length * 10 + 10 });
    if (result.error) {
      message.textContent = result.error.code === "23505" ? "Já existe um barbeiro com esse nome." : "Não foi possível salvar o barbeiro.";
      message.dataset.kind = "error";
      return;
    }
    showToast(id ? "Barbeiro atualizado." : "Barbeiro adicionado.");
    await refreshDashboard(false);
    resetBarberForm();
  } finally {
    state.activeOperations.delete("save-barber");
    setFormBusy(form, false);
  }
});

document.getElementById("schedule-form").addEventListener("submit", async function (event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (state.activeOperations.has("save-shift")) return;
  const payload = {
    barber_id: document.getElementById("shift-barber").value,
    weekday: Number(document.getElementById("shift-weekday").value),
    shift_start: document.getElementById("shift-start").value,
    shift_end: document.getElementById("shift-end").value,
    slot_interval_minutes: Number(document.getElementById("shift-interval").value),
    active: true
  };
  const message = document.getElementById("schedule-message");
  if (!payload.shift_start || !payload.shift_end || payload.shift_start >= payload.shift_end) {
    message.textContent = "O horário final deve ser posterior ao inicial.";
    message.dataset.kind = "error";
    return;
  }
  state.activeOperations.add("save-shift");
  setFormBusy(form, true);
  try {
    const result = await database.from("work_schedules").insert(payload);
    if (result.error) {
      message.textContent = result.error.code === "23505" ? "Esse turno já está cadastrado." : "Não foi possível adicionar o turno.";
      message.dataset.kind = "error";
      return;
    }
    form.reset();
    message.textContent = "";
    showToast("Turno adicionado.");
    await refreshDashboard(false);
  } finally {
    state.activeOperations.delete("save-shift");
    setFormBusy(form, false);
  }
});

document.getElementById("shift-list").addEventListener("click", async function (event) {
  const button = event.target.closest("[data-delete-shift]");
  if (!button || !window.confirm("Remover este turno de trabalho?")) return;
  await runLocked("delete-shift:" + button.dataset.deleteShift, [button], async function () {
    const result = await database.from("work_schedules").delete().eq("id", button.dataset.deleteShift);
    if (result.error) {
      showToast("Não foi possível remover o turno.", "error");
      return;
    }
    await refreshDashboard(false);
    showToast("Turno removido.");
  });
});

document.getElementById("block-form").addEventListener("submit", async function (event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (state.activeOperations.has("save-block")) return;
  const payload = {
    barber_id: document.getElementById("block-barber").value,
    block_date: document.getElementById("block-date").value,
    start_time: document.getElementById("block-start").value,
    end_time: document.getElementById("block-end").value,
    reason: document.getElementById("block-reason").value.trim()
  };
  const message = document.getElementById("block-message");
  if (!payload.block_date || payload.block_date < localDateString() || !payload.start_time || payload.start_time >= payload.end_time) {
    message.textContent = "Escolha uma data válida e um intervalo de horário correto.";
    message.dataset.kind = "error";
    return;
  }
  state.activeOperations.add("save-block");
  setFormBusy(form, true);
  try {
    const result = await database.from("blocked_slots").insert(payload);
    if (result.error) {
      message.textContent = result.error.code === "23505" ? "Esse bloqueio já existe." : "Não foi possível bloquear o horário.";
      message.dataset.kind = "error";
      return;
    }
    form.reset();
    document.getElementById("block-date").min = localDateString();
    message.textContent = "";
    showToast("Horário bloqueado.");
    await refreshDashboard(false);
  } finally {
    state.activeOperations.delete("save-block");
    setFormBusy(form, false);
  }
});

document.getElementById("block-list").addEventListener("click", async function (event) {
  const button = event.target.closest("[data-delete-block]");
  if (!button || !window.confirm("Liberar este horário novamente?")) return;
  await runLocked("delete-block:" + button.dataset.deleteBlock, [button], async function () {
    const result = await database.from("blocked_slots").delete().eq("id", button.dataset.deleteBlock);
    if (result.error) {
      showToast("Não foi possível liberar o horário.", "error");
      return;
    }
    await refreshDashboard(false);
    showToast("Horário liberado.");
  });
});

async function initializeDashboard() {
  if (!await requireAdmin()) return;
  renderProfile();
  document.getElementById("schedule-date").value = localDateString();
  document.getElementById("block-date").min = localDateString();
  const loaded = await refreshDashboard(false);
  if (loaded !== false) {
    document.body.classList.remove("is-loading");
    document.getElementById("admin-loader").hidden = true;
    subscribeToAppointments();
  } else {
    document.getElementById("admin-loader").innerHTML = '<span>!</span><p>Não foi possível carregar o painel. Atualize a página.</p>';
  }
}

database.auth.onAuthStateChange(function (event) {
  if (event === "SIGNED_OUT") window.location.replace("/admin/login");
});

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && state.user) refreshDashboard(false);
});

window.addEventListener("beforeunload", function () {
  window.clearTimeout(state.realtimeTimer);
  if (state.realtimeChannel) database.removeChannel(state.realtimeChannel);
});

initializeDashboard();

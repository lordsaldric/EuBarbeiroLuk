"use strict";

// Insira o número do WhatsApp com DDD e código do país, somente números.
// Exemplo: const WHATSAPP_NUMBER = "5577999999999";
const WHATSAPP_NUMBER = "";

const catalogueItems = [
  { category: "Cortes", title: "Corte masculino", text: "Corte pensado para o formato do rosto, estilo e preferência de acabamento." },
  { category: "Cortes", title: "Corte infantil masculino", text: "Atendimento cuidadoso e corte adequado para o público infantil." },
  { category: "Cortes", title: "Corte na máquina", text: "Visual uniforme ou graduado com acabamento preciso na máquina." },
  { category: "Cortes", title: "Pezinho masculino", text: "Contornos e acabamento para manter o corte sempre alinhado." },
  { category: "Cortes", title: "Corte feminino", text: "Corte personalizado de acordo com o estilo e o movimento dos fios." },
  { category: "Cortes", title: "Corte de franja feminino", text: "Ajuste e desenho da franja com atenção ao formato do rosto." },
  { category: "Barba", title: "Barba e acabamento", text: "Desenho, alinhamento e contornos definidos para valorizar o rosto." },
  { category: "Barba", title: "Bigode", text: "Aparo e acabamento do bigode para um visual limpo e equilibrado." },
  { category: "Barba", title: "Corte + barba", text: "Experiência completa para harmonizar cabelo, barba e acabamento." },
  { category: "Cor e transformação", title: "Luzes masculinas", text: "Iluminação dos fios com resultado adaptado ao estilo desejado." },
  { category: "Cor e transformação", title: "Platinado masculino", text: "Transformação completa para um visual marcante e moderno." },
  { category: "Cor e transformação", title: "Coloração", text: "Mudança ou renovação da cor com avaliação prévia dos fios." },
  { category: "Cor e transformação", title: "Progressiva masculina", text: "Redução de volume e alinhamento dos fios masculinos." },
  { category: "Cor e transformação", title: "Luzes femininas", text: "Iluminação personalizada para criar contraste e movimento." },
  { category: "Cor e transformação", title: "Morena iluminada", text: "Pontos de luz para valorizar a cor natural com suavidade." },
  { category: "Cor e transformação", title: "Mechas coloridas", text: "Cores criativas aplicadas em mechas selecionadas do cabelo." },
  { category: "Tratamentos", title: "Hidratação", text: "Reposição de água para devolver maciez e brilho aos fios." },
  { category: "Tratamentos", title: "Matização", text: "Correção e manutenção do tom de cabelos claros ou descoloridos." },
  { category: "Tratamentos", title: "Nutrição profunda", text: "Reposição de nutrientes para fios mais alinhados e protegidos." },
  { category: "Tratamentos", title: "Reconstrução", text: "Cuidado intensivo para fortalecer cabelos fragilizados." },
  { category: "Tratamentos", title: "Selagem dos fios", text: "Tratamento para alinhamento, brilho e controle do frizz." },
  { category: "Tratamentos", title: "Relaxamento", text: "Redução de volume com avaliação das condições do cabelo." }
];

function whatsappUrl(message) {
  const base = WHATSAPP_NUMBER ? "https://wa.me/" + WHATSAPP_NUMBER : "https://wa.me/";
  return base + "?text=" + encodeURIComponent(message);
}

document.querySelectorAll(".whatsapp-link").forEach(function (link) {
  link.href = whatsappUrl(link.dataset.message || "");
});

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
  video.play().catch(function () {
    playButton.hidden = false;
  });
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
let activeCategory = "Cortes";

function renderCatalogue() {
  const visibleItems = activeCategory === "Todos"
    ? catalogueItems
    : catalogueItems.filter(function (item) { return item.category === activeCategory; });

  catalogueGrid.innerHTML = "";
  visibleItems.forEach(function (item, index) {
    const card = document.createElement("article");
    card.className = "catalogue-card";
    card.innerHTML = [
      '<div class="catalogue-card-top"><small>' + item.category + '</small><span>' + String(index + 1).padStart(2, "0") + "</span></div>",
      "<h3>" + item.title + "</h3>",
      "<p>" + item.text + "</p>",
      '<button class="catalogue-card-action" type="button" data-service="' + item.title + '">Escolher barbeiro <span aria-hidden="true">↗</span></button>'
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

const modalBackdrop = document.getElementById("barber-modal-backdrop");
const modal = modalBackdrop.querySelector(".barber-modal");
const modalCloseButton = modal.querySelector(".barber-modal-close");
const modalBackButton = modal.querySelector(".barber-back-button");
const serviceLabel = document.getElementById("servico-escolhido");
const barberCards = Array.from(modal.querySelectorAll(".barber-card[data-barber]"));
const continueLink = modal.querySelector(".barber-continue");
const selectionHint = modal.querySelector(".barber-selection-hint");
let selectedService = "";
let selectedBarber = "";
let lastFocusedElement = null;

function openModal(service, origin) {
  selectedService = service;
  selectedBarber = "";
  lastFocusedElement = origin;
  serviceLabel.textContent = service;
  barberCards.forEach(function (card) {
    card.classList.remove("is-selected");
    card.setAttribute("aria-pressed", "false");
  });
  continueLink.hidden = true;
  selectionHint.hidden = false;
  modalBackdrop.hidden = false;
  modalBackdrop.classList.add("is-open");
  document.body.style.overflow = "hidden";
  modalCloseButton.focus();
}

function closeModal() {
  modalBackdrop.classList.remove("is-open");
  modalBackdrop.hidden = true;
  document.body.style.overflow = "";
  if (lastFocusedElement) lastFocusedElement.focus();
}

catalogueGrid.addEventListener("click", function (event) {
  const button = event.target.closest("[data-service]");
  if (button) openModal(button.dataset.service, button);
});

barberCards.forEach(function (card) {
  card.addEventListener("click", function () {
    selectedBarber = card.dataset.barber;
    barberCards.forEach(function (item) {
      const selected = item === card;
      item.classList.toggle("is-selected", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    selectionHint.hidden = true;
    continueLink.hidden = false;
    continueLink.innerHTML = "Continuar com " + selectedBarber + ' <span aria-hidden="true">↗</span>';
    continueLink.href = whatsappUrl("Olá! Gostaria de consultar valor e horário para " + selectedService.toLowerCase() + " com " + selectedBarber + " na Eu Barbeiro Luk.");
  });
});

modalCloseButton.addEventListener("click", closeModal);
modalBackButton.addEventListener("click", closeModal);
continueLink.addEventListener("click", closeModal);

modalBackdrop.addEventListener("mousedown", function (event) {
  if (event.target === modalBackdrop) closeModal();
});

window.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && !modalBackdrop.hidden) closeModal();
});

renderCatalogue();

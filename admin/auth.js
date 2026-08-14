"use strict";

const database = window.appDatabase;
const authMode = document.body.dataset.authMode;
const authMessage = document.getElementById("auth-message");

function setMessage(message, kind = "error") {
  authMessage.textContent = message;
  authMessage.dataset.kind = kind;
}

function setLoading(form, loading) {
  const button = form.querySelector("button[type='submit']");
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
}

async function hasAdminAccess(userId) {
  const result = await database.from("admin_users").select("user_id,active").eq("user_id", userId).maybeSingle();
  return !result.error && Boolean(result.data && result.data.active);
}

function callbackUrl() {
  return new URL("/admin/callback", window.location.origin).href;
}

function showMessageFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("confirmed") === "1") setMessage("Email confirmado. Entre com sua senha para abrir o painel.", "success");
  if (params.get("reason") === "unauthorized") setMessage("Este usuário não possui autorização administrativa.");
}

document.querySelectorAll("[data-toggle-password]").forEach(function (button) {
  button.addEventListener("click", function () {
    const input = button.parentElement.querySelector("input");
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.textContent = showing ? "Ver" : "Ocultar";
    button.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
  });
});

async function redirectActiveAdmin() {
  try {
    const sessionResult = await database.auth.getSession();
    const user = sessionResult.data.session && sessionResult.data.session.user;
    if (user && await hasAdminAccess(user.id)) window.location.replace("/admin");
  } catch (error) {
    setMessage("Não foi possível verificar a sessão agora. Você ainda pode entrar com email e senha.", "info");
  }
}

if (authMode === "login") {
  const form = document.getElementById("login-form");
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setLoading(form, true);
    setMessage("Verificando seu acesso...", "info");
    const formData = new FormData(form);
    const result = await database.auth.signInWithPassword({
      email: String(formData.get("email")).trim().toLowerCase(),
      password: String(formData.get("password"))
    });

    if (result.error) {
      setMessage("E-mail ou senha incorretos.");
      setLoading(form, false);
      return;
    }

    if (!await hasAdminAccess(result.data.user.id)) {
      await database.auth.signOut();
      setMessage("Este usuário não possui autorização administrativa.");
      setLoading(form, false);
      return;
    }
    window.location.replace("/admin");
  });
}

if (authMode === "register") {
  const form = document.getElementById("register-form");
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    setLoading(form, true);
    setMessage("Criando seu acesso protegido...", "info");
    const formData = new FormData(form);
    const email = String(formData.get("email")).trim().toLowerCase();
    const password = String(formData.get("password"));
    const result = await database.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl() }
    });

    if (result.error) {
      const message = result.error.message && result.error.message.toLowerCase().includes("already")
        ? "Este e-mail já possui cadastro. Use a página de login."
        : "Não foi possível criar o acesso. Confira o e-mail e a senha.";
      setMessage(message);
      setLoading(form, false);
      return;
    }

    if (!result.data.session) {
      setMessage("Acesse seu e-mail e confirme o cadastro. Depois, entre pela página de login.", "success");
      form.reset();
      setLoading(form, false);
      return;
    }

    if (!await hasAdminAccess(result.data.user.id)) {
      await database.auth.signOut();
      setMessage("Este e-mail ainda não foi autorizado pelos donos.");
      setLoading(form, false);
      return;
    }
    window.location.replace("/admin");
  });
}

showMessageFromUrl();
redirectActiveAdmin();

"use strict";

const database = window.appDatabase;
const message = document.getElementById("callback-message");
const spinner = document.getElementById("callback-spinner");
const link = document.getElementById("callback-link");

function showFailure(copy, destination = "/admin/login") {
  spinner.hidden = true;
  message.textContent = copy;
  message.dataset.kind = "error";
  link.href = destination;
  link.hidden = false;
}

async function hasAdminAccess(userId) {
  const result = await database.from("admin_users").select("user_id,active").eq("user_id", userId).maybeSingle();
  return !result.error && Boolean(result.data && result.data.active);
}

async function getCallbackSession() {
  const url = new URL(window.location.href);
  const authError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (authError) throw new Error(authError);

  const code = url.searchParams.get("code");
  if (code) {
    const exchange = await database.auth.exchangeCodeForSession(code);
    if (exchange.error) throw exchange.error;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await database.auth.getSession();
    if (result.error) throw result.error;
    if (result.data.session) return result.data.session;
    await new Promise(function (resolve) { window.setTimeout(resolve, 150); });
  }
  return null;
}

async function completeCallback() {
  try {
    const session = await getCallbackSession();
    if (!session) {
      window.location.replace("/admin/login?confirmed=1");
      return;
    }
    if (!await hasAdminAccess(session.user.id)) {
      await database.auth.signOut();
      showFailure("O email foi confirmado, mas esta conta não possui autorização administrativa.");
      return;
    }
    message.textContent = "Acesso confirmado. Abrindo o painel...";
    message.dataset.kind = "success";
    window.location.replace("/admin");
  } catch (error) {
    showFailure("Não foi possível concluir a confirmação. O link pode ter expirado; tente entrar com seu email e senha.");
  }
}

completeCallback();

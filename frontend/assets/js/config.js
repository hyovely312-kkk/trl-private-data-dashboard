const apiBaseParam = new URLSearchParams(location.search).get("api_base");
if (apiBaseParam) localStorage.setItem("TRL_API_BASE", apiBaseParam);
const DEFAULT_API_BASE = localStorage.getItem("TRL_API_BASE") || "http://localhost:8000";

function initApiInput() {
  const input = document.querySelector("[data-api-base]");
  if (!input) return;
  input.value = DEFAULT_API_BASE;
  input.addEventListener("change", () => {
    localStorage.setItem("TRL_API_BASE", input.value.trim() || "http://localhost:8000");
    location.reload();
  });
}

function setActiveNav() {
  const page = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((link) => {
    if (link.getAttribute("href") === page) link.classList.add("active");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initApiInput();
  setActiveNav();
});

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

function showFileModeNotice() {
  if (location.protocol !== "file:") return;
  const main = document.querySelector(".main");
  const topbar = document.querySelector(".topbar");
  if (!main || !topbar || document.getElementById("fileModeNotice")) return;
  topbar.insertAdjacentHTML("afterend", `
    <section id="fileModeNotice" class="notice" style="margin-bottom:16px">
      <strong>Local file mode</strong>
      <p>CSV/JSON 로그와 Mermaid 시각화는 브라우저 보안정책 때문에 file://에서 일부 깨질 수 있습니다. 정확한 대시보드는 frontend 폴더에서 <code>python3 -m http.server 5504</code> 실행 후 <code>http://localhost:5504/</code>로 확인하세요.</p>
    </section>
  `);
}

document.addEventListener("DOMContentLoaded", () => {
  initApiInput();
  setActiveNav();
  showFileModeNotice();
});

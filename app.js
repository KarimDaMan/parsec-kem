const launchButton = document.querySelector("#launch-parsec");
const browserNote = document.querySelector("#browser-note");

const isChromium = /Chrome|Chromium|CriOS|Edg|OPR|Brave/i.test(
  navigator.userAgent,
);

if (!isChromium) {
  browserNote.innerHTML =
    "<span aria-hidden=\"true\">●</span> Parsec Web requires Chrome or a Chromium-based browser.";
  browserNote.classList.add("browser-warning");
}

launchButton.addEventListener("click", () => {
  launchButton.querySelector("span:first-child").textContent = "Opening Parsec…";
});

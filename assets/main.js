// Minimal JS: year + a placeholder action
document.addEventListener("DOMContentLoaded", () => {
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const resumeBtn = document.querySelector('[data-action="resume"]');
  if (resumeBtn) {
    resumeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      alert("Replace this with your real resume link.");
    });
  }
});

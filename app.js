/* =========================================================
   ALGOCLOCK v1 — app.js
   Sections: STORAGE -> STATE -> ROUTER -> DASHBOARD -> TIMER -> TRACKING -> MODAL -> INIT
   ========================================================= */

/* ---------------- STORAGE ---------------- */
const STORAGE_KEYS = {
  questions: "algoclock_questions",
  sessions: "algoclock_sessions" // { date: "YYYY-MM-DD", minutes: n }
};

function loadQuestions() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.questions) || "[]");
}
function saveQuestions(list) {
  localStorage.setItem(STORAGE_KEYS.questions, JSON.stringify(list));
}
function loadSessions() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.sessions) || "[]");
}
function saveSessions(list) {
  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(list));
}

/* ---------------- STATE ---------------- */
let questions = loadQuestions();
let sessions = loadSessions();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function logSessionMinutes(minutes) {
  const today = todayStr();
  const existing = sessions.find(s => s.date === today);
  if (existing) existing.minutes += minutes;
  else sessions.push({ date: today, minutes });
  saveSessions(sessions);
}

function computeStreak() {
  if (sessions.length === 0) return 0;
  const dates = new Set(sessions.map(s => s.date));
  let streak = 0;
  let cursor = new Date();
  // if no session today yet, streak still counts back from yesterday
  if (!dates.has(todayStr())) cursor.setDate(cursor.getDate() - 1);
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (dates.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  return streak;
}

/* ---------------- ROUTER ---------------- */
function goToScreen(name) {
  document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
  document.getElementById(`screen-${name}`).classList.add("active");
  document.querySelectorAll(".nav-item[data-screen]").forEach(el => {
    el.classList.toggle("active", el.dataset.screen === name);
  });
  if (name === "dashboard") renderDashboard();
  if (name === "tracking") renderTracking();
}

document.querySelectorAll("[data-screen]").forEach(el => {
  el.addEventListener("click", () => goToScreen(el.dataset.screen));
});

/* ---------------- DASHBOARD ---------------- */
function renderDashboard() {
  const hour = new Date().getHours();
  const greeting = document.getElementById("greeting");
  greeting.textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  document.getElementById("dash-date").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric"
  });

  const streak = computeStreak();
  document.getElementById("streak-count").textContent = streak;
  document.getElementById("sidebar-streak").textContent = `${streak} day streak`;
  document.getElementById("sidebar-total").textContent = `${questions.length} questions solved`;

  const today = todayStr();
  const todaySession = sessions.find(s => s.date === today);
  const minutesToday = todaySession ? todaySession.minutes : 0;
  const goalMinutes = 90;
  const pct = Math.min(100, Math.round((minutesToday / goalMinutes) * 100));

  document.getElementById("dash-focus-line").textContent =
    minutesToday > 0 ? `${minutesToday} min studied today` : "No sessions logged yet";
  document.getElementById("dash-track-fill").style.width = `${pct}%`;
  document.getElementById("dash-track-caption").textContent = `${minutesToday} / ${goalMinutes} min`;

  document.getElementById("stat-total").textContent = questions.length;
  const totalMin = sessions.reduce((sum, s) => sum + s.minutes, 0);
  document.getElementById("stat-time").textContent =
    totalMin >= 60 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : `${totalMin}m`;

  const revised = questions.filter(q => q.revisionCount > 0).length;
  const revisionPct = questions.length ? Math.round((revised / questions.length) * 100) : 0;
  document.getElementById("stat-revision").textContent = `${revisionPct}%`;

  renderRevisionList();
}

function renderRevisionList() {
  const container = document.getElementById("revision-list");
  // due = confidence < 3, solved more than 3 days ago, not revised in last 3 days
  const due = questions
    .filter(q => q.confidence < 3)
    .sort((a, b) => new Date(a.dateSolved) - new Date(b.dateSolved))
    .slice(0, 3);

  if (due.length === 0) {
    container.innerHTML = `<p class="empty-hint">No revisions due right now — nice work.</p>`;
    return;
  }
  container.innerHTML = due.map(q => `
    <div class="revision-item">
      <div>
        <div class="qname">${escapeHtml(q.name)}</div>
        <div class="meta">Solved ${daysAgo(q.dateSolved)}</div>
      </div>
      <span class="tag ${q.difficulty}">${capitalize(q.difficulty)}</span>
    </div>
  `).join("");
}

function daysAgo(dateStr) {
  const diff = Math.round((Date.now() - new Date(dateStr)) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "1 day ago";
  return `${diff} days ago`;
}

/* ---------------- TIMER ---------------- */
let timerInterval = null;
let secondsLeft = 0;
let selectedDiff = null;

const diffButtons = document.querySelectorAll(".diff-btn");
const timerDisplay = document.getElementById("timer-display");
const timerDiffLabel = document.getElementById("timer-diff-label");
const startBtn = document.getElementById("start-btn");
const pauseBtn = document.getElementById("pause-btn");
const endBtn = document.getElementById("end-btn");

diffButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    if (timerInterval) return; // don't allow switching mid-run
    diffButtons.forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedDiff = btn.dataset.diff;
    secondsLeft = parseInt(btn.dataset.min, 10) * 60;
    updateTimerDisplay();
    timerDiffLabel.textContent = `${capitalize(selectedDiff)} session · ready to start`;
    startBtn.disabled = false;
  });
});

function updateTimerDisplay() {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  timerDisplay.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

startBtn.addEventListener("click", () => {
  if (!selectedDiff || timerInterval) return;
  startBtn.disabled = true;
  pauseBtn.disabled = false;
  endBtn.disabled = false;
  timerDiffLabel.textContent = `${capitalize(selectedDiff)} session · in progress`;
  runTimer();
});

function runTimer() {
  timerInterval = setInterval(() => {
    if (secondsLeft <= 0) {
      finishSession(true);
      return;
    }
    secondsLeft--;
    updateTimerDisplay();
  }, 1000);
}

pauseBtn.addEventListener("click", () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
    pauseBtn.textContent = "Resume";
    timerDiffLabel.textContent = `${capitalize(selectedDiff)} session · paused`;
  } else {
    pauseBtn.textContent = "Pause";
    timerDiffLabel.textContent = `${capitalize(selectedDiff)} session · in progress`;
    runTimer();
  }
});

endBtn.addEventListener("click", () => finishSession(false));

function finishSession(completedFully) {
  clearInterval(timerInterval);
  timerInterval = null;

  const totalMinutes = selectedDiff === "easy" ? 25 : selectedDiff === "medium" ? 45 : 60;
  const elapsedMinutes = completedFully ? totalMinutes : Math.max(1, totalMinutes - Math.ceil(secondsLeft / 60));
  logSessionMinutes(elapsedMinutes);
  const finishedDiff = selectedDiff;

  // reset timer UI
  startBtn.disabled = true;
  pauseBtn.disabled = true;
  pauseBtn.textContent = "Pause";
  endBtn.disabled = true;
  timerDiffLabel.textContent = "Session logged — add the question below";
  secondsLeft = 0;
  updateTimerDisplay();
  diffButtons.forEach(b => b.classList.remove("selected"));
  selectedDiff = null;

  // prompt to log the question, pre-filling what we know
  openAddQuestionModal({ prefillDifficulty: finishedDiff, prefillTime: elapsedMinutes });
}

/* ---------------- TRACKING ---------------- */
let activeFilter = "all";

document.querySelectorAll(".filter-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("on"));
    chip.classList.add("on");
    activeFilter = chip.dataset.filter;
    renderTracking();
  });
});

function renderTracking() {
  document.getElementById("track-count").textContent =
    `${questions.length} question${questions.length === 1 ? "" : "s"} logged`;

  const list = activeFilter === "all"
    ? questions
    : questions.filter(q => q.difficulty === activeFilter);

  const container = document.getElementById("q-list");
  const emptyHint = document.getElementById("q-empty");

  const sorted = [...list].sort((a, b) => new Date(b.dateSolved) - new Date(a.dateSolved));

  if (sorted.length === 0) {
    container.innerHTML = "";
    emptyHint.style.display = "block";
    emptyHint.textContent = questions.length === 0
      ? 'No questions logged yet. Click "+ Add question" to log your first one.'
      : "No questions match this filter.";
    return;
  }
  emptyHint.style.display = "none";

  container.innerHTML = sorted.map(q => `
    <div class="q-row">
      <div>
        <div class="qname">${escapeHtml(q.name)}</div>
        <div class="platform">${escapeHtml(q.platform)}</div>
      </div>
      <div><span class="tag ${q.difficulty}">${capitalize(q.difficulty)}</span></div>
      <div>${q.pattern ? `<span class="tag pattern">${escapeHtml(q.pattern)}</span>` : "—"}</div>
      <div class="conf-dots">
        ${[1, 2, 3].map(n => `<span class="${n <= q.confidence ? "on" : ""}"></span>`).join("")}
      </div>
      <div class="date-col">${formatShortDate(q.dateSolved)}</div>
    </div>
  `).join("");
}

function formatShortDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ---------------- MODAL / ADD QUESTION ---------------- */
const modalOverlay = document.getElementById("modal-overlay");
const questionForm = document.getElementById("question-form");
const confidencePicker = document.getElementById("f-confidence");
let selectedConfidence = 2;

document.getElementById("open-add-question").addEventListener("click", () => openAddQuestionModal({}));
document.getElementById("modal-close").addEventListener("click", closeModal);
modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });

confidencePicker.querySelectorAll("button").forEach(btn => {
  btn.addEventListener("click", () => {
    confidencePicker.querySelectorAll("button").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    selectedConfidence = parseInt(btn.dataset.val, 10);
  });
});

function openAddQuestionModal({ prefillDifficulty, prefillTime } = {}) {
  questionForm.reset();
  selectedConfidence = 2;
  confidencePicker.querySelectorAll("button").forEach(b =>
    b.classList.toggle("on", b.dataset.val === "2")
  );
  if (prefillDifficulty) document.getElementById("f-difficulty").value = prefillDifficulty;
  if (prefillTime) document.getElementById("f-time").value = prefillTime;
  modalOverlay.classList.remove("hidden");
  document.getElementById("f-name").focus();
}

function closeModal() {
  modalOverlay.classList.add("hidden");
}

questionForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const newQuestion = {
    id: "q_" + Date.now(),
    name: document.getElementById("f-name").value.trim(),
    platform: document.getElementById("f-platform").value,
    difficulty: document.getElementById("f-difficulty").value,
    pattern: document.getElementById("f-pattern").value.trim(),
    dateSolved: todayStr(),
    timeTakenMin: parseInt(document.getElementById("f-time").value, 10) || 0,
    confidence: selectedConfidence,
    notes: document.getElementById("f-notes").value.trim(),
    revisionCount: 0,
    lastRevisedDate: null
  };
  questions.push(newQuestion);
  saveQuestions(questions);
  closeModal();
  renderDashboard();
  renderTracking();
});

/* ---------------- UTIL ---------------- */
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------- INIT ---------------- */
renderDashboard();
renderTracking();

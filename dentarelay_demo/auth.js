const SESSION_KEY = "dentarelay_session";

const USERS = {
  medecin: [
    { username: "medecin1", password: "1234", displayName: "Dr Amal", role: "Dentiste distant" },
    { username: "medecin2", password: "1234", displayName: "Dr Nabil", role: "Dentiste distant" },
  ],
  infirmier: [
    { username: "infirmier1", password: "1234", displayName: "Nurse Yasmine", role: "Infirmiere mobile" },
    { username: "infirmier2", password: "1234", displayName: "Nurse Samir", role: "Infirmiere mobile" },
  ],
};

function findUser(type, username, password) {
  const normalized = (username || "").trim().toLowerCase();
  return (USERS[type] || []).find(
    (u) => u.username.toLowerCase() === normalized && u.password === password
  );
}

function saveSession(user) {
  const payload = {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    loginAt: new Date().toISOString(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function bootAuth() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const type = form.dataset.userType;
  const errorBox = document.getElementById("errorText");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const user = findUser(type, username, password);
    if (!user) {
      errorBox.textContent = "Identifiants invalides. Essayez un compte demo.";
      return;
    }

    saveSession(user);
    window.location.href = "/";
  });
}

bootAuth();

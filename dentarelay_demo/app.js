const state = {
  analysis: null,
  findings: [],
  urgency: null,
  reportLang: "fr",
  uploadedFile: null,
  role: "Infirmière mobile",
  audit: [],
};

const $ = (id) => document.getElementById(id);

const translations = {
  "Caries": { fr: "Carie", ar: "تسوس" },
  "Periapical Lesion": { fr: "Lésion péri-apicale", ar: "آفة حول الذروة" },
  "Vertical Bone Loss": { fr: "Perte osseuse verticale", ar: "فقدان عظمي عمودي" },
  "Horizontal Bone Loss": { fr: "Perte osseuse horizontale", ar: "فقدان عظمي أفقي" },
  "Impacted Tooth": { fr: "Dent incluse", ar: "سن مطمور" },
  "Root-Canal Filling": { fr: "Traitement endodontique", ar: "حشو قناة الجذر" },
  "Filling-Normal Margin": { fr: "Obturation", ar: "حشوة" },
  "Dental Pulp": { fr: "Pulpe dentaire visible", ar: "لب الأسنان ظاهر" },
  "Post": { fr: "Tenon", ar: "دعامة" },
};

const demoCases = [
  { id: "DR-2407", name: "Patient A-017", town: "Ait M'hamed", distance: "186 km", reason: "Douleur persistante", img: "/sample-xray" },
  { id: "DR-2408", name: "Patient B-031", town: "Zaouiat Ahansal", distance: "214 km", reason: "Gonflement mandibulaire", img: "/data/samples/panoramic/panoramic_016.jpg", preset: "high" },
  { id: "DR-2409", name: "Patient C-044", town: "Tabant", distance: "93 km", reason: "Controle scolaire", img: "/data/samples/bitewing/bitewing_054.jpg", preset: "medium" },
  { id: "DR-2410", name: "Patient D-052", town: "Afourer", distance: "61 km", reason: "Detartrage", img: "/data/samples/bitewing/bitewing_001.jpg", preset: "low" },
];

function label(name, lang = "fr") {
  return translations[name]?.[lang] || name;
}

function setView(id) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === id));
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === id));
  const titles = { intake: "Intake infirmier", queue: "Triage clinique", dashboard: "Dashboard dentiste", assistant: "Assistant local" };
  $("viewTitle").textContent = titles[id];
}

function addAudit(action, detail) {
  const stamp = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  state.audit.unshift({ stamp, action, detail, role: state.role });
  state.audit = state.audit.slice(0, 8);
  renderAudit();
}

function renderAudit() {
  const el = $("auditLog");
  if (!el) return;
  el.innerHTML = state.audit.map((item) => `
    <div class="audit-item">
      <strong>${item.action}</strong>
      <span>${item.stamp} · ${item.role} · ${item.detail}</span>
    </div>
  `).join("");
}

function collectFindings(analysis) {
  const toothResults = analysis?.results?.tooth_results || {};
  const rows = [];
  Object.entries(toothResults).forEach(([tooth, data]) => {
    (data.illnesses || []).forEach((illness) => {
      rows.push({
        tooth,
        name: illness.name,
        probability: Number(illness.probability || 0),
        icd: illness.icd_dict?.icd_code || "",
        coords: data.coordinates,
        treatments: (data.treatment_methods || data.treatment_methods_extra || []).map((t) => t.treatment_method),
      });
    });
  });
  return rows.sort((a, b) => severityWeight(b) - severityWeight(a) || b.probability - a.probability);
}

function severityWeight(f) {
  const n = f.name.toLowerCase();
  let base = 5;
  if (n.includes("periapical") || n.includes("abscess") || n.includes("lesion")) base = 92;
  else if (n.includes("bone loss")) base = 78;
  else if (n.includes("caries") && f.probability >= 55) base = 70;
  else if (n.includes("caries")) base = 52;
  else if (n.includes("impacted")) base = 46;
  else if (n.includes("root-canal")) base = 30;
  else if (n.includes("filling")) base = 18;
  return base + Math.min(20, f.probability / 5);
}

function computeUrgency(findings) {
  const max = findings.reduce((m, f) => Math.max(m, severityWeight(f)), 0);
  const caries = findings.filter((f) => f.name.toLowerCase().includes("caries")).length;
  const lesions = findings.filter((f) => f.name.toLowerCase().includes("periapical")).length;
  const bone = findings.filter((f) => f.name.toLowerCase().includes("bone loss")).length;
  const score = Math.min(100, Math.round(max + caries * 2 + lesions * 7 + bone * 4));
  const level = score >= 80 ? "high" : score >= 50 ? "medium" : "low";
  const title = level === "high" ? "Haute" : level === "medium" ? "Intermediaire" : "Basse";
  return { score, level, title, lesions, caries, bone };
}

function setAnalysis(analysis, source = "Cas demo local") {
  state.analysis = analysis;
  state.findings = collectFindings(analysis);
  state.urgency = computeUrgency(state.findings);
  $("caseBadge").textContent = source;
  $("viewerTitle").textContent = `${$("patientName").value} - ${state.findings.length} observations`;
  renderOverlay();
  renderFindings();
  renderScore();
  renderReport();
  renderQueue();
  renderKnowledge();
  seedChat();
  addAudit("Analyse chargée", `${source}, ${state.findings.length} observations`);
}

function renderOverlay() {
  const svg = $("overlaySvg");
  svg.innerHTML = "";
  state.findings.slice(0, 18).forEach((finding) => {
    if (!finding.coords) return;
    const { xmin, ymin, xmax, ymax } = finding.coords;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", xmin);
    rect.setAttribute("y", ymin);
    rect.setAttribute("width", Math.max(8, xmax - xmin));
    rect.setAttribute("height", Math.max(8, ymax - ymin));
    svg.appendChild(rect);
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", xmin + 8);
    text.setAttribute("y", Math.max(38, ymin - 10));
    text.textContent = finding.tooth;
    svg.appendChild(text);
  });
}

function renderFindings() {
  $("findingsList").innerHTML = state.findings.slice(0, 12).map((f) => `
    <div class="finding">
      <div class="tooth">${f.tooth}</div>
      <div><strong>${label(f.name)}</strong><span>${f.icd || "sans ICD"} · ${recommendationFor(f)}</span></div>
      <div class="conf">${Math.round(f.probability)}%</div>
    </div>
  `).join("");
}

function renderScore() {
  const card = $("scoreCard");
  card.className = `score-card ${state.urgency.level}`;
  card.innerHTML = `<p>Score urgence</p><strong>${state.urgency.score}</strong><span>Priorite ${state.urgency.title.toLowerCase()} · ${state.findings.length} observations</span>`;
}

function recommendationFor(f) {
  const n = f.name.toLowerCase();
  if (n.includes("periapical")) return "avis endodontique prioritaire";
  if (n.includes("bone loss")) return "evaluation parodontale";
  if (n.includes("caries")) return f.probability >= 55 ? "traitement restaurateur rapide" : "controle clinique";
  if (n.includes("impacted")) return "avis chirurgical si symptomatique";
  return "validation par le dentiste";
}

function reportFR() {
  const top = state.findings.slice(0, 8);
  return [
    `Rapport DentaRelay - ${$("patientName").value}`,
    `Commune: ${$("patientTown").value} · Distance du dentiste: ${$("distance").value}`,
    `Niveau d'urgence: ${state.urgency.title} (${state.urgency.score}/100)`,
    "",
    "Synthese clinique:",
    `L'analyse IA ThakaaMed a detecte ${state.findings.length} observations sur ${Object.keys(state.analysis.results.tooth_results || {}).length} dents. Les elements les plus importants concernent ${top.map((f) => `dent ${f.tooth} (${label(f.name)}, ${Math.round(f.probability)}%)`).join(", ")}.`,
    "",
    "Recommandations initiales:",
    state.urgency.level === "high" ? "- Prioriser ce patient dans la queue du dentiste distant." : "- Programmer une revue par le dentiste distant selon la disponibilite.",
    "- Verifier cliniquement les detections avant toute decision therapeutique.",
    "- Retourner au patient un avis final valide par un praticien qualifie.",
    "",
    "Observations principales:",
    ...top.map((f) => `- Dent ${f.tooth}: ${label(f.name)} (${Math.round(f.probability)}%) - ${recommendationFor(f)}.`),
    "",
    "Note: prototype de demonstration, non destine a remplacer un diagnostic dentaire."
  ].join("\n");
}

function reportAR() {
  const top = state.findings.slice(0, 8);
  return [
    `تقرير DentaRelay - ${$("patientName").value}`,
    `المنطقة: ${$("patientTown").value} · المسافة إلى طبيب الأسنان: ${$("distance").value}`,
    `مستوى الاستعجال: ${state.urgency.title} (${state.urgency.score}/100)`,
    "",
    "ملخص سريري:",
    `كشف تحليل ThakaaMed عن ${state.findings.length} ملاحظة. أهم النتائج: ${top.map((f) => `السن ${f.tooth} (${label(f.name, "ar")}، ${Math.round(f.probability)}%)`).join("، ")}.`,
    "",
    "توصيات أولية:",
    state.urgency.level === "high" ? "- إعطاء أولوية لهذا الملف في قائمة طبيب الأسنان عن بعد." : "- برمجة مراجعة عن بعد حسب التوفر.",
    "- يجب تأكيد النتائج سريريا قبل أي قرار علاجي.",
    "- التقرير النهائي يجب أن يصادق عليه طبيب أسنان مؤهل.",
    "",
    "الملاحظات الرئيسية:",
    ...top.map((f) => `- السن ${f.tooth}: ${label(f.name, "ar")} (${Math.round(f.probability)}%).`),
    "",
    "تنبيه: هذا نموذج تجريبي ولا يعوض التشخيص الطبي."
  ].join("\n");
}

function renderReport() {
  const text = $("reportText");
  text.value = state.reportLang === "ar" ? reportAR() : reportFR();
  text.classList.toggle("rtl", state.reportLang === "ar");
}

function renderQueue() {
  const mainLevel = state.urgency?.level || "medium";
  const cases = [
    { ...demoCases[0], level: mainLevel, score: state.urgency?.score || 64, reason: $("reason").value },
    { ...demoCases[1], level: "high", score: 91 },
    { ...demoCases[2], level: "medium", score: 62 },
    { ...demoCases[3], level: "low", score: 28 },
  ].sort((a, b) => b.score - a.score);
  $("urgentCount").textContent = `${cases.filter((c) => c.level === "high").length} haute`;
  $("caseList").innerHTML = cases.map((c) => `
    <article class="case-card">
      <img src="${c.img}" alt="">
      <div><h4>${c.id} · ${c.name}</h4><p>${c.town} · ${c.distance} · ${c.reason}</p></div>
      <div class="priority ${c.level}">${c.score}/100</div>
    </article>
  `).join("");
}

function renderKnowledge() {
  const topEvidence = state.findings.slice(0, 4).map((f) => `Dent ${f.tooth}: ${label(f.name)} ${Math.round(f.probability)}%`).join(" · ");
  const items = [
    ["JSON ThakaaMed", `${state.findings.length} observations indexees par dent`],
    ["Rapport FR/AR", "Genere localement, sans API payante"],
    ["Triage", `Priorite ${state.urgency.title.toLowerCase()} fondee sur caries, lesions et perte osseuse`],
    ["Preuves clés", topEvidence || "Aucune observation chargee"],
    ["Sécurité", "API key côté serveur, consentement trace, audit local, données anonymisées"],
    ["Cache offline", "Disponible meme sans connexion pendant la tournee"],
  ];
  $("knowledgeList").innerHTML = items.map(([a, b]) => `<div class="knowledge-item"><strong>${a}</strong><span>${b}</span></div>`).join("");
}

function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}

function normalize(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function sourceLine(f) {
  return `dent ${f.tooth}, ${label(f.name)}, confiance ${Math.round(f.probability)}%`;
}

function compactFindings(list, lang = "fr") {
  if (!list.length) return lang === "ar" ? "لا توجد نتائج مطابقة في الملف الحالي." : "Aucune observation correspondante dans le dossier courant.";
  return list.map((f) => {
    if (lang === "ar") return `السن ${f.tooth}: ${label(f.name, "ar")} (${Math.round(f.probability)}%)`;
    return `dent ${f.tooth}: ${label(f.name)} (${Math.round(f.probability)}%)`;
  }).join(lang === "ar" ? "، " : "; ");
}

function recommendationSummary(findings) {
  const urgent = findings.filter((f) => severityWeight(f) >= 75).slice(0, 5);
  const caries = findings.filter((f) => f.name.toLowerCase().includes("caries")).slice(0, 6);
  const watch = findings.filter((f) => severityWeight(f) < 50).slice(0, 4);
  const lines = [];
  if (urgent.length) lines.push(`Prioriser: ${compactFindings(urgent)}.`);
  if (caries.length) lines.push(`Traiter/verifier les caries: ${compactFindings(caries)}.`);
  if (watch.length) lines.push(`Surveiller ou confirmer: ${compactFindings(watch)}.`);
  lines.push("Toute decision doit etre validee par le dentiste distant avant retour au patient.");
  return lines.join("\n");
}

function nurseNextSteps() {
  const steps = [
    "1. Confirmer douleur, gonflement, fièvre, difficulté à ouvrir la bouche ou à avaler.",
    "2. Vérifier que le consentement est documenté et que l'identifiant patient reste pseudonymisé.",
    "3. Prioriser la synchronisation du dossier si le score est haut.",
    "4. Ne pas prescrire: transmettre au dentiste distant pour validation.",
  ];
  if (state.urgency.level === "high") steps.splice(1, 0, "Urgence haute: placer le dossier en tête de queue et appeler le dentiste si symptômes infectieux.");
  return steps.join("\n");
}

function patientQuestions() {
  return [
    "Questions utiles avant validation:",
    "- Depuis quand la douleur est-elle présente ?",
    "- Douleur spontanée, à la mastication, au froid ou au chaud ?",
    "- Gonflement, fièvre, mauvais goût, écoulement ?",
    "- Médicaments récents, allergies, grossesse, diabète ou immunodépression ?",
    "- Le patient peut-il se déplacer dans les 24-48h si le dentiste confirme l'urgence ?"
  ].join("\n");
}

function securityAnswer() {
  return [
    "Sécurité démo DentaRelay:",
    "- La clé ThakaaMed reste dans le serveur local Python, jamais dans le JavaScript du navigateur.",
    "- Le mode offline utilise un JSON anonymisé fourni dans le bundle hackathon.",
    "- Le consentement est visible dans l'intake et tracé dans l'audit local.",
    "- Les rôles séparent le parcours infirmière et dentiste pour raconter le RBAC.",
    "- Les réponses du chatbot citent le JSON local et ne contactent aucun LLM payant.",
    "- Pour une vraie production: remplacer le PIN démo par OAuth/MFA, chiffrer réellement IndexedDB, ajouter TLS, journaux signés, expiration de session et politique de minimisation des données."
  ].join("\n");
}

function costAnswer() {
  return [
    "Coût du prototype:",
    "- Aucun LLM payant: rapports et chatbot sont générés localement.",
    "- Les images de démo viennent du bundle anonymisé.",
    "- Seul le mode live consomme un jeton ThakaaMed hackathon par analyse.",
    "- Le développement fonctionne offline à partir du cache pour économiser le quota."
  ].join("\n");
}

function differentialSummary() {
  const lesion = state.findings.filter((f) => f.name.toLowerCase().includes("periapical")).slice(0, 3);
  const caries = state.findings.filter((f) => f.name.toLowerCase().includes("caries")).slice(0, 5);
  const bone = state.findings.filter((f) => f.name.toLowerCase().includes("bone loss")).slice(0, 3);
  return [
    "Lecture orientée praticien:",
    lesion.length ? `- Endodontie/infection à vérifier: ${compactFindings(lesion)}.` : "- Pas de lésion péri-apicale détectée dans le cache.",
    caries.length ? `- Restaurateur: ${compactFindings(caries)}.` : "- Pas de carie détectée dans le cache.",
    bone.length ? `- Parodontal: ${compactFindings(bone)}.` : "- Pas de perte osseuse majeure dans les observations prioritaires.",
    "- Le modèle signale des indices radiographiques; le diagnostic final reste clinique."
  ].join("\n");
}

function answerWithSources(body, sourceFindings = [], rtl = false) {
  const sources = sourceFindings.length
    ? `Sources: ${sourceFindings.slice(0, 5).map(sourceLine).join(" | ")}`
    : "Sources: dossier local DentaRelay, JSON ThakaaMed en cache.";
  return { body, sources, rtl };
}

function answerQuestion(q) {
  const text = normalize(q);
  const wantsArabic = isArabic(q) || text.includes("arab");
  const top = state.findings.slice(0, 5);
  if (!state.analysis) return answerWithSources("Chargez d'abord le cas demo ou une analyse live.");
  if (wantsArabic) {
    return answerWithSources(
      [
        `مستوى الاستعجال: ${state.urgency.title} (${state.urgency.score}/100).`,
        `أهم النتائج: ${compactFindings(top, "ar")}.`,
        "يجب أن يصادق طبيب أسنان مؤهل على التقرير قبل أي قرار علاجي."
      ].join("\n"),
      top,
      true
    );
  }
  if (text.includes("urgent") || text.includes("prior")) {
    const evidence = state.findings.filter((f) => severityWeight(f) >= 70).slice(0, 5);
    return answerWithSources(
      `Priorite ${state.urgency.title.toLowerCase()} (${state.urgency.score}/100).\nJustification: ${state.urgency.lesions} lesion(s) peri-apicale(s), ${state.urgency.bone} perte(s) osseuse(s), ${state.urgency.caries} carie(s).\n${recommendationSummary(state.findings)}`,
      evidence
    );
  }
  if (text.includes("infirm") || text.includes("nurse") || text.includes("maintenant") || text.includes("next")) {
    return answerWithSources(nurseNextSteps(), top);
  }
  if (text.includes("question") || text.includes("demander") || text.includes("interroger")) {
    return answerWithSources(patientQuestions(), top);
  }
  if (text.includes("secur") || text.includes("confidential") || text.includes("privacy") || text.includes("login") || text.includes("conforme") || text.includes("audit")) {
    return answerWithSources(securityAnswer(), []);
  }
  if (text.includes("cout") || text.includes("cost") || text.includes("payant") || text.includes("gratuit") || text.includes("quota")) {
    return answerWithSources(costAnswer(), []);
  }
  if (text.includes("dentiste") || text.includes("praticien") || text.includes("validation") || text.includes("diagnostic")) {
    return answerWithSources(differentialSummary(), top);
  }
  if (text.includes("patient") || text.includes("simple") || text.includes("vulgar")) {
    const caries = state.findings.filter((f) => f.name.toLowerCase().includes("caries")).slice(0, 4);
    return answerWithSources(
      `Explication patient: l'IA a repéré des zones à vérifier par le dentiste. Les caries possibles concernent ${compactFindings(caries)}. Ce n'est pas un diagnostic final; le dentiste doit confirmer sur la radio et l'examen clinique.`,
      caries
    );
  }
  if (text.includes("carie") || text.includes("cavity")) {
    const caries = state.findings.filter((f) => f.name.toLowerCase().includes("caries"));
    return answerWithSources(
      caries.length ? `Caries detectees:\n${compactFindings(caries)}.\nRecommendation: verifier cliniquement la profondeur et prioriser les dents avec confiance elevee.` : "Aucune carie n'est presente dans le cache courant.",
      caries
    );
  }
  if (text.includes("lesion") || text.includes("abces") || text.includes("infection")) {
    const lesions = state.findings.filter((f) => f.name.toLowerCase().includes("periapical"));
    return answerWithSources(
      lesions.length ? `Suspicion de lesion/infection a confirmer:\n${compactFindings(lesions)}.\nAction proposee: avis endodontique prioritaire si douleur, gonflement ou fievre.` : "Aucune lesion peri-apicale n'est detectee dans le cache courant.",
      lesions
    );
  }
  if (text.includes("perte") || text.includes("osseuse") || text.includes("bone")) {
    const bone = state.findings.filter((f) => f.name.toLowerCase().includes("bone loss"));
    return answerWithSources(
      bone.length ? `Signes parodontaux detectes:\n${compactFindings(bone)}.\nAction proposee: evaluation parodontale et controle clinique.` : "Aucune perte osseuse n'est detectee dans les observations principales.",
      bone
    );
  }
  if (text.includes("trait") || text.includes("recommand") || text.includes("quoi faire")) {
    return answerWithSources(recommendationSummary(state.findings), top);
  }
  if (text.includes("dent")) {
    const toothMatch = q.match(/\b([1-4][1-8])\b/);
    if (toothMatch) {
      const toothFindings = state.findings.filter((f) => f.tooth === toothMatch[1]);
      return answerWithSources(
        toothFindings.length ? `Pour la dent ${toothMatch[1]}:\n${compactFindings(toothFindings)}.\n${toothFindings.map((f) => `- ${recommendationFor(f)}`).join("\n")}` : `Je ne trouve pas d'observation pour la dent ${toothMatch[1]} dans ce dossier.`,
        toothFindings
      );
    }
    return answerWithSources(`Dents les plus pertinentes:\n${compactFindings(top)}.`, top);
  }
  if (text.includes("rapport") || text.includes("resume") || text.includes("synthese")) {
    return answerWithSources(reportFR(), top);
  }
  if (text.includes("source") || text.includes("preuve") || text.includes("confidence") || text.includes("confiance")) {
    return answerWithSources(`Voici les preuves les plus fortes du cache:\n${top.map((f) => `- ${sourceLine(f)}`).join("\n")}`, top);
  }
  return answerWithSources(
    `Je peux aider sur ce dossier local.\nObservations principales: ${compactFindings(top)}.\nEssayez: "pourquoi prioritaire", "quelles caries", "dent 26", "recommandations", ou "rapport arabe".`,
    top
  );
}

function addMessage(role, payload) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  if (typeof payload === "string") {
    div.textContent = payload;
  } else {
    div.classList.toggle("rtl", Boolean(payload.rtl));
    div.textContent = payload.body;
    const sources = document.createElement("span");
    sources.className = "sources";
    sources.textContent = payload.sources;
    div.appendChild(sources);
  }
  $("chatLog").appendChild(div);
  $("chatLog").scrollTop = $("chatLog").scrollHeight;
}

function seedChat() {
  $("chatLog").innerHTML = "";
  const top = state.findings.slice(0, 3);
  addMessage("bot", answerWithSources(
    `Cas charge. Je fonctionne hors ligne a partir du cache DentaRelay.\nPriorite actuelle: ${state.urgency.title} (${state.urgency.score}/100).\nJe peux expliquer l'urgence, citer les detections par dent, proposer une synthese FR/AR, ou aider le dentiste a valider le rapport.`,
    top
  ));
}

async function loadSample() {
  $("syncBadge").textContent = "Cache local";
  const res = await fetch("/sample-analysis");
  const data = await res.json();
  $("xrayImage").src = "/sample-xray";
  setAnalysis(data, "Cas demo local");
  addAudit("Cache offline", "Cas démo restauré sans réseau");
  setView("dashboard");
}

async function analyzeLive() {
  if (!state.uploadedFile) return;
  $("syncBadge").textContent = "Analyse live...";
  $("analyzeBtn").disabled = true;
  const form = new FormData();
  form.append("image", state.uploadedFile);
  try {
    const res = await fetch("/api/analyze?lang=fr", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Analyse impossible");
    $("xrayImage").src = URL.createObjectURL(state.uploadedFile);
    setAnalysis(data, "Analyse live ThakaaMed");
    $("syncBadge").textContent = "Live synchronise";
    addAudit("Synchronisation live", "Résultat ThakaaMed reçu via proxy local");
    setView("dashboard");
  } catch (err) {
    $("syncBadge").textContent = "Live indisponible";
    addAudit("Échec live", err.message);
    alert(err.message);
  } finally {
    $("analyzeBtn").disabled = false;
  }
}

function bindEvents() {
  document.querySelectorAll(".role-card").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".role-card").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.role = btn.dataset.role;
  }));
  $("loginBtn").addEventListener("click", () => {
    state.role = document.querySelector(".role-card.active")?.dataset.role || "Session démo";
    $("loginScreen").classList.add("hidden");
    $("userRole").textContent = state.role;
    $("userAccess").textContent = state.role.includes("Dentiste") ? "Peut valider et modifier les rapports." : "Peut capturer, synchroniser et demander avis.";
    $("consentStatus").textContent = $("consentCheck").checked ? "Confirmé" : "À compléter";
    addAudit("Connexion", `PIN démo ${$("demoPin").value ? "accepté" : "vide"}, consentement ${$("consentCheck").checked ? "oui" : "non"}`);
  });
  document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));
  document.querySelectorAll("#quickPrompts button").forEach((btn) => btn.addEventListener("click", () => {
    const prompt = btn.dataset.prompt || btn.textContent;
    $("chatInput").value = prompt;
    $("chatForm").requestSubmit();
  }));
  document.querySelectorAll(".viewer-tabs .tab").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".viewer-tabs .tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    $("overlaySvg").style.display = btn.dataset.layer === "boxes" ? "block" : "none";
  }));
  document.querySelectorAll(".report-tabs .tab").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".report-tabs .tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.reportLang = btn.dataset.report;
    renderReport();
  }));
  $("loadSampleBtn").addEventListener("click", loadSample);
  $("analyzeBtn").addEventListener("click", analyzeLive);
  $("fileInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    state.uploadedFile = file;
    $("uploadZone").querySelector("h4").textContent = file.name;
    $("uploadZone").querySelector("p").textContent = `${Math.round(file.size / 1024)} Ko prets pour compression et synchronisation.`;
    $("analyzeBtn").disabled = false;
  });
  $("validateBtn").addEventListener("click", () => {
    $("syncBadge").textContent = "Diagnostic valide";
    $("validateBtn").textContent = "Validé";
    addAudit("Rapport validé", "Conclusion praticien prête à renvoyer");
  });
  $("chatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const q = $("chatInput").value.trim();
    if (!q) return;
    addMessage("user", q);
    addMessage("bot", answerQuestion(q));
    addAudit("Question assistant", q.slice(0, 70));
    $("chatInput").value = "";
  });
}

async function init() {
  bindEvents();
  renderQueue();
  try {
    const cfg = await fetch("/api/config").then((r) => r.json());
    if (cfg.live_ready) {
      $("liveDot").classList.add("live");
      $("liveStatus").textContent = "Mode live pret";
      $("facilityText").textContent = `Proxy local connecte a ${cfg.facility_code}.`;
    }
  } catch {}
  await loadSample();
  setView("intake");
}

init();

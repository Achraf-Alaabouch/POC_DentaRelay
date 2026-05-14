const state = {
  analysis: null,
  findings: [],
  urgency: null,
  reportLang: "fr",
  patientLang: "fr",
  uploadedFile: null,
  role: "Infirmière mobile",
  ollamaReady: false,
  ollamaModel: "llama3:latest",
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

function plainLabel(name, lang = "fr") {
  const key = name.toLowerCase();
  const labels = {
    caries: { fr: "zone qui peut correspondre à une carie", ar: "منطقة قد تكون تسوسا", en: "area that may be a cavity" },
    "periapical lesion": { fr: "signe possible d'inflammation près de la racine", ar: "علامة محتملة على التهاب قرب جذر السن", en: "possible inflammation near the tooth root" },
    "vertical bone loss": { fr: "perte osseuse autour de la dent", ar: "نقص في العظم حول السن", en: "bone loss around the tooth" },
    "horizontal bone loss": { fr: "perte osseuse autour de la dent", ar: "نقص في العظم حول السن", en: "bone loss around the tooth" },
    "impacted tooth": { fr: "dent qui ne sort pas normalement", ar: "سن لا يظهر بشكل طبيعي", en: "tooth that is not erupting normally" },
    "root-canal filling": { fr: "ancien traitement de racine visible", ar: "علاج سابق لجذر السن ظاهر في الصورة", en: "visible previous root treatment" },
    "filling-normal margin": { fr: "ancienne obturation visible", ar: "حشوة سابقة ظاهرة", en: "visible previous filling" },
  };
  return labels[key]?.[lang] || label(name, lang);
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
  renderArtifacts();
  renderPatientExplainer();
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

function downloadReportPdf() {
  const report = $("reportText").value || "";
  const name = ($("patientName").value || "patient").replace(/[^a-z0-9_\- ]/gi, "_");
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${name}_${date}_DentaRelay_report.pdf`;
  if (window.jspdf && window.jspdf.jsPDF) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(12);
    const margin = 10;
    const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
    const lines = doc.splitTextToSize(report, pageWidth);
    doc.text(lines, margin, 20);
    doc.save(filename);
  } else {
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/\.pdf$/, ".txt");
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }
  addAudit("Téléchargement rapport", filename);
}

function renderArtifacts() {
  const analysis = state.analysis || {};
  const drawn = analysis.draw_image || "";
  const viewer = analysis.embeded_link || "";
  const report = analysis.embeded_report_link || "";
  $("drawnImage").src = drawn;
  const link = (href, text) => href
    ? `<a class="artifact-link" href="${href}" target="_blank" rel="noreferrer">${text}</a>`
    : `<span class="artifact-link disabled">${text} indisponible</span>`;
  $("artifactStrip").innerHTML = [
    link(drawn, "PNG annoté"),
    link(viewer, "Viewer intégré"),
    link(report, "Rapport PDF"),
  ].join("");
}

function patientExplanation(lang = "fr") {
  const top = state.findings.slice(0, 6);
  const caries = state.findings.filter((f) => f.name.toLowerCase().includes("caries")).length;
  const infection = state.findings.filter((f) => f.name.toLowerCase().includes("periapical")).length;
  const bone = state.findings.filter((f) => f.name.toLowerCase().includes("bone loss")).length;
  const topLine = top.map((f) => {
    const pct = Math.round(f.probability);
    if (lang === "ar") return `السن ${f.tooth}: ${plainLabel(f.name, "ar")} (${pct}%)`;
    if (lang === "en") return `tooth ${f.tooth}: ${plainLabel(f.name, "en")} (${pct}%)`;
    return `dent ${f.tooth}: ${plainLabel(f.name)} (${pct}%)`;
  }).join(lang === "ar" ? "، " : "; ");

  if (lang === "ar") {
    return [
      `هذه قراءة أولية لصورة الأسنان الخاصة بملف ${$("patientName").value}.`,
      `درجة الأولوية: ${state.urgency.title} (${state.urgency.score}/100).`,
      `وجد النظام ${state.findings.length} ملاحظة، منها ${caries} منطقة قد تكون تسوسا، ${infection} علامة التهاب قرب الجذر، و ${bone} ملاحظة مرتبطة بالعظم.`,
      top.length ? `أهم النقاط التي يجب أن يراجعها طبيب الأسنان: ${topLine}.` : "لا توجد ملاحظات رئيسية في الملف الحالي.",
      "هذا ليس تشخيصا نهائيا ولا وصفة علاج. طبيب الأسنان هو من يؤكد النتيجة بعد الفحص."
    ].join("\n\n");
  }

  if (lang === "en") {
    return [
      `This is a simple explanation of ${$("patientName").value}'s dental X-ray.`,
      `Current priority: ${state.urgency.title} (${state.urgency.score}/100).`,
      `The AI found ${state.findings.length} observations, including ${caries} possible cavity area(s), ${infection} possible root inflammation sign(s), and ${bone} bone-level observation(s).`,
      top.length ? `Main points for the dentist to check: ${topLine}.` : "There are no major observations in the current file.",
      "This is not a final diagnosis or a treatment prescription. A qualified dentist must confirm it clinically."
    ].join("\n\n");
  }

  return [
    `Voici une explication simple de la radiographie de ${$("patientName").value}.`,
    `Priorité actuelle: ${state.urgency.title} (${state.urgency.score}/100).`,
    `L'IA a repéré ${state.findings.length} observations, dont ${caries} zone(s) pouvant correspondre à une carie, ${infection} signe(s) possible(s) d'inflammation près d'une racine, et ${bone} observation(s) liées au niveau osseux.`,
    top.length ? `Points principaux à vérifier par le dentiste: ${topLine}.` : "Aucune observation majeure n'est présente dans le dossier courant.",
    "Ce n'est pas un diagnostic final ni une prescription. Un dentiste qualifié doit confirmer avec l'examen clinique."
  ].join("\n\n");
}

function renderPatientExplainer() {
  const summary = $("patientSummary");
  summary.textContent = patientExplanation(state.patientLang);
  summary.classList.toggle("rtl", state.patientLang === "ar");
  const evidence = state.findings.slice(0, 6);
  $("citationList").innerHTML = evidence.map((f) => `
    <div class="citation-item">
      <strong>Dent ${f.tooth} · ${Math.round(f.probability)}%</strong>
      <span>${label(f.name)} · ${recommendationFor(f)}</span>
    </div>
  `).join("");
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
    ["Rapport FR/AR", "Genere localement depuis le dossier"],
    ["Triage", `Priorite ${state.urgency.title.toLowerCase()} fondee sur caries, lesions et perte osseuse`],
    ["Preuves clés", topEvidence || "Aucune observation chargee"],
    ["Sécurité", "API key côté serveur, consentement trace, audit local, données anonymisées"],
    ["Ollama", state.ollamaReady ? `Assistant local via ${state.ollamaModel}` : "Fallback local si Ollama est indisponible"],
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
  return div;
}

function seedChat() {
  $("chatLog").innerHTML = "";
  const top = state.findings.slice(0, 3);
  addMessage("bot", answerWithSources(
    `Cas charge. ${state.ollamaReady ? `Je reponds avec Ollama (${state.ollamaModel}) en local.` : "Ollama n'est pas detecte, je garde le fallback local."}\nPriorite actuelle: ${state.urgency.title} (${state.urgency.score}/100).\nJe peux expliquer l'urgence, citer les detections par dent, proposer une synthese FR/AR, ou aider le dentiste a valider le rapport.`,
    top
  ));
}

function chatContext() {
  return {
    patient_name: $("patientName").value,
    town: $("patientTown").value,
    distance: $("distance").value,
    reason: $("reason").value,
    urgency_title: state.urgency?.title || "Non calculee",
    urgency_score: state.urgency?.score || 0,
    lesions: state.urgency?.lesions || 0,
    caries: state.urgency?.caries || 0,
    bone_loss: state.urgency?.bone || 0,
    findings: state.findings.slice(0, 24).map((f) => ({
      tooth: f.tooth,
      name: f.name,
      name_fr: label(f.name),
      probability: f.probability,
      icd: f.icd,
      recommendation: recommendationFor(f),
    })),
  };
}

async function askOllama(question) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, context: chatContext() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ollama indisponible");
  return answerWithSources(data.answer, state.findings.slice(0, 5), isArabic(data.answer));
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
    const layer = btn.dataset.layer;
    $("xrayImage").style.display = layer === "drawn" ? "none" : "block";
    $("drawnImage").style.display = layer === "drawn" ? "block" : "none";
    $("overlaySvg").style.display = layer === "boxes" ? "block" : "none";
  }));
  document.querySelectorAll(".report-tabs .tab").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".report-tabs .tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.reportLang = btn.dataset.report;
    renderReport();
  }));
  document.querySelectorAll(".patient-tabs .tab").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".patient-tabs .tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.patientLang = btn.dataset.patientLang;
    renderPatientExplainer();
    addAudit("Langue patient", state.patientLang.toUpperCase());
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
  ["patientName", "patientTown", "distance", "reason"].forEach((id) => {
    $(id).addEventListener("input", () => {
      if (!state.analysis) return;
      $("viewerTitle").textContent = `${$("patientName").value} - ${state.findings.length} observations`;
      renderReport();
      renderQueue();
      renderPatientExplainer();
    });
  });
  $("validateBtn").addEventListener("click", () => {
    $("syncBadge").textContent = "Diagnostic valide";
    $("validateBtn").textContent = "Validé";
    addAudit("Rapport validé", "Conclusion praticien prête à renvoyer");
  });
  $("downloadPdfBtn").addEventListener("click", downloadReportPdf);
  $("speakPatientBtn").addEventListener("click", () => {
    if (!("speechSynthesis" in window)) {
      alert("Lecture audio indisponible dans ce navigateur.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance($("patientSummary").textContent);
    utterance.lang = state.patientLang === "ar" ? "ar" : state.patientLang === "en" ? "en-US" : "fr-FR";
    window.speechSynthesis.speak(utterance);
    addAudit("Lecture patient", state.patientLang.toUpperCase());
  });
  $("copyPatientBtn").addEventListener("click", async () => {
    const text = $("patientSummary").textContent;
    try {
      await navigator.clipboard.writeText(text);
      $("copyPatientBtn").textContent = "Copié";
      setTimeout(() => { $("copyPatientBtn").textContent = "Copier"; }, 1300);
      addAudit("Résumé copié", state.patientLang.toUpperCase());
    } catch {
      alert(text);
    }
  });
  $("chatForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const q = $("chatInput").value.trim();
    if (!q) return;
    const input = $("chatInput");
    const button = $("chatForm").querySelector("button");
    addMessage("user", q);
    const pending = addMessage("bot", answerWithSources(`Ollama (${state.ollamaModel}) reflechit...`, state.findings.slice(0, 3)));
    addAudit("Question assistant", q.slice(0, 70));
    input.value = "";
    input.disabled = true;
    button.disabled = true;
    try {
      const answer = await askOllama(q);
      pending.remove();
      addMessage("bot", answer);
      addAudit("Réponse Ollama", state.ollamaModel);
    } catch (err) {
      pending.remove();
      addMessage("bot", answerQuestion(q));
      addAudit("Fallback assistant", err.message.slice(0, 70));
    } finally {
      input.disabled = false;
      button.disabled = false;
      input.focus();
    }
  });
}

async function init() {
  bindEvents();
  renderQueue();
  try {
    const cfg = await fetch("/api/config").then((r) => r.json());
    state.ollamaReady = Boolean(cfg.ollama_ready);
    state.ollamaModel = cfg.ollama_model || state.ollamaModel;
    if (cfg.live_ready) {
      $("liveDot").classList.add("live");
      $("liveStatus").textContent = "Mode live pret";
      $("facilityText").textContent = `Proxy local connecte a ${cfg.facility_code}.`;
    }
    if (state.ollamaReady) {
      $("liveStatus").textContent = cfg.live_ready ? "Live + Ollama prets" : "Ollama local pret";
      $("facilityText").textContent = cfg.live_ready
        ? `ThakaaMed ${cfg.facility_code}, assistant ${state.ollamaModel}.`
        : `Assistant local connecte a ${state.ollamaModel}.`;
    }
  } catch {}
  await loadSample();
  setView("intake");
}

init();

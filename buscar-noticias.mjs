// Oftalmo Update — robô de notícias
// Roda no GitHub Actions: busca notícias novas, atualiza feed.json e manda notificação pro celular.
// Fontes: Eyewire+ (notícias), Healio (notícias) e PubMed (artigos das principais revistas, 1x por dia).

import { readFile, writeFile } from "node:fs/promises";

const FEED_FILE = new URL("./feed.json", import.meta.url);
const MAX_ITEMS = 400;
const UA = "OftalmoUpdate/1.0 (uso pessoal)";

const NEWS_SOURCES = [
  { name: "Eyewire+", url: "https://eyewire.news/rss" },
  { name: "Healio", url: "https://www.healio.com/Rss/Ophthalmology" },
];

// ---------- Áreas (mesmos ids do app) ----------
const AREA_RULES = [
  ["mercado", /\b(acquir|acquisition|merger|merges?|funding|financing|raises?\s+\$|series [a-d]\b|ipo\b|appoint|names? .* (ceo|president|chief)|ceo\b|earnings|revenue|quarter(ly)? results|partnership|licens(e|ing) agreement|distribution agreement)/i],
  ["lios", /\b(iol|intraocular lens|toric|edof|extended depth|multifocal lens|trifocal|light adjustable)/i],
  ["plastica", /\b(thyroid eye|\bted\b|graves|orbit|orbital|eyelid|ptosis|oculoplast|blepharoplast|teprotumumab|lacrimal|dacryo)/i],
  ["neuro", /\b(optic neur|naion|neuro-?ophthalm|papilledema|intracranial hypertension|\biih\b|glp-1|semaglutide|optic nerve|visual field defect|myasthenia)/i],
  ["uveite", /\b(uveitis|uveitic|scleritis|ocular inflammation|behçet|vkh|vogt)/i],
  ["estrabismo", /\b(strabismus|amblyopia|pediatric|paediatric|children|child\b|infant|myopia control|atropine|retinopathy of prematurity|\brop\b|esotropia|exotropia)/i],
  ["glaucoma", /\b(glaucoma|intraocular pressure|\biop\b|migs|trabecul|tube shunt|\bslt\b|ocular hypertension)/i],
  ["retina", /\b(retina|retinal|macula|macular|\bamd\b|namd|geographic atrophy|diabetic|\bdme\b|vitre|anti-?vegf|aflibercept|faricimab|ranibizumab|stargardt|retinitis pigmentosa|choroid|uveal melanoma|gene therapy)/i],
  ["catarata", /\b(cataract|phaco|refractive|lasik|smile\b|prk\b|presbyopia|myopia)/i],
  ["cornea", /\b(cornea|corneal|keratoconus|dry eye|ocular surface|blephar|keratitis|conjunctiv|meibomian|pterygium|demodex|crosslink|endotheli|fuchs)/i],
  ["aparelhos", /\b(device|\boct\b|imaging|laser|510\(k\)|ce mark|platform|microscope|slit lamp|surgical system|diagnostic)/i],
  ["labs", /\b(fda|approv|nda\b|bla\b|pdufa|phase [123]|eye ?drop|drug|formulation|biosimilar|pharma)/i],
];
const classify = (text) => (AREA_RULES.find(([, re]) => re.test(text)) || ["noticias"])[0];

// ---------- PubMed ----------
const JOURNALS = [
  "Ophthalmology", "JAMA Ophthalmol", "Am J Ophthalmol", "Br J Ophthalmol", "Prog Retin Eye Res",
  "Ophthalmol Retina", "Retina", "Ophthalmol Glaucoma", "J Glaucoma", "J Cataract Refract Surg",
  "Cornea", "Ocul Surf", "J AAPOS", "J Neuroophthalmol", "Ophthalmic Plast Reconstr Surg",
  "Ocul Immunol Inflamm", "Arq Bras Oftalmol",
].map((j) => `"${j}"[ta]`).join(" OR ");
const PUBMED_AREAS = {
  retina: "retina OR retinal OR macular OR vitreoretinal OR choroidal",
  glaucoma: "glaucoma OR intraocular pressure",
  catarata: "cataract OR phacoemulsification OR refractive surgery OR intraocular lens OR presbyopia",
  cornea: "cornea OR corneal OR keratoconus OR dry eye OR keratitis OR ocular surface",
  estrabismo: "strabismus OR amblyopia OR myopia control OR retinopathy of prematurity",
  neuro: "optic neuritis OR optic neuropathy OR papilledema OR neuro-ophthalmology",
  plastica: "thyroid eye disease OR orbit OR orbital OR eyelid OR ptosis OR lacrimal",
  uveite: "uveitis OR scleritis",
};
const EXCLUDE = "NOT (letter[pt] OR comment[pt] OR editorial[pt] OR erratum[pt] OR published erratum[pt])";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url) {
  const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// ---------- RSS ----------
const decode = (s) => String(s || "")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#8217;|&rsquo;/g, "'").replace(/&#8216;|&lsquo;/g, "'")
  .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ").trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};
const isoDay = (d) => { const t = new Date(d); return isNaN(t) ? new Date().toISOString().slice(0, 10) : t.toISOString().slice(0, 10); };
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

export function parseRss(xml, sourceName) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    const title = decode(tag(b, "title")).replace(/^Core4\s+/, "");
    let link = decode(tag(b, "link"));
    if (!link) { const m = b.match(/<link[^>]*href="([^"]+)"/i); link = m ? m[1] : ""; }
    const guid = decode(tag(b, "guid")) || link || title;
    const date = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
    const desc = decode(tag(b, "description") || tag(b, "summary") || tag(b, "content"))
      .replace(/^\*?\*?Key Takeaways\*?\*?\s*/i, "");
    return {
      id: `${sourceName}|${guid}`,
      t: title, url: link, d: isoDay(date), src: sourceName, kind: "noticia",
      s: clip(desc, 260), area: classify(`${title} ${desc}`),
    };
  }).filter((x) => x.t && x.url);
}

export function parsePubmedSummary(json, area) {
  const res = json.result || {};
  return (res.uids || []).map((uid) => {
    const r = res[uid] || {};
    const d = (r.sortpubdate || r.epubdate || r.pubdate || "").replace(/\//g, "-").slice(0, 10);
    return {
      id: `PubMed|${uid}`,
      t: decode(r.title).replace(/\.$/, ""), url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
      d: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : isoDay(Date.now()), src: r.source || "PubMed",
      kind: "artigo", s: (r.authors || []).slice(0, 3).map((a) => a.name).join(", ") + ((r.authors || []).length > 3 ? " et al." : ""),
      area,
    };
  }).filter((x) => x.t);
}

async function fetchPubmed() {
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const out = [];
  for (const [area, terms] of Object.entries(PUBMED_AREAS)) {
    try {
      const term = `(${JOURNALS}) AND (${terms}) ${EXCLUDE}`;
      const s = JSON.parse(await getText(`${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=8&sort=pub_date&datetype=edat&reldate=2&term=${encodeURIComponent(term)}`));
      const ids = s.esearchresult?.idlist || [];
      await sleep(400);
      if (!ids.length) continue;
      const sum = JSON.parse(await getText(`${base}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`));
      out.push(...parsePubmedSummary(sum, area));
      await sleep(400);
    } catch (e) { console.log(`PubMed ${area}: falhou (${e.message})`); }
  }
  return out;
}

// ---------- Push ----------
const AREA_NAMES = { noticias: "Notícias", retina: "Retina", glaucoma: "Glaucoma", catarata: "Catarata", cornea: "Córnea", estrabismo: "Estrabismo/Ped", neuro: "Neuro", plastica: "Plástica/Órbita", uveite: "Uveíte", lios: "LIOs", aparelhos: "Aparelhos", labs: "Laboratórios", mercado: "Negócios" };

async function sendPush(payload) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !PUSH_SUBSCRIPTION) {
    console.log("Sem chaves/inscrição configuradas — pulando notificação.");
    return;
  }
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails("mailto:oftalmo-update@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  // Aceita uma inscrição ou uma lista (celular + tablet, por exemplo)
  let subs = JSON.parse(PUSH_SUBSCRIPTION);
  if (!Array.isArray(subs)) subs = [subs];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: "normal" });
      console.log("Notificação enviada.");
    } catch (e) {
      console.log(`Falha ao enviar (${e.statusCode || ""}): ${e.body || e.message}`);
      if (e.statusCode === 404 || e.statusCode === 410) console.log("→ A inscrição expirou. Abra o app, toque em 'Ativar avisos' e atualize o segredo PUSH_SUBSCRIPTION.");
    }
  }
}

// ---------- Principal ----------
export async function main() {
  const test = process.env.TESTE === "true";
  let feed = { updated: null, items: [] };
  try { feed = JSON.parse(await readFile(FEED_FILE, "utf8")); } catch {}
  const known = new Set(feed.items.map((x) => x.id));
  const firstRun = feed.items.length === 0;

  const found = [];
  for (const s of NEWS_SOURCES) {
    try { const items = parseRss(await getText(s.url), s.name); console.log(`${s.name}: ${items.length} itens`); found.push(...items); }
    catch (e) { console.log(`${s.name}: falhou (${e.message})`); }
  }
  const hourBRT = (new Date().getUTCHours() + 21) % 24;
  if (firstRun || hourBRT < 9 || process.env.FORCAR_PUBMED === "true") {
    const arts = await fetchPubmed(); console.log(`PubMed: ${arts.length} artigos`); found.push(...arts);
  }

  const fresh = [];
  const seen = new Set();
  for (const it of found) { if (!known.has(it.id) && !seen.has(it.id)) { seen.add(it.id); fresh.push(it); } }
  const now = new Date().toISOString();
  fresh.forEach((x) => (x.added = now));

  feed.items = [...fresh, ...feed.items]
    .sort((a, b) => (b.d || "").localeCompare(a.d || "") || (b.added || "").localeCompare(a.added || ""))
    .slice(0, MAX_ITEMS);
  feed.updated = now;
  await writeFile(FEED_FILE, JSON.stringify(feed, null, 1));
  console.log(`Novos: ${fresh.length} (total ${feed.items.length})`);

  if (test) {
    await sendPush({ title: "Oftalmo Update", body: "Teste: os avisos estão funcionando ✔", url: "./#aovivo", tag: "teste" });
    return;
  }
  if (firstRun || !fresh.length) return; // 1ª execução só preenche, sem avisar

  const news = fresh.filter((x) => x.kind === "noticia");
  const arts = fresh.filter((x) => x.kind === "artigo");
  let title, body;
  if (news.length === 1 && !arts.length) {
    title = `Nova notícia · ${AREA_NAMES[news[0].area] || "Oftalmo"}`;
    body = news[0].t;
  } else {
    const parts = [];
    if (news.length) parts.push(`${news.length} notícia${news.length > 1 ? "s" : ""}`);
    if (arts.length) parts.push(`${arts.length} artigo${arts.length > 1 ? "s" : ""}`);
    title = `Oftalmo Update · ${parts.join(" e ")} nova${fresh.length > 1 ? "s" : ""}`;
    body = (news.length ? news : arts).slice(0, 3).map((x) => "• " + clip(x.t, 90)).join("\n");
  }
  await sendPush({ title, body, url: "./#aovivo", tag: "oftalmo-" + now.slice(0, 13) });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

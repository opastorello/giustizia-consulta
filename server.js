import http from "node:http";
import crypto from "node:crypto";
import { Agent, fetch as undiciFetch } from "undici";

// =============================================================================
//   GIUSTIZIA CONSULTA · API
//   Reverse-engineered from it.giustizia.civile APK v2.0.18 (assets/www/js/main.js)
//   Endpoint: https://mob.processotelematico.giustizia.it/proxy/index_mobile.php
// =============================================================================

const PORT = process.env.PORT || 8080;
const VERSION_API = "0.1.0";
const REPO_URL = "https://github.com/opastorello/giustizia-consulta";

const KEY  = "ffsdf4354543fefsrwerewsdffw44fdsfwrerdsfwerwfsd";
const KEY2 = "gfhgkhgjrurgd11fgeryjhj65tkuliuefawdwrhk66uklyukrhrgefdwd656wfwhttrhergfqwqwffe";
const VERSION = "2.0";
const SUBVERSION = ".18";
const PLATFORM = "Android";
const SERVERS = [
  "https://mob.processotelematico.giustizia.it/proxy/",
  "https://mob1.processotelematico.giustizia.it/proxy/",
];

// cert TLS do giustizia está expirado - o próprio app ignora via setServerTrustMode("nocheck")
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

// -----------------------------------------------------------------------------
// Constantes de apoio
// -----------------------------------------------------------------------------

// Registros civis italianos (nomenclatura IT original, com tradução PT-BR explicativa)
const REGISTRI = {
  CC:   "Contencioso Civil (Contenzioso Civile)",
  L:    "Trabalho (Lavoro)",
  VG:   "Jurisdição Voluntária (Volontaria Giurisdizione)",
  PC:   "Processos Concursais/Falimentares (Procedure Concorsuali)",
  ESM:  "Execuções de bens móveis (Esecuzioni Mobiliari)",
  ESIM: "Execuções de bens imóveis (Esecuzioni Immobiliari)",
  GDP:  "Juiz de Paz (Giudice di Pace)",
};

const TIPI_UFFICIO = {
  1: "Tribunal Ordinário (1ª instância)",
  2: "Corte de Apelação (2ª instância)",
  3: "Tribunal Especializado",
  4: "Juiz de Paz (protocolo legado)",
  5: "Juiz de Paz (sistema SIGMA)",
};

// Mapeamento de registros com sistema informativo responsável (PT-BR)
const REGISTRI_META = {
  CC:   { desc: "Contencioso Civil",            sistema: "SICID",  nota: "Causas cíveis ordinárias perante o tribunal" },
  L:    { desc: "Trabalho",                     sistema: "SICID",  nota: "Controvérsias trabalhistas, previdenciárias, assistenciais" },
  VG:   { desc: "Jurisdição Voluntária",        sistema: "SICID",  nota: "Tutelas, curatelas, sucessões, adoções" },
  PC:   { desc: "Processos Concursais",         sistema: "SIECIC", nota: "Falências, recuperações (concordati), liquidações judiciais" },
  ESM:  { desc: "Execuções de bens móveis",     sistema: "SIECIC", nota: "Penhoras de bens móveis e junto a terceiros" },
  ESIM: { desc: "Execuções de bens imóveis",    sistema: "SIECIC", nota: "Penhoras imobiliárias, leilões judiciais" },
  GDP:  { desc: "Juiz de Paz",                  sistema: "SIGMA",  nota: "Causas perante o Juiz de Paz (sistema SIGMA)" },
};

const TIPI_UFFICIO_META = {
  1: { desc: "Tribunal Ordinário",              sistema: "SICID/SIECIC" },
  2: { desc: "Corte de Apelação",               sistema: "SICID/SIECIC" },
  3: { desc: "Tribunal Especializado",          sistema: "SICID/SIECIC", nota: "Ex: Seção de Empresas, Menores" },
  4: { desc: "Juiz de Paz (protocolo antigo)",  sistema: "legado" },
  5: { desc: "Juiz de Paz (SIGMA)",             sistema: "SIGMA" },
};

// Tipos de evento canônicos retornados por classifyEvento()
const TIPI_EVENTO = {
  ISCRIZIONE:         "Inscrição do processo em juízo",
  ASSEGNAZIONE:       "Designação/atribuição do juiz",
  FISSAZIONE_UDIENZA: "Fixação da data da audiência",
  UDIENZA:            "Realização de audiência",
  SENTENZA:           "Prolação de sentença",
  DECRETO:            "Prolação de decreto",
  ORDINANZA:          "Prolação de ordinanza (decisão)",
  DEPOSITO:           "Juntada de ato/documento",
  NOTIFICA:           "Intimação/notificação",
  COMUNICAZIONE:      "Comunicação da secretaria",
  INTERVENTO:         "Intervenção de parte",
  RINVIO:             "Adiamento de audiência",
  ANNOTAZIONE:        "Anotação no registro",
  CHIUSURA:           "Encerramento/arquivamento/extinção do processo",
  ALTRO:              "Outro evento não classificado",
};

// Qualificações das partes (classifyQualifica)
const QUALIFICHE_PARTE = {
  ATTORE:      "Autor (quem propõe a ação)",
  CONVENUTO:   "Réu (quem é citado)",
  TERZO:       "Terceiro interveniente / chamado ao processo",
  RICORRENTE:  "Recorrente (rito trabalhista ou voluntário)",
  RESISTENTE:  "Resistente (rito trabalhista ou voluntário)",
  ALTRO:       "Outra qualificação processual",
};

// Códigos de erro retornados pela API
const ERROR_CODES = {
  PARSE_FAIL:    "Resposta do servidor não pôde ser parseada",
  NOT_FOUND:     "Processo não encontrado no servidor do Ministério",
  UPSTREAM_DOWN: "Ambos servidores (mob e mob1) falharam",
  BAD_INPUT:     "Parâmetros ausentes ou inválidos",
  GEOBLOCKED:    "Acesso bloqueado pelo geofiltro (não deveria ocorrer via Fly.io FRA)",
};

// Codici regione usati da PST (servizipst.giustizia.it) — ordine alfabetico, non ISTAT
const REGIONI_IT = {
  "1":  "Abruzzo",
  "2":  "Basilicata",
  "3":  "Calabria",
  "4":  "Campania",
  "5":  "Emilia-Romagna",
  "6":  "Friuli-Venezia Giulia",
  "7":  "Lazio",
  "8":  "Liguria",
  "9":  "Lombardia",
  "10": "Marche",
  "11": "Molise",
  "12": "Piemonte",
  "13": "Puglia",
  "14": "Sardegna",
  "15": "Sicilia",
  "16": "Toscana",
  "17": "Trentino-Alto Adige",
  "18": "Umbria",
  "19": "Valle d'Aosta",
  "20": "Veneto",
};

// Distretti di Corte d'Appello (26 distretti + sezioni staccate)
const DISTRETTI_CORTE_APPELLO = [
  "Ancona", "Bari", "Bologna", "Brescia", "Cagliari", "Caltanissetta", "Campobasso",
  "Catania", "Catanzaro", "Firenze", "Genova", "L'Aquila", "Lecce", "Messina",
  "Milano", "Napoli", "Palermo", "Perugia", "Potenza", "Reggio Calabria",
  "Roma", "Salerno", "Sassari", "Taranto", "Torino", "Trento", "Trieste",
  "Venezia", "Bolzano (sezione)",
];

// Tipos de varas judiciais (classificação pelo nome) — rótulos PT-BR com nome IT original
const TIPI_UFFICIO_GIUDIZIARIO = {
  CORTE_APPELLO:         "Corte de Apelação (Corte d'Appello)",
  TRIBUNALE_ORDINARIO:   "Tribunal Ordinário (Tribunale Ordinario)",
  TRIBUNALE_MINORENNI:   "Tribunal de Menores (Tribunale per i Minorenni)",
  TRIBUNALE_SORVEGLIANZA:"Tribunal de Vigilância Penal (Tribunale di Sorveglianza)",
  GIUDICE_DI_PACE:       "Juiz de Paz (Giudice di Pace)",
  GIUDICE_DI_PACE_LEGACY:"Juiz de Paz (extinto/incorporado)",
  SEZIONE_DISTACCATA:    "Vara Destacada / ex-vara (Sezione Distaccata)",
  ALTRO:                 "Outro",
};

function classifyUfficio(nome) {
  const s = String(nome || "");
  if (/^Corte\s+d[''`]Appello/i.test(s))               return "CORTE_APPELLO";
  if (/^Tribunale\s+per\s+i\s+Minorenni/i.test(s))     return "TRIBUNALE_MINORENNI";
  if (/^Tribunale\s+di\s+Sorveglianza/i.test(s))       return "TRIBUNALE_SORVEGLIANZA";
  if (/^Tribunale\s+Ordinario/i.test(s))               return "TRIBUNALE_ORDINARIO";
  if (/^TRIBUNALE\s+DI\s+.+\s+ex\s+SD/i.test(s))       return "SEZIONE_DISTACCATA";
  if (/^Sezione\s+Distaccata/i.test(s))                return "SEZIONE_DISTACCATA";
  if (/^GIUDICE\s+DI\s+PACE[- ]/i.test(s))             return "GIUDICE_DI_PACE_LEGACY";
  if (/^Giudice\s+di\s+Pace/i.test(s))                 return "GIUDICE_DI_PACE";
  return "ALTRO";
}

// Uffici giudiziari — popolato da DWR scraping del portale PST.
// Formato raw: "idufficio:Nome" (separatore `:` solo per brevità; parser splitta sul primo `:`)
// Distretti di Corte d'Appello allineati regione->distretto quando 1:1.
const UFFICI_RAW = {
  // Abruzzo (1) -> distretto L'Aquila
  1: [
    "0660490066:Corte d'Appello - L'Aquila",
    "06602801539:GIUDICE DI PACE - Castel di Sangro",
    "06905801509:GIUDICE DI PACE-CHIETI EX GIUD. DI PACE - ORTONA",
    "0690050158:GIUDICE DI PACE-LANCIANO EX GIUD. DI PACE - ATESSA",
    "0680380156:GIUDICE DI PACE-PESCARA EX GIUD. DI PACE - SAN VALENTINO IN ABRUZZO CITERIORE",
    "0660280153:GIUDICE DI PACE-SULMONA EX GIUD. DI PACE - CASTEL DI SANGRO",
    "0670250158:GIUDICE DI PACE-TERAMO EX GIUD. DI PACE - GIULIANOVA",
    "0670040154:Giudice di Pace - Atri",
    "0660060157:Giudice di Pace - Avezzano",
    "0690220154:Giudice di Pace - Chieti",
    "0690410154:Giudice di Pace - Gissi",
    "06904301584:Giudice di Pace - Guardiagrele",
    "0660490157:Giudice di Pace - L'Aquila",
    "0690460154:Giudice di Pace - Lanciano",
    "0680270153:Giudice di Pace - Penne",
    "0680280155:Giudice di Pace - Pescara",
    "0660690159:Giudice di Pace - Pescina",
    "0660980150:Giudice di Pace - Sulmona",
    "0670410152:Giudice di Pace - Teramo",
    "0690990155:Giudice di Pace - Vasto",
    "0690050192:Sezione Distaccata - Atessa",
    "0690580193:Sezione Distaccata - Ortona",
    "0680270197:TRIBUNALE DI PESCARA ex SD PENNE",
    "0680380190:TRIBUNALE DI PESCARA ex SD SAN VALENTINO IN ABRUZZO CITERIORE",
    "0670040198:TRIBUNALE DI TERAMO ex SD ATRI",
    "0670250192:TRIBUNALE DI TERAMO ex SD GIULIANOVA",
    "0660060099:Tribunale Ordinario - Avezzano",
    "0690220096:Tribunale Ordinario - Chieti",
    "0660490099:Tribunale Ordinario - L'Aquila",
    "0690460096:Tribunale Ordinario - Lanciano",
    "0680280097:Tribunale Ordinario - Pescara",
    "0660980092:Tribunale Ordinario - Sulmona",
    "0670410094:Tribunale Ordinario - Teramo",
    "0690990097:Tribunale Ordinario - Vasto",
    "0660490113:Tribunale per i Minorenni-L'Aquila",
  ],
  // Toscana (16) -> distretto Firenze
  16: [
    "0480170067:Corte d'Appello - Firenze",
    "04600901591:GIUDICE DI PACE - Castelnuovo di Garfagnana",
    "0510040156:GIUDICE DI PACE-AREZZO EX GIUD. DI PACE - BIBBIENA",
    "0510170153:GIUDICE DI PACE-AREZZO EX GIUD. DI PACE - CORTONA",
    "0510260152:GIUDICE DI PACE-AREZZO EX GIUD. DI PACE - MONTEVARCHI",
    "0510330157:GIUDICE DI PACE-AREZZO EX GIUD. DI PACE - SAN GIOVANNI VALDARNO",
    "0510340159:GIUDICE DI PACE-AREZZO EX GIUD. DI PACE - SANSEPOLCRO",
    "0480040151:GIUDICE DI PACE-FIRENZE EX GIUD. DI PACE - BORGO SAN LORENZO",
    "0480100154:GIUDICE DI PACE-FIRENZE EX GIUD. DI PACE - CASTELFIORENTINO",
    "0480140152:GIUDICE DI PACE-FIRENZE EX GIUD. DI PACE - EMPOLI",
    "0480330152:GIUDICE DI PACE-FIRENZE EX GIUD. DI PACE - PONTASSIEVE",
    "0530150151:GIUDICE DI PACE-GROSSETO EX GIUD. DI PACE - MASSA MARITTIMA",
    "0530180157:GIUDICE DI PACE-GROSSETO EX GIUD. DI PACE - ORBETELLO",
    "0530190159:GIUDICE DI PACE-GROSSETO EX GIUD. DI PACE - PITIGLIANO",
    "0460040159:GIUDICE DI PACE-LUCCA EX GIUD. DI PACE - BORGO A MOZZANO",
    "0460090159:GIUDICE DI PACE-LUCCA EX GIUD. DI PACE - CASTELNUOVO DI GARFAGNANA",
    "0460240151:GIUDICE DI PACE-LUCCA EX GIUD. DI PACE - PIETRASANTA",
    "0460330150:GIUDICE DI PACE-LUCCA EX GIUD. DI PACE - VIAREGGIO",
    "0520010151:GIUDICE DI PACE-MONTEPULCIANO EX GIUD. DI PACE - ABBADIA SAN SALVATORE",
    "0500080153:GIUDICE DI PACE-PISA EX GIUD. DI PACE - CASCINA",
    "0470090150:GIUDICE DI PACE-PISTOIA EX GIUD. DI PACE - MONSUMMANO TERME",
    "0470120157:GIUDICE DI PACE-PISTOIA EX GIUD. DI PACE - PESCIA",
    "0450010152:GIUDICE DI PACE-PONTREMOLI EX GIUD. DI PACE - AULLA",
    "0520220155:GIUDICE DI PACE-SIENA EX GIUD. DI PACE - POGGIBONSI",
    "0530010152:Giudice di Pace - Arcidosso",
    "0510020152:Giudice di Pace - Arezzo",
    "0450030156:Giudice di Pace - Carrara",
    "0490070158:Giudice di Pace - Cecina",
    "04801401524:Giudice di Pace - Empoli",
    "0480170158:Giudice di Pace - Firenze",
    "0530110153:Giudice di Pace - Grosseto",
    "0490090152:Giudice di Pace - Livorno",
    "0460170156:Giudice di Pace - Lucca",
    "0450100151:Giudice di Pace - Massa",
    "0520150150:Giudice di Pace - Montepulciano",
    "0490120159:Giudice di Pace - Piombino",
    "0500260151:Giudice di Pace - Pisa",
    "0470140151:Giudice di Pace - Pistoia",
    "0500290157:Giudice di Pace - Pontedera",
    "0450140159:Giudice di Pace - Pontremoli",
    "0490140153:Giudice di Pace - Portoferraio",
    "1000050158:Giudice di Pace - Prato",
    "0500320154:Giudice di Pace - San Miniato",
    "0520320156:Giudice di Pace - Siena",
    "0500390158:Giudice di Pace - Volterra",
    "0490140197:Sezione Distaccata - Portoferraio",
    "0510260196:TRIBUNALE DI AREZZO ex SD MONTEVARCHI",
    "0510340193:TRIBUNALE DI AREZZO ex SD SANSEPOLCRO",
    "0480140196:TRIBUNALE DI FIRENZE ex SD EMPOLI",
    "0480330196:TRIBUNALE DI FIRENZE ex SD PONTASSIEVE",
    "0530180191:TRIBUNALE DI GROSSETO ex SD ORBETELLO",
    "0490070192:TRIBUNALE DI LIVORNO ex SD CECINA",
    "0490120193:TRIBUNALE DI LIVORNO ex SD PIOMBINO",
    "0460330194:TRIBUNALE DI LUCCA ex SD VIAREGGIO",
    "0450030190:TRIBUNALE DI MASSA ex SD CARRARA",
    "0450140193:TRIBUNALE DI MASSA ex SD PONTREMOLI",
    "0500290191:TRIBUNALE DI PISA ex SD PONTEDERA",
    "0470090194:TRIBUNALE DI PISTOIA ex SD MONSUMMANO TERME",
    "0470120191:TRIBUNALE DI PISTOIA ex SD PESCIA",
    "0520220199:TRIBUNALE DI SIENA ex SD POGGIBONSI",
    "0520150092:TRIBUNALE DI SIENA ex TRIBUNALE DI MONTEPULCIANO",
    "0510020094:Tribunale Ordinario - Arezzo",
    "0480170090:Tribunale Ordinario - Firenze",
    "0530110095:Tribunale Ordinario - Grosseto",
    "0490090094:Tribunale Ordinario - Livorno",
    "0460170098:Tribunale Ordinario - Lucca",
    "0450100093:Tribunale Ordinario - Massa (MS)",
    "0500260093:Tribunale Ordinario - Pisa",
    "0470140093:Tribunale Ordinario - Pistoia",
    "1000050090:Tribunale Ordinario - Prato",
    "0520320098:Tribunale Ordinario - Siena",
    "0480170114:Tribunale per i Minorenni-Firenze",
  ],
  // Molise (11) -> distretto Campobasso
  11: [
    "0700060062:Corte d'Appello - Campobasso",
    "07007801546:GIUDICE DI PACE - Termoli",
    "0700780154:GIUDICE DI PACE-LARINO EX GIUD. DI PACE - TERMOLI",
    "0940020153:Giudice di Pace - Agnone",
    "0700060153:Giudice di Pace - Campobasso",
    "0940120154:Giudice di Pace - Castel San Vincenzo",
    "0940230157:Giudice di Pace - Isernia",
    "0700310156:Giudice di Pace - Larino",
    "09405201584:Giudice di Pace - Venafro",
    "0700780198:TRIBUNALE DI LARINO ex SD TERMOLI",
    "0700060095:Tribunale Ordinario - Campobasso",
    "0940230099:Tribunale Ordinario - Isernia",
    "0700310098:Tribunale Ordinario - Larino",
    "0700060119:Tribunale per i Minorenni-Campobasso",
  ],
};

// Mappa regione (PST code) -> distretto/i di Corte d'Appello
const DISTRETTI_PER_REGIONE = {
  1:  ["L'Aquila"],
  2:  ["Potenza"],
  3:  ["Catanzaro", "Reggio Calabria"],
  4:  ["Napoli", "Salerno"],
  5:  ["Bologna"],
  6:  ["Trieste"],
  7:  ["Roma"],
  8:  ["Genova"],
  9:  ["Brescia", "Milano"],
  10: ["Ancona"],
  11: ["Campobasso"],
  12: ["Torino"],
  13: ["Bari", "Lecce", "Taranto"],
  14: ["Cagliari", "Sassari"],
  15: ["Caltanissetta", "Catania", "Messina", "Palermo"],
  16: ["Firenze"],
  17: ["Trento", "Bolzano"],
  18: ["Perugia"],
  19: ["Torino"], // Valle d'Aosta dipende dal distretto di Torino
  20: ["Venezia"],
};

function buildUfficioEntry(regioneCode, raw) {
  const idx = raw.indexOf(":");
  const id = raw.slice(0, idx);
  const nome = raw.slice(idx + 1);
  const tipo = classifyUfficio(nome);
  return {
    id,
    nome,
    tipo,
    tipoDesc: TIPI_UFFICIO_GIUDIZIARIO[tipo],
    regioneCode: String(regioneCode),
    regione: REGIONI_IT[String(regioneCode)] || null,
    distretti: DISTRETTI_PER_REGIONE[regioneCode] || [],
  };
}

// Tabella derivata: id -> entry (per lookup O(1))
const UFFICI_BY_ID = {};
for (const [rc, list] of Object.entries(UFFICI_RAW)) {
  for (const raw of list) {
    const entry = buildUfficioEntry(Number(rc), raw);
    UFFICI_BY_ID[entry.id] = entry;
  }
}

// Tipos de evento inferidos a partir do texto do storico
function classifyEvento(ev) {
  const s = String(ev || "").toUpperCase();
  if (/ISCRIZIONE|ISCRITTO/.test(s))          return "ISCRIZIONE";
  if (/ASSEGNAZIONE|DESIGNAZIONE/.test(s))    return "ASSEGNAZIONE";
  if (/FISSAZIONE.*UDIENZA/.test(s))          return "FISSAZIONE_UDIENZA";
  if (/UDIENZA/.test(s))                       return "UDIENZA";
  if (/SENTENZA/.test(s))                      return "SENTENZA";
  if (/DECRETO/.test(s))                       return "DECRETO";
  if (/ORDINANZA/.test(s))                     return "ORDINANZA";
  if (/DEPOSITO/.test(s))                      return "DEPOSITO";
  if (/NOTIFICA/.test(s))                      return "NOTIFICA";
  if (/COMUNICAZIONE/.test(s))                 return "COMUNICAZIONE";
  if (/INTERVENTO/.test(s))                    return "INTERVENTO";
  if (/RINVIO/.test(s))                        return "RINVIO";
  if (/ANNOTAZIONE/.test(s))                   return "ANNOTAZIONE";
  if (/CHIUSURA|ARCHIVIAZIONE|ESTINZIONE/.test(s)) return "CHIUSURA";
  return "ALTRO";
}

function classifyQualifica(q) {
  const s = String(q || "").toLowerCase();
  if (s.includes("attore"))    return "ATTORE";
  if (s.includes("convenuto")) return "CONVENUTO";
  if (s.includes("terzo"))     return "TERZO";
  if (s.includes("ricorrente"))return "RICORRENTE";
  if (s.includes("resistente"))return "RESISTENTE";
  return "ALTRO";
}

// -----------------------------------------------------------------------------
// Signer & URL builder
// -----------------------------------------------------------------------------

function md5(s) {
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}

function buildPagina({ uuid, deviceName, androidVer, width, height }) {
  const token = md5(KEY + VERSION + SUBVERSION + PLATFORM + " " + androidVer + uuid + deviceName);
  const qs = new URLSearchParams({
    version: VERSION + SUBVERSION,
    platform: `${PLATFORM} ${androidVer}`,
    uuid, devicename: deviceName,
    devicewidth: String(width),
    deviceheight: String(height),
    token,
  });
  return "index_mobile.php?" + qs.toString();
}

function pickAzione({ registro, tipoufficio, tiporicerca }) {
  const t = Number(tipoufficio);
  let base;
  if ([1, 2, 3].includes(t)) {
    if (["CC", "VG", "L"].includes(registro))          base = "direttarg_sicid_mobile";
    else if (["PC", "ESM", "ESIM"].includes(registro)) base = "direttarg_siecic_mobile";
    else                                                base = "direttarg_mobile";
  } else if (t === 5) {
    base = "direttarg_sigma_mobile";
  } else {
    base = "direttarg_mobile";
  }
  if (tiporicerca === "S" || tiporicerca === "D") {
    if (["CC", "L"].includes(registro))       base = `direttarg_sicid_mobile&tiporicerca=${tiporicerca}`;
    else if (registro === "PC")               base = `direttarg_siecic_mobile&tiporicerca=${tiporicerca}`;
    else if (tiporicerca === "S")             base = "direttasent_mobile";
    else if (tiporicerca === "D")             base = "direttadi_mobile";
  }
  return base;
}

function normalizeInput(p) {
  const n = { ...p };
  n.idufficio  = String(n.idufficio || "").padStart(10, "0");
  n.registro   = String(n.registro || "").toUpperCase();
  n.aaproc     = String(n.aaproc || "").padStart(4, "0");
  // numproc: aceita com ou sem zero-padding; remove leading zeros internamente para md5/URL
  n.numproc    = String(n.numproc || "").replace(/^0+/, "") || "0";
  n.tipoufficio = Number(n.tipoufficio || 1);
  if (n.tiporicerca) n.tiporicerca = String(n.tiporicerca).toUpperCase();
  return n;
}

function buildQueryUrl(p) {
  const srv = SERVERS[p.serverIdx ?? 0];
  const pagina = buildPagina({
    uuid:       p.uuid       || "aabbccddeeff0011",
    deviceName: p.deviceName || "Pixel 7",
    androidVer: p.androidVer || "14",
    width:      p.width      || 1080,
    height:     p.height     || 2400,
  });
  const azione = pickAzione(p);
  const t2 = md5(p.idufficio + KEY2 + p.aaproc + p.numproc + KEY2);
  let finalUrl = srv + pagina + "&azione=" + azione;
  const extras = {
    registro: p.registro,
    idufficio: p.idufficio,
    numproc: p.numproc,
    aaproc: p.aaproc,
    tipoufficio: String(p.tipoufficio),
    silente: "0",
    t2,
  };
  for (const [k, v] of Object.entries(extras)) finalUrl += "&" + k + "=" + encodeURIComponent(v);
  return finalUrl;
}

async function consulta(p) {
  const url = buildQueryUrl(p);
  const t0 = Date.now();
  const r = await undiciFetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) GiustiziaCivile/2.0.18" },
    dispatcher: insecureAgent,
    signal: AbortSignal.timeout(25000),
  });
  const body = await r.text();
  return { url, status: r.status, ms: Date.now() - t0, body };
}

// -----------------------------------------------------------------------------
// HTML/XML parser
// -----------------------------------------------------------------------------

function tagText(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function allTagTexts(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out = []; let m;
  while ((m = re.exec(html)) !== null) out.push(m[1].trim());
  return out;
}

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ",
  "&egrave;": "è", "&agrave;": "à", "&igrave;": "ì", "&ograve;": "ò", "&ugrave;": "ù",
  "&eacute;": "é", "&aacute;": "á", "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú",
  "&ccedil;": "ç", "&Egrave;": "È", "&Agrave;": "À",
};
function decodeEntities(s) {
  let r = String(s || "");
  for (const [e, c] of Object.entries(ENTITIES)) r = r.split(e).join(c);
  r = r.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  r = r.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  return r;
}
function stripTags(html) {
  return decodeEntities(String(html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

function parseSections(html) {
  const sections = {};
  const ulRe = /<ul[^>]*data-role="listview"[^>]*>([\s\S]*?)<\/ul>/gi;
  let m;
  while ((m = ulRe.exec(html)) !== null) {
    const inner = m[1];
    const divider = inner.match(/<li[^>]*data-role="list-divider"[^>]*>([\s\S]*?)<\/li>/i);
    if (!divider) continue;
    const title = stripTags(divider[1]);
    const items = [];
    const liRe = /<li(?![^>]*list-divider)[^>]*>([\s\S]*?)<\/li>/gi;
    let li;
    while ((li = liRe.exec(inner)) !== null) {
      const rawInner = li[1].trim();
      if (!rawInner) continue;
      items.push({ raw: rawInner, text: stripTags(rawInner) });
    }
    sections[title] = items;
  }
  return sections;
}

function parseParti(items) {
  return items.map(it => {
    const raw = it.raw;
    const mQual = raw.match(/<i>\s*\(([^)]+)\)\s*<\/i>/);
    const qualifica = mQual ? mQual[1].trim() : null;
    const beforeI = raw.split(/<i>/i)[0];
    const nome = stripTags(beforeI);
    const afterBr = raw.split(/<br\s*\/?>/i)[1];
    const avvocato = afterBr ? stripTags(afterBr) : null;
    return {
      nome,
      qualifica,
      qualificaTipo: classifyQualifica(qualifica),
      avvocato,
    };
  });
}

function parseStorico(items) {
  return items.map(it => {
    const t = it.text;
    const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(.+)$/);
    if (!m) return { data: null, dataISO: null, evento: t, tipoEvento: classifyEvento(t) };
    const [, dd, mm, yyyy, evento] = m;
    return {
      data: `${dd}/${mm}/${yyyy}`,
      dataISO: `${yyyy}-${mm}-${dd}`,
      evento: evento.trim(),
      tipoEvento: classifyEvento(evento),
    };
  });
}

function parseCalendarArgs(html) {
  // extrai args do creaEventoCalendarioAndroid("titolo","luogo","note","dtstart","dtend")
  const m = html.match(/creaEventoCalendarioAndroid\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"([^"]*)"/);
  if (!m) return null;
  return { titolo: m[1], luogo: m[2], note: m[3], start: m[4], end: m[5] };
}

function parseMetaComments(html) {
  // <!--G_PLATFORM:Android 14--> etc.
  const out = {};
  const re = /<!--G_([A-Z_]+):([^-]*?)-->/g;
  let m;
  while ((m = re.exec(html)) !== null) out["G_" + m[1]] = m[2].trim();
  const srv = html.match(/<!--SERVER_NAME:([^-]*?)-->/);
  if (srv) out.SERVER_NAME = srv[1].trim();
  return out;
}

function parseUltimoAgg(html) {
  const m = html.match(/Ultimo aggiornamento[^<]*<[^>]*>?\s*([^<]*)</i)
         || html.match(/Ultimo aggiornamento storico fascicolo\s*([^<]+)/i);
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").trim();
}

function udienzaISO(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return null;
  // trata como horário local italiano (Europe/Rome) e converte a offset manual
  // como o endpoint devolve sem tz, manteremos como "wall clock Italy" mas em ISO como naive + sufixo IT
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+02:00`;
}

function italianDateToISO(str) {
  // "dd/mm/yyyy  HH:MM" -> ISO
  const m = String(str || "").match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "00", mi = "00"] = m;
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:00+02:00`;
}

function daysBetween(isoA, isoB) {
  if (!isoA || !isoB) return null;
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.round((a - b) / 86_400_000);
}

function parseIdUfficio(id) {
  if (!id || id.length !== 10) return {};
  return {
    regioneCode:  id.substring(0, 2),
    regione:      REGIONI_IT[id.substring(0, 2)] || null,
    distretto:    id.substring(0, 6),
    sezione:      id.substring(6),
  };
}

function isEmptyOrError(html) {
  if (!html || html.length < 300) return { isErr: true, reason: "resposta muito curta" };
  // servizio non disponibile
  if (/servizio.*non.*disponibile/i.test(html)) return { isErr: true, reason: "servizio non disponibile" };
  // fascicolo non trovato
  if (/fascicolo.*non.*trovato|nessun fascicolo/i.test(html)) return { isErr: true, reason: "fascicolo non trovato", code: "NOT_FOUND" };
  if (/errore/i.test(html) && !/<NumeroRuolo>/.test(html))   return { isErr: true, reason: "erro upstream" };
  return { isErr: false };
}

function parseResult(html) {
  const errCheck = isEmptyOrError(html);
  const meta = parseMetaComments(html);
  const numeroRuolo = tagText(html, "NumeroRuolo");
  const descUfficio = tagText(html, "descUfficio");

  if (errCheck.isErr || (!numeroRuolo && !descUfficio)) {
    return {
      ok: false,
      error: errCheck.reason || "falha ao parsear resposta",
      code: errCheck.code || "PARSE_FAIL",
      meta,
      preview: stripTags(html).slice(0, 400),
    };
  }

  const annoRuolo   = tagText(html, "AnnoRuolo");
  const registro    = tagText(html, "Registro");
  const idUfficio   = tagText(html, "IdUfficio");
  const nomeGiudice = tagText(html, "NomeGiudice");
  const dataUdienza = tagText(html, "DataUdienza");
  const dataReg     = tagText(html, "DataReg");
  const dataRegDB   = tagText(html, "DataRegDB");

  const sections  = parseSections(html);
  const parti     = sections["Parti fascicolo"]   ? parseParti(sections["Parti fascicolo"])   : [];
  const storico   = sections["Storico fascicolo"] ? parseStorico(sections["Storico fascicolo"]): [];
  const oggetto   = (sections["Oggetto"] || []).map(x => x.text).filter(Boolean);
  const statoList = sections["Stato fascicolo"] || [];
  const stato     = statoList.length ? statoList[0].text : null;

  const rgList = sections["Ruolo Generale"] || [];
  const iscritto = rgList.find(x => /iscritto al ruolo/i.test(x.text));
  const iscrittoIl = iscritto ? (iscritto.text.match(/(\d{2}\/\d{2}\/\d{4})/) || [])[1] || null : null;
  const iscrittoIlISO = iscrittoIl ? italianDateToISO(iscrittoIl).split("T")[0] : null;

  const udIso = udienzaISO(dataUdienza);
  const nowIso = new Date().toISOString();
  const cal = parseCalendarArgs(html);
  const ultimoAgg = parseUltimoAgg(html);

  const udienza = dataUdienza ? {
    raw: dataUdienza,
    iso: udIso,
    timezone: "Europe/Rome",
    isFuture: udIso ? new Date(udIso) > new Date() : false,
    daysUntil: udIso ? daysBetween(udIso, nowIso) : null,
    calendar: cal ? { titolo: cal.titolo, luogo: cal.luogo, note: cal.note, start: cal.start, end: cal.end } : null,
  } : null;

  const info = parseIdUfficio(idUfficio);

  return {
    ok: true,
    fascicolo: {
      ruoloGenerale: {
        numero: numeroRuolo,
        numeroInt: numeroRuolo ? parseInt(numeroRuolo, 10) : null,
        anno: annoRuolo,
        identifier: numeroRuolo && annoRuolo ? `${numeroRuolo}/${annoRuolo}` : null,
        registro,
        registroDesc: REGISTRI[registro] || registro,
        iscrittoIl,
        iscrittoIlISO,
        daysSinceIscrizione: iscrittoIlISO ? daysBetween(nowIso, iscrittoIlISO + "T00:00:00+02:00") : null,
      },
      ufficio: {
        id: idUfficio,
        descrizione: descUfficio,
        ...info,
      },
      giudice: nomeGiudice ? { nome: nomeGiudice } : null,
      stato: stato ? { descrizione: stato, codice: stato.replace(/\s+/g, "_").toUpperCase() } : null,
      oggetto: oggetto.length ? {
        rito:     oggetto[0] || null,
        materia:  oggetto[1] || null,
        raw:      oggetto,
      } : null,
      udienza,
      parti: {
        totale: parti.length,
        attori: parti.filter(p => p.qualificaTipo === "ATTORE"),
        convenuti: parti.filter(p => p.qualificaTipo === "CONVENUTO"),
        altri: parti.filter(p => !["ATTORE", "CONVENUTO"].includes(p.qualificaTipo)),
        raw: parti,
      },
      storico: {
        totale: storico.length,
        ultimoEvento: storico.length ? storico[storico.length - 1] : null,
        primoEvento: storico.length ? storico[0] : null,
        eventi: storico,
      },
      aggiornamento: {
        ultimoStorico: ultimoAgg,
        DataReg: dataReg,
        DataRegDB: dataRegDB,
        DataRegISO: dataReg ? italianDateToISO(dataReg) : null,
      },
    },
    meta,
  };
}

// -----------------------------------------------------------------------------
// ICS export (calendar)
// -----------------------------------------------------------------------------

function buildICS(parsed, reqParams) {
  const ud = parsed?.fascicolo?.udienza;
  if (!ud?.iso || !ud?.calendar) return null;
  const pad = n => String(n).padStart(2, "0");
  const toICS = iso => {
    const d = new Date(iso);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  };
  const uid = `${reqParams.idufficio}-${reqParams.registro}-${reqParams.numproc}-${reqParams.aaproc}@giustizia-consulta`;
  const summary = ud.calendar.titolo || `Udienza RG ${reqParams.numproc}/${reqParams.aaproc} ${reqParams.registro}`;
  const location = ud.calendar.luogo || parsed.fascicolo.ufficio.descrizione || "";
  const desc = (ud.calendar.note || "") + `\\n\\nStato: ${parsed.fascicolo.stato?.descrizione || ""}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//giustizia-consulta//IT",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toICS(new Date().toISOString())}`,
    `DTSTART:${toICS(ud.iso)}`,
    `DTEND:${toICS(new Date(new Date(ud.iso).getTime() + 3600_000).toISOString())}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${desc}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

// -----------------------------------------------------------------------------
// DWR client — Direct Web Remoting RPC chiamato dal portale PST
// -----------------------------------------------------------------------------

const DWR_BASE = "https://servizipst.giustizia.it/PST/dwr/call/plaincall/";
const DWR_CACHE = new Map(); // key -> { ts, data }
const DWR_TTL_MS = 6 * 60 * 60_000; // 6h — uffici raramente cambiano

function randScriptSessionId() {
  // 28-char quasi casuale come quello generato da DWR client-side
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 28; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function dwrCall(scriptName, methodName, params = []) {
  const lines = [
    "callCount=1",
    "windowName=",
    `c0-scriptName=${scriptName}`,
    `c0-methodName=${methodName}`,
    "c0-id=0",
  ];
  params.forEach((p, i) => lines.push(`c0-param${i}=string:${p}`));
  lines.push("batchId=0");
  lines.push("page=%2FPST%2Fit%2Fpst_2_6.wp");
  lines.push("httpSessionId=");
  lines.push(`scriptSessionId=${randScriptSessionId()}`);
  const body = lines.join("\n") + "\n";

  const url = DWR_BASE + scriptName + "." + methodName + ".dwr";
  const r = await undiciFetch(url, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
      "accept": "*/*",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0",
      "origin": "https://servizipst.giustizia.it",
      "referer": "https://servizipst.giustizia.it/PST/it/pst_2_6.wp",
    },
    body,
    dispatcher: insecureAgent,
    signal: AbortSignal.timeout(25000),
  });
  const text = await r.text();
  return { status: r.status, text };
}

// Parser resposta DWR: extrai array de {name,value} da forma
// dwr.engine.remote.handleCallback("N","0",[{name:"X",value:"Y"},...]);
function parseDwrNameValueList(text) {
  const out = [];
  const re = /name:\s*"((?:\\.|[^"\\])*)"\s*,\s*value:\s*"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const value = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    if (!name) continue;
    out.push({ id: name, nome: value });
  }
  return out;
}

async function fetchUfficiPubb(regioneCode) {
  const cacheKey = `uffici:${regioneCode}`;
  const cached = DWR_CACHE.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < DWR_TTL_MS) return { source: "cache", data: cached.data };
  try {
    const r = await dwrCall("RegistroListGetter", "getUfficiPubb", [regioneCode, "it"]);
    const list = parseDwrNameValueList(r.text);
    if (!list.length) throw new Error("DWR respondeu mas sem varas (região inválida?)");
    const enriched = list.map(o => ({
      id: o.id,
      nome: o.nome,
      tipo: classifyUfficio(o.nome),
      tipoDesc: TIPI_UFFICIO_GIUDIZIARIO[classifyUfficio(o.nome)],
      regioneCode: String(regioneCode),
      regione: REGIONI_IT[String(regioneCode)] || null,
      distretti: DISTRETTI_PER_REGIONE[regioneCode] || [],
    }));
    DWR_CACHE.set(cacheKey, { ts: Date.now(), data: enriched });
    return { source: "dwr", data: enriched };
  } catch (e) {
    // fallback: dati statici se già noti per la regione
    const staticRaw = UFFICI_RAW[Number(regioneCode)];
    if (staticRaw) {
      const data = staticRaw.map(raw => buildUfficioEntry(Number(regioneCode), raw));
      return { source: "static-fallback", data, dwrError: String(e) };
    }
    throw e;
  }
}

// Estrae parametri utili da una URL PST (detail.action) e restituisce input per /api/consulta
function parsePstUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  const qs = url.searchParams;
  const idufficio = qs.get("ufficioRicerca") || qs.get("idufficio");
  const numproc   = qs.get("numeroregistro") || qs.get("numproc");
  const aaproc    = qs.get("annoregistro")   || qs.get("aaproc");
  const registro  = qs.get("registroRicerca")|| qs.get("registro");
  const regione   = qs.get("regioneRicerca") || null;
  const idfasc    = qs.get("idfascicolo")    || null;
  return { idufficio, numproc, aaproc, registro, regione, idfascicolo: idfasc };
}

// -----------------------------------------------------------------------------
// Reverse proxy (bypass geoblock via Fly.io Frankfurt)
// -----------------------------------------------------------------------------

const PROXY_PREFIX = "/api/proxy?url=";

// Whitelist host: solo domini *.giustizia.it (e esatto "giustizia.it"), evita open relay
function isProxyHostAllowed(host) {
  const h = String(host || "").toLowerCase();
  return h === "giustizia.it" || h.endsWith(".giustizia.it");
}

// Headers do cliente que devolvemos pro upstream
const FORWARD_REQ_HEADERS = new Set([
  "accept", "accept-language", "accept-encoding", "cache-control", "pragma",
  "content-type", "origin", "referer", "user-agent", "cookie",
  "x-requested-with", "upgrade-insecure-requests",
]);

// Headers do upstream que NÃO devolvemos pro cliente
const STRIP_RES_HEADERS = new Set([
  "content-security-policy", "content-security-policy-report-only",
  "x-frame-options", "strict-transport-security", "x-content-type-options",
  "content-encoding", "content-length", "transfer-encoding", "connection",
  "alt-svc", "public-key-pins", "cross-origin-opener-policy",
  "cross-origin-embedder-policy", "cross-origin-resource-policy",
  "permissions-policy", "report-to", "nel",
]);

function absolutize(target, baseUrl) {
  try { return new URL(target, baseUrl).toString(); }
  catch { return null; }
}

function proxify(absUrl, proxyBase) {
  if (!absUrl) return absUrl;
  if (/^(data|javascript|mailto|blob|about|tel|#):/i.test(absUrl) || absUrl.startsWith("#")) return absUrl;
  // Non riscrivere URL a host esterni: manterrebbero il proxy bloccato come open relay
  try {
    const h = new URL(absUrl).host;
    if (!isProxyHostAllowed(h)) return absUrl;
  } catch { return absUrl; }
  return proxyBase + PROXY_PREFIX + encodeURIComponent(absUrl);
}

function xmlEscape(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function rewriteHtml(html, baseUrl, proxyBase) {
  // strip prolog XML + DOCTYPE XHTML -> força o browser a usar parser HTML leniente
  // (upstream serve `<?xml version="1.0"?>` + DOCTYPE XHTML Strict, o que faz o Firefox
  // aplicar parser XML estrito e explodir no primeiro `&` solto em texto/script)
  html = html.replace(/^\s*<\?xml\b[^?]*\?>\s*/i, "");
  html = html.replace(/<!DOCTYPE\s+html\s+PUBLIC\s+"-\/\/W3C\/\/DTD\s+XHTML[^>]*>/i, "<!DOCTYPE html>");
  // remove xmlns do <html> para reforçar modo HTML
  html = html.replace(/<html\b([^>]*)>/i, (m, attrs) => {
    const cleaned = attrs.replace(/\s*xmlns(?::[a-z]+)?\s*=\s*(["'])[^"']*\1/gi, "");
    return `<html${cleaned}>`;
  });
  // atributos comuns: href, src, action, formaction, data-src, poster
  const attrRe = /\b(href|src|action|formaction|poster|data-src|data-href|data-url)\s*=\s*(["'])([^"']*?)\2/gi;
  html = html.replace(attrRe, (m, attr, q, val) => {
    // HTML parsers decodificam entidades em valores de atributo antes de resolver URL
    const decoded = decodeEntities(val);
    const abs = absolutize(decoded, baseUrl);
    return abs ? `${attr}=${q}${proxify(abs, proxyBase)}${q}` : m;
  });
  // srcset (múltiplas URLs separadas por vírgula)
  html = html.replace(/\bsrcset\s*=\s*(["'])([^"']*?)\1/gi, (m, q, val) => {
    const rewritten = decodeEntities(val).split(",").map(part => {
      const bits = part.trim().split(/\s+/);
      if (!bits[0]) return part;
      const abs = absolutize(bits[0], baseUrl);
      bits[0] = abs ? proxify(abs, proxyBase) : bits[0];
      return bits.join(" ");
    }).join(", ");
    return `srcset=${q}${rewritten}${q}`;
  });
  // meta refresh
  html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']refresh["'][^>]*>/gi, (m) => {
    return m.replace(/url\s*=\s*([^"'\s>]+)/i, (mm, u) => {
      const abs = absolutize(decodeEntities(u), baseUrl);
      return `url=${abs ? proxify(abs, proxyBase) : u}`;
    });
  });
  // url(...) em style inline / <style>
  html = html.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (m, q, u) => {
    if (/^(data|#):/i.test(u)) return m;
    const abs = absolutize(u, baseUrl);
    return abs ? `url(${q}${proxify(abs, proxyBase)}${q})` : m;
  });
  // <base href="..."> - remove para não atrapalhar rewriting
  html = html.replace(/<base\b[^>]*>/gi, "");
  // bug upstream: onchange="changeRegistri'it',true);" está sem o parêntese de abertura
  // (HTML servido pelo próprio portal PST) — conserta antes de enviar ao browser.
  html = html.replace(/onchange\s*=\s*(["'])changeRegistri'it',true\);\1/gi, 'onchange="changeRegistri(\'it\',true);"');
  // shim injetado em <head>: intercepta XHR, fetch e form.submit() para rotear via proxy.
  // Usa CDATA (compativel tanto com HTML quanto XHTML strict) para permitir `&&`, `<`, `>` no JS.
  const shimJs = `(function(){
  var TARGET=${JSON.stringify(baseUrl)};
  var PROXY=${JSON.stringify(proxyBase + PROXY_PREFIX)};
  var PROXY_HOST=${JSON.stringify(new URL(proxyBase).host)};
  function isProxied(u){return typeof u==='string' && u.indexOf(PROXY)===0;}
  function wrap(u){
    if(u==null) return u;
    u=String(u);
    if(/^(data|javascript|blob|about|mailto|tel|#):/i.test(u) || u.charAt(0)==='#') return u;
    if(isProxied(u)) return u;
    try{
      var abs=new URL(u,TARGET).toString();
      var au=new URL(abs);
      if(au.host===PROXY_HOST) return u;
      return PROXY+encodeURIComponent(abs);
    }catch(e){return u;}
  }
  var _open=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){arguments[1]=wrap(u);return _open.apply(this,arguments);};
  if(window.fetch){var _fetch=window.fetch;window.fetch=function(input,init){
    if(typeof input==='string') input=wrap(input);
    else if(input && input.url) input=new Request(wrap(input.url),input);
    return _fetch.call(this,input,init);
  };}
  var _sendBeacon=navigator.sendBeacon;
  if(_sendBeacon) navigator.sendBeacon=function(u,d){return _sendBeacon.call(this,wrap(u),d);};
  if(window.WebSocket){var _WS=window.WebSocket;window.WebSocket=function(u,p){return new _WS(wrap(u),p);};window.WebSocket.prototype=_WS.prototype;}
  document.addEventListener('submit',function(e){
    var f=e.target;
    if(f && f.tagName==='FORM' && f.action){
      var a=f.getAttribute('action');
      if(a && !isProxied(a)) f.setAttribute('action',wrap(a));
    }
  },true);
  // -------- auto-fill + auto-submit para URLs com parâmetros pre-resolvidos --------
  // (caso da URL ...detail.action?regioneRicerca=20&ufficioRicerca=9999999999&registroRicerca=CC&...)
  try{
    var qs=new URL(TARGET).searchParams;
    var want={
      regioneRicerca: qs.get('regioneRicerca'),
      ufficioRicerca: qs.get('ufficioRicerca'),
      registroRicerca: qs.get('registroRicerca')
    };
    if(want.regioneRicerca && want.ufficioRicerca && want.registroRicerca){
      var hidden={
        idfascicolo:     qs.get('idfascicolo'),
        numeroregistro:  qs.get('numeroregistro'),
        annoregistro:    qs.get('annoregistro')
      };
      function hasOpt(sel,val){
        if(!sel) return false;
        for(var i=0;i<sel.options.length;i++) if(sel.options[i].value===val) return true;
        return false;
      }
      function wait(test,ms,timeout){
        return new Promise(function(resolve,reject){
          var start=Date.now();
          (function tick(){
            if(test()) return resolve();
            if(Date.now()-start>timeout) return reject(new Error('timeout'));
            setTimeout(tick,ms);
          })();
        });
      }
      function setVal(id,val){
        var el=document.getElementById(id);
        if(!el) return false;
        el.value=val;
        try{el.dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}
        return true;
      }
      function run(){
        var reg=document.getElementById('regioneRicerca');
        if(!reg) return; // não é a página de pesquisa
        // indicador visual
        var tip=document.createElement('div');
        tip.id='__gc_autofill_tip';
        tip.style.cssText='position:fixed;top:48px;left:12px;z-index:999998;background:#ffd700;color:#000;padding:6px 12px;border-radius:4px;font:12px system-ui;box-shadow:0 2px 6px rgba(0,0,0,.3)';
        tip.textContent='giustizia-consulta: aguardando scripts do portal…';
        document.body && document.body.appendChild(tip);
        function finish(msg,ok){
          if(!tip) return;
          tip.textContent='giustizia-consulta: '+msg;
          tip.style.background=ok?'#4caf50':'#f44336';
          tip.style.color='#fff';
          setTimeout(function(){tip && tip.parentNode && tip.parentNode.removeChild(tip);},4000);
        }
        // 1) aguarda DWR engine + changeUfficiPubb estarem prontos
        wait(function(){return typeof window.changeUfficiPubb==='function' && typeof window.dwr!=='undefined';},200,20000)
          .then(function(){
            tip.textContent='giustizia-consulta: selecionando região…';
            setVal('regioneRicerca',want.regioneRicerca);
            // garantia dupla: também chama diretamente
            try{window.changeUfficiPubb('it');}catch(e){}
            return wait(function(){var uf=document.getElementById('ufficioRicerca');return uf && hasOpt(uf,want.ufficioRicerca);},200,20000);
          })
          .then(function(){
            tip.textContent='giustizia-consulta: selecionando vara…';
            setVal('ufficioRicerca',want.ufficioRicerca);
            try{window.changeRegistri && window.changeRegistri('it',true);}catch(e){}
            return wait(function(){var rg=document.getElementById('registroRicerca');return rg && hasOpt(rg,want.registroRicerca);},200,20000);
          })
          .then(function(){
            tip.textContent='giustizia-consulta: selecionando registro…';
            setVal('registroRicerca',want.registroRicerca);
            var form=document.getElementById('regioneRicerca').form;
            if(!form){finish('formulário não encontrado',false);return;}
            Object.keys(hidden).forEach(function(k){
              if(!hidden[k]) return;
              var inp=form.querySelector('input[name="'+k+'"]');
              if(!inp){inp=document.createElement('input');inp.type='hidden';inp.name=k;form.appendChild(inp);}
              inp.value=hidden[k];
            });
            // 1a prioridade: clicar no botão submit ("Consulta"). Assim o evento
            // submit natural dispara, nosso listener reescreve action e o form
            // é enviado exatamente como se o usuário tivesse clicado.
            var submitBtn = form.querySelector('input[type="submit"][value*="Consulta" i], input[type="submit"]:not([name*="aggiorna" i]):not([name*="clear" i]), button[type="submit"]');
            tip.textContent='giustizia-consulta: enviando consulta via botão '+(submitBtn?('"'+(submitBtn.value||submitBtn.textContent||'submit')+'"'):'(não encontrado)')+'…';
            tip.style.background='#4caf50';tip.style.color='#fff';
            setTimeout(function(){tip && tip.parentNode && tip.parentNode.removeChild(tip);},4000);
            setTimeout(function(){
              if(submitBtn){try{submitBtn.click();return;}catch(_){}}
              try{HTMLFormElement.prototype.submit.call(form);}
              catch(e){finish('falha ao submeter: '+e.message,false);}
            },500);
          })
          .catch(function(e){finish('falha no auto-fill ('+e.message+')',false);});
      }
      // ----- STAGE 2: tela "modalità di ricerca" (após scegliRegistro) -----
      // se ao invés de selects regione/ufficio encontramos radios tipoRicerca +
      // campos numeroRicerca/annoRicerca, preenchemos direto e submetemos.
      function runStage2(){
        if(!hidden.numeroregistro || !hidden.annoregistro) return false;
        var radios=document.querySelectorAll('input[type="radio"][name="tipoRicerca"],input[type="radio"][name="radioSearch"]');
        var numInput=document.querySelector('input[name="numeroRicerca"],input[name="numeroRegistro"],input[name="numeroregistro"]');
        var annoInput=document.querySelector('input[name="annoRicerca"],input[name="annoRegistro"],input[name="annoregistro"]');
        if(!numInput && !annoInput) return false;
        var tip2=document.createElement('div');
        tip2.style.cssText='position:fixed;top:48px;left:12px;z-index:999998;background:#ffd700;color:#000;padding:6px 12px;border-radius:4px;font:12px system-ui';
        tip2.textContent='giustizia-consulta: preenchendo número do processo…';
        document.body && document.body.appendChild(tip2);
        // seleciona radio "Ruolo generale" (valor ROLE/RUOLO/numero)
        for(var i=0;i<radios.length;i++){
          var v=String(radios[i].value||'').toUpperCase();
          if(/RUOLO|ROLE|NUMERO|RG/.test(v)){radios[i].checked=true;try{radios[i].dispatchEvent(new Event('change',{bubbles:true}));radios[i].dispatchEvent(new Event('click',{bubbles:true}));}catch(_){}break;}
        }
        setTimeout(function(){
          if(numInput) numInput.value=String(hidden.numeroregistro).replace(/^0+/,'')||'0';
          if(annoInput) annoInput.value=hidden.annoregistro;
          var form=(numInput||annoInput).form;
          if(!form){tip2.textContent='giustizia-consulta: formulário da tela 2 não encontrado';tip2.style.background='#f44336';tip2.style.color='#fff';return;}
          tip2.textContent='giustizia-consulta: enviando busca final…';
          tip2.style.background='#4caf50';tip2.style.color='#fff';
          setTimeout(function(){tip2 && tip2.parentNode && tip2.parentNode.removeChild(tip2);},3000);
          setTimeout(function(){
            try{HTMLFormElement.prototype.submit.call(form);}
            catch(e){
              var btn=form.querySelector('input[type="submit"], button[type="submit"]');
              if(btn){try{btn.click();return;}catch(_){}}
            }
          },600);
        },400);
        return true;
      }
      // guard: evita loop infinito quando o form recarrega. Flag válida por 10min.
      function guardDone(stage){
        try{
          var key='__gc_af_'+stage;
          var v=sessionStorage.getItem(key);
          if(v && Date.now()-parseInt(v,10)<600000) return true;
        }catch(e){}
        return false;
      }
      function guardSet(stage){
        try{sessionStorage.setItem('__gc_af_'+stage,String(Date.now()));}catch(e){}
      }
      // heurística: estamos em página de resultado/detalhe?
      // indicadores: URL atual contém /dettaglio ou Show.action; OU há tabelas com
      // classes típicas de resultado; OU há um h1/h2 com "Dettaglio fascicolo" etc.
      function isResultPage(){
        var href=String(location.href||'');
        if(/dettaglio|Show\.action|showDett|fascicoloDett/i.test(href)) return true;
        // título típico da página de detalhe
        var heads=document.querySelectorAll('h1,h2,h3,h4,legend,caption');
        for(var i=0;i<heads.length;i++){
          var t=(heads[i].textContent||'').trim().toLowerCase();
          if(/^dettaglio$/.test(t)) return true;
          if(/dettaglio\s+(del\s+)?(fascicolo|procedimento)|storico\s+del\s+fascicolo|numero\s+ruolo\s+generale/.test(t)) return true;
        }
        // texto "Numero ruolo generale:" como label aparece só no detalhe
        var body=(document.body && document.body.textContent)||'';
        if(/Numero\s+ruolo\s+generale\s*:\s*\d{4}\/\d+/i.test(body)) return true;
        return false;
      }
      function start(){
        if(isResultPage()) return; // já estamos no detalhe, nada a fazer
        // STAGE 1: selects regione/ufficio/registro com forma ainda não preenchida
        var reg=document.getElementById('regioneRicerca');
        if(reg){
          // se regione já está selecionada com valor desejado E os outros também,
          // provavelmente form está apenas mostrando valores atuais — skip
          var uf=document.getElementById('ufficioRicerca');
          var rg=document.getElementById('registroRicerca');
          var allMatch = reg.value===want.regioneRicerca &&
                         uf && uf.value===want.ufficioRicerca &&
                         rg && rg.value===want.registroRicerca;
          if(allMatch) return; // tudo igual -> não mexer
          if(guardDone('s1')) return;
          guardSet('s1');
          return run();
        }
        // STAGE 2: tela modalità di ricerca
        if(guardDone('s2')) return;
        if(runStage2()) guardSet('s2');
      }
      if(document.readyState==='complete') start();
      else window.addEventListener('load',start);
    }
  }catch(e){ /* silent */ }
})();`;
  const shim = `<script type="text/javascript">/*<![CDATA[*/\n${shimJs}\n/*]]>*/</script>`;
  // injeta barra de navegação refinada (XHTML-safe: entidades numéricas + &amp; escapado)
  const urlSafe = xmlEscape(baseUrl);
  const bannerCss =
    "position:fixed;top:0;left:0;right:0;z-index:2147483647;"
    + "height:44px;box-sizing:border-box;"
    + "background:linear-gradient(90deg,#0b2548 0%,#143a6b 50%,#0b2548 100%);"
    + "color:#fff;font:13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Ubuntu,sans-serif;"
    + "padding:0 16px;border-bottom:1px solid rgba(255,215,0,.35);"
    + "box-shadow:0 2px 12px rgba(0,0,0,.25);"
    + "display:flex;gap:14px;align-items:center;flex-wrap:nowrap;"
    + "backdrop-filter:saturate(120%);";
  const logoCss =
    "display:inline-flex;align-items:center;gap:8px;font-weight:700;"
    + "font-size:14px;letter-spacing:.2px;color:#fff;text-decoration:none;flex-shrink:0;";
  const dotCss =
    "width:8px;height:8px;border-radius:50%;background:#4ade80;"
    + "box-shadow:0 0 8px rgba(74,222,128,.8);flex-shrink:0;";
  const pillCss =
    "display:inline-flex;align-items:center;gap:6px;padding:4px 10px;"
    + "background:rgba(255,215,0,.12);border:1px solid rgba(255,215,0,.35);"
    + "border-radius:999px;font-size:11px;color:#ffd700;white-space:nowrap;flex-shrink:0;";
  const urlPillCss =
    "flex:1;min-width:0;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;"
    + "background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);"
    + "border-radius:6px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;"
    + "font-size:11px;color:rgba(255,255,255,.85);"
    + "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
  const linkCss =
    "color:#ffd700;text-decoration:none;font-weight:500;"
    + "padding:4px 10px;border-radius:6px;transition:background .15s;font-size:12px;flex-shrink:0;";
  const sepCss = "width:1px;height:18px;background:rgba(255,255,255,.15);flex-shrink:0;";
  const banner =
    `<div role="banner" aria-label="giustizia-consulta proxy" style="${bannerCss}">`
    + `<a href="${xmlEscape(proxyBase)}/" target="_blank" rel="noopener" style="${logoCss}" title="Documenta&#231;&#227;o da API">`
    +   `<span style="${dotCss}" aria-hidden="true"></span>`
    +   `<span>giustizia-consulta</span>`
    + `</a>`
    + `<span style="${urlPillCss}" title="${urlSafe}">${urlSafe}</span>`
    + `</div>`
    + `<div style="height:44px" aria-hidden="true"></div>`;
  html = html.replace(/<body\b([^>]*)>/i, (m, attrs) => `<body${attrs}>${banner}`);
  // injeta shim o mais cedo possivel (antes de qualquer script)
  if (/<head\b[^>]*>/i.test(html)) {
    html = html.replace(/<head\b([^>]*)>/i, (m, attrs) => `<head${attrs}>${shim}`);
  } else {
    html = shim + html;
  }
  return html;
}

function rewriteCss(css, baseUrl, proxyBase) {
  return css.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi, (m, q, u) => {
    if (/^(data|#):/i.test(u)) return m;
    const abs = absolutize(u, baseUrl);
    return abs ? `url(${q}${proxify(abs, proxyBase)}${q})` : m;
  });
}

function rewriteSetCookie(setCookie, proxyHost) {
  // neutraliza Domain e força SameSite=None/Secure para funcionar via proxy HTTPS
  return setCookie
    .replace(/;\s*Domain=[^;]+/gi, "")
    .replace(/;\s*SameSite=[^;]+/gi, "")
    .replace(/;\s*Secure/gi, "")
    + "; Path=/; SameSite=None; Secure";
}

async function handleProxy(req, res, u) {
  // Extrai o valor de ?url= direto da raw request URL.
  // - URL encoded (`https%3A%2F%2F...`): pega até o próximo `&` (separador de outros
  //   params, ex.: cache-buster `&_=123456` que o DWR adiciona)
  // - URL raw (`https://host/path?a=1&b=2`): pega tudo até o fim, porque os `&`
  //   são da query INTERNA da URL alvo.
  let target = null;
  const raw = req.url || "";
  const rawNoHash = raw.split("#")[0];
  let start = rawNoHash.indexOf("?url=");
  if (start >= 0) start += 5;
  else {
    const amp = rawNoHash.indexOf("&url=");
    start = amp >= 0 ? amp + 5 : -1;
  }
  if (start >= 0) {
    const rest = rawNoHash.slice(start);
    if (/^https?%3A/i.test(rest)) {
      const ampIdx = rest.indexOf("&");
      const enc = ampIdx >= 0 ? rest.slice(0, ampIdx) : rest;
      try { target = decodeURIComponent(enc); } catch { target = enc; }
    } else if (/^https?:\/\//i.test(rest)) {
      target = rest; // raw com `&` internos
    } else {
      // valor encoded mas sem protocolo prefixado (casos raros) -> fallback ao searchParams
      target = u.searchParams.get("url");
    }
  } else {
    target = u.searchParams.get("url");
  }
  if (!target) return sendJSON(res, 400, { error: "parâmetro ?url= é obrigatório" });
  let targetUrl;
  try { targetUrl = new URL(target); }
  catch { return sendJSON(res, 400, { error: "URL inválida", valorInformado: target }); }
  if (!/^https?:$/.test(targetUrl.protocol))
    return sendJSON(res, 400, { error: "apenas http/https são permitidos" });
  if (!isProxyHostAllowed(targetUrl.host))
    return sendJSON(res, 403, { error: "host não permitido", host: targetUrl.host, permitidos: "*.giustizia.it", nota: "Proxy restrito ao domínio giustizia.it para evitar uso como open relay." });

  const proxyHost = req.headers.host || "localhost";
  const proxyScheme = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const proxyBase = `${proxyScheme}://${proxyHost}`;

  // headers para upstream
  const upstreamHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (FORWARD_REQ_HEADERS.has(k.toLowerCase())) upstreamHeaders[k] = v;
  }
  upstreamHeaders["host"] = targetUrl.host;
  upstreamHeaders["referer"] = targetUrl.origin + "/";
  upstreamHeaders["origin"]  = targetUrl.origin;
  if (!upstreamHeaders["user-agent"])
    upstreamHeaders["user-agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  let body;
  if (!["GET", "HEAD"].includes(req.method)) {
    body = await new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      req.on("data", c => { size += c.length; if (size > 10 * 1024 * 1024) { req.destroy(); reject(new Error("body excede 10 MB")); } else chunks.push(c); });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  let upstream;
  try {
    upstream = await undiciFetch(targetUrl.toString(), {
      method: req.method,
      headers: upstreamHeaders,
      body,
      redirect: "manual",
      dispatcher: insecureAgent,
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    return sendJSON(res, 502, { error: "falha ao conectar ao servidor upstream", detalhe: String(e), target: targetUrl.toString() });
  }

  // redirecionamento: reescreve Location para passar pelo proxy (solo se giustizia.it)
  if ([301, 302, 303, 307, 308].includes(upstream.status)) {
    const loc = upstream.headers.get("location");
    if (loc) {
      const abs = absolutize(loc, targetUrl.toString());
      let newLoc = loc;
      if (abs) {
        try {
          const h = new URL(abs).host;
          newLoc = isProxyHostAllowed(h) ? proxify(abs, proxyBase) : abs; // se esterno, direct redirect
        } catch { /* keep raw */ }
      }
      const outHeaders = { location: newLoc, ...CORS_HEADERS };
      // forward set-cookie
      for (const [k, v] of upstream.headers.entries()) {
        if (k.toLowerCase() === "set-cookie") outHeaders["set-cookie"] = rewriteSetCookie(v, proxyHost);
      }
      res.writeHead(upstream.status, outHeaders);
      return res.end();
    }
  }

  const ct = (upstream.headers.get("content-type") || "").toLowerCase();
  const outHeaders = {};
  for (const [k, v] of upstream.headers.entries()) {
    if (STRIP_RES_HEADERS.has(k.toLowerCase())) continue;
    if (k.toLowerCase() === "set-cookie") { outHeaders["set-cookie"] = rewriteSetCookie(v, proxyHost); continue; }
    if (k.toLowerCase() === "location") continue;
    outHeaders[k] = v;
  }
  Object.assign(outHeaders, CORS_HEADERS);

  // rewriting só em HTML / CSS; resto passa binário intacto
  if (ct.includes("text/html") || ct.includes("application/xhtml")) {
    const text = await upstream.text();
    const rewritten = rewriteHtml(text, targetUrl.toString(), proxyBase);
    const buf = Buffer.from(rewritten, "utf8");
    outHeaders["content-length"] = String(buf.length);
    // força text/html (ignora application/xhtml+xml do upstream) para browser usar
    // parser HTML leniente em vez de XML estrito — evita "EntityRef: expecting ';'"
    // em `&` soltos no conteúdo upstream.
    outHeaders["content-type"] = "text/html; charset=utf-8";
    res.writeHead(upstream.status, outHeaders);
    return res.end(buf);
  }
  if (ct.includes("text/css")) {
    const text = await upstream.text();
    const rewritten = rewriteCss(text, targetUrl.toString(), proxyBase);
    const buf = Buffer.from(rewritten, "utf8");
    outHeaders["content-length"] = String(buf.length);
    res.writeHead(upstream.status, outHeaders);
    return res.end(buf);
  }

  // binário / JS / JSON / imagens — passa direto
  const ab = await upstream.arrayBuffer();
  const buf = Buffer.from(ab);
  outHeaders["content-length"] = String(buf.length);
  res.writeHead(upstream.status, outHeaders);
  res.end(buf);
}

// -----------------------------------------------------------------------------
// HTTP server
// -----------------------------------------------------------------------------

function readBody(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", c => { size += c.length; if (size > max) { req.destroy(); reject(new Error("body excede tamanho máximo")); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function sendJSON(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...CORS_HEADERS,
    ...extraHeaders,
  });
  res.end(body);
}

function validateInputs(p) {
  const errors = [];
  if (!p.idufficio) errors.push("idufficio é obrigatório");
  else if (!/^\d{1,10}$/.test(p.idufficio)) errors.push("idufficio: apenas dígitos, até 10 caracteres");
  if (!p.registro) errors.push("registro é obrigatório");
  else if (!REGISTRI[String(p.registro).toUpperCase()]) errors.push(`registro inválido (use um destes: ${Object.keys(REGISTRI).join("|")})`);
  if (!p.numproc) errors.push("numproc é obrigatório");
  else if (!/^\d+$/.test(String(p.numproc).replace(/^0+/, "") || "0")) errors.push("numproc: apenas dígitos");
  if (!p.aaproc) errors.push("aaproc é obrigatório");
  else if (!/^\d{2,4}$/.test(p.aaproc)) errors.push("aaproc: deve ter 2 a 4 dígitos");
  if (p.tipoufficio && !TIPI_UFFICIO[Number(p.tipoufficio)]) errors.push(`tipoufficio inválido (use um destes: ${Object.keys(TIPI_UFFICIO).join("|")})`);
  if (p.tiporicerca && !["S", "D"].includes(String(p.tiporicerca).toUpperCase())) errors.push("tiporicerca deve ser S (sentença) ou D (decreto monitório)");
  return errors;
}

async function runConsulta(inputRaw) {
  const errors = validateInputs(inputRaw);
  if (errors.length) return { statusCode: 400, payload: { ok: false, error: "parâmetros inválidos", code: "BAD_INPUT", details: errors } };

  const input = normalizeInput(inputRaw);
  const requestedAt = new Date().toISOString();

  let lastErr = null;
  for (const idx of [0, 1]) {
    try {
      const r = await consulta({ ...input, serverIdx: idx });
      const parsed = parseResult(r.body);
      const respondedAt = new Date().toISOString();

      if (!parsed.ok && parsed.code === "NOT_FOUND") {
        return {
          statusCode: 404,
          payload: {
            ok: false, error: parsed.error, code: "NOT_FOUND",
            input, meta: { server: SERVERS[idx], status: r.status, latencyMs: r.ms, requestedAt, respondedAt, upstream: parsed.meta },
          },
        };
      }

      return {
        statusCode: 200,
        payload: {
          ok: parsed.ok,
          ...parsed,
          input,
          meta: {
            ...(parsed.meta || {}),
            server: SERVERS[idx],
            status: r.status,
            latencyMs: r.ms,
            requestedAt,
            respondedAt,
            upstreamUrl: r.url,
            bytes: r.body.length,
          },
        },
      };
    } catch (e) { lastErr = e; }
  }
  return { statusCode: 502, payload: { ok: false, error: "ambos os servidores upstream (mob e mob1) falharam", code: "UPSTREAM_DOWN", detalhe: String(lastErr), input } };
}

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://x");

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS); return res.end();
    }

    if (req.method === "GET" && u.pathname === "/healthz") {
      const deep = u.searchParams.get("deep") === "1" || u.searchParams.get("full") === "1";
      const t0 = Date.now();

      // Checks simples sempre executados
      const mem = process.memoryUsage();
      const fmt = b => Math.round(b / 1024 / 1024 * 100) / 100;

      // Se deep=1, roda probes reais contra upstream
      let checks = null;
      let overallOk = true;
      if (deep) {
        const probe = async (label, url, opts = {}) => {
          const t = Date.now();
          try {
            const r = await undiciFetch(url, {
              method: opts.method || "HEAD",
              headers: { "user-agent": "giustizia-consulta/health-check" },
              dispatcher: insecureAgent,
              signal: AbortSignal.timeout(opts.timeout || 5000),
            });
            return { label, url, ok: r.status < 500, status: r.status, latencyMs: Date.now() - t };
          } catch (e) {
            return { label, url, ok: false, error: String(e.message || e), latencyMs: Date.now() - t };
          }
        };
        const probes = await Promise.all([
          probe("mob", SERVERS[0]),
          probe("mob1", SERVERS[1]),
          probe("portal_pst", "https://servizipst.giustizia.it/PST/it/pst_2_6.wp", { method: "GET", timeout: 8000 }),
        ]);
        checks = probes;
        overallOk = probes.every(p => p.ok);
      }

      const payload = {
        ok: overallOk,
        status: overallOk ? "healthy" : "degraded",
        service: "giustizia-consulta",
        version: VERSION_API,
        timestamp: new Date().toISOString(),
        uptime: {
          segundos: Math.round(process.uptime()),
          formatado: (() => {
            const s = Math.round(process.uptime());
            const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
            return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s % 60}s`].filter(Boolean).join(" ");
          })(),
        },
        runtime: {
          node: process.version,
          pid: process.pid,
          platform: process.platform,
          arch: process.arch,
          memoryMB: {
            heapUsed: fmt(mem.heapUsed),
            heapTotal: fmt(mem.heapTotal),
            rss: fmt(mem.rss),
            external: fmt(mem.external),
          },
        },
        deployment: {
          region: process.env.FLY_REGION || null,
          app: process.env.FLY_APP_NAME || null,
          machineId: process.env.FLY_MACHINE_ID || null,
          imageRef: process.env.FLY_IMAGE_REF || null,
          allocId: process.env.FLY_ALLOC_ID || null,
          publicIp: process.env.FLY_PUBLIC_IP || null,
        },
        cache: {
          dwrEntries: DWR_CACHE.size,
          dwrTtlHours: DWR_TTL_MS / 3600_000,
          regioniCached: Array.from(DWR_CACHE.keys()),
        },
        upstream: {
          mobileServers: SERVERS,
          portalWeb: "https://servizipst.giustizia.it/PST/it/pst_2_6.wp",
          probeDisponivel: "GET /healthz?deep=1",
          checks,
        },
        latenciaHealthzMs: Date.now() - t0,
      };
      return sendJSON(res, overallOk ? 200 : 503, payload);
    }

    if (req.method === "GET" && u.pathname === "/") {
      return sendJSON(res, 200, {
        service:     "giustizia-consulta",
        version:     VERSION_API,
        descricao:   "API não-oficial para consultar o registro cível do Ministério da Justiça italiano (SICID/SIECIC/SIGMA). Engenharia reversa do app Android oficial it.giustizia.civile v2.0.18. Faz bypass do bloqueio geográfico italiano via Fly.io Frankfurt (Alemanha).",
        autor: { nome: "Nícolas Pastorello", github: "https://github.com/opastorello" },
        repositorio: REPO_URL,
        licenca:     "MIT",
        idioma:      "pt-BR (rótulos) · it (termos jurídicos originais preservados)",
        baseUrl:     `${(req.headers["x-forwarded-proto"] || "https").split(",")[0]}://${req.headers.host}`,
        endpoints: [
          { metodo: "GET",        path: "/api/consulta",  descricao: "Consulta processo. Query: idufficio, registro, numproc, aaproc, [tipoufficio=1], [tiporicerca=S|D]", exemplo: "/api/consulta?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024" },
          { metodo: "POST",       path: "/api/consulta",  descricao: "Mesma coisa do GET, mas com body JSON",   exemplo: "{ \"idufficio\": \"9999999999\", \"registro\": \"CC\", \"numproc\": \"12345\", \"aaproc\": \"2024\" }" },
          { metodo: "GET",        path: "/api/by-url",    descricao: "Aceita URL do portal PST e extrai parâmetros automaticamente p/ /api/consulta", exemplo: "/api/by-url?url=" + encodeURIComponent("https://servizipst.giustizia.it/PST/it/pst_2_6_1.wp?actionPath=/ExtStr2/do/consultazionepubblica/sicid/contenzioso/detail.action&currentFrame=10&idfascicolo=9999999&numeroregistro=00012345&annoregistro=2024&regioneRicerca=20&ufficioRicerca=9999999999&registroRicerca=CC") },
          { metodo: "GET",        path: "/api/ics",       descricao: "Arquivo .ics da próxima audiência (mesmos parâmetros de /api/consulta)" },
          { metodo: "GET",        path: "/api/uffici",    descricao: "Lista varas/tribunais por região. Query: regione=<1..20>, opcional tipo=<...>", exemplo: "/api/uffici?regione=20" },
          { metodo: "GET",        path: "/api/form",      descricao: "Schema dos campos de entrada para /api/consulta (pronto pra gerar formulário dinâmico)" },
          { metodo: "GET|POST|*", path: "/api/proxy",     descricao: "Proxy reverso transparente — restrito a *.giustizia.it (evita open relay). Query: url=<URL upstream>", exemplos: [
            { uso: "Página inicial do portal (busca interativa)",      url: "/api/proxy?url=" + encodeURIComponent("https://servizipst.giustizia.it/PST/it/pst_2_6.wp") },
            { uso: "Detalhe direto de fascicolo (cai no form de busca sem sessão, mas útil pra testar)", url: "/api/proxy?url=" + encodeURIComponent("https://servizipst.giustizia.it/PST/it/pst_2_6_1.wp?actionPath=/ExtStr2/do/consultazionepubblica/sicid/contenzioso/detail.action&currentFrame=10&idfascicolo=9999999&numeroregistro=00012345&annoregistro=2024&regioneRicerca=20&ufficioRicerca=9999999999&registroRicerca=CC") },
          ] },
          { metodo: "GET",        path: "/regioni",       descricao: "Lista das 20 regiões italianas com codificação alfabética PST (1=Abruzzo ... 20=Veneto)" },
          { metodo: "GET",        path: "/registri",      descricao: "Códigos de registro processual (CC, L, VG, PC, ESM, ESIM, GDP)" },
          { metodo: "GET",        path: "/tipi-ufficio",  descricao: "Tipos de vara/tribunal (1-5)" },
          { metodo: "GET",        path: "/distretti",     descricao: "Distritos das Cortes de Apelação + mapeamento região→distrito" },
          { metodo: "GET",        path: "/docs/fields",   descricao: "Dicionário completo dos campos retornados por /api/consulta" },
          { metodo: "GET",        path: "/docs/enums",    descricao: "Todos os enums (registri, tipi ufficio, tipi evento, qualifiche parte, códigos de erro)" },
          { metodo: "GET",        path: "/docs/examples", descricao: "Exemplos request/response para cada endpoint" },
          { metodo: "GET",        path: "/openapi.json",  descricao: "Especificação OpenAPI 3.0 (importável em Postman/Swagger)" },
          { metodo: "GET",        path: "/raw",           descricao: "HTML/XML bruto do servidor upstream (debug)" },
          { metodo: "GET",        path: "/healthz",       descricao: "Status e uptime do serviço (use ?deep=1 para probes ao vivo dos servidores upstream)" },
        ],
        enums: {
          registri:               REGISTRI,
          tipiUfficio:            TIPI_UFFICIO,
          regioni:                REGIONI_IT,
          distrettiCorteAppello:  DISTRETTI_CORTE_APPELLO,
          tipiEvento:             TIPI_EVENTO,
          qualificheParte:        QUALIFICHE_PARTE,
          tipiUfficioGiudiziario: TIPI_UFFICIO_GIUDIZIARIO,
          errorCodes:             ERROR_CODES,
        },
        upstream: {
          mobileApi:  SERVERS,
          portalWeb:  "https://servizipst.giustizia.it/PST/it/pst_2_6.wp",
          schemeAssinatura: {
            token: "md5(KEY + VERSION + SUBVERSION + PLATFORM + ' ' + androidVer + uuid + deviceName)",
            t2:    "md5(idufficio + KEY2 + aaproc + numproc + KEY2)",
            nota:  "KEY e KEY2 extraídas do bytecode Android (ofuscadas com _$_137e[]). Certificado TLS do servidor expirado — o próprio app usa setServerTrustMode('nocheck'), esta API usa undici.Agent({rejectUnauthorized:false}).",
          },
          azioni: {
            "direttarg_sicid_mobile":  "SICID — Contencioso, Trabalho, Jurisdição Voluntária (tribunal ordinário/apelação)",
            "direttarg_siecic_mobile": "SIECIC — Concursais/Falimentares, Execuções",
            "direttarg_sigma_mobile":  "SIGMA — Juiz de Paz",
            "direttarg_mobile":        "Fallback genérico",
            "direttasent_mobile":      "Sentença (tiporicerca=S)",
            "direttadi_mobile":        "Decreto Monitório/Injuntivo (tiporicerca=D)",
          },
        },
        notas: [
          "Nenhum dado é persistido — cada requisição é proxied em tempo real ao Ministério da Justiça italiano.",
          "Cache /api/consulta: 15 min (via s-maxage, honrado por Cloudflare/browser).",
          "Cache /api/uffici: 6 h in-memory.",
          "API não requer autenticação; todos os dados consultáveis são públicos (art. 115 c.p.c. / d.m. 44/2011).",
          "Para o fluxo interativo do portal oficial (Região → Vara → Registro → Processo), use /api/proxy?url=<URL>.",
          "Proxy restrito a *.giustizia.it para não funcionar como open relay.",
        ],
      });
    }

    if (req.method === "GET" && u.pathname === "/registri") {
      return sendJSON(res, 200, { registri: REGISTRI, details: REGISTRI_META });
    }

    if (req.method === "GET" && u.pathname === "/tipi-ufficio") {
      return sendJSON(res, 200, { tipiUfficio: TIPI_UFFICIO, details: TIPI_UFFICIO_META });
    }

    if (req.method === "GET" && u.pathname === "/regioni") {
      const out = Object.entries(REGIONI_IT).map(([code, nome]) => ({
        codigo: Number(code),
        nome,
        distritosCorteApelacao: DISTRETTI_PER_REGIONE[Number(code)] || [],
        ufficiConhecidos:       (UFFICI_RAW[Number(code)] || []).length,
      }));
      return sendJSON(res, 200, {
        descricao: "Regiões italianas com numeração alfabética usada pelo portal PST (não ISTAT)",
        total: out.length,
        regioni: out,
      });
    }

    if (req.method === "GET" && u.pathname === "/distretti") {
      return sendJSON(res, 200, {
        descricao: "Distritos das Cortes de Apelação italianas (26 + 1 seção destacada de Bolzano)",
        distretti: DISTRETTI_CORTE_APPELLO,
        mapeamentoRegiaoDistrito: DISTRETTI_PER_REGIONE,
      });
    }

    if (req.method === "GET" && u.pathname === "/api/uffici") {
      const regione = u.searchParams.get("regione");
      if (!regione) return sendJSON(res, 400, { error: "parâmetro ?regione=<1..20> é obrigatório", regioesDisponiveis: REGIONI_IT });
      if (!REGIONI_IT[regione]) return sendJSON(res, 400, { error: "região inválida", valorInformado: regione, regioesDisponiveis: REGIONI_IT });
      try {
        const { source, data, dwrError } = await fetchUfficiPubb(regione);
        const filtroTipo = u.searchParams.get("tipo");
        const filtered = filtroTipo ? data.filter(d => d.tipo === filtroTipo.toUpperCase()) : data;
        return sendJSON(res, 200, {
          regione: { codigo: Number(regione), nome: REGIONI_IT[regione], distritosCorteApelacao: DISTRETTI_PER_REGIONE[Number(regione)] || [] },
          total: filtered.length,
          fonte: source,
          dwrError,
          filtroTipoAplicado: filtroTipo || null,
          uffici: filtered,
        }, { "cache-control": "public, s-maxage=21600" });
      } catch (e) {
        return sendJSON(res, 502, { error: "impossível recuperar lista de uffici", detalhe: String(e), regione });
      }
    }

    if (req.method === "GET" && u.pathname === "/api/by-url") {
      const src = u.searchParams.get("url");
      if (!src) return sendJSON(res, 400, { error: "parâmetro ?url= é obrigatório (URL do portal PST)" });
      const extracted = parsePstUrl(src);
      if (!extracted) return sendJSON(res, 400, { error: "URL não pôde ser parseada", valorInformado: src });
      if (!extracted.idufficio || !extracted.numproc || !extracted.aaproc || !extracted.registro) {
        return sendJSON(res, 400, { error: "parâmetros obrigatórios ausentes na URL", extraidos: extracted, camposNecessarios: ["ufficioRicerca", "numeroregistro", "annoregistro", "registroRicerca"] });
      }
      const { statusCode, payload } = await runConsulta({
        idufficio: extracted.idufficio,
        registro: extracted.registro,
        numproc: extracted.numproc,
        aaproc: extracted.aaproc,
      });
      return sendJSON(res, statusCode, { extraidos: extracted, resultado: payload },
        statusCode === 200 ? { "cache-control": "public, s-maxage=900" } : {});
    }

    if (req.method === "GET" && u.pathname === "/docs/enums") {
      return sendJSON(res, 200, {
        registri: { codes: REGISTRI, details: REGISTRI_META },
        tipiUfficio: { codes: TIPI_UFFICIO, details: TIPI_UFFICIO_META },
        regioni: REGIONI_IT,
        distretti: DISTRETTI_CORTE_APPELLO,
        mappingRegioneDistretto: DISTRETTI_PER_REGIONE,
        tipiEvento: TIPI_EVENTO,
        qualificheParte: QUALIFICHE_PARTE,
        tipiUfficioGiudiziario: TIPI_UFFICIO_GIUDIZIARIO,
        errorCodes: ERROR_CODES,
      });
    }

    if (req.method === "GET" && u.pathname === "/docs/fields") {
      return sendJSON(res, 200, {
        descricao: "Estrutura completa do payload retornado por GET /api/consulta",
        glossario: {
          "fascicolo": "Processo (termo italiano) — conjunto de atos relativos a uma causa",
          "ruolo generale (RG)": "Número de registro geral — equivalente ao número do processo no Brasil",
          "udienza": "Audiência",
          "parti": "Partes do processo",
          "storico": "Histórico de andamentos",
          "ufficio": "Vara/Tribunal",
          "giudice": "Juiz",
        },
        response: {
          "ok":                                          "boolean — flag de sucesso",
          "fascicolo.ruoloGenerale.numero":              "string — número do RG ex. '12345'",
          "fascicolo.ruoloGenerale.numeroInt":           "integer — número sem zeros à esquerda",
          "fascicolo.ruoloGenerale.anno":                "string — ano de distribuição ex. '2024'",
          "fascicolo.ruoloGenerale.identifier":          "string — 'NNNN/AAAA' ex. '12345/2024'",
          "fascicolo.ruoloGenerale.registro":            "enum — código (CC|L|VG|PC|ESM|ESIM|GDP)",
          "fascicolo.ruoloGenerale.registroDesc":        "string — descrição do registro",
          "fascicolo.ruoloGenerale.iscrittoIl":          "string — data de distribuição dd/mm/yyyy",
          "fascicolo.ruoloGenerale.iscrittoIlISO":       "string — data ISO yyyy-mm-dd",
          "fascicolo.ruoloGenerale.daysSinceIscrizione": "integer — dias desde a distribuição até hoje",
          "fascicolo.ufficio.id":                        "string — 10 dígitos, idufficio do Ministério",
          "fascicolo.ufficio.descrizione":               "string — ex. 'TRIBUNALE ORDINARIO (EXEMPLO)'",
          "fascicolo.giudice.nome":                      "string — nome completo do juiz designado",
          "fascicolo.stato.descrizione":                 "string — ex. 'IN CORSO' (em andamento), 'DEFINITO' (julgado)",
          "fascicolo.stato.codice":                      "string — uppercase snake_case da descrição",
          "fascicolo.oggetto.rito":                      "string — rito processual",
          "fascicolo.oggetto.materia":                   "string — matéria específica da causa",
          "fascicolo.oggetto.raw":                       "array<string> — linhas originais do portal",
          "fascicolo.udienza.raw":                       "string — formato original 'yyyy-MM-dd HH:mm'",
          "fascicolo.udienza.iso":                       "string — ISO 8601 com offset +02:00 (Europe/Rome)",
          "fascicolo.udienza.timezone":                  "string — sempre 'Europe/Rome'",
          "fascicolo.udienza.isFuture":                  "boolean — audiência futura vs passada",
          "fascicolo.udienza.daysUntil":                 "integer — dias até a audiência",
          "fascicolo.udienza.calendar":                  "object — {titolo, luogo, note, start, end} extraídos de creaEventoCalendarioAndroid",
          "fascicolo.parti.totale":                      "integer — total de partes",
          "fascicolo.parti.attori":                      "array — autores (qualificaTipo === ATTORE)",
          "fascicolo.parti.convenuti":                   "array — réus (qualificaTipo === CONVENUTO)",
          "fascicolo.parti.altri":                       "array — partes com outra qualificação",
          "fascicolo.parti.raw[].nome":                  "string — nome/denominação da parte",
          "fascicolo.parti.raw[].qualifica":             "string — qualificação original (ex. 'Attore')",
          "fascicolo.parti.raw[].qualificaTipo":         "enum — ATTORE|CONVENUTO|TERZO|RICORRENTE|RESISTENTE|ALTRO",
          "fascicolo.parti.raw[].avvocato":              "string|null — advogado (se informado)",
          "fascicolo.storico.totale":                    "integer — total de eventos no histórico",
          "fascicolo.storico.ultimoEvento":              "object — último evento cronológico",
          "fascicolo.storico.primoEvento":               "object — primeiro evento",
          "fascicolo.storico.eventi[].data":             "string — dd/mm/yyyy",
          "fascicolo.storico.eventi[].dataISO":          "string — yyyy-mm-dd",
          "fascicolo.storico.eventi[].evento":           "string — descrição textual do andamento",
          "fascicolo.storico.eventi[].tipoEvento":       "enum — ver /docs/enums#tipiEvento",
          "fascicolo.aggiornamento.ultimoStorico":       "string — texto 'Ultimo aggiornamento'",
          "fascicolo.aggiornamento.DataReg":             "string — data raw italiana",
          "fascicolo.aggiornamento.DataRegDB":           "string — timestamp do DB do servidor",
          "fascicolo.aggiornamento.DataRegISO":          "string — ISO 8601",
          "input":                                       "object — parâmetros normalizados (echo)",
          "meta.server":                                 "string — servidor PST utilizado (mob ou mob1)",
          "meta.status":                                 "integer — HTTP status do upstream",
          "meta.latencyMs":                              "integer — latência do upstream",
          "meta.requestedAt":                            "string — timestamp ISO da requisição",
          "meta.respondedAt":                            "string — timestamp ISO da resposta",
          "meta.upstreamUrl":                            "string — URL completa assinada enviada ao upstream",
          "meta.bytes":                                  "integer — bytes do payload upstream",
          "meta.G_PLATFORM":                             "string — metadado retornado pelo servidor",
          "meta.G_VERSION":                              "string",
          "meta.SERVER_NAME":                            "string",
        },
        errorResponse: {
          "ok":      "false",
          "error":   "string — mensagem legível em PT-BR",
          "code":    "enum — ver /docs/enums#errorCodes",
          "details": "array<string> — (apenas para BAD_INPUT) lista detalhada dos campos inválidos",
          "meta":    "object — sempre presente com informações diagnósticas",
        },
      });
    }

    if (req.method === "GET" && u.pathname === "/docs/examples") {
      const baseUrl = `${(req.headers["x-forwarded-proto"] || "https").split(",")[0]}://${req.headers.host}`;
      return sendJSON(res, 200, {
        "GET /api/consulta": {
          descricao: "Consulta direta do processo (API mobile assinada)",
          request: `${baseUrl}/api/consulta?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024`,
          curl: `curl '${baseUrl}/api/consulta?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024'`,
          responseShape: {
            ok: true,
            fascicolo: {
              ruoloGenerale: { numero: "12345", anno: "2024", identifier: "12345/2024", registro: "CC", registroDesc: "Contencioso Civil" },
              ufficio: { id: "9999999999", descrizione: "TRIBUNALE ORDINARIO (EXEMPLO)" },
              giudice: { nome: "MARIO ROSSI" },
              udienza: { raw: "2027-09-10 10:00", iso: "2027-09-10T10:00:00+02:00", isFuture: true, daysUntil: 509 },
              parti:   { totale: 3, attori: "[…]", convenuti: "[…]" },
              storico: { totale: 12, ultimoEvento: { data: "15/03/2026", evento: "UDIENZA RINVIATA", tipoEvento: "RINVIO" } },
            },
            meta: { server: SERVERS[0], latencyMs: 420 },
          },
        },
        "POST /api/consulta": {
          descricao: "Mesma coisa, corpo JSON (útil pra quem chama de server-side)",
          curl: `curl -X POST '${baseUrl}/api/consulta' -H 'content-type: application/json' -d '${JSON.stringify({ idufficio: "9999999999", registro: "CC", numproc: "12345", aaproc: "2024" })}'`,
        },
        "GET /api/by-url": {
          descricao: "Cola a URL do portal e a API extrai os parâmetros automaticamente",
          request: `${baseUrl}/api/by-url?url=https%3A%2F%2Fservizipst.giustizia.it%2FPST%2Fit%2Fpst_2_6_1.wp%3FactionPath%3D%2FExtStr2%2Fdo%2Fconsultazionepubblica%2Fsicid%2Fcontenzioso%2Fdetail.action%26idfascicolo%3D9999999%26numeroregistro%3D00012345%26annoregistro%3D2023%26regioneRicerca%3D20%26ufficioRicerca%3D9999999999%26registroRicerca%3DCC`,
        },
        "GET /api/uffici": {
          descricao: "Lista as varas/tribunais de uma região. Dados puxados ao vivo via DWR do portal",
          request: `${baseUrl}/api/uffici?regione=20`,
          nota: "Filtro por tipo: ?regione=20&tipo=TRIBUNALE_ORDINARIO",
        },
        "GET /api/ics": {
          descricao: "Baixa arquivo .ics da próxima audiência, pronto pra importar em Google/Apple/Outlook Calendar",
          request: `${baseUrl}/api/ics?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024`,
        },
        "GET /api/proxy": {
          descricao: "Proxy reverso do portal italiano — abre no browser como se estivesse navegando direto, bypass do bloqueio geográfico",
          request: `${baseUrl}/api/proxy?url=https%3A%2F%2Fservizipst.giustizia.it%2FPST%2Fit%2Fpst_2_6.wp`,
          restricao: "Apenas URLs de *.giustizia.it (anti-open-relay)",
        },
      });
    }

    if (req.method === "GET" && u.pathname === "/api/form") {
      return sendJSON(res, 200, {
        descricao: "Schema dos campos de entrada aceitos por /api/consulta — útil pra gerar formulário HTML/React automaticamente",
        metodos: ["GET (query string)", "POST (body JSON)"],
        campos: [
          {
            nome: "idufficio",
            label: "Vara/Tribunal (Ufficio Giudiziario)",
            tipo: "string",
            widget: "select",
            obrigatorio: true,
            pattern: "^\\d{1,10}$",
            maxLength: 11,
            exemplo: "9999999999",
            descricao: "ID de 10 dígitos da vara judicial (tribunal, corte de apelação, juiz de paz). Obtido via /api/uffici?regione=<N>.",
            fonte: "GET /api/uffici?regione=<regiao>",
            dependeDe: ["regiao"],
          },
          {
            nome: "registro",
            label: "Registro processual",
            tipo: "string",
            widget: "select",
            obrigatorio: true,
            enum: Object.keys(REGISTRI),
            enumLabels: REGISTRI,
            enumMeta: REGISTRI_META,
            exemplo: "CC",
            descricao: "Tipo de registro do processo (SICID/SIECIC/SIGMA).",
            nota: "Nem todos os registros estão disponíveis para todas as varas. CC/L/VG para tribunais ordinários; PC/ESM/ESIM para execuções e falimentares; GDP para Juízes de Paz.",
          },
          {
            nome: "numproc",
            label: "Número do processo (Ruolo Generale)",
            tipo: "string",
            widget: "number",
            obrigatorio: true,
            pattern: "^\\d+$",
            minLength: 1,
            maxLength: 10,
            exemplo: "12345",
            descricao: "Número de distribuição (RG = Ruolo Generale) do processo. Sem zeros à esquerda.",
            aliases: ["numeroregistro", "numproc"],
          },
          {
            nome: "aaproc",
            label: "Ano de distribuição",
            tipo: "string",
            widget: "number",
            obrigatorio: true,
            pattern: "^\\d{2,4}$",
            minLength: 2,
            maxLength: 4,
            exemplo: "2024",
            descricao: "Ano de distribuição do processo. 2 ou 4 dígitos.",
            aliases: ["annoregistro", "aaproc"],
          },
          {
            nome: "tipoufficio",
            label: "Tipo de vara",
            tipo: "integer",
            widget: "select",
            obrigatorio: false,
            default: 1,
            enum: Object.keys(TIPI_UFFICIO).map(Number),
            enumLabels: TIPI_UFFICIO,
            enumMeta: TIPI_UFFICIO_META,
            exemplo: 1,
            descricao: "Tipo da vara. Geralmente deduzido do prefixo do idufficio — mas Juízes de Paz SIGMA precisam tipoufficio=5 explícito.",
          },
          {
            nome: "tiporicerca",
            label: "Tipo de busca (avançada)",
            tipo: "string",
            widget: "select",
            obrigatorio: false,
            enum: ["", "S", "D"],
            enumLabels: { "": "Busca de processo (padrão)", "S": "Sentença", "D": "Decreto monitório/injuntivo" },
            descricao: "Opcional. Use 'S' pra buscar uma sentença específica, 'D' pra um decreto monitório. Vazio = busca normal de processo.",
          },
        ],
        auxiliares: [
          {
            nome: "regiao",
            label: "Região italiana",
            tipo: "integer",
            widget: "select",
            obrigatorio: "apenas pra popular o select de vara",
            enum: Object.keys(REGIONI_IT).map(Number),
            enumLabels: REGIONI_IT,
            descricao: "Não é enviada à /api/consulta — serve só pra filtrar /api/uffici?regione=<N>. Numeração alfabética do portal PST (1=Abruzzo, 20=Veneto).",
          },
        ],
        jsonSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          required: ["idufficio", "registro", "numproc", "aaproc"],
          properties: {
            idufficio:   { type: "string",  pattern: "^\\d{1,10}$" },
            registro:    { type: "string",  enum: Object.keys(REGISTRI) },
            numproc:     { type: "string",  pattern: "^\\d+$" },
            aaproc:      { type: "string",  pattern: "^\\d{2,4}$" },
            tipoufficio: { type: "integer", enum: Object.keys(TIPI_UFFICIO).map(Number), default: 1 },
            tiporicerca: { type: "string",  enum: ["S", "D"] },
          },
          additionalProperties: false,
        },
        fluxo: [
          "1. Usuário seleciona Região (GET /regioni)",
          "2. API popula select de Vara (GET /api/uffici?regione=<N>)",
          "3. Usuário seleciona Vara, digita número do processo e ano, e seleciona o Registro",
          "4. Submit → GET /api/consulta?idufficio=...&registro=...&numproc=...&aaproc=...",
        ],
      });
    }

    if (req.method === "GET" && u.pathname === "/openapi.json") {
      const baseUrl = `${(req.headers["x-forwarded-proto"] || "https").split(",")[0]}://${req.headers.host}`;
      return sendJSON(res, 200, {
        openapi: "3.0.3",
        info: {
          title: "giustizia-consulta",
          version: VERSION_API,
          description: "API não-oficial para consulta do registro cível do Ministério da Justiça italiano (SICID / SIECIC / SIGMA). Engenharia reversa do APK Android oficial it.giustizia.civile v2.0.18. Hospedada em Fly.io Frankfurt, faz bypass do bloqueio geográfico italiano.",
          contact: { name: "Nícolas Pastorello", url: "https://github.com/opastorello" },
          license: { name: "MIT" },
        },
        servers: [{ url: baseUrl }],
        paths: {
          "/api/consulta": {
            get: {
              summary: "Consulta processo cível (SICID / SIECIC / SIGMA)",
              parameters: [
                { name: "idufficio",   in: "query", required: true,  schema: { type: "string", pattern: "^\\d{1,10}$" }, example: "9999999999", description: "Código da vara / tribunal (10 dígitos)." },
                { name: "registro",    in: "query", required: true,  schema: { type: "string", enum: Object.keys(REGISTRI) }, example: "CC", description: "Registro processual: CC, L, VG, PC, ESM, ESIM, GDP." },
                { name: "numproc",     in: "query", required: true,  schema: { type: "string", pattern: "^\\d+$" }, example: "12345", description: "Número do processo (RG), sem zeros à esquerda." },
                { name: "aaproc",      in: "query", required: true,  schema: { type: "string", pattern: "^\\d{2,4}$" }, example: "2024", description: "Ano de distribuição (2 ou 4 dígitos)." },
                { name: "tipoufficio", in: "query", required: false, schema: { type: "integer", enum: Object.keys(TIPI_UFFICIO).map(Number) }, example: 1, description: "Tipo de vara (1=Tribunale Ordinario … 5=Cassazione)." },
                { name: "tiporicerca", in: "query", required: false, schema: { type: "string", enum: ["S", "D"] }, description: "S=sentença, D=decreto monitório." },
              ],
              responses: {
                "200": { description: "Processo encontrado" },
                "400": { description: "Parâmetros inválidos" },
                "404": { description: "Processo não encontrado" },
                "502": { description: "Ambos os servidores upstream (mob e mob1) indisponíveis" },
              },
            },
          },
          "/api/by-url": {
            get: {
              summary: "Consulta processo a partir de URL do portal PST",
              parameters: [{ name: "url", in: "query", required: true, schema: { type: "string", format: "uri" }, description: "URL completa do portal servizipst.giustizia.it, contendo os parâmetros do processo." }],
              responses: { "200": { description: "Processo encontrado" }, "400": { description: "URL inválida ou sem parâmetros suficientes" } },
            },
          },
          "/api/uffici": {
            get: {
              summary: "Lista varas / tribunais por região",
              parameters: [
                { name: "regione", in: "query", required: true, schema: { type: "integer", enum: Object.keys(REGIONI_IT).map(Number) }, description: "Código alfabético PST da região (1=Abruzzo … 20=Veneto)." },
                { name: "tipo",    in: "query", required: false, schema: { type: "string", enum: Object.keys(TIPI_UFFICIO_GIUDIZIARIO) }, description: "Filtrar por tipo de vara." },
              ],
              responses: { "200": { description: "Lista de varas" }, "400": { description: "Região inválida" } },
            },
          },
          "/api/ics": {
            get: {
              summary: "Exporta próxima audiência em formato iCalendar (.ics)",
              parameters: [
                { name: "idufficio", in: "query", required: true, schema: { type: "string" } },
                { name: "registro",  in: "query", required: true, schema: { type: "string" } },
                { name: "numproc",   in: "query", required: true, schema: { type: "string" } },
                { name: "aaproc",    in: "query", required: true, schema: { type: "string" } },
              ],
              responses: { "200": { description: "text/calendar (RFC 5545)" }, "404": { description: "Nenhuma audiência agendada no processo" } },
            },
          },
          "/api/proxy": {
            get: {
              summary: "Proxy reverso transparente para *.giustizia.it",
              description: "Reescreve HTML/CSS, injeta shim JavaScript que roteia XHR/fetch/WebSocket/forms pelo proxy, reescreve cookies. Restrito a *.giustizia.it para evitar uso como open relay.",
              parameters: [{ name: "url", in: "query", required: true, schema: { type: "string", format: "uri" }, description: "URL absoluta upstream (http/https). Deve ser *.giustizia.it." }],
              responses: {
                "200": { description: "Conteúdo upstream (HTML/CSS/JS/binário) com URLs reescritas" },
                "400": { description: "URL ausente ou protocolo não permitido" },
                "403": { description: "Host fora da allowlist (*.giustizia.it)" },
                "502": { description: "Falha ao conectar ao upstream" },
              },
            },
          },
          "/regioni":      { get: { summary: "As 20 regiões italianas (codificação PST, alfabética)", responses: { "200": { description: "OK" } } } },
          "/registri":     { get: { summary: "Códigos de registro processual + metadata", responses: { "200": { description: "OK" } } } },
          "/tipi-ufficio": { get: { summary: "Tipos de vara / tribunal (1–5)", responses: { "200": { description: "OK" } } } },
          "/distretti":    { get: { summary: "Distritos das Cortes de Apelação + mapeamento região→distrito", responses: { "200": { description: "OK" } } } },
          "/api/form":     { get: { summary: "Schema de campos do formulário de consulta", responses: { "200": { description: "OK" } } } },
          "/docs/fields":  { get: { summary: "Dicionário de campos retornados por /api/consulta", responses: { "200": { description: "OK" } } } },
          "/docs/enums":   { get: { summary: "Todos os enums da API", responses: { "200": { description: "OK" } } } },
          "/docs/examples":{ get: { summary: "Exemplos request/response", responses: { "200": { description: "OK" } } } },
          "/raw":          { get: { summary: "HTML/XML bruto do upstream (debug)", responses: { "200": { description: "OK" } } } },
          "/healthz":      { get: { summary: "Status e uptime (use ?deep=1 para probes ao vivo)", responses: { "200": { description: "OK" } } } },
        },
      });
    }

    if ((req.method === "GET" || req.method === "POST") && u.pathname === "/api/consulta") {
      const input = req.method === "POST"
        ? JSON.parse(await readBody(req))
        : Object.fromEntries(u.searchParams);
      const { statusCode, payload } = await runConsulta(input);
      return sendJSON(res, statusCode, payload, statusCode === 200 ? { "cache-control": "public, s-maxage=900" } : {});
    }

    if (req.method === "GET" && u.pathname === "/api/ics") {
      const input = Object.fromEntries(u.searchParams);
      const { statusCode, payload } = await runConsulta(input);
      if (statusCode !== 200) return sendJSON(res, statusCode, payload);
      const ics = buildICS(payload, normalizeInput(input));
      if (!ics) return sendJSON(res, 404, { error: "não há próxima audiência agendada neste processo" });
      const filename = `udienza_${input.registro}_${input.numproc}_${input.aaproc}.ics`;
      res.writeHead(200, {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        ...CORS_HEADERS,
      });
      return res.end(ics);
    }

    if (u.pathname === "/api/proxy") {
      return await handleProxy(req, res, u);
    }

    if (req.method === "GET" && u.pathname === "/raw") {
      const input = normalizeInput(Object.fromEntries(u.searchParams));
      const errors = validateInputs(u.searchParams);
      if (errors.length) return sendJSON(res, 400, { error: "parâmetros inválidos", details: errors });
      const r = await consulta(input);
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", ...CORS_HEADERS });
      return res.end(`URL: ${r.url}\nHTTP ${r.status} | ${r.body.length} bytes | ${r.ms}ms\n\n${r.body}`);
    }

    // Catch-all para requests relativas que escapam do shim JS (ex.: DWR injetando
    // <script src="/PST/dwr/..."> ou iframes). O navegador resolve a URL relativa
    // contra a origem atual (giustizia-consulta.fly.dev) e bate aqui direto.
    // Usamos o Referer para deduzir a origem upstream correta; fallback por prefixo
    // conhecido (/PST/ -> servizipst.giustizia.it).
    {
      let upstreamOrigin = null;
      const refHdr = req.headers.referer || req.headers.referrer;
      if (refHdr) {
        try {
          const refererUrl = new URL(refHdr);
          let refTargetRaw = null;
          const rRaw = refererUrl.search || "";
          const rStart = rRaw.indexOf("?url=") >= 0 ? rRaw.indexOf("?url=") + 5
                       : (rRaw.indexOf("&url=") >= 0 ? rRaw.indexOf("&url=") + 5 : -1);
          if (rStart >= 0) {
            const rest = rRaw.slice(rStart);
            if (/^https?%3A/i.test(rest)) {
              const amp = rest.indexOf("&");
              const enc = amp >= 0 ? rest.slice(0, amp) : rest;
              try { refTargetRaw = decodeURIComponent(enc); } catch { refTargetRaw = enc; }
            } else if (/^https?:\/\//i.test(rest)) {
              refTargetRaw = rest;
            }
          }
          if (refTargetRaw) {
            const refTarget = new URL(refTargetRaw);
            if (isProxyHostAllowed(refTarget.host)) upstreamOrigin = refTarget.origin;
          }
        } catch {}
      }
      if (!upstreamOrigin && /^\/PST\//i.test(u.pathname)) {
        upstreamOrigin = "https://servizipst.giustizia.it";
      }
      if (upstreamOrigin) {
        const synthetic = `${upstreamOrigin}${u.pathname}${u.search || ""}`;
        req.url = `/api/proxy?url=${encodeURIComponent(synthetic)}`;
        const newU = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        return await handleProxy(req, res, newU);
      }
    }

    res.writeHead(404, { "content-type": "application/json", ...CORS_HEADERS });
    res.end(JSON.stringify({ error: "endpoint não encontrado", path: u.pathname, dica: "consulte GET / para ver a lista de endpoints disponíveis" }));
  } catch (e) {
    sendJSON(res, 500, { error: e.message, stack: e.stack?.split("\n").slice(0, 6) });
  }
}).listen(PORT, () => console.log(`giustizia-consulta listening on :${PORT}`));

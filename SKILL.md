---
name: giustizia-consulta
description: Consulta processos cíveis do Ministério da Justiça italiano (SICID / SIECIC / SIGMA) via API hospedada em Fly.io Frankfurt. Use sempre que o usuário pedir informações sobre um fascicolo italiano, precisar de audiências, partes ou histórico de processo no tribunal italiano, colar URLs do portal servizipst.giustizia.it, precisar navegar o portal PST de dentro do Brasil, listar varas (uffici giudiziari) por região italiana, gerar .ics de audiência, consultar processos de cidadania italiana (Diritti della cittadinanza), acompanhar cases de cittadinanza iure sanguinis, ou perguntar sobre códigos CC / L / VG / PC / ESM / ESIM / GDP / SICID / SIECIC / SIGMA / PST.
---

# Skill: giustizia-consulta

> API não-oficial em PT-BR para consultar o **registro cível do Ministério da Justiça italiano**. Engenharia reversa do app Android `it.giustizia.civile` v2.0.18 + proxy reverso visual do portal oficial. Hospedada em Fly.io Frankfurt — faz bypass do bloqueio geográfico italiano (servidores do MinGiustizia bloqueiam IPs fora da UE).

- **Base URL:** `https://giustizia-consulta.fly.dev`
- **Repositório:** <https://github.com/opastorello/giustizia-consulta>
- **Autor:** Nícolas Pastorello — [@opastorello](https://github.com/opastorello)
- **Licença:** MIT
- **Versão da API:** `0.1.0`

---

## 1. Quando invocar esta skill

### 1.1 Gatilhos explícitos (sempre invocar)

- Usuário cola uma URL do portal `servizipst.giustizia.it` e quer dados do processo
- Usuário pergunta sobre um fascicolo italiano (número de processo + ano + ufficio)
- Usuário quer próxima audiência, partes, histórico, juiz, seção, stato
- Usuário menciona `SICID`, `SIECIC`, `SIGMA`, `PST`, `Giudice di Pace`
- Usuário menciona registros `CC`, `L`, `VG`, `PC`, `ESM`, `ESIM`, `GDP` (ou `LAV`, `FALL`)
- Usuário quer listar varas / tribunais / corte d'appello por região italiana
- Usuário pede `.ics` / evento de calendário de audiência italiana
- Usuário está fora da Itália e quer navegar o portal oficial ("não consigo acessar `servizipst.giustizia.it` do Brasil")
- Usuário pergunta sobre bloqueio geográfico, *geoblock* italiano, VPN italiana

### 1.2 Gatilhos de contexto — **cidadania italiana**

Este é o caso de uso **dominante** desta API. Se o usuário mencionar:
- "cidadania italiana", "cittadinanza", "iure sanguinis", "iure matrimonii"
- "processo de reconhecimento de cidadania", "ação de cidadania no tribunal italiano"
- "1948", "linha materna", "diritti della cittadinanza"
- Oficial / vara que está "julgando meu processo de cidadania"

→ **Sempre** tratar como caso de cittadinanza e aplicar §5 (Cittadinanza — guia específico).

### 1.3 Gatilhos implícitos (considerar invocar)

- Menção a "Tribunale Ordinario", "Corte d'Appello", "Giudice di Pace"
- Termos: *fascicolo*, *ruolo generale* (RG), *udienza*, *sentenza*, *decreto monitorio*, *pignoramento*, *citazione*
- Endereços jurídicos italianos
- Documento: processo civil italiano
- Nomes de advogados italianos (Avv.)
- Rito: *Rito Cartabia*, *rito sommario*, *semplificato di cognizione*

---

## 2. Arquitetura (contexto técnico)

A API combina **duas fontes oficiais complementares**:

### 2.1 API mobile (principal — para `/api/consulta`)

Extraída do APK oficial `it.giustizia.civile` v2.0.18. Faz HTTP GET a um de dois servidores espelho:
- `https://mob.processotelematico.giustizia.it` (primário)
- `https://mob1.processotelematico.giustizia.it` (fallback automático)

Parâmetros protegidos por **duas** assinaturas MD5 separadas:
```
token = md5(KEY + VERSION + SUBVERSION + PLATFORM + " " + androidVer + uuid + deviceName)
t2    = md5(idufficio + KEY2 + aaproc + numproc + KEY2)
```

Ação Struts escolhida por `registro` + `tipoufficio`:

| Registro / Tipo de vara | Ação Struts |
|---|---|
| CC, L, VG (Tribunale Ordinario / Appello) | `direttarg_sicid_mobile` |
| PC, ESM, ESIM | `direttarg_siecic_mobile` |
| GDP (Giudice di Pace) | `direttarg_sigma_mobile` |
| tiporicerca=S (sentença) | `direttasent_mobile` |
| tiporicerca=D (decreto monitório) | `direttadi_mobile` |
| fallback | `direttarg_mobile` |

**Nota TLS:** certificado do upstream está expirado — a API usa `undici.Agent({ rejectUnauthorized: false })`, replicando o comportamento do próprio app Android (`setServerTrustMode("nocheck")`).

### 2.2 Portal web (para proxy visual e listagem de varas)

`https://servizipst.giustizia.it/PST/` — usado via:
- **Proxy reverso** (`/api/proxy`) com reescrita de HTML/CSS/cookies + shim JS que intercepta XHR/fetch/WebSocket/form submit
- **DWR** (Direct Web Remoting) para listar varas via `POST /PST/dwr/call/plaincall/RegistroListGetter.getUfficiPubb.dwr`
- **Catch-all** `/PST/*` — requests relativas do DWR engine que escapam do shim são recapturadas via Referer

### 2.3 Mascaramento de dados pessoais

O próprio upstream do Ministério **mascara nomes de partes** com asteriscos (ex.: `P**** S****`). Isso é comportamento **oficial** — a API apenas repassa o que vem do servidor. Não há como obter nomes completos via consulta pública; apenas o juiz, advogados e stato aparecem sem mascaramento.

---

## 3. Endpoints — referência completa

### 3.1 `GET /api/consulta` (endpoint principal)

Query params:

| Parâmetro | Obrigatório | Formato | Exemplo | Observações |
|---|---|---|---|---|
| `idufficio` | ✅ | `^\d{1,11}$` | `9999999999` | Código da vara (10–11 dígitos) |
| `registro` | ✅ | enum | `CC` | Ver §4.1 |
| `numproc` | ✅ | `^\d+$` | `12345` | Número do processo (RG), sem zeros à esquerda |
| `aaproc` | ✅ | `^\d{2,4}$` | `2024` ou `24` | Ano de distribuição |
| `tipoufficio` | opcional | enum 1–5 | `1` | Default: `1`. GDP exige `5` explícito |
| `tiporicerca` | opcional | `S` ou `D` | `S` | `S`=sentença, `D`=decreto monitório |

**Cache:** `Cache-Control: public, s-maxage=900` (15 min em edge). Respeite — consultas repetidas em menos de 15 min retornam do cache.

**Exemplo:**
```
GET https://giustizia-consulta.fly.dev/api/consulta?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024
```

### 3.1.1 Schema real da resposta (200)

> ⚠️ A resposta tem estrutura **aninhada** em `fascicolo.*` — NÃO planar. Os exemplos que mostram `numero` no root são incorretos.

```jsonc
{
  "ok": true,
  "fascicolo": {
    "ruoloGenerale": {
      "numero":               "12345",
      "numeroInt":            12345,
      "anno":                 "2024",
      "identifier":           "12345/2024",
      "registro":             "CC",
      "registroDesc":         "Contencioso Civil (Contenzioso Civile)",
      "iscrittoIl":           "15/03/2024",
      "iscrittoIlISO":        "2024-03-15",
      "daysSinceIscrizione":  765
    },
    "ufficio": {
      "id":           "9999999999",
      "descrizione":  "Tribunale Ordinario di Venezia",
      "regioneCode":  "02",
      "regione":      null,
      "distretto":    "027042",
      "sezione":      "0098"
    },
    "giudice": {
      "nome":  "MARIO ROSSI"
    },
    "stato": {
      "descrizione":  "ATTESA ESITO UDIENZA DI COMPARIZIONE",
      "codice":       "ATTESA_ESITO_UDIENZA_DI_COMPARIZIONE"
    },
    "oggetto": {
      "rito":     "RITO SEMPLIFICATO DI COGNIZIONE CARTABIA",
      "materia":  "Diritti della cittadinanza",
      "raw":      ["RITO SEMPLIFICATO DI COGNIZIONE CARTABIA", "Diritti della cittadinanza"]
    },
    "udienza": {
      "raw":         "2027-09-10 10:00",
      "iso":         "2027-09-10T10:00:00+02:00",
      "timezone":    "Europe/Rome",
      "isFuture":    true,
      "daysUntil":   509,
      "calendar": {
        "titolo":  "Udienza RG 12345/2024 CC",
        "luogo":   "Tribunale Ordinario di Venezia",
        "note":    "Giudice: MARIO ROSSI",
        "start":   "2027-09-10 10:00:00",
        "end":     "2027-09-10 11:00:00"
      }
    },
    "parti": {
      "totale": 5,
      "attori": [
        { "nome": "P**** S****", "qualifica": "Attore Principale", "qualificaTipo": "ATTORE",
          "avvocato": "Avv. S****** L******" }
      ],
      "convenuti": [
        { "nome": "M**** *****", "qualifica": "Convenuto Principale", "qualificaTipo": "CONVENUTO",
          "avvocato": null }
      ],
      "altri": [],
      "raw":   [/* array completo com todas as partes */]
    },
    "storico": {
      "totale": 12,
      "ultimoEvento":  { "data": "14/01/2025", "dataISO": "2025-01-14",
                         "evento": "FISSAZIONE UDIENZA DI COMPARIZIONE PARTI", "tipoEvento": "U" },
      "primoEvento":   { "data": "15/03/2024", "dataISO": "2024-03-15",
                         "evento": "ISCRIZIONE RUOLO GENERALE", "tipoEvento": "I" },
      "eventi": [
        { "data": "15/03/2024", "dataISO": "2024-03-15",
          "evento": "ISCRIZIONE RUOLO GENERALE", "tipoEvento": "I" },
        { "data": "16/03/2024", "dataISO": "2024-03-16",
          "evento": "DESIGNAZIONE GIUDICE", "tipoEvento": "D" },
        /* ... */
      ]
    },
    "aggiornamento": {
      "ultimoStorico":  "Ultimo aggiornamento: 14/01/2025",
      "DataReg":        "14/01/2025 09:33:21",
      "DataRegDB":      "2025-01-14 09:33:21.123",
      "DataRegISO":     "2025-01-14T09:33:21+01:00"
    }
  },
  "input":  { "idufficio": "9999999999", "registro": "CC", "numproc": "12345", "aaproc": "2024" },
  "meta": {
    "server":       "https://mob.processotelematico.giustizia.it",
    "status":       200,
    "latencyMs":    412,
    "requestedAt":  "2026-04-19T08:12:44.123Z",
    "respondedAt":  "2026-04-19T08:12:44.535Z",
    "upstreamUrl":  "https://mob.processotelematico.giustizia.it/...",
    "bytes":        15432,
    "G_PLATFORM":   "Android",
    "G_VERSION":    "2.0.18",
    "SERVER_NAME":  "PST-DMZ-WEB01"
  }
}
```

### 3.1.2 Respostas de erro

```jsonc
{
  "ok":      false,
  "error":   "processo não encontrado",
  "code":    "NOT_FOUND",
  "details": ["..."],   // apenas para BAD_INPUT
  "meta":    { /* sempre presente — server, latency, etc */ }
}
```

| Status | `code` | Significado | Ação sugerida |
|---|---|---|---|
| 400 | `BAD_INPUT` | Parâmetros inválidos | Mostrar `details[]` ao usuário |
| 404 | `NOT_FOUND` | Processo não existe no upstream | "Processo não encontrado — confirme número, ano, ufficio" |
| 500 | `PARSE_FAIL` | Upstream respondeu mas XML não parseável | Raro — tentar novamente em 5min |
| 502 | `UPSTREAM_DOWN` | Ambos `mob` e `mob1` caíram | "Ministério fora do ar — tente em 5min" |

### 3.2 `POST /api/consulta`

Mesmos campos do GET, mas via body JSON. Útil para requests server-side onde a query string inflaria logs.

```bash
curl -X POST https://giustizia-consulta.fly.dev/api/consulta \
  -H 'content-type: application/json' \
  -d '{"idufficio":"9999999999","registro":"CC","numproc":"12345","aaproc":"2024"}'
```

### 3.3 `GET /api/by-url`

Aceita uma URL do portal PST e extrai `idufficio`, `registro`, `numproc`, `aaproc` automaticamente do query string. **Use sempre que o usuário colar uma URL do portal** — é mais rápido que pedir cada campo separado.

```
GET https://giustizia-consulta.fly.dev/api/by-url?url=<URL encoded OU raw>
```

Aceita URL *encoded* (via `encodeURIComponent`) OU *raw* com `&` solto — o parser tolera ambos.

**Parâmetros extraídos do query string:**
- `ufficioRicerca` → `idufficio`
- `registroRicerca` → `registro` (+ mapeamento web→mobile: `LAV`→`L`, `FALL`→`PC`)
- `numeroregistro` → `numproc`
- `annoregistro` → `aaproc`

### 3.4 `GET /api/uffici`

Lista varas / tribunais de uma região italiana. Dados puxados via DWR do portal oficial, com cache in-memory de 6h.

```
GET /api/uffici?regione=<1..20>[&tipo=<filtro>]
```

**Exemplos:**
```
GET /api/uffici?regione=20                    # Veneto — todos os 52 ufici
GET /api/uffici?regione=16&tipo=TRIBUNALE_ORDINARIO   # Toscana, só tribunais
GET /api/uffici?regione=7&tipo=CORTE_APPELLO  # Corte d'Appello Roma
```

**Schema real da resposta:**
```jsonc
{
  "regione": {
    "codigo": 20,
    "nome":   "Veneto",
    "distritosCorteApelacao": ["Venezia"]
  },
  "total":              52,
  "fonte":              "dwr",          // ou "static-fallback"
  "filtroTipoAplicado": null,           // ou o valor de ?tipo=
  "uffici": [
    {
      "id":          "9999999999",
      "nome":        "Tribunale Ordinario - Venezia",
      "tipo":        "TRIBUNALE_ORDINARIO",
      "tipoDesc":    "Tribunal Ordinário",
      "regioneCode": "20",
      "regione":     "Veneto",
      "distretti":   ["Venezia"]
    }
  ]
}
```

**Enum `tipo`:**

| Código | Descrição |
|---|---|
| `TRIBUNALE_ORDINARIO` | Tribunal Ordinário (1ª instância) |
| `CORTE_APPELLO` | Corte de Apelação (2ª instância) |
| `TRIBUNALE_SPECIALIZZATO` | Tribunal Especializado (empresas, menores) |
| `GIUDICE_DI_PACE` | Juiz de Paz (sistema SIGMA ativo) |
| `GIUDICE_DI_PACE_LEGACY` | Juiz de Paz (protocolo antigo — deprecated) |
| `ALTRO` | Outros (commissariati usi civici, etc.) |

Se o DWR falhar, devolve `fonte: "static-fallback"` com as regiões em cache estático hardcoded.

### 3.5 `GET /api/form`

Retorna o **schema** dos campos de entrada para `/api/consulta`. Útil para gerar formulário HTML/React/Vue dinamicamente com validação e placeholders.

### 3.6 `GET /api/ics`

Próxima audiência como evento iCalendar (RFC 5545) — compatível com Google Calendar, Outlook, Apple Calendar.

```
GET /api/ics?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024
```

- Content-Type: `text/calendar; charset=utf-8`
- Content-Disposition: `attachment; filename="udienza_CC_12345_2024.ics"`
- Retorna 404 se não há audiência agendada.

### 3.7 `* /api/proxy`

**Proxy reverso visual** — navegue o portal italiano em qualquer browser, restrito a `*.giustizia.it`.

```
https://giustizia-consulta.fly.dev/api/proxy?url=<URL absoluta>
```

**O que o proxy faz:**
1. **Reescreve todas as URLs** em HTML (href, src, action, formaction, srcset, meta refresh, style url())
2. **Reescreve cookies** (`Set-Cookie`): remove `Domain=`, força `SameSite=None; Secure`
3. **Remove prolog XML** (`<?xml?>`) + DOCTYPE XHTML → força parser HTML leniente
4. **Injeta shim JS** em `<head>` que intercepta `XMLHttpRequest`, `fetch`, `sendBeacon`, `WebSocket`, `<form>.submit()` e roteia tudo via `/api/proxy?url=<abs>`
5. **Auto-preenchimento** — se a URL contém `regioneRicerca`, `ufficioRicerca`, `registroRicerca`, preenche os selects + aguarda DWR async + chega até `detail.action`
6. **Banner** fixo no topo com logo + URL alvo em monospace
7. **Catch-all `/PST/*`** — requests relativas do DWR engine escapam do shim e são recapturadas via Referer

**Restrições:**
- Apenas `*.giustizia.it` (qualquer outro host → 403)
- Apenas HTTP/HTTPS (outros schemes → 400)
- Body máximo: 10 MB

**Quando usar:** usuário quer ver a página original com filtros, paginação, downloads de PDF.
**Quando NÃO usar:** só precisa dos dados estruturados → use `/api/consulta`.

### 3.8 Endpoints de referência (enums + metadata)

| Endpoint | Retorna |
|---|---|
| `GET /regioni` | 20 regiões italianas com numeração alfabética PST (1=Abruzzo … 20=Veneto). **Não é ISTAT** |
| `GET /registri` | Registros processuais + sistema responsável + descrição |
| `GET /tipi-ufficio` | Tipos de vara (1–5) |
| `GET /distretti` | 26 distritos Corte d'Appello + mapeamento região→distrito |
| `GET /docs/fields` | Dicionário completo dos campos retornados |
| `GET /docs/enums` | Todos os enums juntos |
| `GET /docs/examples` | Exemplos request/response |
| `GET /openapi.json` | OpenAPI 3.0 — importável em Postman/Insomnia/Bruno/Hoppscotch |
| `GET /raw` | HTML/XML bruto do upstream (DEBUG) |
| `GET /healthz` | Status básico |
| `GET /healthz?deep=1` | Probe HTTP dos 3 upstreams + memória + cache DWR stats |

---

## 4. Enums completos e mapeamentos

### 4.1 `registro` (obrigatório)

| Código API | Código portal web | Nome italiano | Sistema | Uso mais comum |
|---|---|---|---|---|
| `CC` | `CC` | Contenzioso Civile | SICID | **Cittadinanza**, danos, contratos |
| `L` | `LAV` | Lavoro | SICID | Causas trabalhistas, previdenciárias |
| `VG` | `VG` | Volontaria Giurisdizione | SICID | Tutelas, curadorias, sucessões |
| `PC` | `FALL` | Procedure Concorsuali | SIECIC | Falências, concordatas |
| `ESM` | `ESM` | Esecuzioni Mobiliari | SIECIC | Execuções de bens móveis |
| `ESIM` | `ESIM` | Esecuzioni Immobiliari | SIECIC | Execuções imobiliárias |
| `GDP` | `GDP` | Giudice di Pace | SIGMA | Juiz de Paz |

**⚠️ Mapeamento web→mobile:** o portal web usa `LAV` e `FALL`, mas a API mobile espera `L` e `PC`. O `/api/by-url` trata automaticamente; `/api/consulta` não — passar `LAV`/`FALL` direto gera `BAD_INPUT`.

### 4.2 `tipoufficio` (opcional, default `1`)

| Código | Tipo |
|---|---|
| `1` | Tribunale Ordinario |
| `2` | Tribunale dei Minorenni / Corte d'Appello |
| `3` | Tribunale Specializzato |
| `4` | Giudice di Pace (legado) |
| `5` | Giudice di Pace (SIGMA) |

**Heurística:** código inferido do `idufficio`. Para **GDP (SIGMA)** passar `tipoufficio=5` explicitamente.

### 4.3 `regione` (1–20, codificação alfabética PST)

**⚠️ Não é código ISTAT.** É a numeração alfabética usada pelo portal PST:

| # | Região | Corte d'Appello | # | Região | Corte d'Appello |
|---|---|---|---|---|---|
| 1 | Abruzzo | L'Aquila | 11 | Molise | Campobasso |
| 2 | Basilicata | Potenza | 12 | Piemonte | Torino |
| 3 | Calabria | Catanzaro, Reggio C. | 13 | Puglia | Bari, Lecce, Taranto |
| 4 | Campania | Napoli, Salerno | 14 | Sardegna | Cagliari, Sassari |
| 5 | Emilia-Romagna | Bologna | 15 | Sicilia | Palermo, Catania, Messina, Caltanissetta |
| 6 | Friuli-Venezia Giulia | Trieste | 16 | Toscana | Firenze |
| 7 | Lazio | Roma | 17 | Trentino-Alto Adige | Trento, Bolzano |
| 8 | Liguria | Genova | 18 | Umbria | Perugia |
| 9 | Lombardia | Milano, Brescia | 19 | Valle d'Aosta | (Aosta → Torino) |
| 10 | Marche | Ancona | 20 | Veneto | Venezia |

### 4.4 `tipoEvento` (classificação do histórico)

Heurística baseada em palavras-chave em italiano:

| Code | Categoria | Palavras-chave típicas |
|---|---|---|
| `I` | Iscrizione | ISCRIZIONE RUOLO GENERALE |
| `D` | Designazione / Deposito / Decreto | DESIGNAZIONE GIUDICE, DEPOSITO, DECRETO |
| `U` | Udienza | FISSAZIONE UDIENZA, UDIENZA TENUTA |
| `S` | Sentenza | SENTENZA DEPOSITATA, DISPOSITIVO |
| `C` | Costituzione / Comunicazione | COSTITUZIONE, COMUNICAZIONE |
| `T` | Trattazione | TRATTAZIONE SCRITTA, ORDINANZA ISTRUTTORIA |
| `A` | Archiviazione / Annotazione / Assegnazione | ARCHIVIAZIONE, ASSEGNAZIONE |
| `M` | Memoria / Mutamento | MEMORIA, MUTAMENTO GIUDICE |
| `R` | Ricorso / Rinvio | RICORSO, RINVIO UDIENZA |
| `?` | Não classificado | — |

### 4.5 `qualificaTipo` (tipo de parte)

| Enum | Significado |
|---|---|
| `ATTORE` | Autor principal ou secundário |
| `CONVENUTO` | Réu principal ou secundário |
| `RICORRENTE` | Recorrente (em recursos) |
| `RESISTENTE` | Resistente (em recursos) |
| `TERZO` | Terceiro interveniente |
| `ALTRO` | Curador, CTU, outros |

### 4.6 Códigos de erro (`code`)

| Code | Significado | HTTP |
|---|---|---|
| `BAD_INPUT` | Parâmetros inválidos | 400 |
| `NOT_FOUND` | Processo não existe | 404 |
| `PARSE_FAIL` | XML upstream inválido | 500 |
| `UPSTREAM_DOWN` | mob + mob1 fora | 502 |

---

## 5. Cittadinanza italiana — guia específico

### 5.1 Contexto

**Este é o caso de uso dominante** desta API. Brasileiros (e outros descendentes de italianos no mundo) entram com ações judiciais de reconhecimento de cidadania italiana nos tribunais italianos quando:
- **Linha materna pré-1948** — a via administrativa não aceita (mulheres não transmitiam cidadania antes da Constituição de 1948)
- **Consulado lento** — fila de 10–15 anos; a via judicial força decisão em ~1–3 anos
- **Documentação controversa** — divergências em documentos exigindo decisão judicial

A ação é sempre **cível** (registro `CC`), com **matéria `Diritti della cittadinanza`** e normalmente **rito `RITO SEMPLIFICATO DI COGNIZIONE CARTABIA`** (D.Lgs. 149/2022).

### 5.2 Tribunais competentes (pós-Lei 36/2025)

A **Lei 36/2025** (março 2025) concentrou as causas de cittadinanza em tribunais específicos por **Corte d'Appello**. Os principais:

| Distretto CdA | Tribunale competente | `idufficio` | Região |
|---|---|---|---|
| Roma | Tribunale Ordinario Roma | `0580910098` | Lazio (7) |
| Venezia | Tribunale Ordinario Venezia | `0270420098` | Veneto (20) |
| L'Aquila | Tribunale Ordinario L'Aquila | `0660490099` | Abruzzo (1) |
| Campobasso | Tribunale Ordinario Campobasso | `0700060095` | Molise (11) |
| Ancona | Tribunale Ordinario Ancona | `0420020093` | Marche (10) |
| Firenze | Tribunale Ordinario Firenze | `0480170090` | Toscana (16) |
| Torino | Tribunale Ordinario Torino | `0012720095` | Piemonte (12) |
| Milano | Tribunale Ordinario Milano | `0151460094` | Lombardia (9) |
| Bologna | Tribunale Ordinario Bologna | `0370060094` | Emilia-Romagna (5) |
| Napoli | Tribunale Ordinario Napoli | `0630490096` | Campania (4) |
| Palermo | Tribunale Ordinario Palermo | `0820530098` | Sicilia (15) |
| Bari | Tribunale Ordinario Bari | `0720060097` | Puglia (13) |
| Trieste | Tribunale Ordinario Trieste | `0320060099` | Friuli-VG (6) |
| Genova | Tribunale Ordinario Genova | `0100250093` | Liguria (8) |
| Cagliari | Tribunale Ordinario Cagliari | `0920090097` | Sardegna (14) |

> Pré-2025 os processos espalhavam-se por dezenas de tribunais. Muitos fascicoli antigos ainda estão em tramitação nesses tribunais "menores" — a consulta funciona normalmente, só o protocolo de novos é que mudou.

### 5.3 Assinatura de um caso de cittadinanza

Identificáveis pela combinação:

```json
{
  "fascicolo": {
    "ruoloGenerale": { "registro": "CC", ... },
    "oggetto": {
      "materia": "Diritti della cittadinanza"
    }
  }
}
```

Outras matérias típicas:
- `"Diritti della cittadinanza"` — cidadania estrito senso
- `"Stato delle persone"` — estado civil (retificações, etc.)
- `"Rettifica atti stato civile"` — retificação de nascimentos/casamentos

O **rito** quase sempre será `RITO SEMPLIFICATO DI COGNIZIONE CARTABIA` (pós-2023) ou `RITO SOMMARIO DI COGNIZIONE` (antes).

### 5.4 Timeline típica (eventos esperados)

Ordem cronológica comum dos `tipoEvento` para um caso de cittadinanza:

```
I  — ISCRIZIONE RUOLO GENERALE           (día 0)
D  — DESIGNAZIONE GIUDICE                (día 1–30)
D  — DEPOSITO ATTO DI CITAZIONE          (día 1–30)
C  — COSTITUZIONE ATTORE                 (día 1–60)
C  — COMUNICAZIONE AL MINISTERO          (día 30–90)
U  — FISSAZIONE PRIMA UDIENZA            (día 60–365)
U  — UDIENZA DI COMPARIZIONE             (día 365–700)
T  — TRATTAZIONE SCRITTA                 (variável)
T  — ORDINANZA ISTRUTTORIA               (variável)
U  — UDIENZA DI PRECISAZIONE CONCLUSIONI (pré-sentença)
S  — SENTENZA DEPOSITATA                 (día 400–1200)
```

**Tempo total observado** (até sentença): **12–36 meses**, com tendência de aceleração pós-Cartabia (2023). Alguns tribunais (Venezia, Campobasso, L'Aquila) têm média < 18 meses; Roma pode chegar a 36+.

### 5.5 Prompt sugerido para apps focados em cittadinanza

> "Sou brasileiro/a esperando reconhecimento de cidadania italiana. Meu processo é 12345/2024 no Tribunale di Venezia. Quando é a próxima audiência? Qual o tempo médio de espera do Venezia para casos como o meu?"

→ Responder com:
1. Próxima audiência (`fascicolo.udienza.iso` + `daysUntil`)
2. Tempo desde distribuição (`fascicolo.ruoloGenerale.daysSinceIscrizione`)
3. Status atual (`fascicolo.stato.descrizione`)
4. Link `.ics` para Google Calendar
5. Se o app tiver agregados: "no Tribunale di Venezia, a mediana de tempo até sentença em casos CC com materia 'Diritti della cittadinanza' é de X meses (baseado em Y consultas agregadas na plataforma)"

---

## 6. Tribunais Ordinários — tabela completa (130 varas)

> Para listagem dinâmica com nomes em italiano, preferir `/api/uffici?regione=N&tipo=TRIBUNALE_ORDINARIO`. Tabela abaixo é cache estático para LLMs que precisem gerar selects sem round-trip extra.

<details>
<summary>Abruzzo (1) — 8 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0660060099` | Avezzano |
| `0690220096` | Chieti |
| `0660490099` | L'Aquila |
| `0690460096` | Lanciano |
| `0680280097` | Pescara |
| `0660980092` | Sulmona |
| `0670410094` | Teramo |
| `0690990097` | Vasto |
</details>

<details>
<summary>Basilicata (2) — 3 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0760390090` | Lagonegro |
| `0770140099` | Matera |
| `0760630091` | Potenza |
</details>

<details>
<summary>Calabria (3) — 10 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0780330090` | Castrovillari |
| `0790230090` | Catanzaro |
| `0780450095` | Cosenza |
| `1010100092` | Crotone |
| `0791600090` | Lamezia Terme |
| `0800430095` | Locri |
| `0800570094` | Palmi |
| `0780910092` | Paola |
| `0800630097` | Reggio di Calabria |
| `1020470090` | Vibo Valentia |
</details>

<details>
<summary>Campania (4) — 10 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0640080091` | Avellino |
| `0620080099` | Benevento |
| `0630490096` | Napoli |
| `06100500902` | Napoli Nord |
| `0650780099` | Nocera Inferiore |
| `0630500099` | Nola |
| `0651160091` | Salerno |
| `0610830096` | Santa Maria Capua Vetere |
| `0630830098` | Torre Annunziata |
| `0651540091` | Vallo della Lucania |
</details>

<details>
<summary>Emilia-Romagna (5) — 9 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0370060094` | Bologna |
| `0380080099` | Ferrara |
| `0400120092` | Forlì |
| `0360230099` | Modena |
| `0340270095` | Parma |
| `0330320095` | Piacenza |
| `0390140093` | Ravenna |
| `0350330099` | Reggio Emilia |
| `0990140095` | Rimini |
</details>

<details>
<summary>Friuli-Venezia Giulia (6) — 4 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0310070090` | Gorizia |
| `0930330099` | Pordenone |
| `0320060099` | Trieste |
| `0301290097` | Udine |
</details>

<details>
<summary>Lazio (7) — 9 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0600190090` | Cassino |
| `0580320094` | Civitavecchia |
| `0600380090` | Frosinone |
| `0590110091` | Latina |
| `0570590099` | Rieti |
| `0580910098` | **Roma** |
| `0581040224` | Tivoli |
| `0581110092` | Velletri |
| `0560590098` | Viterbo |
</details>

<details>
<summary>Liguria (8) — 4 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0100250093` | Genova |
| `0080310092` | Imperia |
| `0110150093` | La Spezia |
| `0090560095` | Savona |
</details>

<details>
<summary>Lombardia (9) — 13 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0160240097` | Bergamo |
| `0170290098` | Brescia |
| `0120260097` | Busto Arsizio |
| `0130750091` | Como |
| `0190360095` | Cremona |
| `0970420092` | Lecco |
| `0980310090` | Lodi |
| `0200300096` | Mantova |
| `0151460094` | **Milano** |
| `0151490090` | Monza |
| `0181100092` | Pavia |
| `0140610093` | Sondrio |
| `0121330094` | Varese |
</details>

<details>
<summary>Marche (10) — 6 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0420020093` | Ancona |
| `0440070095` | Ascoli Piceno |
| `0440190090` | Fermo |
| `0430230098` | Macerata |
| `0410440090` | Pesaro |
| `0410670098` | Urbino |
</details>

<details>
<summary>Molise (11) — 3 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0700060095` | Campobasso |
| `0940230099` | Isernia |
| `0700310098` | Larino |
</details>

<details>
<summary>Piemonte (12) — 9 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0060030091` | Alessandria |
| `0050050094` | Asti |
| `0960040091` | Biella |
| `0040780096` | Cuneo |
| `0011250094` | Ivrea |
| `0031060096` | Novara |
| `0012720095` | Torino |
| `1030720094` | Verbania |
| `0021580094` | Vercelli |
</details>

<details>
<summary>Puglia (13) — 6 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0720060097` | Bari |
| `0740010099` | Brindisi |
| `0710240094` | Foggia |
| `0750350091` | Lecce |
| `0730270092` | Taranto |
| `0720450099` | Trani |
</details>

<details>
<summary>Sardegna (14) — 6 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0920090097` | Cagliari |
| `0910370095` | Lanusei |
| `0910510095` | Nuoro |
| `0950380091` | Oristano |
| `0900640091` | Sassari |
| `0900700094` | Tempio Pausania |
</details>

<details>
<summary>Sicilia (15) — 16 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0840010091` | Agrigento |
| `0830050098` | Barcellona Pozzo di Gotto |
| `0870110095` | Caltagirone |
| `0850040098` | Caltanissetta |
| `0870150093` | Catania |
| `0860090099` | Enna |
| `0850070094` | Gela |
| `0810110099` | Marsala |
| `0830480098` | Messina |
| `0820530098` | Palermo |
| `0830660096` | Patti |
| `0880090091` | Ragusa |
| `0840410095` | Sciacca |
| `0890170099` | Siracusa |
| `0820700094` | Termini Imerese |
| `0810210090` | Trapani |
</details>

<details>
<summary>Toscana (16) — 10 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0510020094` | Arezzo |
| `0480170090` | Firenze |
| `0530110095` | Grosseto |
| `0490090094` | Livorno |
| `0460170098` | Lucca |
| `0450100093` | Massa |
| `0500260093` | Pisa |
| `0470140093` | Pistoia |
| `1000050090` | Prato |
| `0520320098` | Siena |
</details>

<details>
<summary>Trentino-Alto Adige (17) — 3 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0210080090` | Bolzano / Bozen |
| `0221610095` | Rovereto |
| `0222050099` | Trento |
</details>

<details>
<summary>Umbria (18) — 3 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0540390094` | Perugia |
| `0540510090` | Spoleto |
| `0550320091` | Terni |
</details>

<details>
<summary>Valle d'Aosta (19) — 1 vara</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0070030092` | Aosta |
</details>

<details>
<summary>Veneto (20) — 7 varas</summary>

| idufficio | Tribunale Ordinario |
|---|---|
| `0250060090` | Belluno |
| `0280600097` | Padova |
| `0290410098` | Rovigo |
| `0260860099` | Treviso |
| `0270420098` | **Venezia** |
| `0230910097` | Verona |
| `0241160092` | Vicenza |
</details>

---

## 7. Decision tree — como atender o usuário

```
Usuário quer consultar processo italiano?
├── Tem URL do portal servizipst.giustizia.it?
│   └─→ GET /api/by-url?url=<encoded> → JSON completo
│
├── Tem os 4 parâmetros (idufficio, registro, numproc, aaproc)?
│   └─→ GET /api/consulta?... → JSON completo
│
├── Sabe cidade/tribunal mas não o idufficio?
│   └─→ Consultar §6 (tabela estática) OU GET /api/uffici?regione=N&tipo=TRIBUNALE_ORDINARIO
│       → usuário escolhe idufficio
│       → GET /api/consulta?...
│
├── Quer navegar visualmente o portal?
│   └─→ Gerar link /api/proxy?url=<encoded URL pst>
│
├── Quer evento de calendário da audiência?
│   └─→ GET /api/ics?<params> (confirmar que há udienza antes via /api/consulta)
│
├── É caso de cittadinanza?
│   └─→ Aplicar §5 — explicar tempo médio, próxima audiência, status em PT-BR claro
│
└── Não sabe nem o processo nem a região?
    └─→ Pedir dados mínimos OU enviar link /api/proxy?url=<portal home>
```

---

## 8. Exemplos práticos por cenário

### 8.1 Usuário cola URL do portal

```
Usuário: "pega os dados desse processo aqui:
https://servizipst.giustizia.it/PST/it/pst_2_6_1.wp?actionPath=/ExtStr2/do/consultazionepubblica/sicid/contenzioso/detail.action&idfascicolo=9999999&numeroregistro=00012345&annoregistro=2024&regioneRicerca=20&ufficioRicerca=9999999999&registroRicerca=CC"
```

**Ação:**
```
GET https://giustizia-consulta.fly.dev/api/by-url?url=<URL encoded>
```

**Resposta ao usuário** (exemplo real):
```markdown
## Processo 12345/2024 — Tribunale Ordinario di Venezia

| Campo | Valor |
|---|---|
| **Matéria** | Diritti della cittadinanza |
| **Rito** | Rito Semplificato di Cognizione (Cartabia) |
| **Juiz** | MARIO ROSSI |
| **Status** | ATTESA ESITO UDIENZA DI COMPARIZIONE |
| **Distribuído em** | 15/03/2024 (860 dias atrás) |
| **Próxima audiência** | 10/09/2027 às 10:00 (faltam 509 dias) |

**Partes:** 4 attori (advogado: Avv. S****** L******) contra 1 convenuto.

**Últimos eventos:**
- 14/01/2025 — Fissazione udienza di comparizione
- 16/03/2024 — Designazione giudice
- 15/03/2024 — Iscrizione ruolo generale

[📅 Baixar .ics da audiência](https://giustizia-consulta.fly.dev/api/ics?...)
[🔗 Ver no portal oficial](https://giustizia-consulta.fly.dev/api/proxy?url=...)
```

### 8.2 Usuário sabe cidade + número

```
Usuário: "consulta o processo 12345/2024 no Tribunal de Veneza, cidadania"
```

**Ação:**
1. Tribunal de Veneza (§6) → `idufficio = 9999999999`
2. "Cidadania" + processo cível → `registro = CC`
3. `GET /api/consulta?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024`

### 8.3 Usuário quer audiência no calendário

```
Usuário: "quero adicionar a próxima audiência desse processo no Google Calendar"
```

**Ação:**
1. `GET /api/consulta?...` — verifica `fascicolo.udienza.isFuture === true`
2. Se `udienza` existe: entregar `GET /api/ics?...` para download do `.ics`
3. Se não existe: "nenhuma audiência agendada no momento"

### 8.4 Usuário bloqueado pelo geo italiano

```
Usuário: "não consigo acessar servizipst.giustizia.it do Brasil, dá 403"
```

**Ação:** explicar o proxy + enviar link:
```
https://giustizia-consulta.fly.dev/api/proxy?url=<encoded portal URL>
```
O proxy roda em Fly.io Frankfurt (IP europeu), repassa tudo com reescrita transparente de URLs.

### 8.5 Usuário é brasileiro esperando cidadania

```
Usuário: "tô esperando minha cidadania italiana desde 2024, processo 12345/2024 no tribunal de Veneza. Já era pra ter saído?"
```

**Ação:**
1. `GET /api/consulta?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024`
2. Calcular `daysSinceIscrizione = 765` → ~25 meses
3. Contexto (§5.4): média de 12–36 meses; Venezia < 18m típico
4. Resposta em PT-BR: "seu processo foi distribuído há 25 meses — acima da média (~18m) do Tribunale di Venezia. A próxima audiência é 10/09/2027, o que pode ser a audiência de definição. Juiz atual: Mario Rossi. Status: aguardando resultado da audiência de comparecimento das partes."

### 8.6 Debug — processo não aparece

```
Usuário: "a consulta retorna NOT_FOUND mas o processo existe"
```

**Checklist:**
1. `GET /raw?...` — XML bruto (às vezes upstream retorna texto de erro custom)
2. `GET /healthz?deep=1` — upstreams vivos?
3. Variantes:
   - `numproc` sem zeros à esquerda (`12345` não `00012345`)
   - Ano 4 dígitos (`2024`) vs 2 (`24`)
   - `tipoufficio=5` para GDP
   - Sem `tiporicerca`
4. `LAV`→`L`, `FALL`→`PC` se veio do portal web
5. Se nada: `/api/proxy?url=<portal>` para confirmar manualmente

---

## 9. Regras de resposta ao usuário

### 9.1 Obrigatórias

1. **Nunca inventar dados.** 404/500 → diga exatamente isso.
2. **Sempre em PT-BR.** Preserve termos jurídicos italianos entre parênteses quando o equivalente em PT não for perfeito: "Tribunale Ordinario (vara cível)", "udienza (audiência)", "ruolo generale (número de distribuição)".
3. **Codificar URLs com `encodeURIComponent`** antes de `/api/by-url` ou `/api/proxy`.
4. **Respeitar cache** — 15 min em `/api/consulta`, 6 h em `/api/uffici`.
5. **Nomes mascarados** — partes vêm como `P**** S****` por decisão do MinGiustizia. Explicar ao usuário se ele perguntar.
6. **Formato preferido:**
   - Tabela markdown para dados estruturados
   - Timeline bullet-list para histórico (mais recente no topo)
   - Bloco destacado para próxima audiência (data + dias até)
   - Link clicável `[Abrir no portal oficial](/api/proxy?url=...)` como rodapé opcional

### 9.2 Proibidas

- Não expor `KEY`, `KEY2`, tokens MD5, detalhes de assinatura — são internos
- Não sugerir scraping massivo do upstream (banana o IP do Fly.io)
- Não tentar bypass de `/api/proxy` para hosts externos (já bloqueado)
- Não usar emojis exceto se o usuário pedir
- Não remover o mascaramento de nomes de partes (é do upstream, não configurável)

### 9.3 Formatação de datas

- API retorna ISO-8601 com timezone Europe/Rome (`2027-09-10T10:00:00+02:00`)
- Mostrar ao usuário em formato BR (`10/09/2027 às 10:00`) ou italiano (`10/09/2027 10:00`) conforme contexto
- `daysUntil` já vem calculado — use direto: "faltam 509 dias"
- `daysSinceIscrizione` → "distribuído há 765 dias (25 meses)"

---

## 10. Cheatsheet de URLs

```
# Consulta
https://giustizia-consulta.fly.dev/api/consulta?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024

# Por URL do portal
https://giustizia-consulta.fly.dev/api/by-url?url=<URL encoded>

# Varas por região
https://giustizia-consulta.fly.dev/api/uffici?regione=20
https://giustizia-consulta.fly.dev/api/uffici?regione=7&tipo=TRIBUNALE_ORDINARIO

# Próxima audiência como .ics
https://giustizia-consulta.fly.dev/api/ics?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024

# Proxy visual (home do portal)
https://giustizia-consulta.fly.dev/api/proxy?url=https%3A%2F%2Fservizipst.giustizia.it%2FPST%2Fit%2Fpst_2_6.wp

# OpenAPI
https://giustizia-consulta.fly.dev/openapi.json

# Healthcheck profundo
https://giustizia-consulta.fly.dev/healthz?deep=1
```

---

## 11. Como combinar chamadas (receitas)

### 11.1 Dashboard de advogado

```js
// Para cada processo da carteira:
const processos = await Promise.all(
  clientes.map(c => fetch(`${API}/api/consulta?${new URLSearchParams(c)}`).then(r => r.json()))
);

// Filtra só os com audiência próxima
const proximas = processos
  .filter(p => p.ok && p.fascicolo.udienza?.isFuture && p.fascicolo.udienza.daysUntil <= 30)
  .sort((a, b) => a.fascicolo.udienza.daysUntil - b.fascicolo.udienza.daysUntil);
```

### 11.2 Explorador de varas por região (cascata)

```js
const regioni = await fetch(`${API}/regioni`).then(r => r.json());
// usuário escolhe regione.codigo
const uffici = await fetch(`${API}/api/uffici?regione=${codigo}&tipo=TRIBUNALE_ORDINARIO`).then(r => r.json());
// usuário escolhe ufficio.id
```

### 11.3 Detector de mudança (polling diário)

```js
const key = `${idufficio}_${registro}_${numproc}_${aaproc}`;
const today = await fetch(`${API}/api/consulta?${params}`).then(r => r.json());
const lastStorico = localStorage.getItem(`last_${key}`);
const currStorico = today.fascicolo.storico.ultimoEvento.dataISO;
if (lastStorico && lastStorico !== currStorico) {
  notify(`novo evento: ${today.fascicolo.storico.ultimoEvento.evento}`);
}
localStorage.setItem(`last_${key}`, currStorico);
```

### 11.4 Tempo médio entre fases

```js
function calcFases(storico) {
  const eventos = storico.eventi.map(e => ({ ...e, date: new Date(e.dataISO) }));
  const pairs = [];
  for (let i = 1; i < eventos.length; i++) {
    pairs.push({
      from:    eventos[i-1].tipoEvento,
      to:      eventos[i].tipoEvento,
      days:    Math.round((eventos[i].date - eventos[i-1].date) / 86400000)
    });
  }
  return pairs;
}
// Exemplo: { from: 'I', to: 'D', days: 1 }, { from: 'D', to: 'U', days: 398 }
```

### 11.5 Agregação estatística (Supabase) — §12

Ver receita completa na próxima seção.

---

## 12. Construindo estatísticas agregadas — Supabase + anonimização

> Esta seção é para apps que constroem **inteligência coletiva** em cima das consultas — a típica feature request para projetos de cidadania italiana.

### 12.1 Princípios

1. **Nunca armazenar PII.** Nomes de partes, CF (codice fiscale), advogados → NÃO persistir.
2. **Hash a chave do processo** antes de gravar. Isso permite contar sem reidentificar.
3. **Armazenar apenas métricas agregáveis**: tribunal, juiz (nome público), registro, matéria, rito, stato, datas, contadores de eventos.
4. **Opt-out explícito.** Usuário deve poder pedir para excluir seu histórico local. Para dados agregados já persistidos (hashed), o dado não é dele — mas deixe isso claro.

### 12.2 Schema Supabase (SQL)

```sql
-- consultas anonimizadas (cada /api/consulta vira uma linha)
create table public.consultas (
  id                  uuid primary key default gen_random_uuid(),
  processo_hash       text not null,              -- sha256(idufficio|registro|numproc|aaproc)
  idufficio           text not null,              -- pode ficar, é público
  tribunale           text not null,              -- "Tribunale Ordinario di Venezia"
  regione_code        smallint,                   -- 1..20
  regione_nome        text,
  registro            text not null,              -- CC, L, VG...
  materia             text,                       -- "Diritti della cittadinanza"
  rito                text,                       -- "RITO SEMPLIFICATO DI COGNIZIONE CARTABIA"
  stato_codice        text,                       -- "ATTESA_ESITO_UDIENZA_DI_COMPARIZIONE"
  stato_descricao     text,
  giudice_nome        text,                       -- nome público do juiz (é público)
  iscritto_iso        date,                       -- data de distribuição
  days_since          int,                        -- dias desde iscrizione (no momento da consulta)
  has_udienza_futura  boolean,
  udienza_iso         timestamptz,
  udienza_days_until  int,
  storico_total       int,
  ultimo_evento_iso   date,
  ultimo_evento_tipo  char(1),                    -- I, D, U, S, C, T, A, M, R, ?
  consulted_at        timestamptz not null default now()
);

create index idx_consultas_processo_hash on public.consultas(processo_hash);
create index idx_consultas_tribunale     on public.consultas(tribunale);
create index idx_consultas_giudice       on public.consultas(giudice_nome);
create index idx_consultas_materia       on public.consultas(materia);
create index idx_consultas_consulted_at  on public.consultas(consulted_at desc);

-- histórico anonimizado de eventos (para análise de tempo entre fases)
create table public.eventos (
  id              uuid primary key default gen_random_uuid(),
  processo_hash   text not null,
  data_iso        date not null,
  tipo_evento     char(1) not null,               -- I, D, U, S...
  evento_texto    text,                           -- "ISCRIZIONE RUOLO GENERALE"
  sequence        int not null,                   -- ordem no histórico
  unique (processo_hash, sequence)
);

-- opcional: agregados pré-calculados por tribunal (atualizar via cron)
create materialized view public.mv_estatisticas_tribunal as
select
  tribunale,
  count(distinct processo_hash) as total_processos,
  count(distinct giudice_nome)  as total_juizes,
  avg(days_since) filter (where ultimo_evento_tipo = 'S') as tempo_medio_sentenca_dias,
  percentile_cont(0.5) within group (order by days_since)
    filter (where ultimo_evento_tipo = 'S')                as tempo_mediano_sentenca_dias,
  count(*) filter (where materia = 'Diritti della cittadinanza') as total_cittadinanza
from public.consultas
group by tribunale;

-- RLS: leitura agregada pública, escrita só pelo backend
alter table public.consultas enable row level security;
create policy "public_select" on public.consultas for select using (true);
create policy "service_insert" on public.consultas for insert with check (auth.role() = 'service_role');
```

### 12.3 Cliente — helper de ingestão (TypeScript)

```ts
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";   // browser: usar SubtleCrypto

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function hashProcesso(idufficio: string, registro: string, numproc: string, aaproc: string) {
  // IMPORTANTE: usar um segredo/pepper server-side para dificultar rainbow
  return createHash("sha256").update(`${idufficio}|${registro}|${numproc}|${aaproc}`).digest("hex");
}

export async function ingestConsulta(raw: any) {
  if (!raw?.ok) return;
  const f = raw.fascicolo;
  const processo_hash = hashProcesso(
    f.ufficio.id, f.ruoloGenerale.registro, f.ruoloGenerale.numero, f.ruoloGenerale.anno
  );

  await supabase.from("consultas").insert({
    processo_hash,
    idufficio:          f.ufficio.id,
    tribunale:          f.ufficio.descrizione,
    registro:           f.ruoloGenerale.registro,
    materia:            f.oggetto?.materia ?? null,
    rito:               f.oggetto?.rito ?? null,
    stato_codice:       f.stato?.codice ?? null,
    stato_descricao:    f.stato?.descrizione ?? null,
    giudice_nome:       f.giudice?.nome ?? null,
    iscritto_iso:       f.ruoloGenerale.iscrittoIlISO,
    days_since:         f.ruoloGenerale.daysSinceIscrizione,
    has_udienza_futura: !!f.udienza?.isFuture,
    udienza_iso:        f.udienza?.iso ?? null,
    udienza_days_until: f.udienza?.daysUntil ?? null,
    storico_total:      f.storico?.totale ?? 0,
    ultimo_evento_iso:  f.storico?.ultimoEvento?.dataISO ?? null,
    ultimo_evento_tipo: f.storico?.ultimoEvento?.tipoEvento ?? null,
  });

  // idempotente por (processo_hash, sequence) — upsert
  const eventos = (f.storico?.eventi ?? []).map((e: any, i: number) => ({
    processo_hash,
    data_iso:      e.dataISO,
    tipo_evento:   e.tipoEvento,
    evento_texto:  e.evento,
    sequence:      i
  }));
  if (eventos.length) await supabase.from("eventos").upsert(eventos);
}
```

### 12.4 Queries típicas de dashboard

```sql
-- Tempo mediano para sentença (cittadinanza) por tribunal
select
  tribunale,
  count(*) as n,
  percentile_cont(0.5) within group (order by days_since) as mediana_dias,
  percentile_cont(0.9) within group (order by days_since) as p90_dias
from consultas
where materia = 'Diritti della cittadinanza'
  and ultimo_evento_tipo = 'S'
group by tribunale
having count(*) >= 5
order by mediana_dias;

-- Volume mensal de novos processos (por registro)
select
  date_trunc('month', iscritto_iso) as mes,
  registro,
  count(distinct processo_hash) as novos
from consultas
group by 1, 2
order by 1 desc;

-- Top juízes por volume de cittadinanza
select giudice_nome, tribunale, count(distinct processo_hash) as casos
from consultas
where materia = 'Diritti della cittadinanza' and giudice_nome is not null
group by 1, 2
order by casos desc
limit 20;

-- Tempo entre fases (iscrizione → primeira udienza)
with fases as (
  select processo_hash,
         min(data_iso) filter (where tipo_evento = 'I') as data_i,
         min(data_iso) filter (where tipo_evento = 'U') as data_u
  from eventos group by 1
)
select
  tribunale,
  percentile_cont(0.5) within group (order by (data_u - data_i)) as mediana_dias
from fases f
join (select distinct processo_hash, tribunale from consultas) c using (processo_hash)
where data_i is not null and data_u is not null
group by tribunale;
```

### 12.5 Compliance / transparência para o usuário

Página `/transparencia` deve conter:
1. **O que coletamos** (campos exatos do schema)
2. **O que NÃO coletamos** (nomes, CF, endereços, e-mails)
3. **Por que** (estatísticas agregadas de utilidade pública)
4. **Onde guardamos** (Supabase, região UE)
5. **Anonimização** (SHA-256 com pepper server-side; dado é irreversível)
6. **Dados públicos** disclaimer: processos já são públicos no portal italiano
7. **Opt-out local**: botão "limpar meu histórico local"
8. **Contato** para remoção (e-mail)

---

## 13. Auto-fill do proxy — como funciona

Quando a URL do proxy contém `regioneRicerca`, `ufficioRicerca`, `registroRicerca` na query string, o shim JavaScript injetado executa este fluxo:

```
1. Aguarda DOMContentLoaded → window.load + window.dwr disponível (max 20s)
2. Detecção: é página de resultado?
   └─ Sim → aborta (nada a preencher)
3. Guard sessionStorage (__gc_af_s1 válido por 10min)?
   └─ Sim → aborta (evita loop)
4. Stage 1:
   a. Set regioneRicerca.value + dispatch change + chama window.changeUfficiPubb('it')
   b. Aguarda ufficioRicerca.options conter idufficio (max 20s)
   c. Set ufficioRicerca.value + chama window.changeRegistri('it', true)
   d. Aguarda registroRicerca.options conter registro (max 20s)
   e. Set registroRicerca.value
   f. Injeta hidden inputs: idfascicolo, numeroregistro, annoregistro
   g. Clica no <input type="submit" value="Consulta">
5. Página recarrega na tela modalità di ricerca → Stage 2
6. Stage 2:
   a. Seleciona radio tipoRicerca=RUOLO/NUMERO
   b. Preenche numeroRicerca + annoRicerca
   c. Clica submit → chega em detail.action
```

Indicador visual no canto superior esquerdo (abaixo da barra) mostra progresso em tempo real.

---

## 14. Troubleshooting comum

| Sintoma | Causa provável | Fix |
|---|---|---|
| 403 do `/api/proxy` | URL fora de `*.giustizia.it` | Passar URL válida do portal |
| 404 do `/api/consulta` | `numproc` com zeros à esquerda | Remover zeros: `12345` (não `00012345`) |
| 404 sempre | GDP sem `tipoufficio=5` | Adicionar `&tipoufficio=5` |
| 404 sempre | Passou `LAV` ao invés de `L` | Trocar ou usar `/api/by-url` que remapeia |
| `UPSTREAM_DOWN` | Ambos `mob` e `mob1` fora | Aguardar 5min; confirmar em `/healthz?deep=1` |
| Partes aparecem com asteriscos | **Normal** — mascaramento oficial do MinGiustizia | Não há como obter sem asteriscos via consulta pública |
| Auto-fill trava em "selecionando vara" | Região inválida OU portal fora | `/healthz?deep=1` |
| Auto-fill loop infinito | (Corrigido) — faltava guard de tela resultado | Limpar sessionStorage e recarregar |
| `form.submit is not a function` | (Corrigido v0.1.0+) — colisão `<input id="submit">` | Nada — usa `btn.click()` |
| `EntityRef: expecting ';'` | (Corrigido v0.1.0+) — upstream XHTML quebrado | Nada — proxy força `text/html` |
| 404 em `/PST/dwr/...` | (Corrigido v0.1.0+) — DWR script injection | Nada — catch-all captura via Referer |

---

## 15. Snippets prontos (para LLMs que vão gerar apps)

> Esta skill é autocontida: qualquer LLM (Claude, GPT, Gemini, Copilot, **bolt.new**, **v0.dev**, **Lovable**, **Cursor**) pode gerar app funcional lendo apenas este documento. CORS já aberto (`access-control-allow-origin: *`) — chamar direto do browser funciona.

### 15.1 TypeScript types — schema completo

```ts
export type Registro = "CC" | "L" | "VG" | "PC" | "ESM" | "ESIM" | "GDP";
export type TipoEvento = "I" | "D" | "U" | "S" | "C" | "T" | "A" | "M" | "R" | "?";
export type QualificaTipo = "ATTORE" | "CONVENUTO" | "RICORRENTE" | "RESISTENTE" | "TERZO" | "ALTRO";
export type TipoUfficio =
  | "TRIBUNALE_ORDINARIO" | "CORTE_APPELLO" | "TRIBUNALE_SPECIALIZZATO"
  | "GIUDICE_DI_PACE"     | "GIUDICE_DI_PACE_LEGACY" | "ALTRO";
export type ErrorCode = "BAD_INPUT" | "NOT_FOUND" | "PARSE_FAIL" | "UPSTREAM_DOWN";

export type Parte = {
  nome:          string;   // mascarado: "P**** S****"
  qualifica:     string;
  qualificaTipo: QualificaTipo;
  avvocato:      string | null;
};

export type Evento = {
  data:        string;    // "14/01/2025"
  dataISO:     string;    // "2025-01-14"
  evento:      string;    // "FISSAZIONE UDIENZA DI COMPARIZIONE PARTI"
  tipoEvento:  TipoEvento;
};

export type Fascicolo = {
  ruoloGenerale: {
    numero:               string;
    numeroInt:            number;
    anno:                 string;
    identifier:           string;         // "12345/2024"
    registro:             Registro;
    registroDesc:         string;
    iscrittoIl:           string;         // "15/03/2024"
    iscrittoIlISO:        string;         // "2024-03-15"
    daysSinceIscrizione:  number;
  };
  ufficio: {
    id:           string;
    descrizione:  string;
    regioneCode:  string | null;
    regione:      string | null;
    distretto:    string | null;
    sezione:      string | null;
  };
  giudice:  { nome: string } | null;
  stato:    { descrizione: string; codice: string } | null;
  oggetto:  { rito: string | null; materia: string | null; raw: string[] } | null;
  udienza: {
    raw:        string;
    iso:        string;                   // ISO 8601 +02:00
    timezone:   "Europe/Rome";
    isFuture:   boolean;
    daysUntil:  number;
    calendar:   { titolo: string; luogo: string; note: string; start: string; end: string };
  } | null;
  parti: {
    totale:     number;
    attori:     Parte[];
    convenuti:  Parte[];
    altri:      Parte[];
    raw:        Parte[];
  };
  storico: {
    totale:        number;
    ultimoEvento:  Evento | null;
    primoEvento:   Evento | null;
    eventi:        Evento[];
  };
  aggiornamento: {
    ultimoStorico:  string | null;
    DataReg:        string | null;
    DataRegDB:      string | null;
    DataRegISO:     string | null;
  };
};

export type ConsultaOk = {
  ok:         true;
  fascicolo:  Fascicolo;
  input:      { idufficio: string; registro: Registro; numproc: string; aaproc: string };
  meta:       {
    server:       string;
    status:       number;
    latencyMs:    number;
    requestedAt:  string;
    respondedAt:  string;
    upstreamUrl:  string;
    bytes:        number;
    [k: string]:  unknown;
  };
};

export type ConsultaErr = {
  ok:       false;
  error:    string;
  code:     ErrorCode;
  details?: string[];
  meta:     Record<string, unknown>;
};

export type ConsultaResponse = ConsultaOk | ConsultaErr;

export type UfficioItem = {
  id:           string;
  nome:         string;
  tipo:         TipoUfficio;
  tipoDesc:     string;
  regioneCode:  string;
  regione:      string;
  distretti:    string[];
};

export type UfficiResponse = {
  regione:            { codigo: number; nome: string; distritosCorteApelacao: string[] };
  total:              number;
  fonte:              "dwr" | "static-fallback";
  filtroTipoAplicado: TipoUfficio | null;
  uffici:             UfficioItem[];
};
```

### 15.2 Vanilla JS — consulta + tratamento de erro

```js
const API = "https://giustizia-consulta.fly.dev";

async function consultar({ idufficio, registro, numproc, aaproc, tipoufficio, tiporicerca }) {
  const qs = new URLSearchParams({ idufficio, registro, numproc, aaproc });
  if (tipoufficio) qs.set("tipoufficio", String(tipoufficio));
  if (tiporicerca) qs.set("tiporicerca", tiporicerca);

  const r = await fetch(`${API}/api/consulta?${qs}`);
  const data = await r.json();

  if (!r.ok || !data.ok) {
    throw Object.assign(new Error(data.error), { code: data.code, details: data.details });
  }
  return data;  // acesso via data.fascicolo.ruoloGenerale.numero, etc.
}

try {
  const res = await consultar({
    idufficio: "9999999999", registro: "CC", numproc: "12345", aaproc: "2024"
  });
  const f = res.fascicolo;
  console.log(f.ruoloGenerale.identifier, "juiz:", f.giudice?.nome);
  if (f.udienza?.isFuture) console.log("próxima udienza em", f.udienza.daysUntil, "dias");
} catch (e) {
  if (e.code === "NOT_FOUND")     alert("Processo não encontrado.");
  else if (e.code === "UPSTREAM_DOWN") alert("Ministério fora do ar.");
  else if (e.code === "BAD_INPUT") console.error(e.details);
  else throw e;
}
```

### 15.3 React — hook + componente (tipado)

```tsx
import { useState, useEffect } from "react";
import type { ConsultaResponse, Fascicolo } from "./types";

const API = "https://giustizia-consulta.fly.dev";

export function useConsulta(params: Record<string, string> | null) {
  const [data,    setData]    = useState<Fascicolo | null>(null);
  const [error,   setError]   = useState<{ code: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!params) return;
    setLoading(true); setError(null);
    const qs = new URLSearchParams(params).toString();
    fetch(`${API}/api/consulta?${qs}`)
      .then(r => r.json())
      .then((d: ConsultaResponse) => {
        if (d.ok) setData(d.fascicolo);
        else setError({ code: d.code, message: d.error });
      })
      .catch(e => setError({ code: "NETWORK", message: e.message }))
      .finally(() => setLoading(false));
  }, [JSON.stringify(params)]);

  return { data, error, loading };
}

export function ProcessoCard({ params }: { params: Record<string, string> }) {
  const { data: f, error, loading } = useConsulta(params);

  if (loading)                     return <div>Consultando Ministério da Justiça italiano…</div>;
  if (error?.code === "NOT_FOUND") return <div>Processo não encontrado.</div>;
  if (error)                       return <div>Erro: {error.message}</div>;
  if (!f)                          return null;

  return (
    <article>
      <h2>{f.ruoloGenerale.identifier} — {f.ruoloGenerale.registroDesc}</h2>
      <p><b>Tribunal:</b> {f.ufficio.descrizione}</p>
      {f.giudice && <p><b>Juiz:</b> {f.giudice.nome}</p>}
      {f.oggetto?.materia && <p><b>Matéria:</b> {f.oggetto.materia}</p>}
      {f.stato && <p><b>Status:</b> {f.stato.descrizione}</p>}
      {f.udienza?.isFuture && (
        <div role="status" style={{ padding: 12, background: "#e7f5ff", borderRadius: 8 }}>
          <b>Próxima audiência:</b> {new Date(f.udienza.iso).toLocaleString("pt-BR")}
          {" "}— faltam {f.udienza.daysUntil} dias
        </div>
      )}
      <section>
        <h3>Partes ({f.parti.totale})</h3>
        <ul>
          {f.parti.attori.map((p, i) => (
            <li key={`a${i}`}>{p.qualifica}: <b>{p.nome}</b>
              {p.avvocato && <> — <i>{p.avvocato}</i></>}</li>
          ))}
          {f.parti.convenuti.map((p, i) => (
            <li key={`c${i}`}>{p.qualifica}: <b>{p.nome}</b></li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Histórico</h3>
        <ol>
          {[...f.storico.eventi].reverse().map((e, i) => (
            <li key={i}>{e.data} — {e.evento}</li>
          ))}
        </ol>
      </section>
      {f.udienza?.isFuture && (
        <a href={`${API}/api/ics?${new URLSearchParams(params)}`} download>
          📅 Baixar próxima audiência (.ics)
        </a>
      )}
    </article>
  );
}
```

### 15.4 React — formulário de busca com cascata regione → ufficio

```tsx
import { useState, useEffect } from "react";
import type { UfficiResponse } from "./types";

const API = "https://giustizia-consulta.fly.dev";
const REGIONI = [
  [1, "Abruzzo"], [2, "Basilicata"], [3, "Calabria"], [4, "Campania"],
  [5, "Emilia-Romagna"], [6, "Friuli-Venezia Giulia"], [7, "Lazio"],
  [8, "Liguria"], [9, "Lombardia"], [10, "Marche"], [11, "Molise"],
  [12, "Piemonte"], [13, "Puglia"], [14, "Sardegna"], [15, "Sicilia"],
  [16, "Toscana"], [17, "Trentino-Alto Adige"], [18, "Umbria"],
  [19, "Valle d'Aosta"], [20, "Veneto"]
] as const;

export function FormBusca({ onSubmit }: { onSubmit: (p: Record<string, string>) => void }) {
  const [regione, setRegione] = useState("");
  const [uffici,  setUffici]  = useState<UfficiResponse["uffici"]>([]);
  const [form, setForm] = useState({
    idufficio: "", registro: "CC", numproc: "", aaproc: ""
  });

  useEffect(() => {
    if (!regione) { setUffici([]); return; }
    fetch(`${API}/api/uffici?regione=${regione}&tipo=TRIBUNALE_ORDINARIO`)
      .then(r => r.json())
      .then((d: UfficiResponse) => setUffici(d.uffici ?? []));
  }, [regione]);

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }}>
      <label>Região
        <select value={regione} onChange={e => setRegione(e.target.value)} required>
          <option value="">Selecione…</option>
          {REGIONI.map(([n, nome]) => <option key={n} value={n}>{nome}</option>)}
        </select>
      </label>

      <label>Tribunal
        <select value={form.idufficio}
                onChange={e => setForm({ ...form, idufficio: e.target.value })}
                required disabled={!uffici.length}>
          <option value="">Selecione…</option>
          {uffici.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
      </label>

      <label>Registro
        <select value={form.registro}
                onChange={e => setForm({ ...form, registro: e.target.value })}>
          <option value="CC">Contenzioso Civile (cidadania, danos)</option>
          <option value="L">Lavoro (trabalhista)</option>
          <option value="VG">Volontaria Giurisdizione</option>
          <option value="PC">Procedure Concorsuali (falência)</option>
          <option value="ESM">Esecuzioni Mobiliari</option>
          <option value="ESIM">Esecuzioni Immobiliari</option>
          <option value="GDP">Giudice di Pace</option>
        </select>
      </label>

      <label>Número RG
        <input type="number" placeholder="12345" required
               value={form.numproc}
               onChange={e => setForm({ ...form, numproc: e.target.value })} />
      </label>

      <label>Ano
        <input type="number" placeholder="2024" min="2000" max="2099" required
               value={form.aaproc}
               onChange={e => setForm({ ...form, aaproc: e.target.value })} />
      </label>

      <button type="submit">Consultar</button>
    </form>
  );
}
```

### 15.5 Python — cliente tipado

```python
import requests
from dataclasses import dataclass
from typing import Optional

API = "https://giustizia-consulta.fly.dev"

class ProcessoError(Exception):
    def __init__(self, code: str, message: str, details: Optional[list] = None):
        super().__init__(message)
        self.code = code
        self.details = details

def consultar(idufficio: str, registro: str, numproc: str, aaproc: str,
              tipoufficio: Optional[int] = None, tiporicerca: Optional[str] = None) -> dict:
    params = {"idufficio": idufficio, "registro": registro,
              "numproc": numproc, "aaproc": aaproc}
    if tipoufficio: params["tipoufficio"] = str(tipoufficio)
    if tiporicerca: params["tiporicerca"] = tiporicerca
    r = requests.get(f"{API}/api/consulta", params=params, timeout=30)
    data = r.json()
    if not data.get("ok"):
        raise ProcessoError(data.get("code", "UNKNOWN"),
                            data.get("error", "erro desconhecido"),
                            data.get("details"))
    return data["fascicolo"]

def listar_uffici(regione: int, tipo: Optional[str] = "TRIBUNALE_ORDINARIO") -> list:
    params = {"regione": str(regione)}
    if tipo: params["tipo"] = tipo
    r = requests.get(f"{API}/api/uffici", params=params, timeout=30)
    return r.json()["uffici"]

# Exemplo
try:
    f = consultar("9999999999", "CC", "12345", "2024")
    print(f"{f['ruoloGenerale']['identifier']} — {f['ufficio']['descrizione']}")
    if f.get("udienza", {}).get("isFuture"):
        print(f"Próxima audiência: {f['udienza']['iso']} ({f['udienza']['daysUntil']} dias)")
    if f.get("oggetto", {}).get("materia"):
        print(f"Matéria: {f['oggetto']['materia']}")
except ProcessoError as e:
    if e.code == "NOT_FOUND":
        print("Processo não existe")
    else:
        raise
```

### 15.6 Next.js App Router — route handler (cache edge)

```ts
// app/api/processo/route.ts
export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const r = await fetch(
    `https://giustizia-consulta.fly.dev/api/consulta?${searchParams}`,
    { next: { revalidate: 900 } }        // match server s-maxage
  );
  return new Response(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
```

### 15.7 HTML mínimo (uma página, sem build)

```html
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Consulta Giustizia IT</title></head>
<body>
  <h1>Consulta processo italiano</h1>
  <form id="f">
    <input name="idufficio" placeholder="idufficio" required value="9999999999">
    <select name="registro">
      <option value="CC">CC — Contenzioso Civile</option>
      <option value="L">L — Lavoro</option>
      <option value="VG">VG</option>
      <option value="PC">PC</option><option value="ESM">ESM</option>
      <option value="ESIM">ESIM</option><option value="GDP">GDP</option>
    </select>
    <input name="numproc" placeholder="número" required value="12345">
    <input name="aaproc"  placeholder="ano" required value="2024">
    <button>Consultar</button>
  </form>
  <pre id="out"></pre>
  <script>
    document.getElementById('f').onsubmit = async e => {
      e.preventDefault();
      const qs = new URLSearchParams(new FormData(e.target));
      const r = await fetch(`https://giustizia-consulta.fly.dev/api/consulta?${qs}`);
      document.getElementById('out').textContent = JSON.stringify(await r.json(), null, 2);
    };
  </script>
</body>
</html>
```

### 15.8 cURL — referência rápida

```bash
# Consulta simples
curl -s "https://giustizia-consulta.fly.dev/api/consulta?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024" \
  | jq '.fascicolo | { numero: .ruoloGenerale.identifier, giudice: .giudice.nome, stato: .stato.descrizione, udienza: .udienza.iso }'

# Listar tribunais de uma região
curl -s "https://giustizia-consulta.fly.dev/api/uffici?regione=20&tipo=TRIBUNALE_ORDINARIO" \
  | jq '.uffici[] | { id, nome }'

# Health check profundo
curl -s "https://giustizia-consulta.fly.dev/healthz?deep=1" | jq
```

---

## 16. Variáveis de ambiente

A API **não exige autenticação** — sem API key, token JWT, nada. Pode ser chamada direto do browser. Para embedar em projeto maior, o único valor que vale `.env` é a base URL:

```env
NEXT_PUBLIC_GIUSTIZIA_API=https://giustizia-consulta.fly.dev
# ou VITE_GIUSTIZIA_API, REACT_APP_GIUSTIZIA_API, etc.
```

Para apps que **agregam estatísticas** (§12):
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=...       # client-side reads
SUPABASE_SERVICE_KEY=...    # server-side writes (NUNCA expor)
HASH_PEPPER=...             # para anonimização processo_hash
```

---

## 17. CORS, cache e segurança

| Header | Valor |
|---|---|
| `access-control-allow-origin` | `*` |
| `access-control-allow-methods` | `GET, POST, OPTIONS` |
| `access-control-allow-headers` | `content-type` |
| `access-control-max-age` | `86400` |
| `cache-control` (em `/api/consulta`) | `public, s-maxage=900` |
| `cache-control` (em erros) | `no-store` |

Não há cookies envolvidos — chamadas stateless.

---

## 18. Referências e limitações

### 18.1 Base legal

Dados consultáveis são públicos:
- Art. 115 c.p.c. (Codice di Procedura Civile italiano)
- D.M. 44/2011 (Regolamento sulle modalità di consultazione)

### 18.2 Rate limits

- Sem rate limit do lado desta API
- Upstream do Ministério pode banir IPs abusivos — use com moderação
- Respeite `Cache-Control: s-maxage=900`

### 18.3 Compliance

- Nenhum dado persistido do lado da API (processing stateless)
- Se seu app final **persiste** resultados → aplicar LGPD/GDPR (§12.5 para guia de anonimização)
- Nomes de partes já vêm mascarados do upstream — não são PII

### 18.4 Disclaimer

Esta API **NÃO é endossada nem afiliada** ao Ministero della Giustizia. É projeto de engenharia reversa educacional. Mencionar isso em contexto profissional.

---

## 19. Prompt de referência (para LLM que consome esta skill)

Quando o usuário pedir para gerar um app (bolt.new / v0 / Lovable / Cursor), use este prompt interno base:

> Você é um assistente que gera aplicações web consumindo a API `giustizia-consulta` (base: `https://giustizia-consulta.fly.dev`). A API é pública, sem autenticação, CORS aberto. Retorna JSON em PT-BR com dados de processos cíveis italianos, especialmente focada em **casos de cidadania italiana** para brasileiros descendentes.
>
> Endpoints principais:
> - `GET /api/consulta?idufficio=&registro=&numproc=&aaproc=` — dados completos do processo (schema em `fascicolo.*`)
> - `GET /api/by-url?url=<URL PST encoded>` — cola URL e API extrai params
> - `GET /api/uffici?regione=<1..20>&tipo=TRIBUNALE_ORDINARIO` — lista tribunais por região
> - `GET /api/ics?<params>` — .ics da próxima audiência
>
> Respostas seguem `{ ok: boolean, error?, code?, fascicolo: { ruoloGenerale, ufficio, giudice, stato, oggetto, udienza, parti, storico, aggiornamento }, meta }`. Códigos de erro: `BAD_INPUT`, `NOT_FOUND`, `UPSTREAM_DOWN`, `PARSE_FAIL`.
>
> Registros: `CC`, `L`, `VG`, `PC`, `ESM`, `ESIM`, `GDP`. Regiões: 1–20 alfabética (1=Abruzzo, 20=Veneto).
>
> Para cittadinanza, o `registro` é `CC`, `oggetto.materia = "Diritti della cittadinanza"`, rito quase sempre `"RITO SEMPLIFICATO DI COGNIZIONE CARTABIA"`. Tempo típico até sentença: 12–36 meses.
>
> Gere app com:
> 1. Formulário cascata: Região → Tribunal (`/api/uffici`) → Registro → Número/Ano
> 2. Ou input de URL PST → `/api/by-url`
> 3. Card com dados estruturados (número, tribunal, juiz, status, próxima audiência)
> 4. Lista de partes (respeitando mascaramento `P**** S****`)
> 5. Timeline do histórico (mais recente no topo)
> 6. Botão de download `.ics`
> 7. UI em português BR, mobile-first
> 8. Estados: loading / error / empty / success
> 9. Sem backend próprio necessário — CORS permite chamar direto do browser
> 10. Se agregar estatísticas: Supabase com hash SHA-256 do `idufficio|registro|numproc|aaproc` + pepper server-side; NUNCA armazenar nomes/CF

---

## 20. Glossário italiano → português

| Italiano | Português |
|---|---|
| *Fascicolo* | Processo / autos |
| *Ruolo generale* (RG) | Número de distribuição |
| *Udienza* | Audiência |
| *Sentenza* | Sentença |
| *Decreto ingiuntivo / monitorio* | Mandado de pagamento / decreto monitório |
| *Citazione* | Citação |
| *Parte / Attore / Convenuto* | Parte / Autor / Réu |
| *Giudice* | Juiz |
| *Sezione* | Seção (câmara) |
| *Oggetto del fascicolo* | Objeto do processo |
| *Materia* | Matéria específica |
| *Iscrizione a ruolo* | Distribuição |
| *Ritualità / Rito* | Rito processual |
| *Rito semplificato di cognizione Cartabia* | Rito simplificado (reforma Cartabia 2022) |
| *Stato del fascicolo* | Status do processo |
| *Tribunale Ordinario* | Tribunal de 1ª instância cível |
| *Corte d'Appello* | Tribunal de apelação (2ª instância) |
| *Giudice di Pace* | Juiz de Paz (causas menores) |
| *Corte di Cassazione* | Supremo Tribunal (cassação) |
| *Ufficio giudiziario* | Vara / órgão judicial |
| *Distretto* | Distrito judiciário |
| *Consultazione pubblica* | Consulta pública |
| *Diritti della cittadinanza* | Direitos de cidadania |
| *Iure sanguinis* | Por direito de sangue (descendência) |
| *Iure matrimonii* | Por direito de casamento |
| *Fissazione udienza* | Designação de audiência |
| *Comparizione delle parti* | Comparecimento das partes |
| *Trattazione scritta* | Análise escrita (sem audiência oral) |
| *Precisazione delle conclusioni* | Precisão de conclusões (pré-sentença) |
| *Deposito sentenza* | Publicação da sentença |
| *Costituzione in giudizio* | Constituição nos autos |

<div align="center">

# <img src="https://flagcdn.com/it.svg" width="32" alt="Italia"> giustizia-consulta

**API pública, em português, para consultar o registro cível do Ministério da Justiça italiano de qualquer lugar do mundo.**

[![Live](https://img.shields.io/badge/API-online-brightgreen?style=flat-square)](https://giustizia-consulta.fly.dev/)
[![Fly.io](https://img.shields.io/badge/deploy-fly.io%20(fra)-8A2BE2?style=flat-square)](https://fly.io/apps/giustizia-consulta)
[![Node](https://img.shields.io/badge/node-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#licença)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0-6BA539?style=flat-square)](https://giustizia-consulta.fly.dev/openapi.json)

<sub>SICID · SIECIC · SIGMA · PST · Tribunale Ordinario · Corte d'Appello · Giudice di Pace</sub>

</div>

---

## Índice

- [O problema](#o-problema)
- [A motivação pessoal](#a-motivação-pessoal)
- [O que este projeto faz](#o-que-este-projeto-faz)
- [Como funciona por dentro](#como-funciona-por-dentro)
  - [Engenharia reversa do app Android](#engenharia-reversa-do-app-android)
  - [Proxy reverso do portal web](#proxy-reverso-do-portal-web)
  - [Bypass do bloqueio geográfico](#bypass-do-bloqueio-geográfico)
- [Uso rápido](#uso-rápido)
- [Endpoints](#endpoints)
- [Schema da resposta](#schema-da-resposta)
- [Enums e códigos](#enums-e-códigos)
- [Tribunais competentes para cittadinanza](#tribunais-competentes-para-cittadinanza)
- [Exemplos](#exemplos)
- [Arquitetura](#arquitetura)
- [Deploy](#deploy)
- [Rodando localmente](#rodando-localmente)
- [Limitações e avisos legais](#limitações-e-avisos-legais)
- [FAQ](#faq)
- [Roadmap](#roadmap)
- [Autor & Licença](#autor--licença)

---

## O problema

Centenas de milhares de brasileiros descendentes de italianos estão em processo judicial de **reconhecimento de cidadania italiana** nos tribunais da Itália — o chamado processo *iure sanguinis*. A via judicial existe porque:

- A **via administrativa** (consulados) tem fila de **10 a 15 anos** em média
- Casos de **linha materna pré-1948** (Constituição italiana) **só podem** ser resolvidos pela via judicial
- Divergências documentais exigem decisão de um juiz

Esses processos tramitam em **tribunais cíveis italianos** e são públicos. O Ministero della Giustizia publica o andamento no portal oficial:

> https://servizipst.giustizia.it/PST/

E aqui começam os problemas reais que qualquer requerente brasileiro enfrenta:

### 1. Bloqueio geográfico

O portal **bloqueia acessos de IPs fora da Itália**. Dependendo do momento o usuário recebe:

- `403 Forbidden` imediato
- Carregamento eterno (*stalling*) em algumas páginas
- `Connection reset` ou `TLS handshake failure`

Na prática: **nenhum brasileiro acessa o site oficial a partir do Brasil**. Sobra comprar VPN italiana paga, pedir para o advogado da Itália consultar por e-mail, ou depender do despachante.

### 2. Portal só em italiano

Termos como *fascicolo*, *ruolo generale*, *udienza*, *costituzione*, *giudice*, *ritualità semplificata di cognizione Cartabia* não fazem sentido para quem não tem formação jurídica italiana.

### 3. Interface pesada, não pensada para mobile

O PST é uma aplicação Java/Struts dos anos 2000 com DWR (Direct Web Remoting), selects que dependem de AJAX encadeado, sem responsividade, sem API pública, sem versão JSON.

### 4. Certificado expirado

O próprio servidor `mob.processotelematico.giustizia.it` (usado pelo app Android oficial) opera com **certificado TLS expirado** — o que quebra qualquer cliente HTTP padrão.

### 5. Nenhuma transparência agregada

Não existe dashboard público mostrando: "quanto tempo o Tribunale di Venezia leva, em média, para julgar um caso de cidadania?", "qual juiz julga mais rápido?", "qual tribunal tem mais volume?". Cada requerente vive a sua fila isolada, sem saber se está dentro ou fora da média.

---

## A motivação pessoal

Construí o `giustizia-consulta` porque, como muitos brasileiros, tenho família e amigos na fila da cidadania italiana e vi de perto três cenários se repetindo:

1. Advogados italianos cobrando por **cada consulta** de andamento (às vezes 50 € só para ler a tela do portal)
2. Requerentes **sem qualquer visibilidade** de onde está o processo, pagando por VPN italiana mensal só para dar um "F5" no PST
3. Despachantes brasileiros **cobrando mensalidade** por um serviço que é, essencialmente, copiar-colar os dados do portal oficial

O direito de consultar um processo público **não deveria** custar 50 € ou exigir VPN, e muito menos depender de intermediários. Este projeto é a minha resposta: pega tudo que o portal oficial e o app Android já expõem gratuitamente, quebra o geoblock, traduz para português claro, devolve JSON bem estruturado e é **gratuito e open source**.

A longo prazo a ideia é que consumir esta API também alimente **estatísticas agregadas e anônimas** da comunidade: tempo médio por tribunal, por juiz, por fase — para que o próximo brasileiro na fila saiba onde está e o que esperar. Essa parte, de inteligência coletiva, é construída por cima da API (por aplicações consumidoras — ver [SKILL.md](./SKILL.md) §12 para a receita de ingestão anônima em Supabase).

---

## O que este projeto faz

Em uma frase: **expõe o registro cível do Ministério da Justiça italiano via API REST pública, em português, acessível de qualquer lugar do mundo**.

Concretamente:

- ✅ Consulta **dados completos** de qualquer processo cível italiano pelo número do RG + ano + vara
- ✅ Aceita URLs coladas diretamente do portal PST (`/api/by-url`)
- ✅ Lista **todas as varas italianas** por região (Tribunale Ordinario, Corte d'Appello, Giudice di Pace)
- ✅ Gera **evento de calendário (.ics)** para audiências, compatível com Google Calendar / Outlook / Apple Calendar
- ✅ Disponibiliza **proxy reverso visual** do portal oficial — navegue o PST original de qualquer IP, com reescrita transparente de HTML/CSS/cookies
- ✅ Traduz termos italianos (registros `CC`/`L`/`VG`/`PC`, status, tipos de evento, qualificações de parte)
- ✅ Expõe **OpenAPI 3.0**, healthcheck profundo, cache com `s-maxage=900` (15 min) e CORS aberto
- ✅ Sem autenticação — chama direto do browser, do backend, de scripts Python/R/curl
- ✅ Documentação completa embutida em `/docs/fields`, `/docs/enums`, `/docs/examples`
- ✅ Um arquivo [`SKILL.md`](./SKILL.md) autocontido descrevendo toda a API — consumível por LLMs (ChatGPT, Gemini, bolt.new, Lovable, v0, Cursor) para gerar apps automaticamente

---

## Como funciona por dentro

### Engenharia reversa do app Android

O aplicativo oficial `it.giustizia.civile` (pacote `it.giustizia.civile`, versão 2.0.18 analisada) oferece consulta do registro cível — mas só funciona instalado em celular com IP italiano, e a UI é só em italiano. Descompilei o APK com Jadx, identifiquei:

- O endpoint real: `https://mob.processotelematico.giustizia.it` (com fallback para `mob1.processotelematico.giustizia.it`)
- A ação Struts usada por registro:

  | Registro | Ação |
  |---|---|
  | CC, L, VG (SICID) | `direttarg_sicid_mobile` |
  | PC, ESM, ESIM (SIECIC) | `direttarg_siecic_mobile` |
  | GDP (SIGMA) | `direttarg_sigma_mobile` |
  | `tiporicerca=S` (sentença) | `direttasent_mobile` |
  | `tiporicerca=D` (decreto) | `direttadi_mobile` |

- O **duplo esquema de assinatura MD5**:
  ```
  token = md5(KEY  + VERSION + SUBVERSION + PLATFORM + " " + androidVer + uuid + deviceName)
  t2    = md5(idufficio + KEY2 + aaproc + numproc + KEY2)
  ```
  As duas chaves (`KEY` e `KEY2`) e os parâmetros de versão foram extraídos da função `generateToken()` do APK.

- O *trust manager* customizado:
  ```java
  setServerTrustMode("nocheck")   // aceita certificados expirados
  ```
  que permite o app se comunicar com o servidor de certificado expirado. Replicado no servidor com `undici.Agent({ connect: { rejectUnauthorized: false } })`.

- O **parser do XML de resposta**: o upstream devolve um documento estruturado com as tags `fascicolo`, `parte`, `evento`, `udienza`, `oggetto`, etc. Implementei parser manual em Node (sem dependências pesadas) com normalização de datas, inferência de `tipoEvento` por palavra-chave e classificação de `qualificaTipo` de partes.

### Proxy reverso do portal web

Para listar varas por região e permitir navegação visual do portal oficial, adicionei um **proxy reverso HTTP/S** completo em `/api/proxy`. Ele:

1. **Reescreve URLs** em todos os atributos HTML (`href`, `src`, `action`, `formaction`, `srcset`, `meta refresh`, `style url()`) — tudo rota para `/api/proxy?url=…`
2. **Reescreve cookies** (`Set-Cookie`): remove `Domain=`, força `SameSite=None; Secure` para funcionar na origem do proxy
3. **Força parser HTML leniente**: remove prolog XML (`<?xml?>`), converte DOCTYPE XHTML Strict em `<!DOCTYPE html>`, remove atributos `xmlns` — elimina o erro `EntityRef: expecting ';'` que o XHTML original causava
4. **Injeta shim JavaScript** em `<head>` que intercepta:
   - `XMLHttpRequest.prototype.open` / `.send`
   - `window.fetch`
   - `navigator.sendBeacon`
   - `WebSocket`
   - `HTMLFormElement.prototype.submit` (com workaround para colisão `<input id="submit">`)

   Todas as requisições originadas do JS do portal são reescritas para passar pelo proxy.

5. **Auto-preenchimento** inteligente: se a URL contém `regioneRicerca`, `ufficioRicerca`, `registroRicerca`, `idfascicolo`, `numeroregistro`, `annoregistro`, o shim preenche os selects encadeados automaticamente (incluindo o DWR assíncrono de `changeUfficiPubb` → `changeRegistri`) e clica "Consulta" até chegar na tela de detalhe. Funciona em dois estágios com guard de `sessionStorage` para evitar loop.

6. **DWR bridge**: encapsula o protocolo DWR (Direct Web Remoting, Java) para chamar `RegistroListGetter.getUfficiPubb` via POST binário e extrair a lista de varas por região — é como a API alimenta `/api/uffici`.

7. **Catch-all `/PST/*`**: scripts DWR injetam `<script src="/PST/dwr/…">` com URL relativa, que o browser resolve contra a origem do proxy. Um catch-all no servidor detecta essas rotas e as roteia de volta para `giustizia.it` usando o `Referer` para deduzir a origem upstream.

8. **Fix de bug no HTML upstream**: o portal oficial tem um bug em `changeRegistri` (falta um `(`) que quebraria o auto-fill. Corrigido no pipeline de reescrita antes de enviar ao browser.

### Bypass do bloqueio geográfico

A API roda em **Fly.io, região Frankfurt (`fra`)** — IP europeu. A partir do Frankfurt, os servidores do Ministério aceitam conexões normalmente. O cliente brasileiro chama a API no Fly, o Fly chama o Ministério, o Ministério responde, o Fly retorna JSON.

O custo operacional é mínimo: máquina `shared-cpu-1x` com 256 MB, `auto_stop_machines = 'stop'` e `min_machines_running = 0` — a VM só liga quando há requisição e dorme quando não há, rodando de graça no free tier do Fly para volumes normais.

---

## Uso rápido

```bash
# consulta básica (processo 12345/2024 Contenzioso Civile, Tribunale di Venezia)
curl "https://giustizia-consulta.fly.dev/api/consulta?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024"
```

```jsonc
{
  "ok": true,
  "fascicolo": {
    "ruoloGenerale": {
      "identifier":           "12345/2024",
      "registro":             "CC",
      "registroDesc":         "Contencioso Civil (Contenzioso Civile)",
      "iscrittoIlISO":        "2024-03-15",
      "daysSinceIscrizione":  860
    },
    "ufficio":  { "descrizione": "Tribunale Ordinario di Venezia" },
    "giudice":  { "nome": "MARIO ROSSI" },
    "stato":    { "descrizione": "ATTESA ESITO UDIENZA DI COMPARIZIONE" },
    "oggetto":  { "materia": "Diritti della cittadinanza",
                  "rito":    "RITO SEMPLIFICATO DI COGNIZIONE CARTABIA" },
    "udienza":  { "iso": "2027-09-10T10:00:00+02:00", "daysUntil": 509 },
    "parti":    { "totale": 5, "attori": [...], "convenuti": [...] },
    "storico":  { "totale": 12, "eventi": [...] }
  }
}
```

Ou cole uma URL do portal e deixe a API extrair:

```bash
curl "https://giustizia-consulta.fly.dev/api/by-url?url=https://servizipst.giustizia.it/PST/it/pst_2_6_1.wp?actionPath=/ExtStr2/do/consultazionepubblica/sicid/contenzioso/detail.action&idfascicolo=9999999&numeroregistro=00012345&annoregistro=2024&regioneRicerca=20&ufficioRicerca=9999999999&registroRicerca=CC"
```

Lista varas de uma região:

```bash
curl "https://giustizia-consulta.fly.dev/api/uffici?regione=20&tipo=TRIBUNALE_ORDINARIO"
```

Gera `.ics` da próxima audiência:

```bash
curl -o audiencia.ics "https://giustizia-consulta.fly.dev/api/ics?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024"
```

---

## Endpoints

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/` | Landing com documentação HTML navegável |
| `GET` | `/healthz` | Status básico |
| `GET` | `/healthz?deep=1` | Probe HTTP dos upstreams, memória, cache DWR |
| `GET` `POST` | `/api/consulta` | **Endpoint principal** — consulta completa |
| `GET` | `/api/by-url` | Aceita URL do portal PST e extrai params |
| `GET` | `/api/uffici` | Lista varas por região (via DWR) |
| `GET` | `/api/form` | Schema dos campos de entrada (para gerar formulários) |
| `GET` | `/api/ics` | Próxima audiência como arquivo iCalendar |
| `*`   | `/api/proxy` | Proxy reverso visual do portal (`*.giustizia.it`) |
| `GET` | `/regioni` | 20 regiões com codificação PST |
| `GET` | `/registri` | Registros processuais com sistema (SICID/SIECIC/SIGMA) |
| `GET` | `/tipi-ufficio` | Tipos de vara (1–5) |
| `GET` | `/distretti` | 26 distritos Corte d'Appello |
| `GET` | `/docs/fields` | Dicionário de campos |
| `GET` | `/docs/enums` | Todos os enums |
| `GET` | `/docs/examples` | Exemplos request/response |
| `GET` | `/openapi.json` | Especificação OpenAPI 3.0 |
| `GET` | `/raw` | HTML/XML bruto do upstream (debug) |

### `GET /api/consulta` — parâmetros

| Parâmetro | Obrigatório | Formato | Exemplo | Observações |
|---|---|---|---|---|
| `idufficio` | ✅ | `^\d{1,11}$` | `9999999999` | Código da vara (10–11 dígitos) |
| `registro` | ✅ | enum | `CC` | `CC`/`L`/`VG`/`PC`/`ESM`/`ESIM`/`GDP` |
| `numproc` | ✅ | `^\d+$` | `12345` | Número RG sem zeros à esquerda |
| `aaproc` | ✅ | `^\d{2,4}$` | `2023` ou `23` | Ano de distribuição |
| `tipoufficio` | ✖️ | enum 1–5 | `1` | Default `1`. GDP exige `5` |
| `tiporicerca` | ✖️ | `S`/`D` | `S` | `S`=sentença, `D`=decreto monitório |

**Cache:** `Cache-Control: public, s-maxage=900` (15 minutos em edge).

### Códigos de erro

```jsonc
{ "ok": false, "error": "processo não encontrado", "code": "NOT_FOUND", "meta": { ... } }
```

| Status | `code` | Significado |
|---|---|---|
| `400` | `BAD_INPUT` | Parâmetros inválidos (`details[]` lista os erros) |
| `404` | `NOT_FOUND` | Processo não existe no upstream |
| `500` | `PARSE_FAIL` | XML upstream inválido |
| `502` | `UPSTREAM_DOWN` | Ambos `mob` e `mob1` fora do ar |

---

## Schema da resposta

O payload retornado pelo `/api/consulta` é **aninhado em `fascicolo.*`**:

```
fascicolo
├── ruoloGenerale
│   ├── numero, numeroInt, anno, identifier
│   ├── registro, registroDesc
│   ├── iscrittoIl, iscrittoIlISO
│   └── daysSinceIscrizione
├── ufficio
│   ├── id, descrizione
│   ├── regioneCode, regione, distretto, sezione
│
├── giudice { nome }
├── stato   { descrizione, codice }
├── oggetto { rito, materia, raw[] }
├── udienza
│   ├── raw, iso, timezone
│   ├── isFuture, daysUntil
│   └── calendar { titolo, luogo, note, start, end }
├── parti
│   ├── totale
│   ├── attori    [{ nome, qualifica, qualificaTipo, avvocato }]
│   ├── convenuti [...]
│   ├── altri     [...]
│   └── raw       [...]
├── storico
│   ├── totale
│   ├── ultimoEvento, primoEvento
│   └── eventi [{ data, dataISO, evento, tipoEvento }]
└── aggiornamento
    ├── ultimoStorico
    ├── DataReg, DataRegDB, DataRegISO
```

Ver [`SKILL.md`](./SKILL.md) §15.1 para os tipos TypeScript completos ou `GET /docs/fields` para o dicionário online.

> **Nota sobre nomes de partes:** o próprio upstream do Ministério devolve nomes mascarados com asteriscos (`P**** S****`). É comportamento **oficial** — a API apenas repassa. Não há como obter nomes completos via consulta pública.

---

## Enums e códigos

### Registros processuais

| Código (API mobile) | Código (portal web) | Nome | Sistema |
|---|---|---|---|
| `CC` | `CC` | Contenzioso Civile | SICID |
| `L` | `LAV` | Lavoro | SICID |
| `VG` | `VG` | Volontaria Giurisdizione | SICID |
| `PC` | `FALL` | Procedure Concorsuali | SIECIC |
| `ESM` | `ESM` | Esecuzioni Mobiliari | SIECIC |
| `ESIM` | `ESIM` | Esecuzioni Immobiliari | SIECIC |
| `GDP` | `GDP` | Giudice di Pace | SIGMA |

⚠️ O portal web usa `LAV` e `FALL`, mas a API espera `L` e `PC`. Use `/api/by-url` para remapeamento automático.

### Regiões (codificação alfabética PST — **não** ISTAT)

| # | Região | Corte d'Appello |
|---|---|---|
| 1 | Abruzzo | L'Aquila |
| 2 | Basilicata | Potenza |
| 3 | Calabria | Catanzaro, Reggio Calabria |
| 4 | Campania | Napoli, Salerno |
| 5 | Emilia-Romagna | Bologna |
| 6 | Friuli-Venezia Giulia | Trieste |
| 7 | Lazio | Roma |
| 8 | Liguria | Genova |
| 9 | Lombardia | Milano, Brescia |
| 10 | Marche | Ancona |
| 11 | Molise | Campobasso |
| 12 | Piemonte | Torino |
| 13 | Puglia | Bari, Lecce, Taranto |
| 14 | Sardegna | Cagliari, Sassari |
| 15 | Sicilia | Palermo, Catania, Messina, Caltanissetta |
| 16 | Toscana | Firenze |
| 17 | Trentino-Alto Adige | Trento, Bolzano |
| 18 | Umbria | Perugia |
| 19 | Valle d'Aosta | (Aosta → Torino) |
| 20 | Veneto | Venezia |

### Tipos de evento no histórico

| Code | Categoria |
|---|---|
| `I` | Iscrizione (registro) |
| `D` | Designazione / Deposito / Decreto |
| `U` | Udienza (audiência) |
| `S` | Sentenza |
| `C` | Costituzione / Comunicazione |
| `T` | Trattazione |
| `A` | Archiviazione / Assegnazione |
| `M` | Memoria / Mutamento giudice |
| `R` | Ricorso / Rinvio |
| `?` | Não classificado |

Lista completa e atualizada em `GET /docs/enums`.

---

## Tribunais competentes para cittadinanza

Desde a **Lei 36/2025** (março 2025) os processos de cidadania foram concentrados em tribunais específicos por distrito de Corte d'Appello. Os principais `idufficio` para uso direto:

| Distretto | Tribunale | `idufficio` |
|---|---|---|
| Roma | Tribunale Ordinario Roma | `0580910098` |
| Venezia | Tribunale Ordinario Venezia | `0270420098` |
| L'Aquila | Tribunale Ordinario L'Aquila | `0660490099` |
| Campobasso | Tribunale Ordinario Campobasso | `0700060095` |
| Ancona | Tribunale Ordinario Ancona | `0420020093` |
| Firenze | Tribunale Ordinario Firenze | `0480170090` |
| Torino | Tribunale Ordinario Torino | `0012720095` |
| Milano | Tribunale Ordinario Milano | `0151460094` |
| Bologna | Tribunale Ordinario Bologna | `0370060094` |
| Napoli | Tribunale Ordinario Napoli | `0630490096` |
| Palermo | Tribunale Ordinario Palermo | `0820530098` |
| Bari | Tribunale Ordinario Bari | `0720060097` |
| Trieste | Tribunale Ordinario Trieste | `0320060099` |
| Genova | Tribunale Ordinario Genova | `0100250093` |
| Cagliari | Tribunale Ordinario Cagliari | `0920090097` |

Processos anteriores a 2025 continuam nos tribunais originais (dezenas espalhados). A tabela completa de **130 varas** está em [`SKILL.md §6`](./SKILL.md).

Uma ação de cidadania tem a seguinte "assinatura":

```jsonc
{
  "registro":   "CC",
  "materia":    "Diritti della cittadinanza",
  "rito":       "RITO SEMPLIFICATO DI COGNIZIONE CARTABIA"
}
```

**Tempo típico até sentença:** 12 a 36 meses. Venezia, Campobasso e L'Aquila têm média inferior a 18 meses; Roma pode chegar a 36+.

---

## Exemplos

### Node.js / TypeScript

```ts
const API = "https://giustizia-consulta.fly.dev";

const r = await fetch(`${API}/api/consulta?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024`);
const data = await r.json();

if (!data.ok) {
  if (data.code === "NOT_FOUND") throw new Error("Processo não encontrado");
  throw new Error(data.error);
}

const f = data.fascicolo;
console.log(`${f.ruoloGenerale.identifier} — ${f.ufficio.descrizione}`);
console.log(`Juiz: ${f.giudice?.nome ?? "não designado"}`);
console.log(`Status: ${f.stato?.descrizione}`);
if (f.udienza?.isFuture) {
  console.log(`Próxima audiência: ${f.udienza.iso} (faltam ${f.udienza.daysUntil} dias)`);
}
```

### Python

```python
import requests

r = requests.get("https://giustizia-consulta.fly.dev/api/consulta", params={
    "idufficio": "9999999999", "registro": "CC", "numproc": "12345", "aaproc": "2024"
})
data = r.json()

if not data["ok"]:
    raise RuntimeError(data["error"])

f = data["fascicolo"]
print(f"{f['ruoloGenerale']['identifier']} — {f['ufficio']['descrizione']}")
if f.get("udienza", {}).get("isFuture"):
    print(f"Próxima audiência: {f['udienza']['iso']} ({f['udienza']['daysUntil']} dias)")
```

### React (hook)

```tsx
function useProcesso(params: { idufficio: string; registro: string; numproc: string; aaproc: string }) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    const qs = new URLSearchParams(params);
    fetch(`https://giustizia-consulta.fly.dev/api/consulta?${qs}`)
      .then(r => r.json())
      .then(d => setState({ data: d.ok ? d.fascicolo : null, error: d.ok ? null : d, loading: false }));
  }, [JSON.stringify(params)]);
  return state;
}
```

### HTML puro (sem build)

```html
<form id="f">
  <input name="idufficio" value="9999999999">
  <select name="registro"><option>CC</option><option>L</option><option>VG</option></select>
  <input name="numproc" value="12345"><input name="aaproc" value="2024">
  <button>Consultar</button>
</form>
<pre id="out"></pre>
<script>
  f.onsubmit = async e => {
    e.preventDefault();
    const qs = new URLSearchParams(new FormData(f));
    const r = await fetch(`https://giustizia-consulta.fly.dev/api/consulta?${qs}`);
    out.textContent = JSON.stringify(await r.json(), null, 2);
  };
</script>
```

Mais exemplos em [`SKILL.md §15`](./SKILL.md) (tipos TypeScript completos, React hook + formulário cascata, Python, Next.js edge route, cURL) e receita de estatísticas agregadas com Supabase em [`§12`](./SKILL.md).

---

## Arquitetura

```
┌─────────────────────┐
│   Cliente           │   browser / app / script / LLM
│   (Brasil, Europa)  │
└──────────┬──────────┘
           │ HTTPS (JSON ou HTML proxied)
           ▼
┌─────────────────────┐   Fly.io — Frankfurt (fra)
│  giustizia-consulta │   Node.js 20, ~1900 LOC, 256 MB RAM
│  server.js          │   auto_stop, min_machines_running = 0
└──────────┬──────────┘
           │ TLS insecure (certificado expirado)
           │ + assinatura MD5 dupla
           ▼
┌─────────────────────────────────────────────┐
│  Ministero della Giustizia italiano         │
│  ├── mob.processotelematico.giustizia.it    │ ← API mobile (app Android)
│  ├── mob1.processotelematico.giustizia.it   │   (fallback)
│  └── servizipst.giustizia.it/PST/           │ ← portal web (proxy + DWR)
└─────────────────────────────────────────────┘
```

### Stack

- **Runtime:** Node.js 20 (ESM, sem transpilação, sem bundler)
- **HTTP client:** [`undici`](https://github.com/nodejs/undici) (fetch nativo do Node) com `Agent({ connect: { rejectUnauthorized: false } })` para aceitar TLS expirado
- **Servidor HTTP:** `node:http` nativo (sem Express, sem Fastify) — ~1900 LOC em um único `server.js`
- **Parsing XML/HTML:** implementação manual com regex e state machines, sem dependência de parser externo (DOM puro seria overkill para o volume de dados)
- **Cache DWR:** in-memory `Map` com TTL de 6h para listas de uffici
- **Deploy:** Dockerfile `node:20-alpine` + `fly.toml` (região `fra`, `shared-cpu-1x`, `256 MB`)

### Nenhuma dependência "pesada"

O único módulo não-nativo é `undici` (já incluído como peer do Node 20). Sem Express, sem Axios, sem TypeScript, sem bundler. Código de um arquivo só, fácil de ler e auditar.

---

## Deploy

### Deploy no Fly.io

```bash
# primeira vez
fly launch --no-deploy
fly deploy

# atualizações
fly deploy
```

`fly.toml`:
```toml
app = 'giustizia-consulta'
primary_region = 'fra'           # Frankfurt — IP europeu para acessar o upstream italiano

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = 'stop'    # desliga quando idle — grátis no free tier
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  size = 'shared-cpu-1x'
  memory = '256mb'
```

Custo operacional real: **zero** para uso moderado, o Fly.io inclui horas suficientes no plano gratuito para rodar 24/7 com auto-stop ligado.

### Deploy em outras plataformas

Como é um Node.js simples sem dependências nativas, roda em qualquer plataforma:

- **Railway / Render / Koyeb:** deploy direto do GitHub, portas `8080`
- **Docker anywhere:** `docker build -t giustizia-consulta . && docker run -p 8080:8080 giustizia-consulta`
- **VPS comum:** `node server.js` dentro de um `systemd` unit

⚠️ **Requisito geográfico:** a plataforma de deploy **precisa** ter IP europeu. De servidores nos EUA/Brasil/Ásia o upstream do Ministério fica bloqueado. Frankfurt (Fly), Amsterdam (Hetzner, Contabo), Paris, Londres funcionam.

---

## Rodando localmente

```bash
git clone https://github.com/opastorello/giustizia-consulta.git
cd giustizia-consulta
npm install
node server.js
# → giustizia-consulta v0.1.0 ouvindo em http://0.0.0.0:8080
```

⚠️ **A execução local só funciona se a sua máquina tiver IP europeu** (VPN italiana/europeia, ou VPS em Frankfurt/Amsterdam). De IP brasileiro o upstream responde `403`. Para testar sem VPN, use a instância pública em `https://giustizia-consulta.fly.dev/`.

### Testar endpoints

```bash
# health profundo
curl localhost:8080/healthz?deep=1 | jq

# consulta real (precisa IP EU)
curl "localhost:8080/api/consulta?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024" | jq

# raw HTML (debug)
curl -s "localhost:8080/raw?idufficio=9999999999&registro=CC&numproc=12345&aaproc=2024" | head -60
```

---

## Limitações e avisos legais

### O que esta API **não** faz

- ❌ Não desmascara nomes de partes — o upstream já devolve com asteriscos
- ❌ Não notifica automaticamente mudanças (você precisa fazer polling)
- ❌ Não consulta processos criminais (não há API mobile para SICP)
- ❌ Não autentica com ADP / SPID (portal público, consulta livre)

### Base legal

Os dados consultáveis são **públicos**, com fundamento em:

- Art. 115 c.p.c. (Codice di Procedura Civile italiano)
- D.M. 44/2011 (*Regolamento concernente le regole tecniche per l'adozione...*) — disciplina a **consultazione pubblica** dos registros PST

### Privacidade

- A API **não persiste** nada: processing stateless, zero banco de dados, zero logs de consulta
- Cache é in-memory por 15 minutos (consulta) e 6 horas (lista de varas)
- Se você construir app em cima e persistir resultados: aplique LGPD/GDPR (ver receita de anonimização em [`SKILL.md §12`](./SKILL.md))

### Disclaimer

Este projeto **não é endossado, afiliado, autorizado ou associado** ao Ministero della Giustizia italiano. É software open source de uso educacional e utilidade pública. O autor não se responsabiliza por decisões tomadas com base nos dados retornados — sempre confirme com seu advogado ou no portal oficial.

### Uso justo

- Respeite o cache (`Cache-Control: s-maxage=900`). Polling abusivo derruba o upstream e prejudica outros usuários
- Não faça scraping massivo — os servidores do Ministério são lentos e a banana no IP do Fly afeta todo mundo
- Para projetos com alto volume, implemente fila + rate limiting no seu backend

---

## FAQ

### "Por que preciso da API se posso usar VPN italiana?"

Porque VPN paga custa €5–15/mês, quebra suas sessões normais, deixa o browser lento, e ainda assim você tem que navegar o portal em italiano. A API devolve JSON estruturado em português, grátis, sem configurar nada, e integra em qualquer app.

### "E o app Android oficial?"

Só funciona **dentro da Itália** (o geoblock é no servidor) e a UI é só em italiano. Este projeto usa o mesmo endpoint que o app, mas o deixa acessível globalmente e em PT-BR.

### "A API vai ficar no ar pra sempre?"

Intenção é sim. Custo operacional é baixíssimo (pode rodar no free tier do Fly indefinidamente). Se um dia o Ministério virar o certificado ou mudar o esquema de assinatura MD5, é uma tarde de trabalho adaptando o parser. O repositório fica aberto para quem quiser forkar, subir uma cópia independente ou contribuir.

### "Posso usar em projeto comercial?"

Sim. Licença MIT. Você pode usar, modificar, vender soluções que consumam a API. Peço que mantenha o aviso de disclaimer sobre não-afiliação com o MinGiustizia e, se possível, uma menção ao projeto original no seu README.

### "Meu processo retorna NOT_FOUND, o que fazer?"

Checklist:

1. Número RG **sem** zeros à esquerda: `12345`, não `00012345`
2. Ano completo (`2023`) ou dois dígitos (`23`) — ambos funcionam
3. Se é Giudice di Pace, adicione `tipoufficio=5`
4. Se colou do portal web, `LAV`→`L` e `FALL`→`PC` (ou use `/api/by-url` que remapeia sozinho)
5. Confirme no `/healthz?deep=1` que o upstream está de pé
6. Como último recurso, use `/api/proxy?url=...` para confirmar visualmente no portal

### "Os nomes das partes aparecem com asteriscos, como ver os completos?"

Não tem jeito via consulta pública. O Ministério mascara os nomes em consultas anônimas (sem SPID/CIE). Só constam completos para quem está autenticado como **parte** ou **advogado** do processo via certificado digital italiano.

### "Como construo estatísticas agregadas em cima disso?"

[`SKILL.md §12`](./SKILL.md) tem a receita completa com schema Supabase, hash SHA-256 com pepper para anonimizar a chave do processo, queries SQL prontas (tempo mediano por tribunal, volume mensal, top juízes) e checklist de compliance.

### "Posso colar o SKILL.md no ChatGPT / bolt.new / Lovable?"

Sim — é pra isso que o [`SKILL.md`](./SKILL.md) existe. Ele é autocontido (~1900 linhas) e descreve toda a API, tipos TypeScript, exemplos em 6 linguagens, receitas e troubleshooting. Cole inteiro como contexto e peça para gerar o app que quiser.

---

## Roadmap

- [x] API mobile reverseada, `/api/consulta` funcionando
- [x] Proxy reverso visual com auto-fill
- [x] DWR bridge para listar uffici
- [x] Geração de `.ics`
- [x] OpenAPI 3.0
- [x] SKILL.md para consumo por LLMs
- [ ] Endpoint de diff entre duas consultas (para detectar mudanças)
- [ ] Webhook push quando novo evento aparece no histórico
- [ ] Bridge também para SICP (processos criminais) — se houver app mobile oficial
- [ ] Dashboard público de estatísticas agregadas (opcional, construído em cima)
- [ ] Tradução dos eventos do histórico para PT (hoje ficam em italiano no `.evento`)

Pull requests são bem-vindos. Issues com dúvidas ou bugs também.

---

## Autor & Licença

**Nicolas Pastorello** · [GitHub](https://github.com/opastorello) · [LinkedIn](https://www.linkedin.com/in/nicolas-pastorello/)

[MIT](./LICENSE) — © 2026.

</content>

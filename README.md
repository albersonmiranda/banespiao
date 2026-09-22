<p align="center">
  <img src="frontend/public/assets/logo.png" alt="Logo" />
</p>

Protótipo para plataforma de monitoramento de vegetação por imagens de satélite. Permite upload de áreas via KML, cálculo de séries temporais de NDVI e obtenção de imagens de satélite em cores verdadeiras a partir do Copernicus Data Space Ecosystem (CDSE) e Instituto Nacional de Pesquisas Espaciais (INPE).

## Funcionalidades

### Mapa e série temporal de NDVI

Após importação do `.kml`, a área é plotada no mapa Leaflet. O usuário pode então obter a série temporal de NDVI a partir de duas fontes:

- **CDSE** (Copernicus Data Space Ecosystem) — via API Statistical
- **INPE** (catálogo STAC do Brasil) — séries prontas de NDVI dos data cubes do Brazil Data Cube (Sentinel-2 `S2-16D-2` e Landsat `LANDSAT-16D-1`, composições 16 dias) com leitura direta do raster de NDVI, sem cálculo por pixel

Parâmetros disponíveis:

- Intervalo de datas
- Fonte (CDSE ou INPE)
- Satélites
  - Sentinel 2
  - Landsat 8-9
- Resolução
  - 10m (INPE Sentinel)
  - 30m (INPE Landsat)
  - 10m / 20m / 30m / 100m (CDSE)
- Agregação
  - Diário
  - Semanal
  - Mensal
  - Anual

O gráfico plotado contém 3 linhas: máximo, média e mínimo (cada uma pode ser ligada/desligada). Como é obtido um índice para cada pixel válido na imagem, esses valores se referem, considerando o período de agregação, o valor máximo encontrado, o valor médio e o valor mínimo.

É possível sobrepor a **precipitação** (em mm, eixo direito) usando a API gratuita do **Open-Meteo** (reanálise ERA5/ERA5-Land), ativando o toggle "Precipitação (mm)" no gráfico.

![Série temporal NDVI.](docs/img/mapa_ndvi.png)

### Download de imagens de satélites

A aplicação permite download e persistência de imagens das seguintes coleções:

- Sentinel-2 L2A (CDSE)
  - 10m
  - 20m
  - 30m
  - 100m
- Landsat 8-9 OLI/TIRS L1 (CDSE)
  - 30m
  - 100m
- Sentinel-2 L2A (INPE, `S2_L2A-1`)
  - 10m
- Landsat Collection 2 (INPE, `landsat-2`)
  - 30m
- CBERS-4A WPM PCA fused (INPE)
  - 2m

![Série temporal de imagens de satélites.](docs/img/satelite.png)

## Arquitetura

![Serviços no Railway.](docs/img/railway.png)

```
banesensor/
├── backend/          # API R (plumber2) + workers assíncronos (mirai)
├── frontend/         # Aplicação Angular 22 + Leaflet + Chart.js
├── db/               # PostgreSQL 16 + extensão PostGIS
└── docker-compose.yml
```

No banco de dados, são guardadas as séries temporais de NDVI, os metadados das imagens e as séries de precipitação (cache do Open-Meteo). Os `.png` em si são guardados em `/app/uploads` (em um volume anexado, no caso do Railway).

## Stack

| Camada     | Tecnologias |
|------------|-------------|
| Backend    | R 4.6, plumber2, mirai, CDSE, rsi, rstac, sf, terra |
| Frontend   | Angular 22, Leaflet, Chart.js (ng2-charts) |
| Banco      | PostgreSQL 16 + PostGIS |
| Dados      | CDSE (Sentinel Hub), STAC/INPE (BDC + WMS CBERS), Open-Meteo |
| Infra      | Docker Compose |

## Pré-requisitos

- Docker e Docker Compose (para build local)
- Conta gratuita no [Copernicus Data Space Ecosystem](https://dataspace.copernicus.eu/) com credenciais OAuth (client ID e secret) — necessária apenas para uso das fontes CDSE. As fontes INPE e Open-Meteo são públicas e gratuitas.

## Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
CDSE_ID=seu_client_id
CDSE_SECRET=seu_client_secret

DB_NAME=seu_db_name
DB_USER=seu_db_user
DB_PASSWORD=seu_db_password

ASYNC_WORKERS=4 (mude para 1, caso use um serviço limitado em RAM)
```

`CDSE_ID` e `CDSE_SECRET` são opcionais se você usar apenas as fontes INPE e Open-Meteo. As consultas aos catálogos INPE (STAC BDC e WMS CBERS) não exigem chave.

## Como executar

```bash
docker compose up
```

| Serviço  | URL |
|----------|-----|
| Frontend | http://localhost:4200 |
| API      | http://localhost:8000 |
| Banco    | localhost:5432 |

## Deploy no Railway

O projeto é um monorepo com três serviços (`backend/`, `frontend/` e `db/`), cada um capaz de ser deployado como um serviço separado no Railway. Cada diretório contém um `railway.json` que configura o builder `DOCKERFILE` e healthchecks.

### Passo a passo

1. **Crie um projeto no Railway** e conecte-o ao repositório GitHub.
2. **Crie três serviços** (Source → GitHub → selecione o repositório):
   - **Database** — Root Directory: `db`, nome de serviço sugerido: `database`
   - **Backend** — Root Directory: `backend`, nome de serviço sugerido: `backend`
   - **Frontend** — Root Directory: `frontend`, nome de serviço sugerido: `frontend`

3. **Banco de dados**: o serviço `db/` usa a imagem `postgis/postgis:16-3.4`. Anexe um **Volume** ao serviço para persistência (Railway montará o volume automaticamente). O `init.sql` cria as tabelas e a extensão PostGIS na primeira inicialização.

4. **Env vars do Backend**:
   | Variável | Valor |
   |----------|-------|
   | `CDSE_ID` | seu client ID do CDSE |
   | `CDSE_SECRET` | seu client secret do CDSE |
   | `DB_HOST` | hostname interno do serviço de banco (ex.: `database`) |
   | `DB_PORT` | `5432` |
   | `DB_NAME` | `banesensor` (ou nome do banco) |
   | `DB_USER` | usuário do Postgres (padrão da imagem: `postgres`) |
   | `DB_PASSWORD` | senha do Postgres configurada na imagem |
   | `UPLOAD_DIR` | `/app/uploads` (e anexe um Volume neste path para persistir imagens) |
   | `ASYNC_WORKERS` | `4` (opcional, mude para 1 se serviço limitado em RAM) |

5. **Env vars do Frontend**:
   | Variável | Valor |
   |----------|-------|
   | `BACKEND_URL` | URL da API backend via **Private Network** (ex.: `http://backend.railway.internal:8000`) |
   | `NGINX_RESOLVER` | `[fd12::10]` — DNS resolver da Private Network do Railway (obrigatório) |

   O nginx renderiza `default.conf.template` via `envsubst` no boot, injetando `BACKEND_URL` e `NGINX_RESOLVER`. **Importante:** os valores acima **sobrescrevem** os defaults do `Dockerfile` (que são pensados para desenvolvimento local com Docker Compose: `http://backend:8000` e `127.0.0.11`). No Railway o `NGINX_RESOLVER` **deve** ser `[fd12::10]`, senão o nginx não resolve os hostnames da Private Network. Use o hostname privado `http://<serviço>.railway.internal:<porta>` (porta padrão do backend é `8000`). Não use a URL pública do backend (`https://...up.railway.app`): como o nginx preserva o header `Host` do frontend, o edge do Railway rotearia a requisição de volta para o frontend, causando loop e erro `502 upstream sent too big header`.

6. **Networking**: o frontend e o backend devem compartilhar o mesmo **Private Network** do Railway para que resolvam os hostnames internos (o que acontece por default, usando os 3 serviços no mesmo projeto).

7. **Deploy**: o Railway detecta os `railway.json` automaticamente. Após o deploy, use o domínio público gerado para o serviço `frontend`.

### Volumes necessários

- Serviço `database`: volume no path de dados do Postgres (definido pela imagem; no postgis é `/var/lib/postgresql/data`).
- Serviço `backend`: volume em `UPLOAD_DIR` para persistir as imagens baixadas.

## API

### Áreas

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/areas` | Lista todas as áreas |
| `GET` | `/api/areas/<id>` | Retorna uma área com geometria |
| `POST` | `/api/areas/upload` | Upload de KML para criar área |
| `DELETE` | `/api/areas/<id>` | Remove área e dados associados |

### NDVI

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/ndvi/<id>` | Calcula série temporal de NDVI (assíncrono; `provider: "cdse"` ou `"inpe"`) |
| `GET` | `/api/ndvi/<id>` | Retorna série temporal em cache |

### Precipitação

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/precipitation/<id>` | Calcula série temporal de precipitação via Open-Meteo (assíncrono) |
| `GET` | `/api/precipitation/<id>` | Retorna série em cache (`query`: `date_from`, `date_to`, `aggregation`) |

### Imagens de satélite

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/image/<id>` | Sincroniza imagens RGB (assíncrono; `provider: "cdse"`, `"inpe"` ou `"cbers"`) |
| `GET` | `/api/image/<id>` | Lista metadados das imagens em cache |
| `GET` | `/api/image/<id>/file/<image_id>` | Retorna imagem PNG |

### Coleções disponíveis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/collections` | Lista coleções de satélite disponíveis |

## Coleções suportadas

**NDVI (série temporal):**

- **Sentinel-2 L2A** (`sentinel-2-l2a` via CDSE / `S2-16D-2` data cube 16d via INPE) — MSI, correção atmosférica
- **Landsat** (`landsat-c2-l2` via CDSE / `LANDSAT-16D-1` data cube 16d via INPE) — OLI/TIRS, reflectância superficial

**Imagens de satélite (download):**

- **Sentinel-2 L2A** (`sentinel-2-l2a` via CDSE / `S2_L2A-1` via INPE) — MSI, correção atmosférica
- **Landsat 8-9 Collection 2** (`landsat-c2-l2` via CDSE / `landsat-2` via INPE) — OLI/TIRS, reflectância superficial
- **CBERS-4A WPM** (`CB4A-WPM-PCA-FUSED-1`) — via STAC/WMS INPE

## Banco de dados

Tabelas principais:

- `areas` — Áreas de interesse com geometria PostGIS
- `ndvi_time_series` — Séries temporais de NDVI
- `precipitation_time_series` — Séries temporais de precipitação (cache do Open-Meteo)
- `satellite_images` — Metadados das imagens de satelite baixadas

> Em bancos que já executaram o `init.sql` anterior à adição da precipitação, aplique o arquivo `db/migrations/2026.09.18_precipitation.sql` para criar a tabela.

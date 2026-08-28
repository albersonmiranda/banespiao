<p align="center">
  <img src="frontend/public/assets/logo.png" alt="Logo" />
</p>

<p align="center">Banespião</p>

Protótipo para plataforma de monitoramento de vegetação por imagens de satélite. Permite upload de áreas via KML, cálculo de séries temporais de NDVI e obtenção de imagens de satélite em cores verdadeiras a partir do Copernicus Data Space Ecosystem (CDSE) e Instituto Nacional de Pesquisas Espaciais (INPE).

## Arquitetura

```
banesensor/
├── backend/          # API R (plumber2) + workers assíncronos (mirai)
├── frontend/         # Aplicação Angular 22 + Leaflet + Chart.js
├── db/               # PostgreSQL 16 + extensão PostGIS
└── docker-compose.yml
```

## Stack

| Camada     | Tecnologias |
|------------|-------------|
| Backend    | R 4.6, plumber2, mirai, CDSE, rsi, rstac, sf, terra |
| Frontend   | Angular 22, Leaflet, Chart.js (ng2-charts) |
| Banco      | PostgreSQL 16 + PostGIS |
| Infra      | Docker Compose |

## Pré-requisitos

- Docker e Docker Compose
- Conta gratuita no [Copernicus Data Space Ecosystem](https://dataspace.copernicus.eu/) com credenciais OAuth (client ID e secret)

## Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
CDSE_ID=seu_client_id
CDSE_SECRET=seu_client_secret

DB_NAME=banesensor
DB_USER=banesensor
DB_PASSWORD=banesensor_secret

ASYNC_WORKERS=4
```

## Como executar

```bash
docker compose up
```

| Serviço  | URL |
|----------|-----|
| Frontend | http://localhost:4200 |
| API      | http://localhost:8000 |
| Banco    | localhost:5432 |

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
| `POST` | `/api/ndvi/<id>` | Calcula série temporal de NDVI (assíncrono) |
| `GET` | `/api/ndvi/<id>` | Retorna série temporal em cache |

### Imagens de satélite

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/image/<id>` | Sincroniza imagens RGB (assíncrono) |
| `GET` | `/api/image/<id>` | Lista metadados das imagens em cache |
| `GET` | `/api/image/<id>/file/<image_id>` | Retorna imagem PNG |

### Coleções disponíveis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/collections` | Lista coleções de satélite disponíveis |

## Coleções suportadas

- **Sentinel-2 L2A** (`sentinel-2-l2a`) — MSI, correção atmosférica
- **Landsat 8-9 Collection 2 L2** (`landsat-c2-l2`) — OLI/TIRS, reflectância superficial
- **CBERS-4A WPM** (`CB4A-WPM-PCA-FUSED-1`) — via STAC/INPE

## Banco de dados

Tabelas principais:

- `areas` — Áreas de interesse com geometria PostGIS
- `ndvi_time_series` — Séries temporais de NDVI (com cache)
- `satellite_images` — Imagens de satélite baixadas e metadados

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE areas (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    kml_filename  VARCHAR(255),
    geom          GEOMETRY(GEOMETRY, 4326) NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ndvi_time_series (
    id            SERIAL PRIMARY KEY,
    area_id       INTEGER REFERENCES areas(id) ON DELETE CASCADE,
    date          DATE NOT NULL,
    date_from     DATE NOT NULL,
    date_to       DATE NOT NULL,
    collection    VARCHAR(100) NOT NULL,
    aggregation   VARCHAR(20) NOT NULL DEFAULT 'day',
    resolution    INTEGER NOT NULL,
    ndvi_min      DOUBLE PRECISION,
    ndvi_mean     DOUBLE PRECISION,
    ndvi_max      DOUBLE PRECISION,
    ndvi_stdev    DOUBLE PRECISION,
    sample_count  INTEGER,
    no_data_count INTEGER,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE satellite_images (
    id              SERIAL PRIMARY KEY,
    area_id         INTEGER REFERENCES areas(id) ON DELETE CASCADE,
    collection      VARCHAR(100) NOT NULL,
    scene_id        VARCHAR(255) NOT NULL,
    image_date      DATE NOT NULL,
    cloud_cover     DOUBLE PRECISION,
    satellite       VARCHAR(100),
    resolution      INTEGER NOT NULL DEFAULT 10,
    image_path      VARCHAR(500) NOT NULL,
    bbox            GEOMETRY(POLYGON, 4326),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE precipitation_time_series (
    id            SERIAL PRIMARY KEY,
    area_id       INTEGER REFERENCES areas(id) ON DELETE CASCADE,
    date          DATE NOT NULL,
    date_from     DATE NOT NULL,
    date_to       DATE NOT NULL,
    source        VARCHAR(50) NOT NULL DEFAULT 'open-meteo',
    aggregation   VARCHAR(20) NOT NULL DEFAULT 'day',
    precip_total  DOUBLE PRECISION,
    precip_days   INTEGER,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_areas_geom ON areas USING GIST(geom);
CREATE INDEX idx_ndvi_area_id ON ndvi_time_series(area_id);
CREATE INDEX idx_satellite_area_id ON satellite_images(area_id);
CREATE INDEX idx_satellite_area_date ON satellite_images(area_id, collection, image_date);
CREATE INDEX idx_precipitation_area_id ON precipitation_time_series(area_id);
CREATE UNIQUE INDEX idx_ndvi_cache ON ndvi_time_series(area_id, date, date_from, date_to, collection, aggregation, resolution);
CREATE UNIQUE INDEX idx_image_cache ON satellite_images(area_id, collection, scene_id, resolution);
CREATE UNIQUE INDEX idx_precipitation_cache ON precipitation_time_series(area_id, date, date_from, date_to, source, aggregation);

CREATE TABLE ibge_municipalities (
    code INTEGER PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    uf   VARCHAR(2) NOT NULL,
    geom GEOMETRY(MULTIPOLYGON, 4326) NOT NULL
);

CREATE INDEX idx_ibge_municipalities_geom ON ibge_municipalities USING GIST(geom);
CREATE INDEX idx_ibge_municipalities_uf   ON ibge_municipalities(uf);

CREATE TABLE crop_yield_estimates (
    id                  SERIAL PRIMARY KEY,
    area_id             INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    product_code        INTEGER NOT NULL,
    product_name        VARCHAR(120) NOT NULL,
    years               INTEGER[] NOT NULL,
    n_years             INTEGER NOT NULL,
    municipality_code   INTEGER,
    municipality_name   VARCHAR(120),
    uf                  VARCHAR(2),
    area_ha             DOUBLE PRECISION NOT NULL,
    yield_value         DOUBLE PRECISION,
    yield_unit          VARCHAR(30) NOT NULL DEFAULT 'kg/ha',
    total               DOUBLE PRECISION,
    total_tons          DOUBLE PRECISION,
    total_mil_frutos    DOUBLE PRECISION,
    value_total         DOUBLE PRECISION,
    price_per_unit      DOUBLE PRECISION,
    value_years         INTEGER,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_crop_yield_estimate UNIQUE (area_id, product_code, years)
);

CREATE INDEX idx_crop_yield_area_id ON crop_yield_estimates(area_id);

CREATE TABLE crop_products (
    code   INTEGER PRIMARY KEY,
    name   VARCHAR(120) NOT NULL,
    unit   VARCHAR(30) NOT NULL DEFAULT 'kg/ha',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sack_kg INTEGER
);

INSERT INTO crop_products (code, name, unit) VALUES
    (40124, 'Soja (em grão)',              'kg/ha'),
    (40139, 'Café (em grão) Total',        'kg/ha'),
    (40140, 'Café (em grão) Arábica',      'kg/ha'),
    (40141, 'Café (em grão) Canephora',    'kg/ha'),
    (40122, 'Milho (em grão)',             'kg/ha'),
    (40106, 'Cana-de-açúcar',              'kg/ha'),
    (40102, 'Arroz (em casca)',            'kg/ha'),
    (40112, 'Feijão (em grão)',            'kg/ha'),
    (40119, 'Mandioca',                    'kg/ha'),
    (40127, 'Trigo (em grão)',             'kg/ha'),
    (40099, 'Algodão herbáceo (em caroço)','kg/ha'),
    (40101, 'Amendoim (em casca)',         'kg/ha'),
    (40105, 'Batata-inglesa',              'kg/ha'),
    (40107, 'Cebola',                      'kg/ha'),
    (40125, 'Sorgo (em grão)',             'kg/ha'),
    (40103, 'Aveia (em grão)',             'kg/ha'),
    (40109, 'Cevada (em grão)',            'kg/ha'),
    (40126, 'Tomate',                      'kg/ha'),
    (40113, 'Fumo (em folha)',             'kg/ha'),
    (40147, 'Erva-mate (folha verde)',     'kg/ha'),
    (40138, 'Cacau (em amêndoa)',          'kg/ha'),
    (40151, 'Laranja',                     'kg/ha'),
    (40136, 'Banana (cacho)',              'kg/ha'),
    (40261, 'Mamão',                       'kg/ha'),
    (40262, 'Manga',                       'kg/ha'),
    (40269, 'Pimenta-do-reino',            'kg/ha'),
    (40274, 'Uva',                         'kg/ha'),
    (40143, 'Castanha de caju',            'kg/ha'),
    (40118, 'Mamona (baga)',               'kg/ha'),
    (40120, 'Melancia',                    'kg/ha'),
    (40121, 'Melão',                       'kg/ha'),
    (40092, 'Abacaxi',                     'frutos/ha'),
    (40145, 'Coco-da-baía',                'frutos/ha')
ON CONFLICT (code) DO NOTHING;

-- Coffee (in beans) is measured in 60 kg bags (saca), so yield and total
-- production are converted to sacas/ha and sacas (60 kg each).
UPDATE crop_products SET sack_kg = 60 WHERE code IN (40139, 40140, 40141);
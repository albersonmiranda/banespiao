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

CREATE INDEX idx_areas_geom ON areas USING GIST(geom);
CREATE INDEX idx_ndvi_area_id ON ndvi_time_series(area_id);
CREATE INDEX idx_satellite_area_id ON satellite_images(area_id);
CREATE INDEX idx_satellite_area_date ON satellite_images(area_id, collection, image_date);
CREATE UNIQUE INDEX idx_ndvi_cache ON ndvi_time_series(area_id, date, date_from, date_to, collection, aggregation);
CREATE UNIQUE INDEX idx_image_cache ON satellite_images(area_id, collection, scene_id, resolution);
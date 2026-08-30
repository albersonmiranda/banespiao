library(DBI)
library(RPostgres)
library(sf)

get_pool <- function() {
  con <- getOption("banesensor.pool")
  if (is.null(con) || !DBI::dbIsValid(con)) {
    con <- dbConnect(
      RPostgres::Postgres(),
      dbname   = Sys.getenv("DB_NAME"),
      host     = Sys.getenv("DB_HOST", "localhost"),
      port     = as.integer(Sys.getenv("DB_PORT", "5432")),
      user     = Sys.getenv("DB_USER"),
      password = Sys.getenv("DB_PASSWORD")
    )
    options(banesensor.pool = con)
  }
  con
}

db_disconnect <- function() {
  con <- getOption("banesensor.pool")
  if (!is.null(con)) {
    dbDisconnect(con)
    options(banesensor.pool = NULL)
  }
}

migrate_satellite_images <- function() {
  con <- get_pool()
  dbExecute(con, "ALTER TABLE satellite_images ADD COLUMN IF NOT EXISTS scene_id VARCHAR(255)")
  dbExecute(con, "ALTER TABLE satellite_images ADD COLUMN IF NOT EXISTS satellite VARCHAR(100)")
  dbExecute(con, "ALTER TABLE satellite_images ADD COLUMN IF NOT EXISTS resolution INTEGER NOT NULL DEFAULT 10")
  dbExecute(con, "UPDATE satellite_images SET scene_id = COALESCE(scene_id, image_path)")
  dbExecute(con, "ALTER TABLE satellite_images ALTER COLUMN scene_id SET NOT NULL")
  dbExecute(con, "DROP INDEX IF EXISTS idx_image_cache")
  dbExecute(con, "CREATE UNIQUE INDEX IF NOT EXISTS idx_image_cache ON satellite_images(area_id, collection, scene_id, resolution)")
  dbExecute(con, "CREATE INDEX IF NOT EXISTS idx_satellite_area_date ON satellite_images(area_id, collection, image_date)")
  invisible(NULL)
}

insert_area <- function(name, kml_filename, geom_sf) {
  con <- get_pool()
  wkt <- st_as_text(st_geometry(geom_sf))
  query <- sprintf(
    "INSERT INTO areas (name, kml_filename, geom) VALUES ('%s', '%s', ST_GeomFromText('%s', 4326)) RETURNING id, name, ST_AsGeoJSON(geom) as geojson",
    gsub("'", "''", name),
    gsub("'", "''", kml_filename),
    wkt
  )
  res <- dbGetQuery(con, query)
  list(
    id      = unname(res$id[[1]]),
    name    = unname(res$name[[1]]),
    geojson = jsonlite::fromJSON(res$geojson[[1]])
  )
}

get_areas <- function() {
  con <- get_pool()
  dbGetQuery(con, "SELECT id, name, kml_filename, created_at FROM areas ORDER BY created_at DESC")
}

get_area <- function(id) {
  con <- get_pool()
  query <- sprintf(
    "SELECT id, name, kml_filename, ST_AsGeoJSON(geom) as geojson, created_at FROM areas WHERE id = %d",
    as.integer(id)
  )
  res <- dbGetQuery(con, query)
  if (nrow(res) == 0) return(NULL)
  list(
    id         = unname(res$id[[1]]),
    name       = unname(res$name[[1]]),
    geojson    = jsonlite::fromJSON(res$geojson[[1]]),
    created_at = unname(res$created_at[[1]])
  )
}

get_area_geometry <- function(id) {
  con <- get_pool()
  query <- sprintf(
    "SELECT ST_AsText(geom) as wkt FROM areas WHERE id = %d",
    as.integer(id)
  )
  res <- dbGetQuery(con, query)
  if (nrow(res) == 0) return(NULL)
  geometry <- sf::st_as_sfc(res$wkt[1])
  geometry <- sf::st_simplify(geometry, preserveTopology = TRUE, dTolerance = 0)
  geometry <- sf::st_make_valid(geometry)
  geometry <- sf::st_simplify(geometry, preserveTopology = TRUE, dTolerance = 0)
  sf::st_sf(geometry = sf::st_set_crs(geometry, 4326))
}

get_area_id_by_name <- function(name) {
  con <- get_pool()
  query <- sprintf(
    "SELECT id FROM areas WHERE lower(name) = lower('%s') LIMIT 1",
    gsub("'", "''", name)
  )
  res <- dbGetQuery(con, query)
  if (nrow(res) == 0) return(NULL)
  unname(res$id[[1]])
}

delete_area <- function(id) {
  con <- get_pool()
  dbExecute(con, sprintf("DELETE FROM areas WHERE id = %d", as.integer(id)))
}

get_image_paths_for_area <- function(id) {
  con <- get_pool()
  query <- sprintf(
    "SELECT image_path FROM satellite_images WHERE area_id = %d",
    as.integer(id)
  )
  res <- dbGetQuery(con, query)
  if (nrow(res) == 0) return(character(0))
  res$image_path
}

get_ndvi_cache <- function(area_id, date_from, date_to, collection, aggregation) {
  con <- get_pool()
  query <- sprintf(
    "SELECT * FROM ndvi_time_series WHERE area_id = %d AND date_from = '%s' AND date_to = '%s' AND collection = '%s' AND aggregation = '%s' ORDER BY date",
    as.integer(area_id), date_from, date_to, collection, aggregation
  )
  res <- dbGetQuery(con, query)
  if (nrow(res) == 0) return(NULL)
  res
}

insert_ndvi_series <- function(area_id, date_from, date_to, collection, aggregation, stats_df) {
  con <- get_pool()
  if (!nrow(stats_df)) return(invisible(NULL))
  sql_lit <- function(x) {
    if (length(x) != 1) x <- x[[1]]
    if (is.na(x) || is.nan(x) || (!is.numeric(x) && toupper(as.character(x)) %in% c("NA", "NAN", "INF", "-INF"))) "NULL" else x
  }
  for (i in seq_len(nrow(stats_df))) {
    row <- stats_df[i, ]
    query <- sprintf(
      "INSERT INTO ndvi_time_series (area_id, date, date_from, date_to, collection, aggregation, ndvi_min, ndvi_mean, ndvi_max, ndvi_stdev, sample_count, no_data_count) VALUES (%d, '%s', '%s', '%s', '%s', '%s', %s, %s, %s, %s, %s, %s) ON CONFLICT (area_id, date, date_from, date_to, collection, aggregation) DO UPDATE SET ndvi_min = EXCLUDED.ndvi_min, ndvi_mean = EXCLUDED.ndvi_mean, ndvi_max = EXCLUDED.ndvi_max, ndvi_stdev = EXCLUDED.ndvi_stdev, sample_count = EXCLUDED.sample_count, no_data_count = EXCLUDED.no_data_count",
      as.integer(area_id), as.character(row$date), date_from, date_to, collection, aggregation,
      sql_lit(row$ndvi_min),
      sql_lit(row$ndvi_mean),
      sql_lit(row$ndvi_max),
      sql_lit(row$ndvi_stdev),
      sql_lit(row$sample_count),
      sql_lit(row$no_data_count)
    )
    dbExecute(con, query)
  }
}

get_image_cache <- function(area_id, collection, date_from = NULL, date_to = NULL, resolution = NULL) {
  con <- get_pool()
  clauses <- c("area_id = $1", "collection = $2")
  params <- list(as.integer(area_id), collection)
  if (!is.null(date_from)) {
    clauses <- c(clauses, sprintf("image_date >= $%d", length(params) + 1))
    params <- c(params, list(as.Date(date_from)))
  }
  if (!is.null(date_to)) {
    clauses <- c(clauses, sprintf("image_date <= $%d", length(params) + 1))
    params <- c(params, list(as.Date(date_to)))
  }
  if (!is.null(resolution)) {
    clauses <- c(clauses, sprintf("resolution = $%d", length(params) + 1))
    params <- c(params, list(as.integer(resolution)))
  }
  query <- paste("SELECT id, area_id, collection, scene_id, image_date, cloud_cover, satellite, resolution, image_path, bbox, created_at FROM satellite_images WHERE", paste(clauses, collapse = " AND "), "ORDER BY image_date DESC, cloud_cover NULLS LAST, id DESC")
  res <- DBI::dbGetQuery(con, query, params = params)
  if (nrow(res) == 0) return(NULL)
  res
}

get_image_record <- function(area_id, image_id) {
  con <- get_pool()
  query <- "SELECT id, image_path FROM satellite_images WHERE area_id = $1 AND id = $2"
  res <- DBI::dbGetQuery(con, query, params = list(as.integer(area_id), as.integer(image_id)))
  if (nrow(res) == 0) return(NULL)
  res
}

insert_image_record <- function(area_id, collection, scene_id, image_date, cloud_cover, satellite, resolution, image_path, bbox_sf) {
  con <- get_pool()
  wkt <- st_as_text(st_geometry(bbox_sf))
  query <- sprintf(
    "INSERT INTO satellite_images (area_id, collection, scene_id, image_date, cloud_cover, satellite, resolution, image_path, bbox) VALUES (%d, '%s', '%s', '%s', %s, '%s', %d, '%s', ST_GeomFromText('%s', 4326)) ON CONFLICT (area_id, collection, scene_id, resolution) DO UPDATE SET cloud_cover = EXCLUDED.cloud_cover, satellite = EXCLUDED.satellite, image_path = EXCLUDED.image_path, bbox = EXCLUDED.bbox RETURNING id",
    as.integer(area_id), collection, gsub("'", "''", scene_id), image_date,
    ifelse(is.na(cloud_cover), "NULL", cloud_cover),
    gsub("'", "''", ifelse(is.null(satellite) || is.na(satellite), "", satellite)), as.integer(resolution),
    gsub("'", "''", image_path),
    wkt
  )
  res <- dbGetQuery(con, query)
  res$id[1]
}
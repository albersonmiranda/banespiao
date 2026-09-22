library(terra)
library(sf)
library(httr2)

INPE_STAC_URL <- "https://data.inpe.br/bdc/stac/v1/"

`%||%` <- function(a, b) if (is.null(a)) b else a

inpe_asset_href <- function(item, key) {
  asset <- item$assets[[key]]
  if (is.null(asset)) return(NULL)
  asset$href %||% NULL
}

set_inpe_gdal_env <- function() {
  Sys.setenv(
    CPL_VSIL_CURL_ALLOWED_EXTENSIONS = ".tif,.TIF,.tiff,.TIFF",
    GDAL_HTTP_MULTIRANGE = "YES",
    GDAL_HTTP_VERSION = "2",
    GDAL_HTTP_TIMEOUT = "300",
    GDAL_DISABLE_READDIR_ON_OPEN = "EMPTY_DIR",
    CPL_VSIL_CURL_CACHE_SIZE = "67108864"
  )
}

inpe_collection_spec <- function(collection) {
  switch(collection,
    "S2_L2A-1" = list(
      kind              = "sentinel",
      red               = "B04",
      nir               = "B08",
      mask              = "SCL",
      resolution        = 10L,
      scale             = 0.0001,
      scale_add         = 0,
      mask_cloud_values = c(1, 3, 8, 9, 10),
      mask_cloud_bits   = NULL,
      rgb               = c("B04", "B03", "B02"),
      tci               = "TCI",
      display_gain      = 2.5,
      satellite_label   = "Sentinel-2"
    ),
    "landsat-2" = list(
      kind              = "landsat",
      red               = "red",
      nir               = "nir08",
      mask              = "qa_pixel",
      resolution        = 30L,
      scale             = 2.75e-05,
      scale_add         = -0.2,
      mask_cloud_values = NULL,
      mask_cloud_bits   = 62L,
      rgb               = c("red", "green", "blue"),
      tci               = NULL,
      display_gain      = 1,
      satellite_label   = "Landsat"
    ),
    "S2-16D-2" = list(
      kind              = "datacube",
      ndvi              = "NDVI",
      resolution        = 10L,
      scale             = 0.0001,
      scale_add         = 0,
      nodata            = -9999L,
      mask              = "SCL",
      mask_cloud_values = c(1, 2, 3, 7, 8, 9, 10, 11),
      mask_cloud_bits   = NULL,
      rgb               = c("B04", "B03", "B02"),
      tci               = NULL,
      display_gain      = 1,
      satellite_label   = "Sentinel-2"
    ),
    "LANDSAT-16D-1" = list(
      kind              = "datacube",
      ndvi              = "NDVI",
      resolution        = 30L,
      scale             = 0.0001,
      scale_add         = 0,
      nodata            = -9999L,
      mask              = "qa_pixel",
      mask_cloud_values = NULL,
      mask_cloud_bits   = 62L,
      rgb               = c("red", "green", "blue"),
      tci               = NULL,
      display_gain      = 1,
      satellite_label   = "Landsat"
    ),
    stop("Unsupported INPE collection: ", collection)
  )
}

stac_search_items <- function(collection, bbox, datetime, limit = 100, url = INPE_STAC_URL,
                              max_items = 3000) {
  query_url <- paste0(url, "search")
  attach_defaults <- function(req) {
    req |>
      httr2::req_timeout(60) |>
      httr2::req_options(ipresolve = 1, connecttimeout = 60) |>
      httr2::req_retry(max_tries = 3, backoff = ~ 2 ^ .x)
  }
  tryCatch({
    current_url <- query_url
    with_params <- TRUE
    features <- list()
    repeat {
      request <- if (with_params) {
        attach_defaults(httr2::request(current_url) |> httr2::req_url_query(
          collections = collection,
          bbox = paste(as.numeric(bbox), collapse = ","),
          datetime = datetime,
          limit = limit
        ))
      } else {
        attach_defaults(httr2::request(current_url))
      }
      response <- httr2::req_perform(request) |> httr2::resp_body_json(simplifyVector = FALSE)
      features <- c(features, response$features %||% list())
      next_link <- Filter(function(link) identical(link$rel, "next"), response$links %||% list())
      if (!length(next_link) || length(features) >= max_items) break
      current_url <- next_link[[1]]$href
      with_params <- FALSE
    }
    ids <- vapply(features, function(item) item$id %||% NA_character_, character(1))
    features[!duplicated(ids)]
  }, error = function(error) {
    stop("INPE catalog is temporarily unreachable. Details: ", conditionMessage(error))
  })
}

resolve_inpe_collection <- function(collection) {
  switch(collection,
    "S2_L2A-1"        = "S2_L2A-1",
    "sentinel-2-l2a"  = "S2_L2A-1",
    "landsat-2"       = "landsat-2",
    "landsat-ot-l1"   = "landsat-2",
    "landsat-c2-l2"   = "landsat-2",
    "S2-16D-2"        = "S2-16D-2",
    "LANDSAT-16D-1"   = "LANDSAT-16D-1",
    stop("Unknown INPE collection: ", collection)
  )
}

infer_satellite <- function(scene_id, spec) {
  if (spec$kind == "sentinel") {
    m <- regmatches(scene_id, regexpr("^S2[ABC]", scene_id))
    if (length(m)) {
      sat <- switch(m,
        S2A = "Sentinel-2A",
        S2B = "Sentinel-2B",
        S2C = "Sentinel-2C",
        NULL
      )
      if (!is.null(sat)) return(sat)
    }
    return("Sentinel-2")
  }
  if (spec$kind == "landsat") {
    if (grepl("^LC09", scene_id)) return("Landsat-9")
    if (grepl("^LC08", scene_id)) return("Landsat-8")
    if (grepl("^LE07", scene_id)) return("Landsat-7")
    if (grepl("^LT0[45]", scene_id)) return("Landsat-5")
    return("Landsat")
  }
  spec$satellite_label
}

search_inpe_items <- function(aoi_sf, collection, date_from, date_to, cloud_cover_max = NULL) {
  bbox <- sf::st_bbox(sf::st_transform(aoi_sf, 4326))
  items <- stac_search_items(collection, bbox, paste(date_from, date_to, sep = "/"))
  if (!length(items)) return(list())
  if (!is.null(cloud_cover_max)) {
    items <- Filter(function(item) {
      cc <- suppressWarnings(as.numeric(item$properties[["eo:cloud_cover"]] %||% NA_real_))
      is.na(cc) || is.nan(cc) || cc < cloud_cover_max
    }, items)
  }
  items
}

render_inpe_tci <- function(href, aoi_sf, output_file) {
  set_inpe_gdal_env()
  source_raster <- terra::rast(paste0("/vsicurl/", href))
  aoi_vect <- terra::project(terra::vect(aoi_sf), terra::crs(source_raster))
  cropped <- terra::crop(source_raster, aoi_vect, snap = "out")
  masked <- terra::mask(cropped, aoi_vect)
  if (terra::ncell(masked) == 0) stop("Image does not intersect the selected area")
  terra::writeRaster(masked, output_file, overwrite = TRUE, filetype = "PNG", datatype = "INT1U", NAflag = 0)
  output_file
}

to_srgb_uint8 <- function(v) {
  v <- suppressWarnings(as.numeric(v))
  v[!is.finite(v)] <- NA_real_
  vv <- pmax(pmin(v, 1), 0)
  g <- ifelse(vv <= 0.0031308, 12.92 * vv, 1.055 * vv^(1 / 2.4) - 0.055)
  round(g * 255)
}

load_inpe_rgb_stack <- function(item, spec, aoi_sf) {
  set_inpe_gdal_env()
  hrefs <- lapply(spec$rgb, function(band) inpe_asset_href(item, band))
  if (any(vapply(hrefs, is.null, logical(1)))) {
    stop("Missing RGB band assets for scene ", item$id)
  }
  raw <- lapply(hrefs, function(h) terra::rast(paste0("/vsicurl/", h)))
  aoi_vect <- terra::project(terra::vect(aoi_sf), terra::crs(raw[[1]]))
  crop_ext <- terra::ext(aoi_vect)
  raw <- lapply(raw, function(r) terra::crop(r, crop_ext, snap = "out"))
  ref <- raw[[1]]
  layers <- lapply(raw, function(r) {
    aligned <- terra::resample(r, ref, method = "near")
    terra::mask(aligned, aoi_vect)
  })
  if (terra::ncell(layers[[1]]) == 0) stop("Image does not intersect the selected area")
  stack <- do.call(c, layers)
  stack * spec$scale + spec$scale_add
}

is_blank_render <- function(file) {
  r <- tryCatch(terra::rast(file), error = function(e) NULL)
  if (is.null(r) || terra::ncell(r) == 0) return(TRUE)
  v <- terra::values(r, mat = TRUE)
  if (is.null(v) || !nrow(v)) return(TRUE)
  if (ncol(v) >= 4) {
    alpha <- v[, 4]
    inside <- !is.na(alpha) & alpha > 0
  } else {
    inside <- rep(TRUE, nrow(v))
  }
  if (!any(inside)) return(TRUE)
  colored <- inside &
    !is.na(v[, 1]) & !is.na(v[, 2]) & !is.na(v[, 3]) &
    (v[, 1] > 0 | v[, 2] > 0 | v[, 3] > 0)
  sum(colored) < sum(inside) * 0.02
}

render_inpe_rgb <- function(item, spec, aoi_sf, output_file) {
  if (spec$kind == "sentinel" && !is.null(spec$tci)) {
    tci_href <- inpe_asset_href(item, spec$tci)
    if (!is.null(tci_href)) {
      render_inpe_tci(tci_href, aoi_sf, output_file)
      if (!is_blank_render(output_file)) return(output_file)
      message(sprintf("[inpe] TCI blank for scene %s, falling back to band composite", item$id))
      unlink(output_file)
    }
  }
  stack <- load_inpe_rgb_stack(item, spec, aoi_sf)
  v <- terra::values(stack, mat = TRUE)
  v <- v * spec$display_gain
  base <- stack[[1]]
  layers <- lapply(seq_len(3), function(i) terra::setValues(base, to_srgb_uint8(v[, i])))
  alpha <- ifelse(is.na(v[, 1]), 0, 255)
  alpha_raster <- terra::setValues(base, alpha)
  out <- do.call(c, c(layers, list(alpha_raster)))
  terra::writeRaster(out, output_file, overwrite = TRUE, filetype = "PNG", datatype = "INT1U", NAflag = 0)
  output_file
}

get_inpe_image_series <- function(aoi_sf, area_id, collection, date_from, date_to,
                                  resolution = NULL) {
  collection <- resolve_inpe_collection(collection)
  spec <- inpe_collection_spec(collection)
  if (is.null(resolution)) resolution <- spec$resolution
  output_dir <- Sys.getenv("UPLOAD_DIR", "/app/uploads")
  dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)
  cached <- get_image_cache(area_id, collection, date_from, date_to, resolution)
  cached_paths <- if (is.null(cached)) character(0) else setNames(as.character(cached$image_path), as.character(cached$scene_id))
  bbox_sf <- sf::st_set_crs(sf::st_as_sfc(sf::st_bbox(aoi_sf)), 4326)
  items <- search_inpe_items(aoi_sf, collection, date_from, date_to, cloud_cover_max = 20)

  for (item in items) {
    scene_id <- item$id %||% ""
    acquisition <- item$properties$datetime %||% item$properties$start_datetime
    if (!nzchar(scene_id) || is.null(acquisition)) next
    image_date <- as.Date(substr(acquisition, 1, 10))
    safe_scene_id <- gsub("[^A-Za-z0-9_.-]", "_", scene_id)
    output_file <- file.path(output_dir, sprintf(
      "inpe_%s_area-%d_%s_%dm.png",
      collection, as.integer(area_id), safe_scene_id, as.integer(resolution)
    ))
    if (identical(unname(cached_paths[scene_id]), output_file) && file.exists(output_file)) next

    rendered <- tryCatch({
      render_inpe_rgb(item, spec, aoi_sf, output_file)
    }, error = function(e) {
      message(sprintf("[inpe] render failed for scene %s: %s", scene_id, conditionMessage(e)))
      NULL
    })
    if (is.null(rendered) || !file.exists(output_file)) next
    if (is_blank_render(output_file)) {
      message(sprintf("[inpe] blank render for scene %s in area %s, skipping", scene_id, area_id))
      unlink(output_file)
      next
    }

    cloud_cover <- suppressWarnings(as.numeric(item$properties[["eo:cloud_cover"]] %||% NA_real_))
    satellite <- infer_satellite(scene_id, spec)
    insert_image_record(
      area_id, collection, scene_id, image_date, cloud_cover,
      satellite, as.integer(resolution), output_file, bbox_sf
    )
  }

  get_image_cache(area_id, collection, date_from, date_to, resolution)
}

scene_ndvi_stats <- function(item, spec, aoi_sf) {
  set_inpe_gdal_env()
  red_href <- inpe_asset_href(item, spec$red)
  nir_href <- inpe_asset_href(item, spec$nir)
  qa_href <- inpe_asset_href(item, spec$mask)
  if (is.null(red_href) || is.null(nir_href) || is.null(qa_href)) return(NULL)

  red <- terra::rast(paste0("/vsicurl/", red_href))
  nir <- terra::rast(paste0("/vsicurl/", nir_href))
  qa <- terra::rast(paste0("/vsicurl/", qa_href))
  aoi_vect <- terra::project(terra::vect(aoi_sf), terra::crs(red))
  crop_ext <- terra::ext(aoi_vect)

  red <- terra::crop(red, crop_ext, snap = "out")
  nir <- terra::crop(nir, crop_ext, snap = "out")
  qa <- terra::crop(qa, crop_ext, snap = "out")
  if (terra::ncell(red) == 0) return(NULL)

  ref <- red
  red_m <- terra::mask(red, aoi_vect)
  nir_m <- terra::mask(terra::resample(nir, ref, method = "near"), aoi_vect)
  qa_m <- terra::mask(terra::resample(qa, ref, method = "near"), aoi_vect)

  is_cloud <- function(qv) {
    if (!is.null(spec$mask_cloud_values)) {
      !is.na(qv) && (qv %in% spec$mask_cloud_values)
    } else if (!is.null(spec$mask_cloud_bits)) {
      !is.na(qv) && (bitwAnd(qv, spec$mask_cloud_bits) != 0L)
    } else {
      FALSE
    }
  }

  ndvi <- terra::app(c(red_m, nir_m, qa_m), function(px) {
    rv <- as.numeric(px[1]) * spec$scale + spec$scale_add
    nv <- as.numeric(px[2]) * spec$scale + spec$scale_add
    qv <- px[3]
    if (is.na(rv) || is.na(nv) || is.na(qv)) return(NA_real_)
    if (is_cloud(qv)) return(NA_real_)
    denom <- nv + rv
    if (!is.finite(denom) || denom == 0) return(NA_real_)
    (nv - rv) / denom
  })
  ndvi <- terra::clamp(ndvi, -1, 1, values = TRUE)

  vals <- terra::values(ndvi, mat = TRUE)
  vals <- vals[is.finite(vals)]
  if (length(vals) == 0) return(NULL)
  list(
    min       = min(vals),
    max       = max(vals),
    sum       = sum(vals),
    sumsq     = sum(vals * vals),
    n         = as.numeric(length(vals)),
    no_data   = as.numeric(terra::ncell(ndvi) - length(vals))
  )
}

datacube_ndvi_stats <- function(item, spec, aoi_sf) {
  set_inpe_gdal_env()
  ndvi_href <- inpe_asset_href(item, spec$ndvi)
  qa_href   <- inpe_asset_href(item, spec$mask)
  if (is.null(ndvi_href) || is.null(qa_href)) return(NULL)

  ndvi_raw <- terra::rast(paste0("/vsicurl/", ndvi_href))
  qa_raw   <- terra::rast(paste0("/vsicurl/", qa_href))
  aoi_vect <- terra::project(terra::vect(aoi_sf), terra::crs(ndvi_raw))
  crop_ext <- terra::ext(aoi_vect)
  ndvi_raw <- terra::crop(ndvi_raw, crop_ext, snap = "out")
  qa_raw   <- terra::crop(qa_raw, crop_ext, snap = "out")
  if (terra::ncell(ndvi_raw) == 0) return(NULL)

  ndvi <- terra::mask(ndvi_raw, aoi_vect)
  qa   <- terra::mask(terra::resample(qa_raw, ndvi_raw, method = "near"), aoi_vect)
  ndvi <- terra::classify(ndvi, rbind(c(spec$nodata, NA_real_)))

  # LCF cubes emit a "best pixel" even when the 16-day window has no clear
  # observation (CLEAROB == 0, SCL == cloud over the whole AOI), leaving
  # cloud-contaminated NDVI nodes. Mask those pixels using the cube's own
  # quality band (SCL for Sentinel-2, qa_pixel for Landsat) before scaling.
  is_cloud <- function(qv) {
    if (!is.null(spec$mask_cloud_values)) {
      !is.na(qv) && (qv %in% spec$mask_cloud_values)
    } else if (!is.null(spec$mask_cloud_bits)) {
      !is.na(qv) && (bitwAnd(qv, spec$mask_cloud_bits) != 0L)
    } else {
      FALSE
    }
  }
  ndvi <- terra::app(c(ndvi, qa), function(px) {
    rv <- as.numeric(px[1])
    qv <- px[2]
    if (is.na(rv) || is.na(qv) || is_cloud(qv)) return(NA_real_)
    rv
  })

  ndvi <- ndvi * spec$scale + spec$scale_add
  ndvi <- terra::clamp(ndvi, -1, 1, values = TRUE)

  vals <- terra::values(ndvi, mat = TRUE)
  vals <- vals[is.finite(vals)]
  min_valid <- max(50L, ceiling(0.01 * terra::ncell(ndvi)))
  if (length(vals) < min_valid) return(NULL)
  list(
    min       = min(vals),
    max       = max(vals),
    sum       = sum(vals),
    sumsq     = sum(vals * vals),
    n         = as.numeric(length(vals)),
    no_data   = as.numeric(terra::ncell(ndvi) - length(vals))
  )
}

compute_inpe_ndvi_timeseries <- function(aoi_sf, date_from, date_to, collection,
                                          aggregation_period = 1,
                                          aggregation_unit = "month",
                                          resolution = NULL) {
  collection <- resolve_inpe_collection(collection)
  spec <- inpe_collection_spec(collection)
  cloud_cover_max <- if (spec$kind == "datacube") NULL else 70
  items <- search_inpe_items(aoi_sf, collection, date_from, date_to, cloud_cover_max = cloud_cover_max)
  if (!length(items)) {
    stop("No INPE imagery available for the selected period and area (collection ", collection, ")")
  }

  scene_stats <- if (spec$kind == "datacube") {
    datacube_ndvi_stats
  } else {
    scene_ndvi_stats
  }

  scenes <- Filter(Negate(is.null), lapply(items, function(item) {
    acquisition <- item$properties$datetime %||% item$properties$start_datetime
    if (is.null(acquisition)) return(NULL)
    scene_date <- as.character(as.Date(substr(acquisition, 1, 10)))
    if (as.Date(scene_date) < as.Date(date_from) || as.Date(scene_date) > as.Date(date_to)) return(NULL)
    stats <- tryCatch(scene_stats(item, spec, aoi_sf), error = function(e) {
      message(sprintf("[inpe] NDVI failed for scene %s: %s", item$id %||% "?", conditionMessage(e)))
      NULL
    })
    if (is.null(stats)) return(NULL)
    c(list(date = scene_date), stats)
  }))

  aggregate_ndvi_scenes(scenes, aggregation_period, aggregation_unit, anchor = as.Date(date_from))
}

aggregate_ndvi_scenes <- function(scenes, aggregation_period, aggregation_unit, anchor) {
  if (!length(scenes)) stop("No valid pixels found for the selected period and area")
  dates <- as.Date(vapply(scenes, `[[`, character(1), "date"))
  buckets <- period_end_date(dates, aggregation_period, aggregation_unit, anchor = anchor)
  rows <- lapply(unique(buckets), function(bucket) {
    selected <- scenes[buckets == bucket]
    n_total <- sum(vapply(selected, `[[`, numeric(1), "n"))
    sum_total <- sum(vapply(selected, `[[`, numeric(1), "sum"))
    sumsq_total <- sum(vapply(selected, `[[`, numeric(1), "sumsq"))
    nir_mean_total <- if (n_total > 0) sum_total / n_total else NA_real_
    data.frame(
      date          = as.character(as.Date(bucket)),
      ndvi_min      = min(vapply(selected, `[[`, numeric(1), "min")),
      ndvi_mean     = nir_mean_total,
      ndvi_max      = max(vapply(selected, `[[`, numeric(1), "max")),
      ndvi_stdev    = if (n_total > 1) sqrt(max(sumsq_total - sum_total^2 / n_total, 0) / (n_total - 1)) else 0,
      sample_count  = as.integer(n_total),
      no_data_count = as.integer(sum(vapply(selected, `[[`, numeric(1), "no_data"))),
      stringsAsFactors = FALSE
    )
  })
  out <- do.call(rbind, rows)
  out[order(out$date), , drop = FALSE]
}
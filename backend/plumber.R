#* Banesensor API
#*
#* Satellite-based vegetation monitoring reports: upload KML areas, compute NDVI
#* time series and fetch true-color satellite imagery from the Copernicus Data
#* Space Ecosystem.
#*
#* Heavy, long-running endpoints (/api/ndvi, /api/image) run asynchronously on a
#* pool of parallel mirai worker processes so the API never blocks while they
#* are being computed.
#* @version 1.0.0
#* @tag areas Area management
#* @tag ndvi Vegetation index time series
#* @tag imagery Satellite imagery
"_API"

library(plumber2)

source("R/config.R", local = TRUE)
source("R/db.R", local = TRUE)
source("R/kml.R", local = TRUE)
source("R/ndvi.R", local = TRUE)
source("R/satellite.R", local = TRUE)
source("R/cbers.R", local = TRUE)

ensure_upload_dir()
migrate_satellite_images()
start_async_workers()

# Keep uploaded KML bytes raw regardless of the browser-supplied Content-Type
register_parser("raw-kml", function(...) function(raw, directives) raw, "application/vnd.google-earth.kml+xml")
register_parser("raw-xml", function(...) function(raw, directives) raw, "application/xml")
register_parser("raw-bin", function(...) function(raw, directives) raw, "application/octet-stream")

#* List all uploaded areas
#* @get /api/areas
#* @serializer unboxedJSON
#* @response 200:[object] List of areas
function() {
  get_areas()
}

#* Get a single area
#* @get /api/areas/<id:integer>
#* @serializer unboxedJSON
#* @response 200:object The area with geometry
#* @response 404:object Unknown area
function(id) {
  area <- get_area(id)
  if (is.null(area)) {
    reqres::abort_status(404, detail = "Area not found")
  }
  area
}

#* Delete an area and all of its cached data
#* @delete /api/areas/<id:integer>
#* @serializer unboxedJSON
#* @response 200:object Deletion confirmation
#* @response 404:object Unknown area
function(id) {
  if (is.null(get_area(id))) {
    reqres::abort_status(404, detail = "Area not found")
  }
  cleanup_area_images(id)
  delete_area(id)
  list(success = TRUE, message = paste("Area", id, "deleted"))
}

#* Upload a KML file to create a new area
#* @post /api/areas/upload
#* @serializer unboxedJSON
#* @parser multi
#* @parser raw-kml
#* @parser raw-xml
#* @parser raw-bin
#* @response 200:object The created area
#* @response 400:object Missing or invalid file
#* @response 500:object Processing error
function(body) {
  file <- if (is.raw(body)) body else body$file
  if (is.null(file) || !is.raw(file)) {
    reqres::abort_status(400, detail = "No KML file uploaded. Send a file with field name 'file' or the raw KML bytes as body.")
  }
  tryCatch({
    filename <- attr(file, "filename") %||% "area.kml"
    if (!grepl("\\.kml$", filename, ignore.case = TRUE)) {
      reqres::abort_status(400, detail = "Only .kml files are supported")
    }
    name <- if (is.list(body) && !is.null(body$name) && nzchar(body$name)) {
      as.character(body$name)
    } else {
      tools::file_path_sans_ext(basename(filename))
    }
    tmp <- tempfile(fileext = ".kml")
    on.exit(unlink(tmp), add = TRUE)
    writeBin(as.vector(file), tmp)
    sf_obj <- parse_kml(tmp)
    area <- insert_area(name, filename, sf_obj)
    list(id = area$id, name = area$name, geojson = area$geojson)
  }, error = function(e) {
    if (inherits(e, "reqres_problem")) stop(e)
    reqres::abort_status(500, detail = paste("Failed to process KML:", conditionMessage(e)))
  })
}

#* Compute the NDVI time series for an area
#*
#* Runs asynchronously on a parallel worker; the response is returned once the
#* statistics have been queried from the satellite service and cached.
#* @post /api/ndvi/<id:integer>
#* @serializer unboxedJSON
#* @async
#* @body date_from:date Start of the period (required)
#* @body date_to:date End of the period (required)
#* @body collection:string("sentinel-2-l2a") Satellite collection
#* @body aggregation:string("month") Aggregation ('day', 'week', 'month' or 'year')
#* @body resolution:integer(100) Resolution in meters
#* @response 200:object NDVI time series
#* @response 404:object Unknown area
#* @response 500:object Processing error
function(id, body) {
  suppressMessages({ library(DBI); library(RPostgres); library(sf) })
  tryCatch({
    date_from <- body[["date_from"]]
    date_to   <- body[["date_to"]]
    if (is.null(date_from) || is.null(date_to)) {
      return(list(good = FALSE, status = 400L, err = "date_from and date_to are required"))
    }
    collection  <- ifelse(is.null(body[["collection"]]), "sentinel-2-l2a", body[["collection"]])
    aggregation <- ifelse(is.null(body[["aggregation"]]), "month", body[["aggregation"]])
    resolution  <- ifelse(is.null(body[["resolution"]]), 100L, as.integer(body[["resolution"]]))

    agg <- list(
      day   = c(1L, "day"),
      week  = c(7L, "day"),
      month = c(1L, "month"),
      year  = c(1L, "year")
    )
    if (!aggregation %in% names(agg)) {
      return(list(good = FALSE, status = 400L, err = "aggregation must be one of: day, week, month, year"))
    }
    agg_period <- as.integer(agg[[aggregation]][1])
    agg_unit   <- agg[[aggregation]][2]

    aoi_geom <- get_area_geometry(id)
    if (is.null(aoi_geom)) {
      return(list(good = FALSE, status = 404L, err = "Area not found"))
    }

    stats <- compute_ndvi_timeseries(
      aoi_sf = aoi_geom, date_from = date_from, date_to = date_to,
      collection = collection, aggregation_period = agg_period,
      aggregation_unit = agg_unit, resolution = resolution
    )
    insert_ndvi_series(id, date_from, date_to, collection, aggregation, stats)
    list(good = TRUE, result = list(
      area_id = id, date_from = date_from, date_to = date_to,
      collection = collection, aggregation = aggregation, data = stats
    ))
  }, error = function(e) {
    message(sprintf("Image sync failed for area %s: %s", id, conditionMessage(e)))
    list(good = FALSE, status = 500L, err = conditionMessage(e))
  })
}

#* @then
function(response, result) {
  body <- response$body
  if (!isTRUE(body$good)) {
    response$status <- body$status %||% 500L
    response$body <- list(detail = body$err)
    return(Break)
  }
  response$body <- body$result
  Next
}

#* Get a cached NDVI time series
#* @get /api/ndvi/<id:integer>
#* @serializer unboxedJSON
#* @query date_from:string* Start of the period
#* @query date_to:string* End of the period
#* @query collection:string("sentinel-2-l2a") Satellite collection
#* @query aggregation:string("month") Aggregation level
#* @response 200:object Cached NDVI time series
#* @response 404:object No cached series for these parameters
function(id, query) {
  date_from   <- query$date_from
  date_to     <- query$date_to
  collection  <- query$collection %||% "sentinel-2-l2a"
  aggregation <- query$aggregation %||% "month"

  cached <- get_ndvi_cache(id, date_from, date_to, collection, aggregation)
  if (is.null(cached)) {
    reqres::abort_status(404, detail = "No cached NDVI data found. POST /api/ndvi/<id> to compute it first.")
  }
  list(
    area_id = id, date_from = date_from, date_to = date_to,
    collection = collection, aggregation = aggregation,
    data = cached[, c("date", "ndvi_min", "ndvi_mean", "ndvi_max", "ndvi_stdev", "sample_count", "no_data_count")]
  )
}

format_image_records <- function(records, area_id) {
  if (is.null(records)) return(list())
  lapply(seq_len(nrow(records)), function(i) {
    list(id = records$id[[i]], area_id = area_id, collection = records$collection[[i]],
         scene_id = records$scene_id[[i]], image_date = as.character(records$image_date[[i]]),
         cloud_cover = records$cloud_cover[[i]], satellite = records$satellite[[i]],
         resolution = records$resolution[[i]], image_url = paste0("/api/image/", area_id, "/file/", records$id[[i]]))
  })
}

#* Synchronize true-color satellite images for an area and date range
#*
#* Runs asynchronously on a parallel worker. The resulting images are stored
#* and served from /api/image/<id>/file/<image_id>.
#* @post /api/image/<id:integer>
#* @serializer unboxedJSON
#* @async
#* @body collection:string("sentinel-2-l2a") Satellite collection
#* @body date_from:date Start date
#* @body date_to:date End date
#* @body resolution:integer(10) Resolution in meters
#* @response 200:object Image metadata list
#* @response 404:object Unknown area or no imagery available
#* @response 500:object Processing error

function(id, body) {
  suppressMessages({ library(DBI); library(RPostgres); library(sf) })
  tryCatch({
    collection <- ifelse(is.null(body[["collection"]]), "sentinel-2-l2a", body[["collection"]])
    if (collection %in% c("landsat-c2-l2", "landsat-ot-c2-l2")) collection <- "landsat-ot-l1"
    resolution <- ifelse(is.null(body[["resolution"]]), 10L, as.integer(body[["resolution"]]))
    date_to <- ifelse(is.null(body[["date_to"]]), as.character(Sys.Date()), as.character(body[["date_to"]]))
    date_from <- ifelse(is.null(body[["date_from"]]), as.character(as.Date(date_to) - 365), as.character(body[["date_from"]]))

    aoi_geom <- get_area_geometry(id)
    if (is.null(aoi_geom)) {
      return(list(good = FALSE, status = 404L, err = "Area not found"))
    }

    records <- if (identical(body[["provider"]], "cbers") || startsWith(collection, "CB4A-")) {
      get_cbers_image_series(aoi_geom, id, date_from, date_to, resolution = 2L)
    } else {
      get_image_series(aoi_sf = aoi_geom, area_id = id, collection = collection,
                       resolution = resolution, date_from = date_from, date_to = date_to)
    }
    list(good = TRUE, result = list(
      area_id = id, collection = collection, date_from = date_from, date_to = date_to,
      images = format_image_records(records, id)
    ))
  }, error = function(e) {
    list(good = FALSE, status = 500L, err = conditionMessage(e))
  })
}

#* @then
function(response, result) {
  body <- response$body
  if (!isTRUE(body$good)) {
    response$status <- body$status %||% 500L
    response$body <- list(detail = body$err)
    return(Break)
  }
  response$body <- body$result
  Next
}

#* List cached satellite image metadata without contacting CDSE
#* @get /api/image/<id:integer>
#* @serializer unboxedJSON
#* @query collection:string("sentinel-2-l2a") Satellite collection
#* @query date_from:date Start date
#* @query date_to:date End date
#* @query resolution:integer(10) Resolution in meters
function(id, query) {
  collection <- query$collection %||% "sentinel-2-l2a"
  resolution <- as.integer(query$resolution %||% 10L)
  records <- get_image_cache(id, collection, query$date_from, query$date_to, resolution)
  list(area_id = id, images = format_image_records(records, id))
}

#* Serve the cached satellite image for an area as PNG
#* @get /api/image/<id:integer>/file/<image_id:integer>
#* @serializer image/png
#* @query collection:string("sentinel-2-l2a") Satellite collection
#* @response 200:image/png PNG image
#* @response 404:object No cached image
function(id, image_id) {
  cached <- get_image_record(id, image_id)
  if (is.null(cached)) {
    reqres::abort_status(404, detail = "No cached image found")
  }
  img_path <- cached$image_path[1]
  if (!file.exists(img_path)) {
    reqres::abort_status(404, detail = "Image file not found on disk")
  }
  readBin(img_path, "raw", file.size(img_path))
}

#* List available satellite collections
#* @get /api/collections
#* @serializer unboxedJSON
#* @response 200:object Available collections
function() {
  tryCatch({
    list(data = get_available_collections())
  }, error = function(e) {
    list(
      data = data.frame(
        id = c("sentinel-2-l2a", "landsat-c2-l2"),
        title = c("Sentinel 2 L2A", "Landsat 8-9 Collection 2 L2"),
        description = c("MSI multispectral, atmospheric corrected", "OLI/TIRS multispectral, surface reflectance"),
        processed = rep(NA_character_, 2)
      )
    )
  })
}

`%||%` <- function(a, b) if (is.null(a)) b else a
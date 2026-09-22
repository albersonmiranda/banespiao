library(CDSE)
library(rsi)

get_oauth_client <- function() {
  id <- Sys.getenv("CDSE_ID")
  secret <- Sys.getenv("CDSE_SECRET")
  if (nchar(id) == 0 || nchar(secret) == 0) {
    stop("CDSE_ID and CDSE_SECRET environment variables must be set")
  }
  CDSE::GetOAuthClient(id = id, secret = secret)
}

read_evalscript <- function(filename) {
  path <- file.path("scripts", filename)
  if (!file.exists(path)) {
    stop("Evalscript not found: ", path)
  }
  paste(readLines(path, warn = FALSE), collapse = "\n")
}

make_ndvi_evalscript <- function(constellation = "sentinel-2", mask_clouds = TRUE) {
  if (constellation == "sentinel-2" && mask_clouds) {
    return(read_evalscript("NDVI_SCL_masked_evalscript.js"))
  }
  si <- rsi::spectral_indices()
  ndvi <- si[si$short_name == "NDVI", ]
  if (!nrow(ndvi)) stop("NDVI spectral index not available")
  script <- CDSE::MakeEvalScript(ndvi, constellation = constellation)
  paste(script, collapse = "\n")
}

compute_ndvi_timeseries <- function(aoi_sf, date_from, date_to, collection,
                                     aggregation_period = 1,
                                     aggregation_unit = "month",
                                     resolution) {
  client <- get_oauth_client()
  script <- make_ndvi_evalscript(
    constellation = ifelse(grepl("sentinel", collection), "sentinel-2", "landsat")
  )

  stats <- CDSE::GetStatistics(
    aoi = aoi_sf,
    time_range = c(as.character(date_from), as.character(date_to)),
    collection = collection,
    script = script,
    mosaicking_order = "leastCC",
    resolution = resolution,
    aggregation_period = aggregation_period,
    aggregation_unit = aggregation_unit,
    client = client
  )

  if (is.null(stats) || nrow(stats) == 0) {
    stop("No NDVI data available for the selected period and area")
  }

  dates <- if ("to" %in% names(stats)) {
    as.Date(stats$to)
  } else {
    as.Date(stats$date)
  }

  to_num <- function(x) {
    v <- suppressWarnings(as.numeric(x))
    v[!is.finite(v) | is.nan(v)] <- NA_real_
    v
  }

  data.frame(
    date          = dates,
    ndvi_min      = to_num(stats$min),
    ndvi_mean     = to_num(stats$mean),
    ndvi_max      = to_num(stats$max),
    ndvi_stdev    = to_num(stats$stDev),
    sample_count  = suppressWarnings(as.integer(stats$sampleCount)),
    no_data_count = suppressWarnings(as.integer(stats$noDataCount)),
    stringsAsFactors = FALSE
  )
}

get_available_collections <- function() {
  client <- get_oauth_client()
  collections <- CDSE::GetCollections(as_data_frame = TRUE, client = client)
  supported <- collections[
    grepl("msi|landsat", collections$instrument, ignore.case = TRUE) |
      grepl("sentinel-2|landsat", collections$id, ignore.case = TRUE),
  ]
  data.frame(
    id          = supported$id,
    title       = supported$title,
    description = supported$description,
    gsd         = supported$gsd,
    since       = supported$since,
    stringsAsFactors = FALSE
  )
}
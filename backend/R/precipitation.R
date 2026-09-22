library(httr2)
library(sf)

OPEN_METEO_ARCHIVE_URL <- "https://archive-api.open-meteo.com/v1/archive"

precipitation_sample_points <- function(aoi_sf, n = 3) {
  aoi_4326 <- sf::st_transform(aoi_sf, 4326)
  bbox <- sf::st_bbox(aoi_4326)
  centroid <- sf::st_centroid(aoi_4326)
  center <- sf::st_coordinates(centroid)[1, ]
  if (n <= 1) {
    return(data.frame(lat = center[["Y"]], lon = center[["X"]]))
  }
  xs <- seq(bbox[["xmin"]], bbox[["xmax"]], length.out = n)
  ys <- seq(bbox[["ymin"]], bbox[["ymax"]], length.out = n)
  grid <- expand.grid(lon = xs, lat = ys)
  pts <- sf::st_as_sf(grid, coords = c("lon", "lat"), crs = 4326)
  inside <- lengths(sf::st_intersects(pts, aoi_4326)) > 0
  grid <- grid[inside, , drop = FALSE]
  if (!nrow(grid)) {
    grid <- data.frame(lat = center[["Y"]], lon = center[["X"]])
  }
  grid[, c("lat", "lon")]
}

fetch_daily_precipitation <- function(lat, lon, date_from, date_to) {
  data <- tryCatch({
    httr2::request(OPEN_METEO_ARCHIVE_URL) |>
      httr2::req_url_query(
        latitude = lat,
        longitude = lon,
        start_date = as.character(date_from),
        end_date = as.character(date_to),
        daily = "precipitation_sum",
        timezone = "UTC"
      ) |>
      httr2::req_timeout(60) |>
      httr2::req_retry(max_tries = 3, backoff = ~ 2 ^ (.x - 1)) |>
      httr2::req_perform() |>
      httr2::resp_body_json()
  }, error = function(e) {
    message("Open-Meteo request failed: ", conditionMessage(e))
    NULL
  })
  if (is.null(data) || is.null(data$daily$time)) return(NULL)
  data.frame(
    date = as.Date(unlist(data$daily$time)),
    precip = suppressWarnings(as.numeric(unlist(data$daily$precipitation_sum))),
    stringsAsFactors = FALSE
  )
}

aggregate_precipitation_daily <- function(daily_df, aggregation_period, aggregation_unit, anchor) {
  if (!nrow(daily_df)) return(daily_df)
  buckets <- period_end_date(daily_df$date, aggregation_period, aggregation_unit, anchor = anchor)
  rows <- lapply(unique(buckets), function(bucket) {
    selected <- daily_df[buckets == bucket, , drop = FALSE]
    data.frame(
      date         = as.character(as.Date(bucket)),
      precip_total = sum(selected$precip, na.rm = TRUE),
      precip_days  = as.integer(sum(selected$precip > 0, na.rm = TRUE)),
      stringsAsFactors = FALSE
    )
  })
  out <- do.call(rbind, rows)
  out[order(out$date), , drop = FALSE]
}

compute_precipitation_series <- function(aoi_sf, date_from, date_to,
                                          aggregation_period = 1,
                                          aggregation_unit = "month") {
  points <- precipitation_sample_points(aoi_sf)
  daily <- lapply(seq_len(nrow(points)), function(i) {
    fetch_daily_precipitation(points$lat[[i]], points$lon[[i]], date_from, date_to)
  })
  daily <- Filter(Negate(is.null), daily)
  if (!length(daily)) stop("No precipitation data available for the selected period and area")
  merged <- do.call(rbind, daily)
  if (length(daily) > 1) {
    daily_mean <- stats::aggregate(precip ~ date, data = merged, FUN = mean)
  } else {
    daily_mean <- merged[, c("date", "precip")]
  }
  names(daily_mean) <- c("date", "precip")
  daily_mean <- daily_mean[order(daily_mean$date), , drop = FALSE]
  aggregate_precipitation_daily(daily_mean, aggregation_period, aggregation_unit,
                                anchor = as.Date(date_from))
}
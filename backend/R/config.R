get_config <- function() {
  list(
    cdse_id      = Sys.getenv("CDSE_ID"),
    cdse_secret  = Sys.getenv("CDSE_SECRET"),
    db_host      = Sys.getenv("DB_HOST", "localhost"),
    db_port      = as.integer(Sys.getenv("DB_PORT", "5432")),
    db_name      = Sys.getenv("DB_NAME"),
    db_user      = Sys.getenv("DB_USER"),
    db_password  = Sys.getenv("DB_PASSWORD"),
    upload_dir   = Sys.getenv("UPLOAD_DIR", "uploads")
  )
}

ensure_upload_dir <- function() {
  dir <- Sys.getenv("UPLOAD_DIR", "uploads")
  if (!dir.exists(dir)) dir.create(dir, recursive = TRUE)
}

get_async_workers <- function() {
  n <- suppressWarnings(as.integer(Sys.getenv("ASYNC_WORKERS", "")))
  if (is.na(n) || n < 1L) {
    n <- min(parallel::detectCores(logical = FALSE), 8L)
  }
  max(n, 1L)
}

start_async_workers <- function() {
  n <- get_async_workers()
  if (!requireNamespace("mirai", quietly = TRUE)) {
    cli::cli_inform("mirai not available; async endpoints will run in ephemeral processes")
    return(invisible(NULL))
  }
  mirai::daemons(n)
  cli::cli_inform("Started {n} parallel worker(s) for async endpoint processing")
  invisible(n)
}

last_day_in_month <- function(year, month) {
  next_year <- year + (month %/% 12L)
  next_month <- month %% 12L + 1L
  as.Date(paste0(next_year, "-", sprintf("%02d", next_month), "-01")) - 1L
}

add_months_offset <- function(date, months) {
  y <- as.integer(format(date, "%Y"))
  m <- as.integer(format(date, "%m")) - 1L
  total <- y * 12L + m + months
  y2 <- total %/% 12L
  m2 <- total %% 12L + 1L
  last <- last_day_in_month(y2, m2)
  dom <- min(as.integer(format(date, "%d")), as.integer(format(last, "%d")))
  as.Date(paste0(y2, "-", sprintf("%02d", m2), "-", sprintf("%02d", dom)))
}

# Buckets are contiguous windows anchored at `anchor` (same convention used by
# the CDSE GetStatistics API): bucket n covers
#   [anchor + (n-1)*period, anchor + n*period - day), i.e. the returned label is
# the bucket END date. Shared by precipitation, INPE NDVI and (matching CDSE)
# so the panel can overlay precipitation on any NDVI source.
period_end_date <- function(dates, period, unit, anchor = min(dates)) {
  dates <- as.Date(dates)
  anchor <- as.Date(anchor)
  bucket_end_for <- function(n) {
    if (unit == "day") return(as.Date(anchor + n * period - 1L))
    if (unit == "week") return(as.Date(anchor + n * period * 7L - 1L))
    if (unit == "month") return(add_months_offset(anchor, n * period) - 1L)
    if (unit == "year") return(add_months_offset(anchor, n * period * 12L) - 1L)
    stop("Unsupported aggregation unit: ", unit)
  }
  step_for <- function(d) {
    if (unit == "day") return(max(as.numeric(d - anchor) %/% period, 0L) + 1L)
    if (unit == "week") return(max(as.numeric(d - anchor) %/% (7L * period), 0L) + 1L)
    1L
  }
  vapply(seq_along(dates), function(i) {
    d <- dates[i]
    n <- step_for(d)
    while (n < 600L && as.Date(bucket_end_for(n)) < d) n <- n + 1L
    as.character(as.Date(bucket_end_for(n)))
  }, character(1))
}
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
library(httr2)
library(jsonlite)
library(sf)

IBGE_SIDRA_URL <- "https://apisidra.ibge.gov.br/values"
IBGE_MALHAS_URL <- "https://servicodados.ibge.gov.br/api/v3/malhas"
IBGE_LOCALIDADES_URL <- "https://servicodados.ibge.gov.br/api/v1/localidades"
IBGE_PAM_TABLE <- 5457L
IBGE_RENDIMENTO_VAR <- 112L
IBGE_QUANTIDADE_VAR <- 214L
IBGE_VALOR_VAR <- 215L
IBGE_PRODUTO_CLASS <- 782L
BRAZIL_UF_CODES <- c(11L, 12L, 13L, 14L, 15L, 16L, 17L, 21L, 22L, 23L, 24L, 25L, 26L, 27L,
                     28L, 29L, 31L, 32L, 33L, 35L, 41L, 42L, 43L, 50L, 51L, 52L, 53L)

# Supported cultivations come from the crop_products table (a curated subset of
# IBGE PAM classification 782). `unit` there is only a FALLBACK used when the
# SIDRA response does not carry its own unit (get_ibge_yield() normalizes the
# actual unit from the response); abacaxi and coco default to fruits per hectare.
crop_products <- function() {
  get_crop_products()
}

crop_product <- function(product_code) {
  all <- crop_products()
  row <- all[all$code == as.integer(product_code), , drop = FALSE]
  if (!nrow(row)) return(NULL)
  as.list(row[1, ])
}

crop_products_payload <- function() {
  list(
    data = crop_products(),
    latest_year = ibge_latest_year(),
    min_year = 1974L
  )
}

ibge_latest_year <- function() {
  cached <- getOption("banesensor.ibge_latest_year")
  if (!is.null(cached)) return(cached)
  latest <- tryCatch({
    resp <- httr2::request(sprintf("https://apisidra.ibge.gov.br/DescritoresTabela/t/%d", IBGE_PAM_TABLE)) |>
      httr2::req_timeout(30) |>
      httr2::req_perform() |>
      httr2::resp_body_json()
    max(suppressWarnings(as.integer(vapply(resp$Periodos, function(p) p$Codigo, integer(1)))), na.rm = TRUE)
  }, error = function(e) {
    message("Failed to fetch IBGE latest year: ", conditionMessage(e))
    as.integer(format(Sys.Date(), "%Y")) - 1L
  })
  if (is.na(latest) || latest < 1974L) latest <- as.integer(format(Sys.Date(), "%Y")) - 1L
  options(banesensor.ibge_latest_year = as.integer(latest))
  as.integer(latest)
}

# --- Municipality resolution --------------------------------------------------

resolve_municipality <- function(aoi_sf) {
  old_s2 <- sf::sf_use_s2()
  on.exit(sf::sf_use_s2(old_s2), add = TRUE)
  # st_point_on_surface under s2 mode fails ("missing value") for lon/lat data;
  # GEOS handles the unprojected point-in-polygon test correctly.
  sf::sf_use_s2(FALSE)
  point <- sf::st_point_on_surface(aoi_sf)
  wkt <- sf::st_as_text(sf::st_geometry(point)[1])
  get_municipality_at(wkt)
}

ensure_municipalities_loaded <- function() {
  # The table is the source of truth (shared across processes); an empty table
  # means "not loaded yet". Avoid reloading solely because a per-process flag
  # is unset (e.g. a fresh worker on a pre-loaded database).
  if (!isTRUE(getOption("banesensor.municipalities_guard"))) {
    options(banesensor.municipalities_guard = TRUE)
    on.exit(options(banesensor.municipalities_guard = NULL), add = TRUE)
    if (count_municipalities() == 0L) {
      load_municipalities()
    }
  }
}

fetch_municipality_names <- function() {
  resp <- httr2::request(sprintf("%s/municipios", IBGE_LOCALIDADES_URL)) |>
    httr2::req_url_query(orderBy = "nome") |>
    httr2::req_timeout(60) |>
    httr2::req_retry(max_tries = 2) |>
    httr2::req_perform() |>
    httr2::resp_body_json()
  stats::setNames(
    vapply(resp, function(x) x$nome, character(1)),
    vapply(resp, function(x) as.character(x$id), character(1))
  )
}

fetch_uf_municipalities <- function(uf_code) {
  resp <- httr2::request(sprintf("%s/estados/%d", IBGE_MALHAS_URL, uf_code)) |>
    httr2::req_url_query(intrarregiao = "municipio", formato = "application/vnd.geo+json") |>
    httr2::req_timeout(120) |>
    httr2::req_retry(max_tries = 3, backoff = ~ 2 ^ (.x - 1)) |>
    httr2::req_perform()
  tmp <- tempfile(fileext = ".geojson")
  on.exit(unlink(tmp), add = TRUE)
  writeBin(httr2::resp_body_raw(resp), tmp)
  sf::st_read(tmp, quiet = TRUE)
}

load_municipalities <- function(force = FALSE, verbose = TRUE) {
  existing <- count_municipalities()
  if (existing > 0L && !force) {
    if (verbose) message(sprintf("Municipality table already has %d rows", existing))
    return(invisible(existing))
  }
  if (force && existing > 0L) clear_municipalities()

  names_map <- tryCatch(fetch_municipality_names(), error = function(e) {
    message("Failed to fetch municipality names: ", conditionMessage(e))
    character(0)
  })

  total <- 0L
  tryCatch({
    for (uf_code in BRAZIL_UF_CODES) {
      uf <- tryCatch(fetch_uf_municipalities(uf_code), error = function(e) {
        message(sprintf("Failed to fetch malha for UF %d: %s", uf_code, conditionMessage(e)))
        NULL
      })
      if (is.null(uf) || !nrow(uf)) next
      codes <- uf$codarea %||% uf$code
      if (is.null(codes)) next
      for (i in seq_len(nrow(uf))) {
        code <- as.character(codes[i])
        name <- names_map[[code]] %||% code
        geom <- sf::st_geometry(uf)[[i]]
        wkt <- sf::st_as_text(sf::st_cast(geom, "MULTIPOLYGON", warn = FALSE))
        insert_municipality(as.integer(code), name, sprintf("%02d", uf_code), wkt)
      }
      total <- total + nrow(uf)
    }
  }, error = function(e) {
    # Never leave a partially populated table: the module treats "empty table"
    # as "not loaded yet" and would otherwise never retry.
    try(clear_municipalities(), silent = TRUE)
    stop(e)
  })
  options(banesensor.municipalities_loaded = TRUE)
  if (verbose) message(sprintf("Loaded %d IBGE municipalities into ibge_municipalities", total))
  invisible(total)
}

# --- IBGE PAM yield ----------------------------------------------------------

# Maps the unit reported by SIDRA to a normalized unit used by the module.
normalize_yield_unit <- function(unit) {
  u <- tolower(unit %||% "")
  if (grepl("fruto", u)) return("frutos/ha")
  "kg/ha"
}

# Raw fetch of a single SIDRA variable for one year/municipality/product.
# Returns {year, value, unit (from the response header MN), product_name} or
# NULL when there is no usable value. SIDRA rejects combining several
# v/<code> in one URL, so each variable requires its own request.
fetch_pam_var <- function(municipality_code, product_code, year, variable) {
  url <- sprintf(
    "%s/t/%d/n6/%d/v/%d/p/%d/c782/%d",
    IBGE_SIDRA_URL, IBGE_PAM_TABLE,
    as.integer(municipality_code),
    as.integer(variable),
    as.integer(year),
    as.integer(product_code)
  )
  data <- tryCatch({
    httr2::request(url) |>
      httr2::req_headers(Accept = "application/json") |>
      httr2::req_timeout(30) |>
      httr2::req_retry(max_tries = 2) |>
      httr2::req_perform() |>
      httr2::resp_body_json()
  }, error = function(e) {
    message("IBGE SIDRA request failed: ", conditionMessage(e))
    NULL
  })
  if (is.null(data) || !length(data)) return(NULL)
  # Response is an array: first row is the header, remaining rows hold values.
  value_row <- NULL
  for (row in data) {
    if (is.null(row$V) || row$V %in% c("NC", "NN", "MC", "-")) next
    if (identical(as.character(row$D1C), as.character(municipality_code)) ||
        identical(as.character(row$D4C), as.character(product_code))) {
      value_row <- row
      break
    }
  }
  if (is.null(value_row)) return(NULL)
  value <- suppressWarnings(as.numeric(gsub(",", ".", as.character(value_row$V))))
  if (is.na(value)) return(NULL)
  list(
    year         = as.integer(year),
    value        = value,
    unit         = value_row$MN %||% "",
    product_name = value_row$D4N %||% ""
  )
}

fetch_pam_yield <- function(municipality_code, product_code, year, fallback_unit = "kg/ha") {
  row <- fetch_pam_var(municipality_code, product_code, year, IBGE_RENDIMENTO_VAR)
  if (is.null(row)) return(NULL)
  list(
    year         = row$year,
    yield_value  = row$value,
    yield_unit   = normalize_yield_unit(row$unit %||% fallback_unit),
    product_name = row$product_name
  )
}

# Fetches the average IBGE PAM yield per hectare for one or more years and
# averages the years that have data. Years without data ("NC"/"NN"/no row) are
# silently skipped. Units from the SIDRA response are honored per year; if the
# reported unit differs across years, only the years sharing the unit of the
# most recent one are averaged, so kg/ha and frutos/ha are never mixed.
get_ibge_yield <- function(municipality_code, product_code, years, fallback_unit = "kg/ha") {
  years <- sort(unique(as.integer(years)))
  if (!length(years)) return(NULL)
  rows <- lapply(years, function(y) fetch_pam_yield(municipality_code, product_code, y, fallback_unit))
  ok <- Filter(Negate(is.null), rows)
  if (!length(ok)) return(NULL)
  latest_unit <- ok[[length(ok)]]$yield_unit
  ok <- Filter(function(r) identical(r$yield_unit, latest_unit), ok)
  if (!length(ok)) return(NULL)
  list(
    yield_value  = mean(vapply(ok, function(r) r$yield_value, numeric(1))),
    yield_unit   = latest_unit,
    product_name = ok[[length(ok)]]$product_name,
    years_used   = vapply(ok, function(r) r$year, integer(1))
  )
}

# --- Estimation --------------------------------------------------------------

# Maps the SIDRA quantity unit (v214) to the counting scheme used by the
# module: "toneladas" products are compared against total_tons, fruit products
# ("mil frutos") against total_mil_frutos. Returns NULL for unknown units.
quantity_count_type <- function(unit) {
  u <- tolower(unit %||% "")
  if (grepl("ton", u)) return("tons")
  if (grepl("mil", u) && grepl("fruto", u)) return("mil_frutos")
  NULL
}

# Estimates the crop value in reais for the area. For each of the reference
# years (the same years already averaged into the yield) it fetches the
# municipality production quantity (v214) and production value (v215, nominal
# thousand reais) and derives the implicit price per unit (R$/ton, R$/mil
# frutos or R$/saca). The estimated area value is price x the estimated
# total, in the counting unit the caller selected (`total_count`), averaged
# over the years that have all the data. Returns NULL when no year can be
# paired. `sack_kg` (60 for coffee) converts IBGE toneladas into 60 kg bags.
get_ibge_value <- function(municipality_code, product_code, years, total_count, count_type, sack_kg = NULL) {
  years <- sort(unique(as.integer(years)))
  prices <- numeric(0)
  for (y in years) {
    quantity <- fetch_pam_var(municipality_code, product_code, y, IBGE_QUANTIDADE_VAR)
    value    <- fetch_pam_var(municipality_code, product_code, y, IBGE_VALOR_VAR)
    if (is.null(quantity) || is.null(value)) next
    if (is.na(quantity$value) || quantity$value <= 0 || is.na(value$value)) next
    count_unit <- quantity_count_type(quantity$unit)
    if (identical(count_type, "sacas")) {
      if (!identical(count_unit, "tons")) next
      quantity_out <- quantity$value * 1000 / sack_kg  # toneladas -> sacas
    } else {
      if (!identical(count_unit, count_type)) next
      quantity_out <- quantity$value
    }
    prices <- c(prices, value$value / quantity_out)  # mil reais per unit
  }
  if (!length(prices)) return(NULL)
  price_per_unit <- mean(prices)  # mil reais per unit
  price_unit <- switch(count_type, sacas = "R$/saca", mil_frutos = "R$/mil frutos", "R$/t")
  list(
    price_per_unit = price_per_unit * 1000,
    price_unit     = price_unit,
    value_total    = price_per_unit * 1000 * total_count,
    value_years    = as.integer(length(prices))
  )
}

compute_crop_estimate <- function(area_id, product_code, years) {
  years <- sort(unique(as.integer(years)))
  product <- crop_product(product_code)
  if (is.null(product)) stop("Unknown crop product code: ", product_code)
  if (!length(years)) stop("years must contain at least one year")
  if (anyNA(years) || any(years < 1974L)) stop("years must be >= 1974")
  latest <- ibge_latest_year()
  if (any(years > latest)) stop(sprintf("years must be <= %d (last IBGE PAM release)", latest))

  ensure_municipalities_loaded()

  aoi_geom <- get_area_geometry(area_id)
  if (is.null(aoi_geom)) stop("Area not found")

  muni <- resolve_municipality(aoi_geom)
  if (is.null(muni)) {
    stop("Could not resolve an IBGE municipality for this area. The area may lie outside Brazil or over the municipal mesh.")
  }

  area_ha <- get_area_area_ha(area_id)
  if (is.null(area_ha) || is.na(area_ha)) stop("Could not compute the area in hectares")

  yield <- get_ibge_yield(muni$code, product_code, years, fallback_unit = product$unit)
  if (is.null(yield)) {
    stop(sprintf(
      "No IBGE PAM data found for %s in %s for year(s) %s",
      product$name, muni$name, paste(years, collapse = ", ")
    ))
  }

  sack_kg <- product$sack_kg
  if (is.null(sack_kg) || is.na(sack_kg)) sack_kg <- NA_real_
  sack_kg <- as.numeric(sack_kg)
  in_sacks <- !is.na(sack_kg) && sack_kg > 0 && identical(yield$yield_unit, "kg/ha")

  total_kg <- area_ha * yield$yield_value
  yield_value_out <- yield$yield_value
  yield_unit_out <- yield$yield_unit
  total <- total_kg
  total_tons <- NULL
  total_mil_frutos <- NULL
  if (in_sacks) {
    # Coffee (60 kg saca): report yield in sacas/ha and total in sacas.
    yield_value_out <- yield$yield_value / sack_kg
    yield_unit_out <- "sacas/ha"
    total <- total_kg / sack_kg
    total_tons <- total_kg / 1000
  } else if (identical(yield$yield_unit, "frutos/ha")) {
    total_mil_frutos <- total_kg / 1000
  } else {
    total_tons <- total_kg / 1000
  }

  value <- NULL
  if (in_sacks) {
    value <- get_ibge_value(muni$code, product_code, yield$years_used, total, "sacas", sack_kg)
  } else if (identical(yield$yield_unit, "frutos/ha")) {
    value <- get_ibge_value(muni$code, product_code, yield$years_used, total_mil_frutos, "mil_frutos")
  } else {
    value <- get_ibge_value(muni$code, product_code, yield$years_used, total_tons, "tons")
  }

  insert_crop_estimate(
    area_id  = area_id,
    product_code = product$code,
    product_name = yield$product_name %||% product$name,
    years    = yield$years_used,
    muni     = muni,
    area_ha  = area_ha,
    yield_value = yield_value_out,
    yield_unit  = yield_unit_out,
    total    = total,
    total_tons = total_tons,
    total_mil_frutos = total_mil_frutos,
    value_total = value$value_total,
    price_per_unit = value$price_per_unit,
    value_years = value$value_years
  )

  list(
    area_id            = as.integer(area_id),
    product_code       = as.integer(product$code),
    product_name       = yield$product_name %||% product$name,
    years              = as.integer(yield$years_used),
    n_years            = as.integer(length(yield$years_used)),
    municipality_code  = as.integer(muni$code),
    municipality_name  = muni$name,
    uf                 = muni$uf,
    area_ha            = area_ha,
    yield_value        = yield_value_out,
    yield_unit         = yield_unit_out,
    total              = total,
    total_tons         = total_tons,
    total_mil_frutos   = total_mil_frutos,
    value_total        = value$value_total,
    price_per_unit     = value$price_per_unit,
    price_unit         = value$price_unit,
    value_years        = value$value_years
  )
}

`%||%` <- function(a, b) if (is.null(a)) b else a
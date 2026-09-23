library(rstac)
library(terra)
library(sf)
library(httr2)

CBERS_STAC_URL <- "https://data.inpe.br/bdc/stac/v1/"
CBERS_PREVIEW_COLLECTION <- "CB4A-WPM-PCA-FUSED-1"

cbers_asset_href <- function(item, key) {
  asset <- item$assets[[key]]
  if (is.null(asset)) return(NULL)
  asset$href %||% NULL
}

render_cbers_preview <- function(source_href, aoi_sf, output_file,
                                 source_type = "thumbnail", source_bbox = NULL) {
  if (source_type == "tci") {
    Sys.setenv(
      CPL_VSIL_CURL_ALLOWED_EXTENSIONS = ".tif",
      GDAL_HTTP_MULTIRANGE = "YES",
      GDAL_HTTP_VERSION = "2",
      GDAL_HTTP_TIMEOUT = "300",
      GDAL_DISABLE_READDIR_ON_OPEN = "EMPTY_DIR",
      CPL_VSIL_CURL_CACHE_SIZE = "67108864"
    )
    source_raster <- terra::rast(paste0("/vsicurl/", source_href))
  } else {
    source_file <- tempfile(fileext = ".png")
    on.exit(unlink(source_file), add = TRUE)
    downloaded <- tryCatch(
      utils::download.file(source_href, source_file, mode = "wb", quiet = TRUE),
      error = function(error) stop("Failed to download CBERS thumbnail: ", conditionMessage(error))
    )
    if (!identical(downloaded, 0L) || !file.exists(source_file) || file.info(source_file)$size == 0) {
      stop("Failed to download CBERS thumbnail")
    }
    source_raster <- terra::rast(source_file)
    if (is.null(source_bbox) || length(source_bbox) != 4) {
      stop("CBERS thumbnail is missing its STAC bounding box")
    }
    terra::crs(source_raster) <- "EPSG:4326"
    terra::ext(source_raster) <- terra::ext(source_bbox[1], source_bbox[3], source_bbox[2], source_bbox[4])
  }
  aoi_vect <- terra::project(terra::vect(aoi_sf), terra::crs(source_raster))
  cropped <- terra::crop(source_raster, aoi_vect, snap = "out")
  masked <- terra::mask(cropped, aoi_vect)
  if (terra::ncell(masked) == 0) stop("CBERS image does not intersect the selected area")

  terra::writeRaster(
    masked,
    output_file,
    overwrite = TRUE,
    filetype = "PNG",
    datatype = "INT1U",
    NAflag = 0
  )
  output_file
}

search_cbers_previews <- function(aoi_sf, date_from, date_to, cloud_cover_max = 20) {
  bbox <- sf::st_bbox(sf::st_transform(aoi_sf, 4326))
  items <- tryCatch(
    stac_search_items(CBERS_PREVIEW_COLLECTION, bbox, paste(date_from, date_to, sep = "/")),
    error = function(error) {
      stop("CBERS catalog is temporarily unreachable from the backend container. Please retry shortly. Details: ", conditionMessage(error))
    }
  )
  # prepara a filtragem de cloud cover, mas o INPE não popula o campo
  if (!is.null(cloud_cover_max)) {
    items <- Filter(function(item) {
      cc <- suppressWarnings(as.numeric(item$properties[["eo:cloud_cover"]] %||% NA_real_))
      is.na(cc) || is.nan(cc) || cc < cloud_cover_max
    }, items)
  }
  items
}

get_cbers_image_series <- function(aoi_sf, area_id, date_from, date_to,
                                   resolution = 2) {
  output_dir <- Sys.getenv("UPLOAD_DIR", "/app/uploads")
  dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)
  cached <- get_image_cache(area_id, CBERS_PREVIEW_COLLECTION, date_from, date_to, resolution)
  cached_paths <- if (is.null(cached)) character(0) else setNames(as.character(cached$image_path), as.character(cached$scene_id))
  bbox_sf <- sf::st_set_crs(sf::st_as_sfc(sf::st_bbox(aoi_sf)), 4326)
  items <- search_cbers_previews(aoi_sf, date_from, date_to, cloud_cover_max = 20)
  kept_dates <- character(0)

  for (item in items) {
    scene_id <- item$id %||% ""
    if (!nzchar(scene_id)) next
    acquisition <- item$properties$datetime %||% item$properties$start_datetime
    image_date <- as.Date(substr(acquisition, 1, 10))
    date_key <- as.character(image_date)
    safe_scene_id <- gsub("[^A-Za-z0-9_.-]", "_", scene_id)
    output_file <- file.path(output_dir, sprintf(
      "cbers_area-%d_%s_aoi-v3_2m.png",
      as.integer(area_id),
      safe_scene_id
    ))
    has_row <- scene_id %in% names(cached_paths)
    cached_path <- if (has_row) unname(cached_paths[scene_id]) else NA_character_
    file_ok <- has_row && !is.na(cached_path) && nzchar(cached_path) && file.exists(cached_path)
    is_current <- file_ok && identical(cached_path, output_file)

    # remove cenas duplicadas do mesmo dia, mantendo a primeira que aparece na busca do STAC
    if (date_key %in% kept_dates) {
      if (has_row) delete_image_record(area_id, CBERS_PREVIEW_COLLECTION, scene_id, resolution)
      if (file.exists(output_file)) unlink(output_file)
      if (file_ok && !identical(cached_path, output_file) && file.exists(cached_path)) unlink(cached_path)
      next
    }

    # revalida a cena não duplicada para inválidos
    if (is_current) {
      if (is_blank_render(output_file)) {
        message(sprintf("[cbers] blank render for scene %s in area %s, skipping", scene_id, area_id))
        delete_image_record(area_id, CBERS_PREVIEW_COLLECTION, scene_id, resolution)
        next
      }
      kept_dates <- c(kept_dates, date_key)
      next
    }

    # re-renderiza a cena se o caminho estiver vazio ou inválido
    tci_href <- cbers_asset_href(item, "tci")
    thumbnail_href <- cbers_asset_href(item, "thumbnail")
    href <- tci_href
    source_type <- "tci"
    if (is.null(tci_href)) {
      href <- thumbnail_href
      source_type <- "thumbnail"
    }
    render_status <- "error"
    if (!is.null(href)) {
      rendered <- tryCatch({
        render_cbers_preview(href, aoi_sf, output_file, source_type, item$bbox)
        TRUE
      }, error = function(error) {
        message(sprintf("[cbers] render failed for scene %s: %s", scene_id, conditionMessage(error)))
        FALSE
      })
      if (rendered && file.exists(output_file)) {
        render_status <- if (is_blank_render(output_file)) "blank" else "ok"
      }
    }

    if (render_status == "ok") {
      # The upsert repoints the row to output_file; remove any legacy file.
      if (file_ok) unlink(cached_path)
      cloud_cover <- suppressWarnings(as.numeric(item$properties[["eo:cloud_cover"]] %||% NA_real_))
      insert_image_record(
        area_id, CBERS_PREVIEW_COLLECTION, scene_id, image_date, cloud_cover,
        "CBERS-4A WPM", resolution, output_file, bbox_sf
      )
      kept_dates <- c(kept_dates, date_key)
      next
    }

    if (file.exists(output_file)) unlink(output_file)

    if (render_status == "blank") {
      if (has_row) delete_image_record(area_id, CBERS_PREVIEW_COLLECTION, scene_id, resolution)
      next
    }

    if (has_row) {
      if (file_ok && !is_blank_render(cached_path)) {
        kept_dates <- c(kept_dates, date_key)
      } else {
        delete_image_record(area_id, CBERS_PREVIEW_COLLECTION, scene_id, resolution)
      }
    }
  }

  get_image_cache(area_id, CBERS_PREVIEW_COLLECTION, date_from, date_to, resolution)
}
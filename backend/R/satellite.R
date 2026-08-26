library(CDSE)
library(sf)

get_catalog_value <- function(row, candidates, default = NA_character_) {
  available <- candidates[candidates %in% names(row)]
  if (!length(available)) return(default)
  value <- row[[available[[1]]]][[1]]
  if (length(value) == 0 || is.na(value)) default else as.character(value)
}

get_display_pixels <- function(aoi_sf, long_side = 1600L) {
  bbox <- sf::st_bbox(sf::st_transform(aoi_sf, 3857))
  width <- max(as.numeric(bbox["xmax"] - bbox["xmin"]), 1)
  height <- max(as.numeric(bbox["ymax"] - bbox["ymin"]), 1)
  if (width >= height) {
    c(long_side, max(1L, round(long_side * height / width)))
  } else {
    c(max(1L, round(long_side * width / height)), long_side)
  }
}

get_image_series <- function(aoi_sf, area_id, collection = "sentinel-2-l2a",
                             resolution = 10, date_from, date_to) {
  client <- get_oauth_client()

  images <- CDSE::SearchCatalog(
    aoi = aoi_sf,
    from = as.character(date_from),
    to = as.character(date_to),
    collection = collection,
    with_geometry = FALSE,
    filter = "eo:cloud_cover < 20",
    client = client
  )

  output_dir <- Sys.getenv("UPLOAD_DIR", "/app/uploads")
  dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)
  cached <- get_image_cache(area_id, collection, date_from, date_to, resolution)
  cached_paths <- if (is.null(cached)) character(0) else setNames(as.character(cached$image_path), as.character(cached$scene_id))
  display_pixels <- get_display_pixels(aoi_sf)
  rgb_script <- make_rgb_evalscript(
    constellation = ifelse(grepl("sentinel", collection), "sentinel-2", "landsat")
  )
  bbox_sf <- sf::st_set_crs(sf::st_as_sfc(sf::st_bbox(aoi_sf)), 4326)

  if (!is.null(images) && nrow(images)) {
    for (i in seq_len(nrow(images))) {
      row <- images[i, , drop = FALSE]
      scene_id <- get_catalog_value(row, c("sourceId", "id", "sceneId", "productId", "identifier"))
      acquisition <- get_catalog_value(row, c("acquisitionDate", "date", "from"))
      if (is.na(scene_id) || is.na(acquisition)) next

      image_date <- as.Date(substr(acquisition, 1, 10))
      cloud_cover <- suppressWarnings(as.numeric(get_catalog_value(row, c("tileCloudCover", "cloudCover"), NA_character_)))
      satellite <- get_catalog_value(row, c("satellite", "platform", "constellation"), "unknown")
      safe_scene <- gsub("[^A-Za-z0-9_.-]", "_", scene_id)
      output_file <- file.path(output_dir, sprintf("rgb_%s_%s_%dp.png", area_id, safe_scene, max(display_pixels)))

      if (identical(unname(cached_paths[scene_id]), output_file) && file.exists(output_file)) next

      if (!file.exists(output_file)) {
        CDSE::GetImage(
          aoi = aoi_sf,
          time_range = acquisition,
          script = rgb_script,
          collection = collection,
          file = output_file,
          format = "image/png",
          mosaicking_order = "leastCC",
          pixels = display_pixels,
          buffer = 10,
          client = client
        )
      }
      insert_image_record(area_id, collection, scene_id, image_date, cloud_cover,
                          satellite, resolution, output_file, bbox_sf)
    }
  }

  get_image_cache(area_id, collection, date_from, date_to, resolution)
}

cleanup_area_images <- function(area_id) {
  output_dir <- Sys.getenv("UPLOAD_DIR", "/app/uploads")
  pattern <- sprintf("rgb_%s_", area_id)
  files <- list.files(output_dir, pattern = paste0("^", gsub("([+.])", "\\\\\\1", pattern)),
                      full.names = TRUE)
  unlink(files)
  invisible(length(files))
}

make_rgb_evalscript <- function(constellation = "sentinel-2") {
  if (constellation == "sentinel-2") {
    "//VERSION=3
function setup() {
  return {
    input: ['B04', 'B03', 'B02', 'dataMask'],
    output: { bands: 4, sampleType: 'AUTO' }
  };
}

function evaluatePixel(smp) {
  let rgbLin = [2.5 * smp.B04, 2.5 * smp.B03, 2.5 * smp.B02];
  return [sRGB(rgbLin[0]), sRGB(rgbLin[1]), sRGB(rgbLin[2]), smp.dataMask];
}

function sRGB(v) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
}"
  } else {
    "//VERSION=3
function setup() {
  return {
    input: ['B04', 'B03', 'B02', 'dataMask'],
    output: { bands: 4 }
  };
}

function evaluatePixel(smp) {
  return [sRGB(smp.B04), sRGB(smp.B03), sRGB(smp.B02), smp.dataMask];
}

function sRGB(v) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
}"
  }
}
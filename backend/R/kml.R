library(sf)

parse_kml <- function(kml_path) {
  old_s2 <- sf_use_s2()
  on.exit(sf_use_s2(old_s2), add = TRUE)
  sf_use_s2(FALSE)

  sf_obj <- st_read(kml_path, quiet = TRUE)
  if (nrow(sf_obj) == 0) {
    stop("No geometries found in KML file")
  }
  sf_obj <- st_zm(sf_obj, drop = TRUE, what = "ZM")

  geom <- st_geometry(sf_obj)
  geom_types <- as.character(st_geometry_type(geom, by_geometry = TRUE))
  allowed <- c("POLYGON", "MULTIPOLYGON", "GEOMETRYCOLLECTION")
  if (!all(geom_types %in% allowed)) {
    stop("KML must contain only polygon geometries (got: ",
         paste(unique(geom_types), collapse = ", "), ")")
  }

  direct_geom <- geom[geom_types %in% c("POLYGON", "MULTIPOLYGON")]
  collection_geom <- geom[geom_types == "GEOMETRYCOLLECTION"]

  extracted_polygons <- if (length(collection_geom) > 0) {
    st_collection_extract(collection_geom, "POLYGON", warn = FALSE)
  } else {
    st_sfc(crs = st_crs(geom))
  }
  extracted_multipolygons <- if (length(collection_geom) > 0) {
    st_collection_extract(collection_geom, "MULTIPOLYGON", warn = FALSE)
  } else {
    st_sfc(crs = st_crs(geom))
  }

  polygon_geom <- c(direct_geom, extracted_polygons, extracted_multipolygons)
  if (length(polygon_geom) == 0) {
    stop("KML does not contain polygon geometries")
  }

  repaired_geometry <- st_make_valid(polygon_geom)
  repaired_geometry <- repaired_geometry[!st_is_empty(repaired_geometry)]
  if (length(repaired_geometry) == 0) {
    stop("No valid polygon geometries found in KML file")
  }

  geometry <- st_make_valid(st_union(repaired_geometry))
  sf_obj[1, , drop = FALSE] |>
    st_set_geometry(geometry)
}
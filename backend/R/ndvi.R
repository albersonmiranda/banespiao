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

SENTINEL2_NDVI_SCL_MASKED_SCRIPT <- R"---(
//VERSION=3
function setup() {
  return {
    input: [
      {
        bands: [
          "B04",
          "B08",
          "SCL",
          "dataMask"
        ]
      }
    ],
    output: [
      {
        id: "default",
        bands: 1,
        sampleType: "FLOAT32"
      },
      {
        id: "dataMask",
        bands: 1
      }
    ]
  };
}

function evaluatePixel(sample) {
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
  let scl = sample.SCL;
  let isCloud = scl === 1 || scl === 3 || scl === 8 || scl === 9 || scl === 10;
  if (isCloud) {
    return {
      default: [NaN],
      dataMask: [0]
    };
  }
  return {
    default: [ndvi],
    dataMask: [sample.dataMask]
  };
}
)---"

make_ndvi_evalscript <- function(constellation = "sentinel-2", mask_clouds = TRUE) {
  if (constellation == "sentinel-2" && mask_clouds) {
    return(trimws(SENTINEL2_NDVI_SCL_MASKED_SCRIPT))
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
                                     resolution = 100) {
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

  dates <- if ("date" %in% names(stats)) {
    as.Date(stats$date)
  } else {
    as.Date(stats$from)
  }

  data.frame(
    date          = dates,
    ndvi_min      = stats$min,
    ndvi_mean     = stats$mean,
    ndvi_max      = stats$max,
    ndvi_stdev    = stats$stDev,
    sample_count  = stats$sampleCount,
    no_data_count = stats$noDataCount,
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
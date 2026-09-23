# Standalone loader for the IBGE municipality mesh (Malhas API).
#
# Populates the `ibge_municipalities` PostGIS table with simplified polygons for
# every Brazilian municipality. The backend also runs this automatically on
# first use (compute_crop_estimate) when the table is empty; use this script to
# pre-load the data before serving traffic.
#
# Usage (DB_* env vars must be set):
#   Rscript scripts/load_municipalities.R [--force]

args <- commandArgs(trailingOnly = TRUE)
force_reload <- "--force" %in% args

source("R/db.R", local = TRUE)
source("R/crop.R", local = TRUE)

cli::cli_inform("Connecting to {Sys.getenv('DB_NAME')}...")
cli::cli_inform("Loading IBGE municipalities (Brazil, 27 UFs)...")
count <- load_municipalities(force = force_reload)
cli::cli_inform("Done. {count} municipalities in ibge_municipalities.")
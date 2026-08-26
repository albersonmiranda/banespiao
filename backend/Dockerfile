FROM rocker/geospatial:4.6.1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsodium-dev rustc cargo \
  && rm -rf /var/lib/apt/lists/*

RUN R -q -e '\
  pkgs <- c("plumber2@0.2.0", "mirai@2.7.2", "CDSE@0.3.2", "rstac@1.0.1", "terra@1.9.34", "rsi@0.3.3", \
            "RPostgres@1.4.10", "DBI@1.3.0", "jsonlite@2.0.0", "httr2@1.3.0", \
            "lubridate@1.9.5"); \
  pak::pkg_install(pkgs); \
  missing <- pkgs[!sapply(gsub("@.*", "", pkgs), requireNamespace, quietly = TRUE)]; \
  if (length(missing)) stop("Failed to install: ", paste(missing, collapse = ", ")); \
  cat("All packages installed successfully\n")'

WORKDIR /app

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 8000

CMD ["Rscript", "-e", "plumber2::api('_server.yml') |> plumber2::api_run()"]
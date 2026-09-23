export interface Area {
  id: number;
  name: string;
  kml_filename: string;
  created_at: string;
  geojson?: GeoJSON.Geometry;
}

export interface UploadResponse {
  id: number;
  name: string;
  geojson: GeoJSON.Geometry;
}

export interface NdviDataPoint {
  date: string;
  ndvi_min: number;
  ndvi_mean: number;
  ndvi_max: number;
  ndvi_stdev: number;
  sample_count: number;
  no_data_count: number;
}

export interface NdviTimeSeries {
  area_id: number;
  date_from: string;
  date_to: string;
  collection: string;
  aggregation: string;
  data: NdviDataPoint[];
}

export interface SatelliteImage {
  id: number;
  area_id: number;
  collection: string;
  scene_id: string;
  image_date: string;
  cloud_cover: number;
  satellite: string;
  resolution: number;
  image_url: string;
}

export interface Collection {
  id: string;
  title: string;
  description: string;
}

export interface NdviRequest {
  date_from: string;
  date_to: string;
  collection: string;
  aggregation: string;
  resolution?: number;
  provider?: 'cdse' | 'inpe';
}

export interface ImageRequest {
  provider?: 'cdse' | 'inpe' | 'cbers';
  collection: string;
  date_from: string;
  date_to: string;
  resolution?: number;
}

export interface PrecipitationDataPoint {
  date: string;
  precip_total: number;
  precip_days: number;
}

export interface PrecipitationSeries {
  area_id: number;
  date_from: string;
  date_to: string;
  aggregation: string;
  source: string;
  data: PrecipitationDataPoint[];
}

export interface PrecipitationRequest {
  date_from: string;
  date_to: string;
  aggregation: string;
  source?: string;
}

export interface CropProduct {
  code: number;
  name: string;
  unit: 'kg/ha' | 'frutos/ha';
  sack_kg?: number | null;
}

export interface CropProductsResponse {
  data: CropProduct[];
  latest_year: number;
  min_year: number;
}

export interface CropYieldEstimate {
  area_id: number;
  product_code: number;
  product_name: string;
  years: number[];
  n_years: number;
  municipality_code: number;
  municipality_name: string;
  uf: string;
  area_ha: number;
  yield_value: number;
  yield_unit: 'kg/ha' | 'frutos/ha' | 'sacas/ha';
  total: number;
  total_tons: number | null;
  total_mil_frutos: number | null;
  value_total?: number;
  price_per_unit?: number;
  price_unit?: string;
  value_years?: number;
  created_at?: string;
}

export interface CropRequest {
  product_code: number;
  years: number[];
}

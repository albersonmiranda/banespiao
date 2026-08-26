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
}

export interface ImageRequest {
  provider?: 'cdse' | 'cbers';
  collection: string;
  date_from: string;
  date_to: string;
  resolution?: number;
}

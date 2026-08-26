import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Area,
  UploadResponse,
  NdviTimeSeries,
  SatelliteImage,
  Collection,
  NdviRequest,
  ImageRequest,
} from '../models/types';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = '/api';

  constructor(private http: HttpClient) {}

  uploadKml(file: File, name?: string): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (name) {
      formData.append('name', name);
    }
    return this.http.post<UploadResponse>(`${this.apiUrl}/areas/upload`, formData);
  }

  getAreas(): Observable<Area[]> {
    return this.http.get<Area[]>(`${this.apiUrl}/areas`);
  }

  getArea(id: number): Observable<Area> {
    return this.http.get<Area>(`${this.apiUrl}/areas/${id}`);
  }

  deleteArea(id: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/areas/${id}`
    );
  }

  computeNdvi(areaId: number, request: NdviRequest): Observable<NdviTimeSeries> {
    return this.http.post<NdviTimeSeries>(
      `${this.apiUrl}/ndvi/${areaId}`,
      request
    );
  }

  getNdvi(
    areaId: number,
    dateFrom: string,
    dateTo: string,
    collection: string,
    aggregation: string
  ): Observable<NdviTimeSeries> {
    const params = {
      date_from: dateFrom,
      date_to: dateTo,
      collection,
      aggregation,
    };
    return this.http.get<NdviTimeSeries>(`${this.apiUrl}/ndvi/${areaId}`, {
      params,
    });
  }

  getImages(areaId: number, request: ImageRequest): Observable<{ area_id: number; images: SatelliteImage[] }> {
    return this.http.post<{ area_id: number; images: SatelliteImage[] }>(
      `${this.apiUrl}/image/${areaId}`,
      request
    );
  }

    getCachedImages(areaId: number, request: Omit<ImageRequest, 'date_from' | 'date_to'> & { date_from?: string; date_to?: string }): Observable<{ area_id: number; images: SatelliteImage[] }> {
      const params = {
        collection: request.collection,
        ...(request.provider ? { provider: request.provider } : {}),
        resolution: String(request.resolution ?? 10),
        ...(request.date_from ? { date_from: request.date_from } : {}),
        ...(request.date_to ? { date_to: request.date_to } : {}),
      };
      return this.http.get<{ area_id: number; images: SatelliteImage[] }>(`${this.apiUrl}/image/${areaId}`, { params });
    }

  getImageUrl(areaId: number, imageId: number): string {
    return `${this.apiUrl}/image/${areaId}/file/${imageId}`;
  }

  getCollections(): Observable<{ data: Collection[] }> {
    return this.http.get<{ data: Collection[] }>(`${this.apiUrl}/collections`);
  }
}

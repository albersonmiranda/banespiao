import { Component, Input, OnChanges, SimpleChanges, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-container" #mapContainer [attr.id]="mapId"></div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      min-height: 400px;
    }

    .map-container {
      width: 100%;
      height: 100%;
      min-height: 400px;
      border-radius: var(--radius-lg);
      overflow: hidden;
      border: 1px solid var(--color-border-light);
    }

    :host ::ng-deep .leaflet-container {
      font-family: var(--font-family-base);
      font-size: var(--font-size-sm);
    }

    :host ::ng-deep .leaflet-popup-content-wrapper {
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
    }

    :host ::ng-deep .leaflet-popup-tip {
      box-shadow: var(--shadow-lg);
    }

    :host ::ng-deep .leaflet-control-zoom {
      border: none;
      box-shadow: var(--shadow-md);
      border-radius: var(--radius-md);
      overflow: hidden;
    }

    :host ::ng-deep .leaflet-control-zoom a {
      background: var(--color-bg-secondary);
      color: var(--color-text-primary);
      border: none;
      width: 36px;
      height: 36px;
      line-height: 36px;
      font-size: var(--font-size-lg);
      transition: background var(--transition-fast);
    }

    :host ::ng-deep .leaflet-control-zoom a:hover {
      background: var(--color-bg-tertiary);
    }

    :host ::ng-deep .leaflet-control-attribution {
      background: rgba(255, 255, 255, 0.9);
      border-radius: var(--radius-sm) 0 0 0;
      font-size: var(--font-size-xs);
    }

    :host ::ng-deep .custom-geo-json path {
      transition: stroke-width var(--transition-fast), opacity var(--transition-fast);
    }

    :host ::ng-deep .custom-geo-json path:hover {
      stroke-width: 4;
      opacity: 1;
    }
  `],
})
export class MapViewComponent implements OnChanges, OnDestroy {
  @Input() geojson: any = null;

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private map: L.Map | null = null;
  private geoJsonLayer: L.GeoJSON | null = null;
  mapId = `map-${Math.random().toString(36).substr(2, 9)}`;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['geojson'] && this.geojson) {
      if (this.map) {
        this.updateLayer();
      } else {
        this.initMap();
      }
    }
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initMap() {
    const container = this.mapContainer.nativeElement;
    container.id = this.mapId;

    this.map = L.map(this.mapId, {
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(this.map);

    this.addGeoJsonLayer();

    this.map.on('click', () => {
      this.map?.closePopup();
    });
  }

  private addGeoJsonLayer() {
    if (!this.map || !this.geojson) return;

    if (this.geoJsonLayer) {
      this.map.removeLayer(this.geoJsonLayer);
    }

    this.geoJsonLayer = L.geoJSON(this.geojson, {
      style: () => ({
        color: '#1E0AE8',
        weight: 3,
        opacity: 0.9,
        fillColor: '#1E0AE8',
        fillOpacity: 0.15,
        dashArray: '0',
        className: 'custom-geo-json',
      }),
      onEachFeature: (feature, layer) => {
        if (feature.properties) {
          const props = Object.entries(feature.properties)
            .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
            .join('<br>');
          layer.bindPopup(`<div class="leaflet-popup-content">${props}</div>`, {
            maxWidth: 300,
          });
        }
      },
    }).addTo(this.map);

    this.map.fitBounds(this.geoJsonLayer.getBounds(), {
      padding: [20, 20],
      maxZoom: 16,
    });
  }

  private updateLayer() {
    if (!this.map || !this.geojson) return;

    if (this.geoJsonLayer) {
      this.map.removeLayer(this.geoJsonLayer);
    }

    this.addGeoJsonLayer();
  }
}
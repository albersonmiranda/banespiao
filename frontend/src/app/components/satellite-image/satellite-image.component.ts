import { ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-satellite-image',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="image-container">
      <div class="controls">
        <div class="form-group">
          <label for="sat-date-from">De</label>
          <input id="sat-date-from" type="date" [(ngModel)]="dateFrom" (ngModelChange)="loadCachedImages()" [max]="dateTo" [disabled]="loading" aria-label="Data inicial das imagens" />
        </div>
        <div class="form-group">
          <label for="sat-date-to">Até</label>
          <input id="sat-date-to" type="date" [(ngModel)]="dateTo" (ngModelChange)="loadCachedImages()" [min]="dateFrom" [max]="maxDate" [disabled]="loading" aria-label="Data final das imagens" />
        </div>
        <div class="form-group" style="flex: 1;">
          <label for="sat-provider">Fonte</label>
          <select
            id="sat-provider"
            [(ngModel)]="provider"
            (ngModelChange)="changeProvider($event)"
            [disabled]="loading"
            aria-label="Fonte de imagens de satélite"
          >
            <option value="cdse">Sentinel/Landsat via CDSE</option>
            <option value="cbers">CBERS-4A via INPE</option>
          </select>
        </div>
        <div class="form-group" style="flex: 1;">
          <label for="sat-collection">Satélite</label>
          <select
            id="sat-collection"
            [(ngModel)]="collection"
            (ngModelChange)="changeCollection($event)"
            [disabled]="loading"
            aria-label="Coleção de satélite"
          >
            <option *ngFor="let option of availableCollections" [ngValue]="option.id">{{ option.label }}</option>
          </select>
        </div>
        <div class="form-group" style="flex: 1;">
          <label for="sat-resolution">Resolução (m)</label>
          <select
            id="sat-resolution"
            [(ngModel)]="resolution"
            (ngModelChange)="loadCachedImages()"
            [disabled]="loading"
            aria-label="Resolução espacial"
          >
            <option *ngFor="let value of availableResolutions" [ngValue]="value">{{ value }}m</option>
          </select>
        </div>
        <button
          class="btn btn-primary"
          data-testid="load-satellite-image"
          [disabled]="!areaId || loading"
          (click)="loadImage()"
          style="align-self: flex-end; min-width: 160px;">
          <span *ngIf="!loading" class="btn-content">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            Sincronizar Imagens
          </span>
          <span *ngIf="loading" class="btn-loading">
            <span class="spinner"></span>
            Carregando...
          </span>
        </button>
      </div>

      <div *ngIf="error" class="alert alert-danger" role="alert">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>{{ error }}</span>
      </div>

      <p *ngIf="loading" class="request-status" role="status" aria-live="polite">
        Sincronizando imagens de satélite...
      </p>

      <div *ngIf="images.length" class="image-viewer">
        <div class="image-selector-row">
          <div class="form-group image-date-selector">
            <label for="sat-image-date">Imagem da data</label>
            <select
              id="sat-image-date"
              [(ngModel)]="selectedImageId"
              (ngModelChange)="selectImage($event)"
              aria-label="Selecionar data da imagem de satélite"
            >
              <option *ngFor="let image of images" [ngValue]="image.id">
                {{ image.image_date }} · {{ image.satellite || 'Satélite' }}<ng-container *ngIf="hasCloudCoverage(image)"> · {{ image.cloud_cover | number:'1.1-1' }}% nuvens</ng-container>
              </option>
            </select>
          </div>
          <span class="image-count">{{ images.length }} imagem{{ images.length !== 1 ? 'ns' : '' }}</span>
        </div>

        <div class="image-wrapper" *ngIf="selectedImage">
          <img [src]="selectedImage.image_url" [alt]="'Imagem de satélite de ' + selectedImage.image_date" />
        </div>

        <div class="metadata" *ngIf="selectedImage">
          <div class="meta-item"><span class="meta-label">Data</span><span class="meta-value">{{ selectedImage.image_date }}</span></div>
          <div class="meta-item" *ngIf="hasCloudCoverage(selectedImage)"><span class="meta-label">Cobertura de nuvens</span><span class="meta-value">{{ selectedImage.cloud_cover | number:'1.1-1' }}%</span></div>
          <div class="meta-item"><span class="meta-label">Satélite</span><span class="meta-value">{{ selectedImage.satellite || 'Não informado' }}</span></div>
          <div class="meta-item"><span class="meta-label">Resolução</span><span class="meta-value">{{ selectedImage.resolution }} m</span></div>
        </div>
      </div>

      <div *ngIf="!images.length && !loading && !error" class="empty-state animate-fade-in">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <h4>Nenhuma imagem de satélite carregada</h4>
        <p>Escolha um período e clique em <strong>Sincronizar Imagens</strong> para carregar todas as cenas disponíveis.</p>
      </div>
    </div>
  `,
styles: [`
    .image-container {
      padding: var(--space-5);
    }

    .controls {
      display: flex;
      align-items: flex-end;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
      flex-wrap: wrap;
    }

    input {
      width: 100%;
      height: var(--input-height);
      padding: 0 var(--space-3);
      font: inherit;
      font-size: var(--font-size-sm);
      color: var(--color-text-primary);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    label {
      display: block;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      margin-bottom: var(--space-1);
    }

    select {
      width: 100%;
      height: var(--input-height);
      padding: 0 var(--space-3);
      font-size: var(--font-size-sm);
      font-family: inherit;
      color: var(--color-text-primary);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }

    select:hover:not(:disabled) {
      border-color: var(--color-border-medium);
    }

    select:focus {
      outline: none;
      border-color: var(--color-border-focus);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
    }

    select:disabled {
      background: var(--color-bg-tertiary);
      color: var(--color-text-tertiary);
      cursor: not-allowed;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: 0 var(--space-4);
      height: var(--input-height);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      line-height: 1;
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all var(--transition-fast);
      white-space: nowrap;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: var(--color-primary);
      color: var(--color-primary-contrast);
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--color-primary-dark);
    }

    .btn-primary:active:not(:disabled) {
      background: var(--color-primary-dark);
      transform: scale(0.98);
    }

    .btn-content {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
    }

    .btn-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid color-mix(in srgb, currentColor 20%, transparent);
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .metadata {
      display: flex;
      gap: var(--space-4);
      margin-bottom: var(--space-4);
      padding: var(--space-3) var(--space-4);
      background: var(--color-bg-tertiary);
      border-radius: var(--radius-md);
      flex-wrap: wrap;
    }

    .image-selector-row {
      display: flex;
      align-items: flex-end;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
    }

    .image-date-selector {
      flex: 1;
    }

    .image-count {
      padding-bottom: var(--space-3);
      color: var(--color-text-tertiary);
      font-size: var(--font-size-xs);
      white-space: nowrap;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .meta-label {
      font-size: var(--font-size-xs);
      color: var(--color-text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .meta-value {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-primary);
    }

    .image-wrapper {
      position: relative;
      border-radius: var(--radius-lg);
      overflow: hidden;
      border: 1px solid var(--color-border-light);
      background: var(--color-bg-secondary);
      aspect-ratio: 16 / 9;
      min-height: 520px;
    }

    .image-wrapper img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #0f172a;
      transition: opacity var(--transition-normal);
      opacity: 1;
    }

    .image-wrapper img:not([src]) {
      opacity: 0;
    }

    .image-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--color-bg-secondary) 90%, transparent);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
      gap: var(--space-2);
      z-index: 1;
    }

    .image-overlay .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-10) var(--space-4);
      text-align: center;
      color: var(--color-text-tertiary);
      aspect-ratio: 16 / 10;
      border: 1px dashed var(--color-border-light);
      border-radius: var(--radius-lg);
      background: var(--color-bg-secondary);
    }

    .empty-state svg {
      width: 56px;
      height: 56px;
      color: var(--color-text-tertiary);
      margin: 0 auto;
    }

    .empty-state h4 {
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin: 0;
    }

    .empty-state p {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      margin: var(--space-2) 0 0;
      max-width: 320px;
      margin-left: auto;
      margin-right: auto;
    }

    .empty-state p strong {
      color: var(--color-primary);
    }

    .alert {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      margin-bottom: var(--space-4);
    }

    .alert-danger {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
    }

    .request-status {
      margin: 0 0 var(--space-4);
      padding: var(--space-3) var(--space-4);
      color: var(--color-text-secondary);
      background: color-mix(in srgb, var(--color-primary) 6%, transparent);
      border: 1px solid color-mix(in srgb, var(--color-primary) 14%, transparent);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
    }

    @media (max-width: 767px) {
      .image-selector-row {
        align-items: stretch;
        flex-direction: column;
      }

      .image-count {
        padding-bottom: 0;
      }

      .image-wrapper {
        min-height: 280px;
      }
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class SatelliteImageComponent implements OnChanges {
  @Input() areaId: number | null = null;

  collection = 'sentinel-2-l2a';
  provider: 'cdse' | 'cbers' = 'cdse';
  resolution = 10;
  loading = false;
  error = '';
  images: import('../../models/types').SatelliteImage[] = [];
  selectedImageId: number | null = null;
  dateFrom = '';
  dateTo = '';
  private cachedRequestSeq = 0;
  private syncRequestSeq = 0;

  constructor(private api: ApiService, private changeDetector: ChangeDetectorRef) {
    const end = new Date();
    const start = new Date();
    start.setFullYear(end.getFullYear() - 1);
    this.dateTo = end.toISOString().split('T')[0];
    this.dateFrom = start.toISOString().split('T')[0];
  }

  get maxDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  get availableCollections(): { id: string; label: string }[] {
    return this.provider === 'cbers'
      ? [{ id: 'CB4A-WPM-PCA-FUSED-1', label: 'CBERS-4A WPM PCA fused (2 m preview)' }]
      : [
          { id: 'sentinel-2-l2a', label: 'Sentinel-2 L2A' },
          { id: 'landsat-ot-l1', label: 'Landsat 8-9 OLI/TIRS L1' },
        ];
  }

  get availableResolutions(): number[] {
    if (this.provider === 'cbers') return [2];
    return this.collection.startsWith('landsat') ? [30, 100] : [10, 20, 30, 100];
  }

  get selectedImage() {
    return this.images.find((image) => image.id === this.selectedImageId) || null;
  }

  hasCloudCoverage(image: import('../../models/types').SatelliteImage | null): boolean {
    return !!image &&
      this.provider !== 'cbers' &&
      !image.collection.startsWith('CB4A-') &&
      image.cloud_cover !== null &&
      image.cloud_cover !== undefined &&
      Number.isFinite(Number(image.cloud_cover));
  }

  selectImage(value: number | string | null) {
    const id = Number(value);
    this.selectedImageId = Number.isInteger(id) ? id : null;
  }

  changeProvider(provider: 'cdse' | 'cbers') {
    this.provider = provider;
    this.collection = provider === 'cbers' ? 'CB4A-WPM-PCA-FUSED-1' : 'sentinel-2-l2a';
    this.resolution = provider === 'cbers' ? 2 : 10;
    this.images = [];
    this.selectedImageId = null;
    this.loadCachedImages();
  }

  changeCollection(collection: string) {
    this.collection = collection;
    if (!this.availableResolutions.includes(this.resolution)) {
      this.resolution = this.availableResolutions[0];
    }
    this.loadCachedImages();
  }

  private setImages(images: import('../../models/types').SatelliteImage[]) {
    this.images = images;
    this.selectedImageId = images.some((image) => image.id === this.selectedImageId)
      ? this.selectedImageId
      : images[0]?.id || null;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['areaId']?.currentValue) this.loadCachedImages();
  }

  loadCachedImages() {
    if (!this.areaId) return;
    const areaId = this.areaId;
    const requestSeq = ++this.cachedRequestSeq;
    this.error = '';
    this.api.getCachedImages(areaId, {
      provider: this.provider,
      collection: this.collection,
      date_from: this.dateFrom,
      date_to: this.dateTo,
      resolution: this.resolution,
    }).subscribe({
      next: (response) => {
        if (requestSeq !== this.cachedRequestSeq || this.areaId !== areaId) return;
        this.setImages(Array.isArray(response?.images) ? response.images : []);
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (requestSeq !== this.cachedRequestSeq || this.areaId !== areaId) return;
        this.images = [];
        this.selectedImageId = null;
        this.changeDetector.markForCheck();
      },
    });
  }

  loadImage() {
    if (!this.areaId) return;
    const areaId = this.areaId;
    const requestSeq = ++this.syncRequestSeq;

    this.loading = true;
    this.error = '';
    this.images = [];

    this.api.getImages(areaId, {
      provider: this.provider,
      collection: this.collection,
      date_from: this.dateFrom,
      date_to: this.dateTo,
      resolution: this.resolution,
    }).subscribe({
      next: (response) => {
        if (requestSeq !== this.syncRequestSeq || this.areaId !== areaId) return;
        this.loading = false;
        if (!response || !Array.isArray(response.images)) {
          this.error = 'A resposta do serviço de imagens não contém dados válidos';
          return;
        }
        this.setImages(response.images);
        if (!this.images.length) this.error = 'Nenhuma imagem foi encontrada para o período selecionado';
          this.changeDetector.markForCheck();
      },
      error: (err) => {
        if (requestSeq !== this.syncRequestSeq || this.areaId !== areaId) return;
        this.loading = false;
        this.error = err.error?.detail || err.error?.error || 'Falha ao carregar imagem';
          this.changeDetector.markForCheck();
      },
    });
  }
}
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KmlUploadComponent } from '../kml-upload/kml-upload.component';
import { MapViewComponent } from '../map-view/map-view.component';
import { NdviChartComponent } from '../ndvi-chart/ndvi-chart.component';
import { SatelliteImageComponent } from '../satellite-image/satellite-image.component';
import { ApiService } from '../../services/api.service';
import { Area } from '../../models/types';

@Component({
  selector: 'app-report-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    KmlUploadComponent,
    MapViewComponent,
    NdviChartComponent,
    SatelliteImageComponent,
  ],
  template: `
    <div class="report-layout">
      <header class="report-header">
        <div class="header-content">
          <div class="header-brand">
            <img src="assets/banespiao.png" alt="Logomarca Banestes" width=10%>
            <div>
              <h1>Banespião</h1>
              <p class="subtitle">Sensoriamento remoto para operações de crédito rural</p>
            </div>
          </div>
        </div>
      </header>

      <main class="report-main">
        <div class="area-selector-section" [class.has-selection]="selectedAreaId">
          <div class="area-selector-card">
            <div class="selector-header">
              <label for="area-select" class="selector-label">Área de Monitoramento</label>
              <span class="area-count" *ngIf="areas.length > 0">{{ areas.length }} área{{ areas.length !== 1 ? 's' : '' }}</span>
            </div>
            <div class="selector-controls">
              <label class="area-search" for="area-search">
                <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
                <input
                  id="area-search"
                  type="search"
                  class="area-search-input"
                  [(ngModel)]="areaSearch"
                  (input)="filterAreas(areaSearch)"
                  placeholder="Buscar área"
                  aria-label="Buscar área de monitoramento"
                />
              </label>
              <select
                id="area-select"
                class="area-select"
                [(ngModel)]="selectedAreaId"
                (ngModelChange)="onAreaChange($event)"
                [disabled]="areas.length === 0"
                aria-label="Selecionar área de monitoramento"
              >
                <option [ngValue]="null">-- Selecione uma área --</option>
                <option *ngFor="let area of filteredAreas" [ngValue]="area.id">
                  {{ area.name }} · {{ area.kml_filename }} · {{ area.created_at | date:'dd/MM/yyyy' }}
                </option>
              </select>
              <button
                *ngIf="selectedAreaId"
                class="btn btn-danger btn-sm"
                (click)="confirmDeleteArea()"
                [disabled]="deleting"
                aria-label="Excluir área selecionada"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                <span>Excluir</span>
              </button>
            </div>
            <p *ngIf="areas.length > 0 && filteredAreas.length === 0" class="search-empty">
              Nenhuma área corresponde à busca.
            </p>
            <div *ngIf="loadError" class="alert alert-danger">{{ loadError }}</div>
            <div *ngIf="selectError" class="alert alert-danger">{{ selectError }}</div>
          </div>
        </div>

        <div class="upload-section" *ngIf="!selectedAreaId || areas.length === 0">
          <app-kml-upload (areaCreated)="onAreaCreated($event)"></app-kml-upload>
        </div>

        <div *ngIf="selectedAreaId" class="main-content animate-fade-in">
          <div class="content-grid">
            <section class="panel map-panel" aria-labelledby="map-title">
              <header class="panel-header">
<h2 id="map-title" class="panel-title">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"></polygon>
                      <line x1="12" y1="22" x2="12" y2="15.5"></line>
                      <line x1="22" y1="8.5" x2="12" y2="15.5"></line>
                      <line x1="2" y1="8.5" x2="12" y2="15.5"></line>
                    </svg>
                    Mapa da Área
                  </h2>
              </header>
              <div class="panel-body">
                <app-map-view [geojson]="selectedGeojson"></app-map-view>
              </div>
            </section>

            <aside class="side-panels" aria-label="Painéis de análise">
              <section class="panel" aria-labelledby="ndvi-title">
                <header class="panel-header">
                  <h2 id="ndvi-title" class="panel-title">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="20" x2="18" y2="10"></line>
                      <line x1="12" y1="20" x2="12" y2="4"></line>
                      <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                    Série Temporal de NDVI
                  </h2>
                </header>
                <div class="panel-body">
                  <app-ndvi-chart [areaId]="selectedAreaId"></app-ndvi-chart>
                </div>
              </section>

              <section class="panel" aria-labelledby="satellite-title">
                <header class="panel-header">
                  <h2 id="satellite-title" class="panel-title">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="2" y1="12" x2="22" y2="12"></line>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                    </svg>
                    Imagens de Satélite
                  </h2>
                </header>
                <div class="panel-body">
                  <app-satellite-image [areaId]="selectedAreaId"></app-satellite-image>
                </div>
              </section>
            </aside>
          </div>
        </div>

        <div *ngIf="!selectedAreaId && areas.length === 0" class="empty-state animate-slide-up">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"></polygon>
            <line x1="12" y1="22" x2="12" y2="15.5"></line>
            <line x1="22" y1="8.5" x2="12" y2="15.5"></line>
            <line x1="2" y1="8.5" x2="12" y2="15.5"></line>
          </svg>
          <h3>Nenhuma área de monitoramento selecionada</h3>
          <p>Envie um arquivo KML para definir sua área de interesse e começar a gerar relatórios.</p>
        </div>
      </main>

      <footer class="report-footer">
        <p>Banespião · Banco do Estado do Espírito Santo · Dados do Copernicus Data Space Ecosystem & Institituto Nacional de Pesquisas Espaciais</p>
      </footer>
    </div>
  `,
  styles: [`
    .report-layout {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--color-bg-primary);
    }

    .report-header {
      background: var(--color-bg-secondary);
      border-bottom: 1px solid var(--color-border-light);
      padding: var(--space-4) var(--space-6);
      position: sticky;
      top: 0;
      z-index: 1100;
    }

    .header-content {
      max-width: 1600px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-brand {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .logo {
      width: 40px;
      height: 40px;
      flex-shrink: 0;
    }

    .header-brand h1 {
      font-size: var(--font-size-4xl);
      font-weight: var(--font-weight-bold);
      font-family: 'Whitney HTF', var(--font-family-base);
      color: var(--color-text-title);
      margin: 0;
    }

    .title-icon {
      display: inline-block;
      width: 0.85em;
      height: 0.85em;
      margin-left: var(--space-1);
      vertical-align: 0.08em;
    }

    .subtitle {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .header-actions {
      display: flex;
      gap: var(--space-2);
    }

    .report-main {
      flex: 1;
      max-width: 1600px;
      width: 100%;
      margin: 0 auto;
      padding: var(--space-6);
    }

    .area-selector-section {
      margin-bottom: var(--space-6);
    }

    .area-selector-card {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      padding: var(--space-4) var(--space-5);
    }

    .selector-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-3);
    }

    .selector-label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
    }

    .area-count {
      font-size: var(--font-size-xs);
      color: var(--color-text-tertiary);
      background: var(--color-bg-tertiary);
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-full);
    }

    .selector-controls {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    .area-search {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex: 0 1 280px;
      min-width: 220px;
      height: var(--input-height);
      padding: 0 var(--space-3);
      color: var(--color-text-tertiary);
      background: var(--color-bg-primary);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
    }

    .area-search:focus-within {
      border-color: var(--color-border-focus);
      background: var(--color-bg-secondary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
    }

    .search-icon {
      width: 17px;
      height: 17px;
      flex-shrink: 0;
    }

    .area-search-input {
      min-width: 0;
      width: 100%;
      border: 0;
      outline: 0;
      color: var(--color-text-primary);
      background: transparent;
      font-size: var(--font-size-sm);
    }

    .area-search-input::placeholder {
      color: var(--color-text-tertiary);
    }

    .search-empty {
      margin: var(--space-3) 0 0;
      color: var(--color-text-tertiary);
      font-size: var(--font-size-sm);
    }

    .area-select {
      flex: 1;
      min-width: 280px;
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
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right var(--space-3) center;
      padding-right: var(--space-10);
    }

    .area-select:hover:not(:disabled) {
      border-color: var(--color-border-medium);
    }

    .area-select:focus {
      outline: none;
      border-color: var(--color-border-focus);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      min-height: var(--btn-height);
      padding: 0 var(--space-4);
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      line-height: 1;
      cursor: pointer;
      transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
    }

    .btn:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .btn:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .btn:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);
    }

    .btn-ghost {
      color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 8%, transparent);
      border-color: color-mix(in srgb, var(--color-primary) 18%, transparent);
    }

    .btn-ghost:hover:not(:disabled) {
      color: var(--color-primary-dark);
      background: color-mix(in srgb, var(--color-primary) 14%, transparent);
      border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
    }

    .btn-danger {
      color: var(--color-danger-dark);
      background: color-mix(in srgb, var(--color-danger) 8%, transparent);
      border-color: color-mix(in srgb, var(--color-danger) 20%, transparent);
    }

    .btn-danger:hover:not(:disabled) {
      color: var(--color-danger-dark);
      background: color-mix(in srgb, var(--color-danger) 14%, transparent);
      border-color: color-mix(in srgb, var(--color-danger) 35%, transparent);
    }

    .btn-sm {
      min-height: var(--btn-height-sm);
      padding: 0 var(--space-3);
      font-size: var(--font-size-xs);
    }

    .upload-section {
      margin-bottom: var(--space-6);
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr 420px;
      gap: var(--space-6);
    }

    .panel {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4) var(--space-5);
      border-bottom: 1px solid var(--color-border-light);
      background: var(--color-bg-tertiary);
    }

    .panel-title {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin: 0;
    }

    .panel-title .icon {
      width: 20px;
      height: 20px;
      color: var(--color-primary);
      flex-shrink: 0;
    }

    .panel-body {
      flex: 1;
      min-height: 0;
    }

    .map-panel {
      min-height: 600px;
    }

    .side-panels {
      display: contents;
    }

    .side-panels > .panel:first-child {
      grid-column: 2;
    }

    .side-panels > .panel:last-child {
      grid-column: 1 / -1;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-10) var(--space-4);
      text-align: center;
      color: var(--color-text-tertiary);
      background: var(--color-bg-secondary);
      border: 1px dashed var(--color-border-light);
      border-radius: var(--radius-lg);
    }

    .empty-state svg {
      width: 64px;
      height: 64px;
      color: var(--color-text-tertiary);
      margin: 0 auto;
    }

    .empty-state h3 {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin: 0;
    }

    .empty-state p {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      margin: var(--space-2) 0 0;
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }

    .alert {
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      margin-top: var(--space-3);
    }

    .alert-danger {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
    }

    .report-footer {
      padding: var(--space-4) var(--space-6);
      text-align: center;
      border-top: 1px solid var(--color-border-light);
      background: var(--color-bg-secondary);
    }

    .report-footer p {
      margin: 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-tertiary);
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 1279px) {
      .content-grid {
        grid-template-columns: 1fr 380px;
      }
    }

    @media (max-width: 1023px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
      .map-panel {
        grid-row: auto;
        min-height: 450px;
      }
      .side-panels {
        display: contents;
      }
      .side-panels > .panel {
        grid-column: 1;
        min-width: 320px;
      }
    }

    @media (max-width: 767px) {
      .side-panels {
        display: contents;
      }
      .side-panels > .panel {
        min-width: 0;
      }
      .header-content {
        flex-direction: column;
        gap: var(--space-3);
        align-items: flex-start;
      }
      .selector-controls {
        width: 100%;
      }
      .area-search {
        flex: 1 1 100%;
        min-width: 0;
      }
      .area-select {
        flex: 1 1 100%;
        min-width: 0;
      }
    }
  `],
  animations: [
    // Note: Using CSS animations instead of Angular animations for simplicity
  ],
})
export class ReportPanelComponent implements OnInit {
  areas: Area[] = [];
  filteredAreas: Area[] = [];
  areaSearch = '';
  selectedAreaId: number | null = null;
  selectedGeojson: any = null;
  loadError = '';
  selectError = '';
  deleting = false;

  filterAreas(value: string = this.areaSearch) {
    this.areaSearch = value;
    const query = value.trim().toLocaleLowerCase();
    this.filteredAreas = !query ? this.areas : this.areas.filter((area) =>
      `${area.name} ${area.kml_filename}`.toLocaleLowerCase().includes(query)
    );
  }

  constructor(private api: ApiService, private changeDetector: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadAreas();
  }

  loadAreas() {
    this.api.getAreas().subscribe({
      next: (areas) => {
        const response = areas as unknown;
        const normalizedAreas = Array.isArray(response)
          ? response
          : (response && typeof response === 'object' && 'id' in response)
            ? [response]
            : (response as { data?: Area[] })?.data || Object.values(response as Record<string, Area>);
        this.areas = normalizedAreas.filter((area): area is Area =>
          !!area && typeof area.id === 'number'
        );
        this.filterAreas();
        this.loadError = '';
        this.changeDetector.markForCheck();
      },
      error: (err) => {
        this.loadError = err.error?.detail || err.error?.error || 'Falha ao carregar áreas';
        this.changeDetector.markForCheck();
      },
    });
  }

  onAreaCreated(event: { id: number; name: string; geojson: any }) {
    this.selectedAreaId = event.id;
    this.selectedGeojson = event.geojson;
    this.selectError = '';
    this.loadAreas();
  }

  onAreaChange(value: number | string | null) {
    const id = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      this.selectedAreaId = null;
      this.selectedGeojson = null;
      this.selectError = '';
      return;
    }

    this.selectArea(id);
  }

  selectArea(id: number) {
    this.selectError = '';
    this.selectedGeojson = null;
    this.api.getArea(id).subscribe({
      next: (area) => {
        this.selectedAreaId = area.id;
        this.selectedGeojson = area.geojson;
        this.changeDetector.markForCheck();
      },
      error: (err) => {
        this.selectedAreaId = null;
        this.selectedGeojson = null;
        this.selectError = err.error?.detail || err.error?.error || 'Falha ao carregar área';
        this.changeDetector.markForCheck();
      },
    });
  }

  async confirmDeleteArea() {
    if (!this.selectedAreaId) return;
    if (!confirm('Excluir esta área e todos os dados de NDVI/imagem em cache? Esta ação não pode ser desfeita.')) return;

    this.deleting = true;
    this.api.deleteArea(this.selectedAreaId).subscribe({
      next: () => {
        this.selectedAreaId = null;
        this.selectedGeojson = null;
        this.loadAreas();
        this.deleting = false;
      },
      error: () => {
        this.deleting = false;
      },
    });
  }

}
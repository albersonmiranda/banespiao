import {
  ChangeDetectorRef,
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { ApiService } from '../../services/api.service';
import { NdviDataPoint } from '../../models/types';

@Component({
  selector: 'app-ndvi-chart',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  template: `
    <div class="chart-container">
      <div class="controls" [class.disabled]="loading">
        <div class="control-row">
          <div class="form-group">
            <label for="ndvi-date-from">De</label>
            <input
              id="ndvi-date-from"
              type="date"
              [(ngModel)]="dateFrom"
              (ngModelChange)="onDateChange()"
              [max]="dateTo"
              [disabled]="loading"
              aria-label="Data inicial da análise de NDVI"
            />
          </div>
          <div class="form-group">
            <label for="ndvi-date-to">Até</label>
            <input
              id="ndvi-date-to"
              type="date"
              [(ngModel)]="dateTo"
              (ngModelChange)="onDateChange()"
              [min]="dateFrom"
              [max]="maxDate"
              [disabled]="loading"
              aria-label="Data final da análise de NDVI"
            />
          </div>
        </div>

        <div class="control-row">
          <div class="form-group" style="flex: 1;">
            <label for="ndvi-collection">Satélite</label>
            <select
              id="ndvi-collection"
              [(ngModel)]="collection"
              (ngModelChange)="changeCollection($event)"
              [disabled]="loading"
              aria-label="Coleção de satélite"
            >
              <option value="sentinel-2-l2a">Sentinel-2 L2A</option>
              <option value="landsat-ot-l1">Landsat 8-9 OLI/TIRS L1</option>
            </select>
          </div>
          <div class="form-group" style="flex: 1;">
            <label for="ndvi-aggregation">Agregação</label>
            <select
              id="ndvi-aggregation"
              [(ngModel)]="aggregation"
              [disabled]="loading"
              aria-label="Agregação temporal"
            >
              <option value="day">Diária</option>
              <option value="week">Semanal</option>
              <option value="month">Mensal</option>
              <option value="year">Anual</option>
            </select>
          </div>
        </div>

        <div class="control-row">
          <div class="form-group" style="flex: 1;">
            <label for="ndvi-resolution">Resolução (m)</label>
            <select
              id="ndvi-resolution"
              [(ngModel)]="resolution"
              [disabled]="loading"
              aria-label="Resolução espacial"
            >
              <option *ngFor="let value of availableResolutions" [ngValue]="value">{{ value }}m</option>
            </select>
          </div>
          <button
            class="btn btn-primary"
            data-testid="compute-ndvi"
            [disabled]="!areaId || loading"
            (click)="computeNdvi()"
            style="align-self: flex-end; min-width: 140px;">
            <span *ngIf="!loading" class="btn-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
              Calcular NDVI
            </span>
            <span *ngIf="loading" class="btn-loading">
              <span class="spinner"></span>
              Calculando...
            </span>
          </button>
        </div>
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
        Consultando dados de NDVI...
      </p>

      <div class="chart-wrapper" *ngIf="chartData">
        <canvas baseChart
          [data]="chartData"
          [options]="chartOptions"
          [type]="'line'">
        </canvas>
      </div>

      <div *ngIf="!chartData && !loading && !error" class="empty-state animate-fade-in">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"></line>
          <line x1="12" y1="20" x2="12" y2="4"></line>
          <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
        <h4>Ainda não há dados de NDVI</h4>
        <p>Configure os parâmetros acima e clique em <strong>Calcular NDVI</strong> para gerar a série temporal do índice de reflectância.</p>
      </div>

      <div *ngIf="chartData" class="chart-legend">
        <div class="legend-item">
          <span class="legend-color" style="background: #4b9e4b;"></span>
          <span>Máx</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #4a90d9;"></span>
          <span>Média</span>
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #d93025;"></span>
          <span>Mín</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .chart-container {
      padding: var(--space-5);
    }

    .controls {
      margin-bottom: var(--space-5);
      opacity: 1;
      transition: opacity var(--transition-fast);
    }

    .controls.disabled {
      opacity: 0.6;
      pointer-events: none;
    }

    .control-row {
      display: flex;
      align-items: flex-end;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
      flex-wrap: wrap;
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

    input, select {
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

    input::placeholder {
      color: var(--color-text-tertiary);
    }

    input:hover:not(:disabled):not([readonly]),
    select:hover:not(:disabled):not([readonly]) {
      border-color: var(--color-border-medium);
    }

    input:focus,
    select:focus {
      outline: none;
      border-color: var(--color-border-focus);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
    }

    input:disabled,
    input[readonly],
    select:disabled,
    select[readonly] {
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

    .chart-wrapper {
      position: relative;
      height: 360px;
      width: 100%;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-10) var(--space-4);
      text-align: center;
      color: var(--color-text-tertiary);
      height: 360px;
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

    .chart-legend {
      display: flex;
      justify-content: center;
      gap: var(--space-6);
      margin-top: var(--space-4);
      padding: var(--space-3) 0;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: var(--radius-sm);
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

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class NdviChartComponent implements OnChanges {
  @Input() areaId: number | null = null;
  @Output() ndviComputed = new EventEmitter<NdviDataPoint[]>();

  dateFrom = '';
  dateTo = '';
  collection = 'sentinel-2-l2a';
  aggregation = 'month';
  resolution = 100;
  loading = false;
  error = '';

  chartData: ChartData<'line'> | null = null;
  private rawData: NdviDataPoint[] = [];
  chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => {
            const label = ctx.dataset.label || '';
            return `${label}: ${ctx.parsed.y?.toFixed(4)}`;
          },
          afterBody: (items) => {
            if (!items.length) return [];
            const idx = items[0].dataIndex;
            const point = this.rawData[idx];
            if (!point) return [];
            return [
              `Desvio padrão: ${point.ndvi_stdev?.toFixed(4) ?? '—'}`,
              `Pixels válidos: ${point.sample_count ?? '—'}`,
              `Sem dados: ${point.no_data_count ?? '—'}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8', font: { size: 11 } },
      },
      y: {
        min: -1,
        max: 1,
        grid: { color: '#e2e8f0' },
        ticks: { color: '#94a3b8', font: { size: 11 }, stepSize: 0.2 },
        title: { display: true, text: 'NDVI', color: '#475569', font: { size: 12, weight: 500 } },
      },
    },
    elements: {
      line: { tension: 0.3 },
      point: { radius: 3, hoverRadius: 5 },
    },
  };

  get maxDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  get availableResolutions(): number[] {
    return this.collection.startsWith('landsat') ? [30, 100] : [10, 20, 30, 100];
  }

  onDateChange() {
    this.chartData = null;
    this.rawData = [];
    this.error = '';
  }

  changeCollection(collection: string) {
    this.collection = collection;
    if (!this.availableResolutions.includes(this.resolution)) {
      this.resolution = this.availableResolutions[0];
    }
    this.chartData = null;
    this.rawData = [];
    this.error = '';
  }

  constructor(private api: ApiService, private changeDetector: ChangeDetectorRef) {
    this.setDefaultDates();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['areaId'] && this.areaId) {
      this.setDefaultDates();
      this.chartData = null;
      this.rawData = [];
    }
  }

  private setDefaultDates() {
    const end = new Date();
    const start = new Date();
    start.setFullYear(end.getFullYear() - 1);
    this.dateTo = end.toISOString().split('T')[0];
    this.dateFrom = start.toISOString().split('T')[0];
  }

  computeNdvi() {
    if (!this.areaId) return;

    this.loading = true;
    this.error = '';

    this.api
      .computeNdvi(this.areaId, {
        date_from: this.dateFrom,
        date_to: this.dateTo,
        collection: this.collection,
        aggregation: this.aggregation,
        resolution: this.resolution,
      })
      .subscribe({
        next: (response) => {
          this.loading = false;
          if (!response || !Array.isArray(response.data)) {
            this.error = 'A resposta do serviço de NDVI não contém dados válidos';
            this.chartData = null;
            return;
          }
          this.buildChart(response.data);
          this.ndviComputed.emit(response.data);
          this.changeDetector.markForCheck();
        },
        error: (err) => {
          this.loading = false;
          this.error = err.error?.detail || err.error?.error || 'Falha ao calcular NDVI';
          this.changeDetector.markForCheck();
        },
      });
  }

  private buildChart(data: NdviDataPoint[]) {
    if (!data.length) {
      this.chartData = null;
      this.rawData = [];
      this.error = 'Nenhum dado de NDVI foi encontrado para o período selecionado';
      return;
    }

    this.rawData = data;
    const dates = data.map((d) => d.date);
    const means = data.map((d) => d.ndvi_mean);
    const mins = data.map((d) => d.ndvi_min);
    const maxs = data.map((d) => d.ndvi_max);

    this.chartData = {
      labels: dates,
      datasets: [
        {
          label: 'NDVI Max',
          data: maxs,
          borderColor: 'rgba(75, 192, 75, 0.8)',
          backgroundColor: 'rgba(75, 192, 75, 0.1)',
          borderWidth: 1.5,
          fill: '+1',
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
        {
          label: 'NDVI Mean',
          data: means,
          borderColor: '#4a90d9',
          backgroundColor: 'rgba(74, 144, 217, 0.15)',
          borderWidth: 2.5,
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: 'NDVI Min',
          data: mins,
          borderColor: 'rgba(217, 48, 37, 0.8)',
          backgroundColor: 'rgba(217, 48, 37, 0.1)',
          borderWidth: 1.5,
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
      ],
    };
  }
}
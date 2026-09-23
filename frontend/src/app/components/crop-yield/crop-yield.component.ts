import { ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { CropProduct, CropProductsResponse, CropYieldEstimate } from '../../models/types';

@Component({
  selector: 'app-crop-yield',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="crop-container">
      <div class="controls" [class.disabled]="loading">
        <div class="control-row">
          <div class="form-group" style="flex: 2;">
            <label for="crop-product">Cultivo</label>
            <select
              id="crop-product"
              [(ngModel)]="productCode"
              (ngModelChange)="onParamsChange()"
              [disabled]="loading"
              aria-label="Cultivo a estimar"
            >
              <option *ngFor="let product of products" [ngValue]="product.code">{{ product.name }}</option>
            </select>
          </div>
          <div class="form-group" style="flex: 2;">
            <label for="crop-years">Anos (múltipla seleção)</label>
            <div class="multi-select" #yearsBox>
              <button
                type="button"
                class="multi-select-toggle"
                id="crop-years"
                [disabled]="loading"
                aria-haspopup="listbox"
                [attr.aria-expanded]="yearsOpen"
                (click)="yearsOpen = !yearsOpen"
              >
                <span class="multi-select-value">{{ selectedYears.length ? yearsSummary(selectedYears) : 'Selecione os anos' }}</span>
                <svg class="multi-select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" [class.open]="yearsOpen">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <div *ngIf="yearsOpen" class="multi-select-menu" role="listbox" aria-multiselectable="true">
                <label *ngFor="let y of years" class="multi-option" role="option" [attr.aria-selected]="selectedYears.includes(y)">
                  <input
                    type="checkbox"
                    [checked]="selectedYears.includes(y)"
                    (change)="toggleYear(y)"
                  />
                  <span>{{ y }}</span>
                </label>
              </div>
            </div>
          </div>
          <button
            class="btn btn-primary"
            data-testid="compute-crop"
            [disabled]="!areaId || loading || !productCode || !selectedYears.length"
            (click)="loadEstimate()"
            style="align-self: flex-end; min-width: 160px;">
            <span *ngIf="!loading" class="btn-content">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 2v8L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 10V2"></path>
                <path d="M8.5 2h7"></path>
                <path d="M7 16h10"></path>
              </svg>
              Calcular Produção
            </span>
            <span *ngIf="loading" class="btn-loading">
              <span class="spinner"></span>
              Calculando...
            </span>
          </button>
        </div>
        <p class="controls-hint" *ngIf="productCode && selectedYears.length > 1">
          A estimativa usa o rendimento médio do IBGE nos {{ selectedYears.length }} anos selecionados
          (média de {{ yearsSummary(selectedYears) }}); anos sem dados são ignorados.
        </p>
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
        Consultando rendimento médio no IBGE (PAM)...
      </p>

      <div *ngIf="estimate" class="estimate-card animate-fade-in" data-testid="crop-estimate">
        <div class="estimate-grid">
          <div class="estimate-stat">
            <span class="estimate-label">Município</span>
            <span class="estimate-value">{{ estimate.municipality_name }} ({{ estimate.municipality_code }}) · {{ estimate.uf }}</span>
          </div>
          <div class="estimate-stat">
            <span class="estimate-label">Cultivo / Anos</span>
            <span class="estimate-value">{{ estimate.product_name }} · {{ yearsSummary(estimate.years) }}</span>
          </div>
          <div class="estimate-stat">
            <span class="estimate-label">Área total</span>
            <span class="estimate-value">{{ formatNumber(estimate.area_ha) }} ha</span>
          </div>
          <div class="estimate-stat">
            <span class="estimate-label">Rendimento médio IBGE (média de {{ estimate.n_years }} ano(s))</span>
            <span class="estimate-value">{{ formatNumber(estimate.yield_value) }} {{ estimate.yield_unit }}</span>
          </div>
        </div>
        <div class="estimate-total">
          <div class="estimate-total-cols">
            <div class="estimate-total-col">
              <span class="estimate-label">Estimativa de produção</span>
              <span *ngIf="estimate.yield_unit === 'kg/ha'" class="estimate-total-value">
                {{ formatNumber(estimate.total) }} kg
                <span *ngIf="estimate.total_tons != null" class="estimate-total-sub">(≈ {{ formatNumber(estimate.total_tons, 2) }} t)</span>
              </span>
              <span *ngIf="estimate.yield_unit === 'sacas/ha'" class="estimate-total-value">
                {{ formatNumber(estimate.total) }} sacas (60 kg)
                <span *ngIf="estimate.total_tons != null" class="estimate-total-sub">(≈ {{ formatNumber(estimate.total_tons, 2) }} t)</span>
              </span>
              <span *ngIf="estimate.yield_unit === 'frutos/ha'" class="estimate-total-value">
                {{ formatNumber(estimate.total) }} frutos
                <span *ngIf="estimate.total_mil_frutos != null" class="estimate-total-sub">(≈ {{ formatNumber(estimate.total_mil_frutos, 2) }} mil frutos)</span>
              </span>
            </div>
            <div *ngIf="estimate.value_total != null" class="estimate-total-col">
              <span class="estimate-label">Estimativa de valor da produção (IBGE)</span>
              <span class="estimate-total-value">
                ≈ {{ formatCurrency(estimate.value_total) }}
                <span *ngIf="estimate.price_per_unit != null" class="estimate-total-sub">
                  <br>preço médio {{ estimate.price_unit || 'R$/t' }} {{ formatNumber(estimate.price_per_unit, 2) }} · média de {{ estimate.value_years || estimate.n_years }} ano(s)
                </span>
              </span>
            </div>
          </div>
        </div>
        <p class="estimate-source">
          Fonte: IBGE · Produção Agrícola Municipal (tabela 5457) · rendimento médio da produção ·
          média {{ estimate.n_years }} ano(s) ({{ yearsSummary(estimate.years) }})
          <ng-container *ngIf="estimate.value_total != null">
            · valor estimado pelo preço implícito IBGE (valor da produção ÷ quantidade produzida), valores nominais
          </ng-container>
        </p>
      </div>

      <div *ngIf="!estimate && !loading && !error" class="empty-state animate-fade-in">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 2v8L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 10V2"></path>
          <path d="M8.5 2h7"></path>
          <path d="M7 16h10"></path>
        </svg>
        <h4>Ainda não há estimativa de produção</h4>
        <p>Escolha o cultivo e os anos de referência (múltipla seleção) e clique em <strong>Calcular Produção</strong>. A área será estimada em hectares e multiplicada pelo rendimento médio do município apurado pelo IBGE.</p>
      </div>
    </div>
  `,
  styles: [`
    .crop-container {
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

    .controls-hint {
      margin: 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-tertiary);
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

    select:hover:not(:disabled):not([readonly]) {
      border-color: var(--color-border-medium);
    }

    select:focus {
      outline: none;
      border-color: var(--color-border-focus);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
    }

    select:disabled,
    select[readonly] {
      background: var(--color-bg-tertiary);
      color: var(--color-text-tertiary);
      cursor: not-allowed;
    }

    .multi-select {
      position: relative;
    }

    .multi-select-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      width: 100%;
      height: var(--input-height);
      padding: 0 var(--space-3);
      font-size: var(--font-size-sm);
      font-family: inherit;
      color: var(--color-text-primary);
      text-align: left;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }

    .multi-select-toggle:hover:not(:disabled) {
      border-color: var(--color-border-medium);
    }

    .multi-select-toggle:focus {
      outline: none;
      border-color: var(--color-border-focus);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
    }

    .multi-select-toggle:disabled {
      background: var(--color-bg-tertiary);
      color: var(--color-text-tertiary);
      cursor: not-allowed;
    }

    .multi-select-value {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .multi-select-chevron {
      flex-shrink: 0;
      transition: transform var(--transition-fast);
    }

    .multi-select-chevron.open {
      transform: rotate(180deg);
    }

    .multi-select-menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      z-index: 20;
      max-height: 260px;
      overflow-y: auto;
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-medium);
      border-radius: var(--radius-md);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      padding: var(--space-1);
    }

    .multi-option {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      font-size: var(--font-size-sm);
      color: var(--color-text-primary);
      border-radius: var(--radius-sm);
      cursor: pointer;
      margin: 0;
    }

    .multi-option:hover {
      background: color-mix(in srgb, var(--color-primary) 8%, transparent);
    }

    .multi-option input {
      accent-color: var(--color-primary);
      margin: 0;
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

    .estimate-card {
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-lg);
      background: var(--color-bg-secondary);
      padding: var(--space-5);
    }

    .estimate-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--space-4);
      margin-bottom: var(--space-4);
    }

    .estimate-stat {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .estimate-label {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .estimate-value {
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }

    .estimate-total {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-4);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-primary) 6%, transparent);
      border: 1px solid color-mix(in srgb, var(--color-primary) 16%, transparent);
    }

    .estimate-total-value {
      font-size: var(--font-size-2xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-primary-dark);
    }

    .estimate-total-sub {
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
    }

    .estimate-total-cols {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: var(--space-4);
    }

    .estimate-total-col {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .estimate-total-col + .estimate-total-col {
      padding-left: var(--space-4);
      border-left: 1px solid var(--color-border-light);
    }

    .estimate-source {
      margin: var(--space-4) 0 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-tertiary);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-8) var(--space-4);
      text-align: center;
      color: var(--color-text-tertiary);
      border: 1px dashed var(--color-border-light);
      border-radius: var(--radius-lg);
      background: var(--color-bg-secondary);
    }

    .empty-state svg {
      width: 48px;
      height: 48px;
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
      max-width: 420px;
      margin-left: auto;
      margin-right: auto;
    }

    .empty-state p strong {
      color: var(--color-primary);
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class CropYieldComponent implements OnChanges {
  @Input() areaId: number | null = null;
  @ViewChild('yearsBox') yearsBox: ElementRef | null = null;

  products: CropProduct[] = [];
  years: number[] = [];
  productCode: number | null = null;
  selectedYears: number[] = [];
  yearsOpen = false;
  loading = false;
  error = '';
  estimate: CropYieldEstimate | null = null;

  constructor(private api: ApiService, private changeDetector: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['areaId']) {
      this.reset();
      this.yearsOpen = false;
      this.years = [];
      this.selectedYears = [];
      this.api.getCropProducts().subscribe({
        next: (response) => this.handleProducts(response),
        error: (err) => {
          this.error = err.error?.detail || err.error?.error || 'Falha ao carregar cultivos';
          this.changeDetector.markForCheck();
        },
      });
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.yearsOpen && this.yearsBox && !this.yearsBox.nativeElement.contains(event.target)) {
      this.yearsOpen = false;
    }
  }

  private handleProducts(response: CropProductsResponse) {
    if (!response || !Array.isArray(response.data)) {
      this.error = 'A resposta de cultivos não contém dados válidos';
      this.changeDetector.markForCheck();
      return;
    }
    this.products = response.data;
    const latest = response.latest_year ?? new Date().getFullYear() - 1;
    const min = response.min_year ?? 1974;
    this.years = [];
    for (let y = latest; y >= min; y--) {
      this.years.push(y);
    }
    if (this.products.length) {
      this.productCode = this.products[0].code;
    }
    this.selectedYears = [latest, latest - 1, latest - 2].filter((y) => y >= min);
    this.changeDetector.markForCheck();
  }

  reset() {
    this.estimate = null;
    this.error = '';
    this.loading = false;
  }

  onParamsChange() {
    this.reset();
  }

  toggleYear(y: number) {
    if (this.selectedYears.includes(y)) {
      this.selectedYears = this.selectedYears.filter((x) => x !== y);
    } else {
      this.selectedYears = [...this.selectedYears, y].sort((a, b) => b - a);
    }
    this.onParamsChange();
  }

  yearsSummary(years: number[]): string {
    return years.slice(0, 3).join(', ') + (years.length > 3 ? ` +${years.length - 3}` : '');
  }

  formatNumber(value: number | null | undefined, digits = 0): string {
    if (value == null || Number.isNaN(value)) return '—';
    return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
  }

  formatCurrency(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) return '—';
    return 'R$ ' + value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  loadEstimate() {
    if (!this.areaId || !this.productCode || !this.selectedYears.length) return;
    const areaId = this.areaId;
    const productCode = this.productCode;
    const years = [...this.selectedYears];

    this.loading = true;
    this.error = '';
    this.estimate = null;
    this.yearsOpen = false;

    this.api.getCropEstimate(areaId, productCode, years).subscribe({
      next: (response) => {
        if (this.areaId !== areaId) return;
        this.loading = false;
        this.handleEstimate(response);
      },
      error: (err) => {
        if (this.areaId !== areaId) return;
        if (err.status === 404) {
          this.computeRemote(areaId, productCode, years);
        } else {
          this.loading = false;
          this.error = err.error?.detail || err.error?.error || 'Falha ao consultar estimativa em cache';
          this.changeDetector.markForCheck();
        }
      },
    });
  }

  private computeRemote(areaId: number, productCode: number, years: number[]) {
    this.api.computeCropEstimate(areaId, { product_code: productCode, years }).subscribe({
      next: (response) => {
        if (this.areaId !== areaId) return;
        this.loading = false;
        this.handleEstimate(response);
      },
      error: (err) => {
        if (this.areaId !== areaId) return;
        this.loading = false;
        this.error = err.error?.detail || err.error?.error || 'Falha ao calcular a estimativa';
        this.changeDetector.markForCheck();
      },
    });
  }

  private handleEstimate(response: CropYieldEstimate) {
    if (!response || response.municipality_name == null) {
      this.error = 'A resposta não contém uma estimativa válida';
      this.changeDetector.markForCheck();
      return;
    }
    this.estimate = response;
    this.changeDetector.markForCheck();
  }
}
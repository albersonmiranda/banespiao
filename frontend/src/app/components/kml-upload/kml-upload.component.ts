import {
  Component,
  EventEmitter,
  Output,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-kml-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="upload-card">
      <div class="card-header">
        <div class="header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
        </div>
        <div>
          <h3>Enviar Área (KML)</h3>
          <p class="card-subtitle">Defina sua área de monitoramento enviando um arquivo KML com geometria de polígono</p>
        </div>
      </div>

      <div class="drop-zone"
           [class.drag-over]="isDragOver"
           [class.has-file]="selectedFile"
           (dragover)="onDragOver($event)"
           (dragleave)="onDragLeave($event)"
           (drop)="onDrop($event)"
           (click)="fileInput.click()"
           role="button"
           tabindex="0"
           (keydown.enter)="fileInput.click()"
           (keydown.space)="fileInput.click()"
           aria-label="Área de transferência para envio de arquivo KML">
        <input
          #fileInput
          type="file"
          accept=".kml"
          (change)="onFileSelected($event)"
          hidden
          aria-hidden="true"
        />

        <div class="drop-content" *ngIf="!selectedFile">
          <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <p class="drop-text">Arraste e solte um arquivo <strong>.kml</strong> aqui, ou clique para procurar</p>
          <p class="drop-hint">Suporta geometrias Polygon e MultiPolygon</p>
        </div>

        <div class="file-preview" *ngIf="selectedFile">
          <div class="file-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div class="file-info">
            <p class="file-name">{{ selectedFile.name }}</p>
            <p class="file-size">{{ formatFileSize(selectedFile.size) }}</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" (click)="removeFile($event)" aria-label="Remover arquivo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
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

      <div class="card-actions">
        <button
          class="btn btn-primary"
          [disabled]="!selectedFile || uploading"
          (click)="upload()"
          [class.loading]="uploading">
          <span *ngIf="!uploading">Enviar Área</span>
          <span *ngIf="uploading" class="btn-loading">
            <span class="spinner"></span>
            Enviando...
          </span>
        </button>
        <p class="upload-hint" *ngIf="!selectedFile">Selecione um arquivo .kml para habilitar o envio</p>
      </div>
    </div>
  `,
styles: [`
    .upload-card {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      padding: var(--space-5);
    }

    .card-header {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      margin-bottom: var(--space-5);
    }

    .header-icon {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-primary) 10%, transparent);
      color: var(--color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .header-icon svg {
      width: 22px;
      height: 22px;
    }

    .card-header h3 {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      margin: 0 0 var(--space-1);
    }

    .card-subtitle {
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      margin: 0;
    }

    .drop-zone {
      border: 2px dashed var(--color-border-light);
      border-radius: var(--radius-lg);
      padding: var(--space-8) var(--space-6);
      text-align: center;
      cursor: pointer;
      transition: all var(--transition-normal);
      position: relative;
    }

    .drop-zone:hover:not(.has-file):not(.drag-over) {
      border-color: var(--color-primary-light);
      background: color-mix(in srgb, var(--color-primary) 3%, transparent);
    }

    .drop-zone.drag-over {
      border-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 8%, transparent);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary) 10%, transparent);
    }

    .drop-zone.has-file {
      border-style: solid;
      border-color: var(--color-border-medium);
      background: var(--color-bg-tertiary);
      text-align: left;
      padding: var(--space-4);
    }

    .drop-content {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .drop-icon {
      width: 48px;
      height: 48px;
      color: var(--color-text-tertiary);
      margin: 0 auto;
    }

    .drop-text {
      font-size: var(--font-size-base);
      color: var(--color-text-primary);
      margin: 0;
    }

    .drop-text strong {
      color: var(--color-primary);
    }

    .drop-hint {
      font-size: var(--font-size-sm);
      color: var(--color-text-tertiary);
      margin: 0;
    }

    .file-preview {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
    }

    .file-icon {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-primary) 10%, transparent);
      color: var(--color-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .file-icon svg {
      width: 22px;
      height: 22px;
    }

    .file-info {
      flex: 1;
      min-width: 0;
    }

    .file-preview .btn {
      width: var(--btn-height-sm);
      min-width: var(--btn-height-sm);
      flex-shrink: 0;
      padding: 0;
      border: 1px solid var(--color-border-light);
      border-radius: var(--radius-full);
    }

    .file-name {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-primary);
      margin: 0 0 var(--space-1);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-size {
      font-size: var(--font-size-xs);
      color: var(--color-text-tertiary);
      margin: 0;
    }

    .card-actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-top: var(--space-4);
      padding-top: var(--space-4);
      border-top: 1px solid var(--color-border-light);
    }

    .btn {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: 0 var(--space-4);
      height: var(--btn-height);
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

    .btn-ghost {
      background: var(--color-bg-secondary);
      color: var(--color-text-secondary);
    }

    .btn-ghost:hover:not(:disabled) {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
      border-color: var(--color-border-medium);
    }

    .btn-sm {
      height: var(--btn-height-sm);
      padding: 0 var(--space-3);
      font-size: var(--font-size-xs);
    }

    .btn.loading {
      position: relative;
      color: transparent;
    }

    .btn-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      color: var(--color-primary-contrast);
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid color-mix(in srgb, currentColor 20%, transparent);
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .upload-hint {
      text-align: center;
      font-size: var(--font-size-sm);
      color: var(--color-text-tertiary);
      margin: 0;
    }

    .alert {
      display: flex;
      align-items: flex-start;
      gap: var(--space-2);
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
  `],
})
export class KmlUploadComponent {
  @Output() areaCreated = new EventEmitter<{ id: number; name: string; geojson: any }>();

  selectedFile: File | null = null;
  isDragOver = false;
  uploading = false;
  error = '';

  constructor(private api: ApiService) {}

  @HostListener('document:dragenter', ['$event'])
  @HostListener('document:dragover', ['$event'])
  onGlobalDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('document:dragleave', ['$event'])
  onGlobalDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('document:drop', ['$event'])
  onGlobalDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.selectFile(files[0]);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectFile(input.files[0]);
    }
  }

  private selectFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.kml')) {
      this.error = 'Selecione um arquivo .kml';
      this.selectedFile = null;
      return;
    }
    this.selectedFile = file;
    this.error = '';
  }

  removeFile(event: Event) {
    event.stopPropagation();
    this.selectedFile = null;
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  upload() {
    if (!this.selectedFile) return;

    this.uploading = true;
    this.error = '';

    this.api.uploadKml(this.selectedFile).subscribe({
      next: (response) => {
        this.uploading = false;
        this.selectedFile = null;
        this.areaCreated.emit(response);
      },
      error: (err) => {
        this.uploading = false;
        this.error = err.error?.detail || err.error?.error || 'Falha no envio';
      },
    });
  }
}
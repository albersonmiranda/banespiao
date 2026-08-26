import { Component } from '@angular/core';
import { ReportPanelComponent } from './components/report-panel/report-panel.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReportPanelComponent],
  template: `<app-report-panel></app-report-panel>`,
})
export class AppComponent {}

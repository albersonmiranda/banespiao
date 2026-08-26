import { Routes } from '@angular/router';
import { ReportPanelComponent } from './components/report-panel/report-panel.component';

export const routes: Routes = [
  { path: '', component: ReportPanelComponent },
  { path: '**', redirectTo: '' },
];

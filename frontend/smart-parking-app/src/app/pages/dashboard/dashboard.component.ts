import { Component } from '@angular/core';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-dashboard',
  template: '<h1>Dashboard</h1><button (click)="logout()">Deconnexion</button>',
  styles: [],
  standalone: false,
})
export class DashboardComponent {
  constructor(private authService: AuthService) {}

  logout(): void {
    this.authService.logout();
  }
}

import { Component } from '@angular/core';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
  standalone: false,
})
export class NavbarComponent {
  menuItems = [
    { icon: 'grid-outline', label: 'Dashboard', route: '/owner/dashboard' },
    { icon: 'person-outline', label: 'Profil', route: '/owner/profile' }
  ];
}
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

export interface HeaderNotificationItem {
  title: string;
  description: string;
  timestamp: string;
  icon?: string;
  tone?: 'info' | 'success' | 'warning' | 'alert';
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: false,
})
export class HeaderComponent {
  @Input() notificationCount = 0;
  @Input() notifications: HeaderNotificationItem[] = [];
  @Input() showLogoutButton = false;
  @Output() logoutRequested = new EventEmitter<void>();

  companyName = 'Parking Express';
  avatar = 'assets/default-avatar.png';
  isNotificationsOpen = false;

  toggleNotifications(): void {
    this.isNotificationsOpen = !this.isNotificationsOpen;
  }

  closeNotifications(): void {
    this.isNotificationsOpen = false;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeNotifications();
  }

  onNotificationPanelClick(event: Event): void {
    event.stopPropagation();
  }

  requestLogout(event: Event): void {
    event.stopPropagation();
    this.logoutRequested.emit();
  }
}

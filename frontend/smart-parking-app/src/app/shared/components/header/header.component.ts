import { Component, HostListener, Input } from '@angular/core';

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
}

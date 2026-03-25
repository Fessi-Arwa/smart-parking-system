import { Component } from '@angular/core';

export interface OwnerStats {
  totalParkings: number;
  totalSpaces: number;
  occupiedSpaces: number;
  occupancyRate: number;
  todayReservations: number;
  todayRevenue: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
  unreadFeedbacks: number;
}

export interface OwnerParking {
  id: number;
  name: string;
  address: string;
  totalSpaces: number;
  availableSpaces: number;
  status: 'active' | 'maintenance';
  image: string;
}

export interface OwnerReservation {
  id: number;
  parkingName: string;
  userName: string;
  time: string;
  plate: string;
  amount: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class DashboardPage {
  stats: OwnerStats = {
    totalParkings: 3,
    totalSpaces: 124,
    occupiedSpaces: 87,
    occupancyRate: 70,
    todayReservations: 12,
    todayRevenue: 342,
    monthlyRevenue: 8450,
    activeSubscriptions: 28,
    unreadFeedbacks: 3
  };

  parkings: OwnerParking[] = [
    {
      id: 1,
      name: 'Parking Centre Ville',
      address: '15 Rue de la Republique',
      totalSpaces: 45,
      availableSpaces: 12,
      status: 'active',
      image: 'assets/parking1.jpg'
    },
    {
      id: 2,
      name: 'Parking Gare',
      address: '2 Avenue de la Gare',
      totalSpaces: 52,
      availableSpaces: 8,
      status: 'active',
      image: 'assets/parking2.jpg'
    },
    {
      id: 3,
      name: 'Parking Hopital',
      address: '10 Boulevard Pasteur',
      totalSpaces: 27,
      availableSpaces: 3,
      status: 'maintenance',
      image: 'assets/parking3.jpg'
    }
  ];

  todayReservations: OwnerReservation[] = [
    {
      id: 1,
      parkingName: 'Parking Centre Ville',
      userName: 'Jean Dupont',
      time: '10:00 - 12:00',
      plate: 'AB-123-CD',
      amount: 8
    },
    {
      id: 2,
      parkingName: 'Parking Gare',
      userName: 'Marie Martin',
      time: '14:30 - 16:30',
      plate: 'EF-456-GH',
      amount: 10
    },
    {
      id: 3,
      parkingName: 'Parking Centre Ville',
      userName: 'Pierre Durand',
      time: '17:00 - 19:00',
      plate: 'IJ-789-KL',
      amount: 12
    }
  ];
}
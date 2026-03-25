export interface Owner {
  id: number;
  username: string;
  email: string;
  companyName: string;
  avatar?: string;
  phone: string;
  address: string;
  registrationDate: Date;
  totalParkings: number;
  totalSpaces: number;
  totalRevenue: number;
  rating: number;
}

export interface OwnerStats {
  totalParkings: number;
  totalSpaces: number;
  occupiedSpaces: number;
  occupancyRate: number;
  todayReservations: number;
  todayRevenue: number;
  weeklyRevenue: number[];
  monthlyRevenue: number;
  activeSubscriptions: number;
  unreadFeedbacks: number;
}
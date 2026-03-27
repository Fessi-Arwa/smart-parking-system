import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

// Interfaces basées sur les modèles backend
export interface User {
  id_compte: number;
  nom: string;
  email: string;
  telephone: string;
  role: 'conducteur' | 'owner' | 'admin';
  created_at: string;
}

export interface Parking {
  id_park: number;
  owner_id: number;
  owner_name: string;
  nom: string;
  adresse: string;
  ville: string;
  prix_heure: number;
  statut: 'actif' | 'inactif';
  validation_status: 'en_attente' | 'approuve' | 'rejete';
  created_at: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
})
export class AdminDashboardPage implements OnInit {
  // ========== STATISTIQUES ==========
  stats = {
    totalUsers: 8,
    totalDrivers: 5,
    totalOwners: 3,
    totalParkings: 12,
    activeParkings: 8,
    pendingParkings: 4,
    totalReservations: 156,
    totalRevenue: 12450
  };

  // ========== UTILISATEURS ==========
  users: User[] = [
    {
      id_compte: 1,
      nom: 'Ahmed Ben Ali',
      email: 'ahmed@parkini.com',
      telephone: '+216 12 345 678',
      role: 'owner',
      created_at: '2024-01-15'
    },
    {
      id_compte: 2,
      nom: 'Nadia Benali',
      email: 'nadia@parkini.com',
      telephone: '+213 555 20 10 15',
      role: 'conducteur',
      created_at: '2024-02-20'
    },
    {
      id_compte: 3,
      nom: 'Karim Mansouri',
      email: 'karim@parkini.com',
      telephone: '+216 98 765 432',
      role: 'conducteur',
      created_at: '2024-03-10'
    },
    {
      id_compte: 4,
      nom: 'Sonia Trabelsi',
      email: 'sonia@parkini.com',
      telephone: '+216 55 123 456',
      role: 'conducteur',
      created_at: '2024-03-15'
    },
    {
      id_compte: 5,
      nom: 'Mehdi Bouazizi',
      email: 'mehdi@parkini.com',
      telephone: '+216 22 789 123',
      role: 'owner',
      created_at: '2024-03-20'
    },
    {
      id_compte: 6,
      nom: 'Leila Hammami',
      email: 'leila@parkini.com',
      telephone: '+216 33 456 789',
      role: 'conducteur',
      created_at: '2024-04-01'
    },
    {
      id_compte: 7,
      nom: 'Tarek Gharbi',
      email: 'tarek@parkini.com',
      telephone: '+216 44 567 890',
      role: 'conducteur',
      created_at: '2024-04-05'
    },
    {
      id_compte: 8,
      nom: 'Admin System',
      email: 'admin@parkini.com',
      telephone: '+216 11 111 111',
      role: 'admin',
      created_at: '2024-01-01'
    }
  ];

  // ========== PARKINGS ==========
  parkings: Parking[] = [
    {
      id_park: 1,
      owner_id: 1,
      owner_name: 'Ahmed Ben Ali',
      nom: 'Parking Centre Ville',
      adresse: '15 Rue de la République',
      ville: 'Tunis',
      prix_heure: 2.5,
      statut: 'actif',
      validation_status: 'approuve',
      created_at: '2024-01-20'
    },
    {
      id_park: 2,
      owner_id: 1,
      owner_name: 'Ahmed Ben Ali',
      nom: 'Parking Gare',
      adresse: '2 Avenue de la Gare',
      ville: 'Tunis',
      prix_heure: 2.0,
      statut: 'actif',
      validation_status: 'approuve',
      created_at: '2024-02-01'
    },
    {
      id_park: 3,
      owner_id: 5,
      owner_name: 'Mehdi Bouazizi',
      nom: 'Parking Lac',
      adresse: 'Rue du Lac',
      ville: 'Tunis',
      prix_heure: 3.0,
      statut: 'actif',
      validation_status: 'approuve',
      created_at: '2024-03-25'
    },
    {
      id_park: 4,
      owner_id: 5,
      owner_name: 'Mehdi Bouazizi',
      nom: 'Parking Berges du Lac',
      adresse: 'Avenue Hedi Nouira',
      ville: 'Tunis',
      prix_heure: 3.5,
      statut: 'actif',
      validation_status: 'approuve',
      created_at: '2024-04-01'
    },
    {
      id_park: 5,
      owner_id: 1,
      owner_name: 'Ahmed Ben Ali',
      nom: 'Parking Mutuelleville',
      adresse: 'Rue de Mutuelleville',
      ville: 'Tunis',
      prix_heure: 2.8,
      statut: 'actif',
      validation_status: 'en_attente',
      created_at: '2024-04-10'
    },
    {
      id_park: 6,
      owner_id: 5,
      owner_name: 'Mehdi Bouazizi',
      nom: 'Parking Manar',
      adresse: 'Avenue du Stade',
      ville: 'Tunis',
      prix_heure: 2.2,
      statut: 'actif',
      validation_status: 'en_attente',
      created_at: '2024-04-12'
    },
    {
      id_park: 7,
      owner_id: 1,
      owner_name: 'Ahmed Ben Ali',
      nom: 'Parking El Menzah',
      adresse: 'Rue de Palestine',
      ville: 'Tunis',
      prix_heure: 2.5,
      statut: 'inactif',
      validation_status: 'rejete',
      created_at: '2024-03-15'
    },
    {
      id_park: 8,
      owner_id: 5,
      owner_name: 'Mehdi Bouazizi',
      nom: 'Parking Ariana',
      adresse: 'Avenue de Paris',
      ville: 'Ariana',
      prix_heure: 1.8,
      statut: 'actif',
      validation_status: 'en_attente',
      created_at: '2024-04-15'
    }
  ];

  // ========== FILTRES ET RECHERCHE ==========
  userSearchTerm = '';
  userRoleFilter: 'all' | 'conducteur' | 'owner' | 'admin' = 'all';
  
  parkingSearchTerm = '';
  parkingStatusFilter: 'all' | 'en_attente' | 'approuve' | 'rejete' = 'all';

  constructor(
    private router: Router,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit() {}

  // ========== MÉTHODES UTILISATEURS ==========
  get filteredUsers(): User[] {
    let filtered = this.users;
    
    if (this.userRoleFilter !== 'all') {
      filtered = filtered.filter(u => u.role === this.userRoleFilter);
    }
    
    if (this.userSearchTerm.trim()) {
      const term = this.userSearchTerm.toLowerCase();
      filtered = filtered.filter(u => 
        u.nom.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.telephone.includes(term)
      );
    }
    
    return filtered;
  }

  deleteUser(userId: number) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
      this.users = this.users.filter(u => u.id_compte !== userId);
      this.updateStats();
    }
  }

  // ========== MÉTHODES PARKINGS ==========
  get filteredParkings(): Parking[] {
    let filtered = this.parkings;
    
    if (this.parkingStatusFilter !== 'all') {
      filtered = filtered.filter(p => p.validation_status === this.parkingStatusFilter);
    }
    
    if (this.parkingSearchTerm.trim()) {
      const term = this.parkingSearchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.nom.toLowerCase().includes(term) ||
        p.adresse.toLowerCase().includes(term) ||
        p.ville.toLowerCase().includes(term) ||
        p.owner_name.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }

  approveParking(parkingId: number) {
    const parking = this.parkings.find(p => p.id_park === parkingId);
    if (parking) {
      parking.validation_status = 'approuve';
      parking.statut = 'actif';
      this.updateStats();
    }
  }

  rejectParking(parkingId: number) {
    const parking = this.parkings.find(p => p.id_park === parkingId);
    if (parking) {
      parking.validation_status = 'rejete';
      parking.statut = 'inactif';
      this.updateStats();
    }
  }

  deleteParking(parkingId: number) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce parking ?')) {
      this.parkings = this.parkings.filter(p => p.id_park !== parkingId);
      this.updateStats();
    }
  }

  // ========== STATISTIQUES ==========
  updateStats() {
    this.stats.totalUsers = this.users.filter(u => u.role !== 'admin').length;
    this.stats.totalDrivers = this.users.filter(u => u.role === 'conducteur').length;
    this.stats.totalOwners = this.users.filter(u => u.role === 'owner').length;
    this.stats.totalParkings = this.parkings.length;
    this.stats.activeParkings = this.parkings.filter(p => p.statut === 'actif').length;
    this.stats.pendingParkings = this.parkings.filter(p => p.validation_status === 'en_attente').length;
  }

  getRoleLabel(role: string): string {
    switch(role) {
      case 'admin': return 'Admin';
      case 'owner': return 'Propriétaire';
      case 'conducteur': return 'Conducteur';
      default: return role;
    }
  }

  getValidationLabel(status: string): string {
    switch(status) {
      case 'approuve': return 'Approuvé';
      case 'en_attente': return 'En attente';
      case 'rejete': return 'Rejeté';
      default: return status;
    }
  }

  getRoleBadgeClass(role: string): string {
    switch(role) {
      case 'admin': return 'badge-danger';
      case 'owner': return 'badge-primary';
      case 'conducteur': return 'badge-success';
      default: return 'badge-secondary';
    }
  }

  getValidationBadgeClass(status: string): string {
    switch(status) {
      case 'approuve': return 'badge-success';
      case 'en_attente': return 'badge-warning';
      case 'rejete': return 'badge-danger';
      default: return 'badge-secondary';
    }
  }

  // ========== DÉCONNEXION ==========
  logout() {
    this.authService.logout();
    this.toastService.show('Déconnexion réussie', 'success');
    this.router.navigate(['/pages/auth/signin']);
  }
}

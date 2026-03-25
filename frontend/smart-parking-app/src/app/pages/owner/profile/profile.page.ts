import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../services/auth.service';

export interface OwnerProfile {
  id_compte: number;
  nom: string;
  email: string;
  telephone: string;
  role: string;
  companyName?: string;
  avatar?: string;
}

export interface ParkingInfo {
  id_park: number;
  nom: string;
  adresse: string;
  ville: string;
  prix_heure: number;
  statut: string;
  totalSpaces: number;
  availableSpaces: number;
  activeSubscriptions: number;
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false,
})
export class ProfilePage implements OnInit {
  // Données Owner
  owner: OwnerProfile = {
    id_compte: 1,
    nom: 'Ahmed Ben Ali',
    email: 'owner@smartparking.com',
    telephone: '+216 12 345 678',
    role: 'owner',
    companyName: 'Parking Express',
    avatar: 'assets/default-avatar.png'
  };

  // Liste des parkings
  parkings: ParkingInfo[] = [
    {
      id_park: 1,
      nom: 'Parking Centre Ville',
      adresse: '15 Rue de la République',
      ville: 'Tunis',
      prix_heure: 2.5,
      statut: 'actif',
      totalSpaces: 45,
      availableSpaces: 12,
      activeSubscriptions: 28
    },
    {
      id_park: 2,
      nom: 'Parking Gare',
      adresse: '2 Avenue de la Gare',
      ville: 'Tunis',
      prix_heure: 2.0,
      statut: 'actif',
      totalSpaces: 52,
      availableSpaces: 8,
      activeSubscriptions: 15
    },
    {
      id_park: 3,
      nom: 'Parking Hôpital',
      adresse: '10 Boulevard Pasteur',
      ville: 'Tunis',
      prix_heure: 3.0,
      statut: 'maintenance',
      totalSpaces: 27,
      availableSpaces: 0,
      activeSubscriptions: 5
    }
  ];

  // États UI
  isEditingProfile = false;
  showAddParking = false;
  selectedParking: ParkingInfo | null = null;
  isEditingParking = false;
  showDeleteConfirm = false;
  parkingToDelete: ParkingInfo | null = null;

  // Données de formulaire
  editProfileData = {
    nom: '',
    email: '',
    telephone: ''
  };

  newParkingData: Partial<ParkingInfo> = {
    nom: '',
    adresse: '',
    ville: '',
    prix_heure: 2.5,
    statut: 'actif',
    totalSpaces: 20,
    availableSpaces: 20
  };

  editParkingData: ParkingInfo = {
    id_park: 0,
    nom: '',
    adresse: '',
    ville: '',
    prix_heure: 0,
    statut: 'actif',
    totalSpaces: 0,
    availableSpaces: 0,
    activeSubscriptions: 0
  };

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.owner = {
        ...this.owner,
        nom: currentUser.nom || this.owner.nom,
        email: currentUser.email || this.owner.email,
        telephone: currentUser.telephone || this.owner.telephone,
      };
    }
  }

  get ownerInitials(): string {
    const source = (this.owner.nom || this.owner.companyName || '').trim();
    const parts = source.split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('') || 'OW';
  }

  logout(): void {
    this.authService.logout();
  }

  // Modifier profil
  startEditProfile() {
    this.editProfileData = {
      nom: this.owner.nom,
      email: this.owner.email,
      telephone: this.owner.telephone
    };
    this.isEditingProfile = true;
  }

  saveProfile() {
    this.owner.nom = this.editProfileData.nom;
    this.owner.email = this.editProfileData.email;
    this.owner.telephone = this.editProfileData.telephone;
    this.isEditingProfile = false;
  }

  cancelEditProfile() {
    this.isEditingProfile = false;
  }

  // Sélectionner un parking
  selectParking(parking: ParkingInfo) {
    this.selectedParking = parking;
    this.isEditingParking = false;
  }

  backToList() {
    this.selectedParking = null;
    this.showAddParking = false;
  }

  // Modifier parking
  startEditParking() {
    if (this.selectedParking) {
      this.editParkingData = { ...this.selectedParking };
      this.isEditingParking = true;
    }
  }

  saveParking() {
    if (this.selectedParking) {
      const index = this.parkings.findIndex(p => p.id_park === this.selectedParking!.id_park);
      if (index !== -1) {
        this.parkings[index] = { ...this.editParkingData };
        this.selectedParking = this.parkings[index];
      }
    }
    this.isEditingParking = false;
  }

  cancelEditParking() {
    this.isEditingParking = false;
  }

  // Supprimer parking
  confirmDelete(parking: ParkingInfo) {
    this.parkingToDelete = parking;
    this.showDeleteConfirm = true;
  }

  deleteParking() {
    if (this.parkingToDelete) {
      const index = this.parkings.findIndex(p => p.id_park === this.parkingToDelete!.id_park);
      if (index !== -1) {
        this.parkings.splice(index, 1);
        if (this.selectedParking?.id_park === this.parkingToDelete.id_park) {
          this.selectedParking = null;
        }
      }
      this.parkingToDelete = null;
    }
    this.showDeleteConfirm = false;
  }

  cancelDelete() {
    this.showDeleteConfirm = false;
    this.parkingToDelete = null;
  }

  // Ajouter parking
  openAddParking() {
    this.showAddParking = true;
    this.selectedParking = null;
    this.newParkingData = {
      nom: '',
      adresse: '',
      ville: '',
      prix_heure: 2.5,
      statut: 'actif',
      totalSpaces: 20,
      availableSpaces: 20
    };
  }

  addParking() {
    if (this.newParkingData.nom && this.newParkingData.adresse) {
      const newId = Math.max(...this.parkings.map(p => p.id_park), 0) + 1;
      const newParking: ParkingInfo = {
        id_park: newId,
        nom: this.newParkingData.nom,
        adresse: this.newParkingData.adresse,
        ville: this.newParkingData.ville || 'Tunis',
        prix_heure: this.newParkingData.prix_heure || 2.5,
        statut: this.newParkingData.statut as 'actif' | 'maintenance',
        totalSpaces: this.newParkingData.totalSpaces || 20,
        availableSpaces: this.newParkingData.availableSpaces || 20,
        activeSubscriptions: 0
      };
      this.parkings.unshift(newParking);
      this.showAddParking = false;
    }
  }

  getStatusColor(status: string): string {
    return status === 'actif' ? 'success' : 'warning';
  }

  getStatusLabel(status: string): string {
    return status === 'actif' ? 'Actif' : 'Maintenance';
  }
}

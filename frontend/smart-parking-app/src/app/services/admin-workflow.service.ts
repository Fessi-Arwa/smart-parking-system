import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

import { AuthService } from './auth.service';

export interface AdminUserRecord {
  id_compte: number;
  nom: string;
  email: string;
  telephone?: string;
  role: 'conducteur' | 'owner' | 'admin';
  owner_status?: 'en_attente' | 'accepte' | 'refuse' | 'suspendu';
  created_at: string;
}

export interface AdminParkingRecord {
  id_park: number;
  owner_id: number;
  nom: string;
  adresse: string;
  capacite?: number;
  prix_heure: number;
  statut: 'actif' | 'inactif';
  validation_status: 'brouillon' | 'en_attente_validation' | 'valide' | 'rejete';
  created_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class AdminWorkflowService {
  private readonly apiUrl = `${environment.apiBaseUrl}/admin`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  getUsers(): Promise<AdminUserRecord[]> {
    return firstValueFrom(
      this.http.get<AdminUserRecord[]>(`${this.apiUrl}/users`, {
        headers: this.buildAuthHeaders(),
      })
    );
  }

  getParkings(): Promise<AdminParkingRecord[]> {
    return firstValueFrom(
      this.http.get<AdminParkingRecord[]>(`${this.apiUrl}/parkings`, {
        headers: this.buildAuthHeaders(),
      })
    );
  }

  updateOwnerStatus(
    userId: number,
    ownerStatus: 'en_attente' | 'accepte' | 'refuse' | 'suspendu'
  ): Promise<AdminUserRecord> {
    return firstValueFrom(
      this.http.put<AdminUserRecord>(
        `${this.apiUrl}/owners/${userId}/status`,
        { owner_status: ownerStatus },
        { headers: this.buildAuthHeaders() }
      )
    );
  }

  updateParkingValidationStatus(
    parkingId: number,
    validationStatus: 'brouillon' | 'en_attente_validation' | 'valide' | 'rejete'
  ): Promise<AdminParkingRecord> {
    return firstValueFrom(
      this.http.put<AdminParkingRecord>(
        `${this.apiUrl}/parkings/${parkingId}/validation-status`,
        { validation_status: validationStatus },
        { headers: this.buildAuthHeaders() }
      )
    );
  }

  deleteUser(userId: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.apiUrl}/users/${userId}`, {
        headers: this.buildAuthHeaders(),
      })
    );
  }

  deleteParking(parkingId: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.apiUrl}/parkings/${parkingId}`, {
        headers: this.buildAuthHeaders(),
      })
    );
  }

  private buildAuthHeaders(): HttpHeaders | undefined {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }
}

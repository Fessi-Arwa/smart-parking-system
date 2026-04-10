import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthService } from './auth.service';

export interface AdminStatsDto {
  total_users: number;
  total_drivers: number;
  total_owners: number;
  total_admins: number;
  total_parkings: number;
  active_parkings: number;
  pending_parkings: number;
  total_reservations: number;
  total_revenue: number;
}

export interface AdminUserDto {
  id_compte: number;
  nom: string;
  email: string;
  telephone?: string | null;
  role: 'conducteur' | 'owner' | 'admin';
  created_at: string;
  updated_at?: string;
}

export interface AdminParkingDto {
  id_park: number;
  owner_id: number;
  owner_name?: string;
  nom: string;
  adresse: string;
  ville?: string;
  capacite: number;
  prix_heure: number;
  statut: 'actif' | 'inactif';
  validation_status: 'brouillon' | 'en_attente_validation' | 'valide' | 'rejete';
  created_at: string;
}

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private apiUrl = 'http://localhost:5000/api/admin';

  constructor(private http: HttpClient, private authService: AuthService) {}

  getStats(): Observable<AdminStatsDto> {
    return this.http.get<AdminStatsDto>(`${this.apiUrl}/stats`, {
      headers: this.getHeaders(),
    });
  }

  getUsers(): Observable<AdminUserDto[]> {
    return this.http.get<AdminUserDto[]>(`${this.apiUrl}/users`, {
      headers: this.getHeaders(),
    });
  }

  deleteUser(userId: number): Observable<{ msg: string }> {
    return this.http.delete<{ msg: string }>(`${this.apiUrl}/users/${userId}`, {
      headers: this.getHeaders(),
    });
  }

  getParkings(): Observable<AdminParkingDto[]> {
    return this.http.get<AdminParkingDto[]>(`${this.apiUrl}/parkings`, {
      headers: this.getHeaders(),
    });
  }

  updateParkingValidation(
    parkingId: number,
    validationStatus: AdminParkingDto['validation_status']
  ): Observable<AdminParkingDto> {
    return this.http.patch<AdminParkingDto>(
      `${this.apiUrl}/parkings/${parkingId}/validation`,
      { validation_status: validationStatus },
      { headers: this.getHeaders() }
    );
  }

  deleteParking(parkingId: number): Observable<{ msg: string }> {
    return this.http.delete<{ msg: string }>(`${this.apiUrl}/parkings/${parkingId}`, {
      headers: this.getHeaders(),
    });
  }

  private getHeaders(): HttpHeaders | undefined {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }
}

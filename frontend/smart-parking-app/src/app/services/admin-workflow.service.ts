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
  owner_status_reason?: string | null;
  created_at: string;
}

export interface AdminParkingRecord {
  id_park: number;
  owner_id: number;
  owner_name?: string;
  owner_status?: 'en_attente' | 'accepte' | 'refuse' | 'suspendu' | null;
  nom: string;
  adresse: string;
  capacite?: number;
  prix_heure: number;
  statut: 'actif' | 'inactif';
  validation_status: 'brouillon' | 'en_attente_validation' | 'valide' | 'rejete';
  validation_reason?: string | null;
  setup_status?: 'non_commencee' | 'en_cours' | 'terminee';
  ai_setup_status?: 'non_configuree' | 'en_cours' | 'testee' | 'active';
  created_at: string;
}

export interface AdminAppSubscriptionRecord {
  id_abon: number;
  type: 'mensuel' | 'trimestriel' | 'annuel';
  date_debut: string;
  date_fin: string;
  statut: 'actif' | 'expire' | 'suspendu' | 'en_attente';
  admin_status_reason?: string | null;
  tarif: number;
  parking_id: number;
  parking?: {
    id_park: number;
    owner_id: number;
    nom: string;
    adresse: string;
    prix_heure: number;
    statut: string;
    validation_status: string;
  } | null;
  owner?: {
    id_compte: number;
    nom: string;
    email: string;
    telephone?: string;
    role: 'conducteur' | 'owner' | 'admin';
    owner_status?: 'en_attente' | 'accepte' | 'refuse' | 'suspendu' | null;
  } | null;
}

export interface AdminCameraHealthRecord {
  id_source: number;
  parking_id: number;
  parking_name: string;
  owner_id?: number | null;
  owner_name?: string | null;
  label?: string;
  stream_url?: string;
  camera_status?: 'idle' | 'active' | 'offline' | 'error' | string;
  auto_processing_enabled?: boolean;
  auto_process_interval_seconds?: number;
  last_processed_at?: string | null;
  last_error?: string | null;
  created_at?: string | null;
}

export interface AdminCameraHealthResponse {
  summary: {
    total: number;
    active: number;
    offline: number;
    error: number;
    auto_enabled: number;
  };
  items: AdminCameraHealthRecord[];
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

  getAppSubscriptions(): Promise<AdminAppSubscriptionRecord[]> {
    return firstValueFrom(
      this.http.get<AdminAppSubscriptionRecord[]>(`${this.apiUrl}/app-subscriptions`, {
        headers: this.buildAuthHeaders(),
      })
    );
  }

  updateOwnerStatus(
    userId: number,
    ownerStatus: 'en_attente' | 'accepte' | 'refuse' | 'suspendu',
    reason?: string | null
  ): Promise<AdminUserRecord> {
    return firstValueFrom(
      this.http.put<AdminUserRecord>(
        `${this.apiUrl}/owners/${userId}/status`,
        { owner_status: ownerStatus, reason: reason || null },
        { headers: this.buildAuthHeaders() }
      )
    );
  }

  getCameraHealth(): Promise<AdminCameraHealthResponse> {
    return firstValueFrom(
      this.http.get<AdminCameraHealthResponse>(`${this.apiUrl}/camera-health`, {
        headers: this.buildAuthHeaders(),
      })
    );
  }

  updateParkingValidationStatus(
    parkingId: number,
    validationStatus: 'brouillon' | 'en_attente_validation' | 'valide' | 'rejete',
    reason?: string | null
  ): Promise<AdminParkingRecord> {
    return firstValueFrom(
      this.http.put<AdminParkingRecord>(
        `${this.apiUrl}/parkings/${parkingId}/validation-status`,
        { validation_status: validationStatus, reason: reason || null },
        { headers: this.buildAuthHeaders() }
      )
    );
  }

  updateAppSubscriptionStatus(
    abonnementId: number,
    statut: 'actif' | 'expire' | 'suspendu' | 'en_attente',
    reason?: string | null
  ): Promise<AdminAppSubscriptionRecord> {
    return firstValueFrom(
      this.http.put<AdminAppSubscriptionRecord>(
        `${this.apiUrl}/app-subscriptions/${abonnementId}/status`,
        { statut, reason: reason || null },
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

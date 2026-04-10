import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

import { AuthService } from './auth.service';

export interface CreateReservationPayload {
  vehicule_id: number;
  place_id: number;
  date_debut: string;
  date_fin: string;
}

export interface ReservationHistoryDto {
  id_res: number;
  conducteur_id: number;
  vehicule_id?: number | null;
  place_id: number;
  date_debut: string;
  date_fin: string;
  statut: 'en_attente' | 'confirmee' | 'annulee' | 'terminee';
  prix_total: number;
  created_at?: string;
  place?: {
    id_place: number;
    parking_id: number;
    num_place: number;
    etat: 'libre' | 'reservee' | 'occupee';
    zone?: string;
    etage?: string;
  } | null;
  vehicule?: {
    id_veh: number;
    matricule: string;
    marque?: string;
    type?: string;
  } | null;
  parking?: {
    id_park: number;
    nom: string;
    adresse: string;
    prix_heure: number;
    statut: string;
  } | null;
  conducteur?: {
    id_compte: number;
    nom: string;
    email: string;
    telephone?: string;
    role?: string;
  } | null;
}

@Injectable({
  providedIn: 'root',
})
export class ReservationService {
  private apiUrl = `${environment.apiBaseUrl}/reservations`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  getReservations(): Observable<ReservationHistoryDto[]> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.get<ReservationHistoryDto[]>(`${this.apiUrl}/`, { headers });
  }

  getOwnerReservations(): Observable<ReservationHistoryDto[]> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.get<ReservationHistoryDto[]>(`${this.apiUrl}/owner`, { headers });
  }

  createReservation(payload: CreateReservationPayload): Observable<any> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.post(`${this.apiUrl}/`, payload, { headers });
  }
}

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

import { AuthService } from './auth.service';

export interface SubscriptionDto {
  id_abon: number;
  type: 'mensuel' | 'trimestriel' | 'annuel';
  date_debut: string;
  date_fin: string;
  statut: 'actif' | 'expire' | 'suspendu' | 'en_attente';
  tarif: number;
  created_at?: string;
  cancelled_at?: string | null;
  categorie?: string;
  conducteur_id?: number;
  place_id?: number;
  place?: {
    id_place: number;
    parking_id: number;
    num_place: number;
    etat: 'libre' | 'reservee' | 'occupee';
    zone?: string;
    etage?: string;
  } | null;
  parking?: {
    id_park: number;
    nom: string;
    adresse: string;
    prix_heure: number;
    statut: string;
  } | null;
}

export interface CreateSubscriptionPayload {
  type: 'mensuel' | 'trimestriel' | 'annuel';
  date_debut: string;
  date_fin: string;
  tarif: number;
  place_id: number;
}

export interface CancelSubscriptionResponse {
  msg: string;
  abonnement: SubscriptionDto;
  owner_notification?: {
    parking_id: number;
    place_id: number;
    message: string;
    sent_at?: string | null;
  } | null;
}

@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
  private apiUrl = `${environment.apiBaseUrl}/abonnements`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  getSubscriptions(): Observable<SubscriptionDto[]> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.get<SubscriptionDto[]>(`${this.apiUrl}/`, { headers });
  }

  getOwnerSubscriptions(): Observable<SubscriptionDto[]> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.get<SubscriptionDto[]>(`${this.apiUrl}/owner`, { headers });
  }

  createPlaceSubscription(payload: CreateSubscriptionPayload): Observable<SubscriptionDto> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.post<SubscriptionDto>(`${this.apiUrl}/place`, payload, { headers });
  }

  cancelPlaceSubscription(abonnementId: number): Observable<CancelSubscriptionResponse> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.post<CancelSubscriptionResponse>(
      `${this.apiUrl}/${abonnementId}/cancel`,
      {},
      { headers }
    );
  }
}

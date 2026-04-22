import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environments/environment';
import { AuthService } from './auth.service';

export interface SimulatePaymentPayload {
  amount: number;
  method: string;
  card_holder: string;
  card_number: string;
  card_expiry: string;
  card_cvv: string;
}

export interface SimulatePaymentResponse {
  msg: string;
  status: string;
  amount: number;
  method: string;
}

export interface CreatePaymentPayload {
  reservation_id: number;
  montant: number;
  mode: string;
}

export interface PaymentRecordResponse {
  msg: string;
  payment: {
    id_paiement: number;
    reservation_id: number;
    montant: number;
    date_paiement?: string;
    mode?: string;
    statut: string;
    created_at?: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private apiUrl = `${environment.apiBaseUrl}/paiements`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  simulatePayment(payload: SimulatePaymentPayload): Observable<SimulatePaymentResponse> {
    return this.http.post<SimulatePaymentResponse>(`${this.apiUrl}/simulate`, payload);
  }

  createPayment(payload: CreatePaymentPayload): Observable<PaymentRecordResponse> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.post<PaymentRecordResponse>(`${this.apiUrl}/`, payload, { headers });
  }
}

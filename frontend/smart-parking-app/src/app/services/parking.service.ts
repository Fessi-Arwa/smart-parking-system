import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface CreateParkingPayload {
  nom: string;
  adresse: string;
  capacite: number;
  prix_heure: number;
}

@Injectable({
  providedIn: 'root',
})
export class ParkingService {
  private apiUrl = 'http://localhost:5000/api/parkings';

  constructor(private http: HttpClient, private authService: AuthService) {}

  createParking(payload: CreateParkingPayload): Observable<any> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.post(`${this.apiUrl}/`, payload, { headers });
  }
}

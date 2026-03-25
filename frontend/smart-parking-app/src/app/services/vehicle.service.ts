import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface CreateVehiclePayload {
  matricule: string;
  marque?: string;
  type?: string;
}

@Injectable({
  providedIn: 'root',
})
export class VehicleService {
  private apiUrl = 'http://localhost:5000/api/vehicules';

  constructor(private http: HttpClient, private authService: AuthService) {}

  createVehicle(payload: CreateVehiclePayload): Observable<any> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.post(`${this.apiUrl}/`, payload, { headers });
  }
}

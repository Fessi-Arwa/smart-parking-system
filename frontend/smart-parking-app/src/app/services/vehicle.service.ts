import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface VehicleDto {
  id_veh: number;
  conducteur_id: number;
  matricule: string;
  marque?: string;
  type?: string;
  created_at?: string;
}

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

  getVehicles(): Observable<VehicleDto[]> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.get<VehicleDto[]>(`${this.apiUrl}/`, { headers });
  }

  createVehicle(payload: CreateVehiclePayload): Observable<any> {
    const token = this.authService.getToken();
    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.post(`${this.apiUrl}/`, payload, { headers });
  }
}

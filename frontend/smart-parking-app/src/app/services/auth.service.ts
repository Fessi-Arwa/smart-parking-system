import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface User {
  id: number;
  nom: string;
  email: string;
  telephone?: string;
  role?: 'conducteur' | 'owner' | 'admin';
  owner_status?: 'en_attente' | 'accepte' | 'refuse' | 'suspendu' | null;
  owner_status_reason?: string | null;
}

export interface UpdateProfilePayload {
  nom: string;
  email: string;
  telephone?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiBaseUrl}/auth`;
  private tokenKey = 'access_token';
  private userKey = 'auth_user';
  private userSubject = new BehaviorSubject<User | null>(null);

  public user$ = this.userSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.loadUserFromStorage();
  }

  private loadUserFromStorage() {
    const token = localStorage.getItem(this.tokenKey);
    const user = localStorage.getItem(this.userKey);

    if (token && user) {
      if (this.isTokenExpired(token)) {
        this.clearSession();
        return;
      }

      try {
        this.userSubject.next(JSON.parse(user) as User);
      } catch {
        this.clearSession();
      }
    }
  }

  signup(
    username: string,
    email: string,
    password: string,
    phone?: string,
    role: 'conducteur' | 'owner' = 'conducteur'
  ): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, {
      nom: username,
      email,
      telephone: phone,
      mot_passe: password,
      role,
    }).pipe(
      tap((response: any) => {
        this.saveSession(response.access_token, response.user);
      })
    );
  }

  signin(email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, { email, mot_passe: password }).pipe(
      tap((response: any) => {
        this.saveSession(response.access_token, response.user);
      })
    );
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/reset-password`, {
      token,
      mot_passe: password,
    });
  }

  updateProfile(payload: UpdateProfilePayload): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/profile`, payload, {
      headers: this.buildAuthHeaders(),
    }).pipe(
      tap((user) => {
        const currentToken = this.getToken();
        if (currentToken) {
          this.saveSession(currentToken, user);
        }
      })
    );
  }

  logout() {
    this.clearSession();
    this.router.navigate(['/pages/auth/signin/form']);
  }

  handleUnauthorized() {
    this.clearSession();
    this.router.navigate(['/pages/auth/signin/form']);
  }

  private clearSession() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.userSubject.next(null);
  }

  private saveSession(token: string, user: User) {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
    this.userSubject.next(user);
  }

  isAuthenticated(): boolean {
    return this.userSubject.value !== null;
  }

  getCurrentUser(): User | null {
    return this.userSubject.value;
  }

  getToken(): string | null {
    const token = localStorage.getItem(this.tokenKey);

    if (!token) {
      return null;
    }

    if (this.isTokenExpired(token)) {
      this.clearSession();
      return null;
    }

    return token;
  }

  private buildAuthHeaders(): HttpHeaders | undefined {
    const token = this.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }

  private isTokenExpired(token: string): boolean {
    try {
      const payload = this.decodeJwtPayload(token);
      if (typeof payload?.['exp'] !== 'number') {
        return false;
      }

      return Date.now() >= payload['exp'] * 1000;
    } catch {
      return true;
    }
  }

  private decodeJwtPayload(token: string): Record<string, unknown> {
    const [, payloadSegment] = token.split('.');
    if (!payloadSegment) {
      throw new Error('Invalid JWT payload');
    }

    const normalizedPayload = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalizedPayload.length % 4)) % 4);
    return JSON.parse(atob(`${normalizedPayload}${padding}`));
  }
}

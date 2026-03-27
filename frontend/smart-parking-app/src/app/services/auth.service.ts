import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface User {
  id: number;
  nom: string;
  email: string;
  telephone?: string;
  role?: 'conducteur' | 'owner' | 'admin';
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
  private apiUrl = 'http://localhost:5000/api/auth';
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
      this.userSubject.next(JSON.parse(user) as User);
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
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.userSubject.next(null);
    this.router.navigate(['/pages/auth/signin/form']);
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
    return localStorage.getItem(this.tokenKey);
  }

  private buildAuthHeaders(): HttpHeaders | undefined {
    const token = this.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : undefined;
  }
}

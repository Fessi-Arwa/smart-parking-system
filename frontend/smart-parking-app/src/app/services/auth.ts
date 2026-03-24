import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface User {
  id: number;
  username: string;
  email: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:5000/api/auth';
  private tokenKey = 'access_token';
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
    if (token) {
      this.loadUserFromToken(token);
    }
  }

  signup(username: string, email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/signup`, { username, email, password })
      .pipe(
        tap((response: any) => {
          this.saveToken(response.token);
          this.userSubject.next(response.user);
        })
      );
  }

  signin(email: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/signin`, { email, password })
      .pipe(
        tap((response: any) => {
          this.saveToken(response.token);
          this.userSubject.next(response.user);
        })
      );
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    this.userSubject.next(null);
    this.router.navigate(['/pages/auth/signin']);
  }

  private saveToken(token: string) {
    localStorage.setItem(this.tokenKey, token);
  }

  private loadUserFromToken(token: string) {
    this.http.get(`${this.apiUrl}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe({
      next: (user: any) => this.userSubject.next(user),
      error: () => this.logout()
    });
  }

  isAuthenticated(): boolean {
    return this.userSubject.value !== null;
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }
}
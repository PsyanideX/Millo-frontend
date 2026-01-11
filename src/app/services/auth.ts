import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { User, AuthResponse, LoginRequest, RegisterRequest } from '../models/auth.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private apiUrl = environment.vercelUrl;

  // State
  currentUser = signal<User | null>(null);
  token = signal<string | null>(null);
  isAuthenticated = signal(false);

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');
    
    if (storedToken && storedUser) {
      this.token.set(storedToken);
      this.currentUser.set(JSON.parse(storedUser));
      this.isAuthenticated.set(true);
    }
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.apiUrl}/auth/login`,
      { email, password }
    ).pipe(
      tap((response) => {
        this.saveAuthData(response);
      })
    );
  }

  register(email: string, password: string, name: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      `${this.apiUrl}/auth/register`,
      { email, password, name }
    ).pipe(
      tap((response) => {
        this.saveAuthData(response);
      })
    );
  }

  getProfile(): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/auth/profile`);
  }

  logout() {
    this.currentUser.set(null);
    this.token.set(null);
    this.isAuthenticated.set(false);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }

  private saveAuthData(response: AuthResponse) {
    this.token.set(response.token);
    this.currentUser.set(response.user);
    this.isAuthenticated.set(true);
    localStorage.setItem('auth_token', response.token);
    localStorage.setItem('auth_user', JSON.stringify(response.user));
  }

  getToken(): string | null {
    return this.token();
  }
}

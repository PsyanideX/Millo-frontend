import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Task, Category } from '../models/task.model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private http = inject(HttpClient);
  // Cambia esto por tu URL de Vercel
  private apiUrl = 'https://millobackend.vercel.app';

  // Usaremos un Signal para las categorías, facilitando los filtros
  categories = signal<Category[]>([]);

  getTasks(categoryId?: string): Observable<Task[]> {
    const url = categoryId ? `${this.apiUrl}/tasks?categoryId=${categoryId}` : `${this.apiUrl}/tasks`;
    return this.http.get<Task[]>(url);
  }

  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.apiUrl}/categories`);
  }

  updateTaskStatus(taskId: string, status: string): Observable<Task> {
    return this.http.patch<Task>(`${this.apiUrl}/tasks/${taskId}`, { status });
  }
}
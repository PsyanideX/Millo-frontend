import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Task, Category, Column } from '../models/task.model';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private http = inject(HttpClient);
  private apiUrl = environment.vercelUrl;

  // State
  categories = signal<Category[]>([]);
  columns = signal<Column[]>([]);

  // Categories
  getCategories(boardId?: string): Observable<Category[]> {
    let url = `${this.apiUrl}/categories`;
    if (boardId) {
      url += `?boardId=${boardId}`;
    }
    return this.http.get<Category[]>(url);
  }

  createCategory(name: string, color: string, boardId: string): Observable<Category> {
    return this.http.post<Category>(`${this.apiUrl}/categories`, { name, color, boardId });
  }

  updateCategory(id: string, data: Partial<Category>): Observable<Category> {
    return this.http.patch<Category>(`${this.apiUrl}/categories/${id}`, data);
  }

  deleteCategory(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/categories/${id}`);
  }

  // Columns
  getColumns(boardId?: string): Observable<Column[]> {
    let url = `${this.apiUrl}/columns`;
    if (boardId) {
      url += `?boardId=${boardId}`;
    }
    return this.http.get<Column[]>(url);
  }

  createColumn(name: string, boardId: string, order?: number): Observable<Column> {
    return this.http.post<Column>(`${this.apiUrl}/columns`, { name, order, boardId });
  }

  updateColumn(id: string, data: Partial<Column>): Observable<Column> {
    return this.http.patch<Column>(`${this.apiUrl}/columns/${id}`, data);
  }

  deleteColumn(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/columns/${id}`);
  }

  // Tasks
  getTasks(boardId?: string, categoryId?: string, columnId?: string): Observable<Task[]> {
    let url = `${this.apiUrl}/tasks`;
    const params: string[] = [];
    if (boardId) params.push(`boardId=${boardId}`);
    if (categoryId) params.push(`categoryId=${categoryId}`);
    if (columnId) params.push(`columnId=${columnId}`);

    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    return this.http.get<Task[]>(url);
  }

  createTask(task: Partial<Task>): Observable<Task> {
    return this.http.post<Task>(`${this.apiUrl}/tasks`, task);
  }

  updateTask(id: string, data: Partial<Task>): Observable<Task> {
    return this.http.patch<Task>(`${this.apiUrl}/tasks/${id}`, data);
  }

  deleteTask(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/tasks/${id}`);
  }
}